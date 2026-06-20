-- ============================================================================
-- GovTender AI — Phase 2: Deterministic matching (no pgvector)
-- File: supabase/migrations/0002_deterministic_matching.sql
--
-- Architecture pivot: the core matching engine is "Non-LLM First". This
-- migration adds the location column required for relational matching and
-- defines CPV + geography based functions using standard SQL only.
-- Vector search (Phase 1) remains available but is NOT used here.
--
-- Idempotent. Apply after 0001_init.sql.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add country to tenders (historical_awards already has winner_country)
--    Stored lowercased ISO-3166 alpha-2. We keep it nullable: legacy rows and
--    releases that omit buyer geography simply won't match on location.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenders' and column_name = 'country'
  ) then
    alter table public.tenders add column country text;
    create index if not exists tenders_country_idx on public.tenders (country);
  end if;
end $$;

-- Backfill from the issuing authority where possible.
update public.tenders t
   set country = c.country
  from public.companies c
 where t.awarding_authority_id = c.id
   and t.country is null
   and c.country is not null;


-- ---------------------------------------------------------------------------
-- 2. CPV prefix expansion helper
--    A CPV code "48000000" (software) should match "48217000" (network
--    software) at division "48". We expand every stored code into its
--    prefix forms so a simple equality join catches hierarchical matches.
--
--    Returns one row per (row_id, prefix) for any 2..8-digit prefix.
--    Division(2) / group(3) / class(4) / category(5) ... are all covered.
-- ---------------------------------------------------------------------------
create or replace function public.expand_cpv_prefixes(codes text[])
returns table (prefix text)
language sql immutable
as $$
  select distinct prefix
  from (
    select left(code, n) as prefix
    from unnest(codes) with ordinality as u(code, _)
    cross join generate_series(2, 8) as n
    where code is not null
      and char_length(code) >= n
      and code ~ '^[0-9]+$'
  ) p
  where prefix is not null;
$$;

comment on function public.expand_cpv_prefixes is
  'Expand an array of CPV codes into all 2..8-digit hierarchical prefixes for relational matching.';


-- ---------------------------------------------------------------------------
-- 3. match_tenders_by_cpv_and_location
--    Given a query set of CPV codes and an optional country, return the active
--    tenders that share at least one CPV prefix AND (optionally) sit in the
--    same country. Pure relational — no embeddings.
--
--    Parameters:
--      query_cpv_codes  text[]   CPV codes from the input tender (raw form)
--      query_country    text     ISO-3166 alpha-2 (case-insensitive); NULL = any
--      match_count      int      max rows to return (default 20)
--
--    Ranking: more shared CPV prefixes = higher score; same country adds a
--    flat bonus so an exact-CPV cross-border tender can still outrank a
--    loose-CPV local one. Score is a heuristic, not a probability.
-- ---------------------------------------------------------------------------
create or replace function public.match_tenders_by_cpv_and_location(
  query_cpv_codes text[],
  query_country   text default null,
  match_count     int  default 20
)
returns table (
  id                      uuid,
  title                   text,
  source                  text,
  source_id               text,
  country                 text,
  cpv_codes               text[],
  estimated_budget        numeric(15,2),
  currency                text,
  submission_deadline     timestamptz,
  awarding_authority_name text,
  shared_cpv_prefixes     text[],
  score                   integer
)
language sql stable
as $$
  with query_prefixes as (
    select prefix from public.expand_cpv_prefixes(coalesce(query_cpv_codes, '{}'::text[]))
  ),
  matched as (
    select
      t.id,
      t.title,
      t.source,
      t.source_id,
      t.country,
      t.cpv_codes,
      t.estimated_budget,
      t.currency,
      t.submission_deadline,
      t.awarding_authority_name,
      -- prefixes shared between this tender and the query
      array_agg(distinct qp.prefix order by qp.prefix) as shared,
      count(*)::int                                         as shared_count
    from public.tenders t
    cross join lateral public.expand_cpv_prefixes(t.cpv_codes) as tp(prefix)
    join query_prefixes qp on qp.prefix = tp.prefix
    where t.status = 'active'
      and (query_country is null
           or lower(t.country) = lower(query_country))
    group by t.id, t.title, t.source, t.source_id, t.country, t.cpv_codes,
             t.estimated_budget, t.currency, t.submission_deadline,
             t.awarding_authority_name
  )
  select
    m.id, m.title, m.source, m.source_id, m.country, m.cpv_codes,
    m.estimated_budget, m.currency, m.submission_deadline,
    m.awarding_authority_name,
    m.shared      as shared_cpv_prefixes,
    -- location bonus: +5 when the buyer is in the same country.
    (m.shared_count + case
       when query_country is not null and lower(m.country) = lower(query_country)
       then 5 else 0 end)::integer as score
  from matched m
  order by score desc, m.submission_deadline asc nulls last
  limit match_count;
$$;

comment on function public.match_tenders_by_cpv_and_location is
  'Deterministic matcher: active tenders sharing CPV prefixes (+ optional country). No pgvector.';


-- ---------------------------------------------------------------------------
-- 4. match_historical_awards_by_cpv
--    Find past awards with overlapping CPV prefixes. Optionally restricted to
--    the same country (buyer geography). Used to predict likely winners: the
--    winner_names of the top hits are the candidate suppliers.
--
--    Also aggregates per-winner totals so the caller can rank suppliers by
--    how often they win in this CPV family.
-- ---------------------------------------------------------------------------
create or replace function public.match_historical_awards_by_cpv(
  query_cpv_codes text[],
  query_country   text default null,
  match_count     int  default 20
)
returns table (
  id                    uuid,
  title                 text,
  winner_name           text,
  winner_company_id     uuid,
  winner_country        text,
  contract_value        numeric(15,2),
  currency              text,
  award_date            date,
  cpv_codes             text[],
  shared_cpv_prefixes   text[],
  score                 integer
)
language sql stable
as $$
  with query_prefixes as (
    select prefix from public.expand_cpv_prefixes(coalesce(query_cpv_codes, '{}'::text[]))
  ),
  matched as (
    select
      h.id, h.title, h.winner_name, h.winner_company_id, h.winner_country,
      h.contract_value, h.currency, h.award_date, h.cpv_codes,
      array_agg(distinct qp.prefix order by qp.prefix) as shared,
      count(*)::int as shared_count
    from public.historical_awards h
    cross join lateral public.expand_cpv_prefixes(h.cpv_codes) as hp(prefix)
    join query_prefixes qp on qp.prefix = hp.prefix
    where query_country is null
       or lower(h.winner_country) = lower(query_country)
       or lower(h.awarding_authority_name) is null  -- keep rows we can't geo-locate
    group by h.id, h.title, h.winner_name, h.winner_company_id, h.winner_country,
             h.contract_value, h.currency, h.award_date, h.cpv_codes
  )
  select
    m.id, m.title, m.winner_name, m.winner_company_id, m.winner_country,
    m.contract_value, m.currency, m.award_date, m.cpv_codes,
    m.shared as shared_cpv_prefixes,
    (m.shared_count + case
       when query_country is not null and lower(m.winner_country) = lower(query_country)
       then 5 else 0 end)::integer as score
  from matched m
  order by score desc, m.award_date desc nulls last
  limit match_count;
$$;

comment on function public.match_historical_awards_by_cpv is
  'Deterministic matcher: past awards sharing CPV prefixes (+ optional country) for winner prediction.';


-- ---------------------------------------------------------------------------
-- 5. Supporting index: tender CPV equality (helps the prefix join when the
--    query set is small). The GIN index from 0001 still serves array filters.
-- ---------------------------------------------------------------------------
create index if not exists tenders_country_status_idx
  on public.tenders (country, status);

create index if not exists historical_awards_winner_country_idx
  on public.historical_awards (winner_country);


-- ---------------------------------------------------------------------------
-- 6. Done
-- ---------------------------------------------------------------------------
do $$ begin
  raise notice 'GovTender AI: Phase 2 deterministic matching ready.';
end $$;
