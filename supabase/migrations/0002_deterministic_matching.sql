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
--    Stored lowercased ISO-3166 alpha-2 (enforced on insert/update via
--    trigger below). We keep it nullable: legacy rows and releases that omit
--    buyer geography simply won't match on location.
-- ---------------------------------------------------------------------------
alter table public.tenders add column if not exists country text;
create index if not exists tenders_country_idx on public.tenders (country);

-- Backfill from the issuing authority where possible (normalized lowercase).
update public.tenders t
   set country = nullif(lower(trim(c.country)), '')
  from public.companies c
 where t.awarding_authority_id = c.id
   and t.country is null
   and c.country is not null;

-- Normalize any pre-existing non-lowercase / padded tender country values.
update public.tenders
   set country = nullif(lower(trim(country)), '')
 where country is not null
   and country is distinct from nullif(lower(trim(country)), '');

-- Enforce lowercased, trimmed ISO-3166 alpha-2 (or NULL) on every write so
-- equality filters on `tenders.country` can use B-tree indexes directly.
create or replace function public.normalize_tender_country()
returns trigger
language plpgsql
as $$
begin
  if new.country is not null then
    new.country := nullif(lower(trim(new.country)), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenders_normalize_country on public.tenders;
create trigger trg_tenders_normalize_country
  before insert or update of country on public.tenders
  for each row execute function public.normalize_tender_country();


-- ---------------------------------------------------------------------------
-- 2. CPV prefix expansion helper
--    A CPV code "48000000" (software) should match "48217000" (network
--    software) at division "48". We expand every stored code into its
--    prefix forms so a simple equality join catches hierarchical matches.
--
--    Strips optional check-digit suffixes ("48000000-8" -> "48000000") and
--    returns one distinct row per 2..8-digit prefix:
--    division(2) / group(3) / class(4) / category(5) ... exact(8).
-- ---------------------------------------------------------------------------
create or replace function public.expand_cpv_prefixes(codes text[])
returns table (prefix text)
language sql immutable
as $$
  select distinct prefix
  from (
    select left(cleaned, n) as prefix
    from (
      select split_part(trim(code), '-', 1) as cleaned
      from unnest(codes) as u(code)
      where code is not null
    ) c
    cross join generate_series(2, 8) as n
    where char_length(cleaned) >= n
      and cleaned ~ '^[0-9]+$'
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
--    Scoring (heuristic integer, not a probability):
--      • Weighted CPV prefix depth: sum of character lengths of distinct shared
--        prefixes (2-digit division = 2, 3-digit group = 5, 4-digit class = 9,
--        5-digit category = 14, ..., 8-digit exact CPV = 35). Deeper matches
--        weight substantially higher than broad division overlaps.
--      • Country bonus: +10 when `query_country` matches `tenders.country`,
--        allowing an exact cross-border CPV match (35) to outrank a loose
--        division-only local match (2 + 10 = 12).
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
  with params as (
    select nullif(lower(trim(query_country)), '') as norm_country
  ),
  query_prefixes as (
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
      -- distinct prefixes shared between this tender and the query
      array_agg(distinct qp.prefix order by qp.prefix) as shared,
      -- deeper CPV prefix matches weight higher (sum of matched prefix lengths)
      sum(char_length(qp.prefix))::integer             as cpv_depth_score
    from public.tenders t
    cross join params p
    cross join lateral public.expand_cpv_prefixes(t.cpv_codes) as tp(prefix)
    join query_prefixes qp on qp.prefix = tp.prefix
    where t.status = 'active'
      and (p.norm_country is null
           or t.country = p.norm_country)
    group by t.id, t.title, t.source, t.source_id, t.country, t.cpv_codes,
             t.estimated_budget, t.currency, t.submission_deadline,
             t.awarding_authority_name
  )
  select
    m.id, m.title, m.source, m.source_id, m.country, m.cpv_codes,
    m.estimated_budget, m.currency, m.submission_deadline,
    m.awarding_authority_name,
    m.shared as shared_cpv_prefixes,
    -- location bonus: +10 when the buyer is in the same country.
    (m.cpv_depth_score + case
       when p.norm_country is not null and m.country = p.norm_country
       then 10 else 0 end)::integer as score
  from matched m
  cross join params p
  order by score desc, m.submission_deadline asc nulls last
  limit match_count;
$$;

comment on function public.match_tenders_by_cpv_and_location is
  'Deterministic matcher: active tenders sharing CPV prefixes weighted by prefix depth (+ optional country bonus). No pgvector.';


-- ---------------------------------------------------------------------------
-- 4. match_historical_awards_by_cpv
--    Find past awards with overlapping CPV prefixes. Optionally biased/filtered
--    to the same country (keeping un-geolocated historical awards where
--    winner_country IS NULL so sparse historical records are not silently
--    dropped). Used to predict likely winners via `predict_tender_winners`.
--
--    Scoring mirrors `match_tenders_by_cpv_and_location`:
--      sum(char_length(shared_prefix)) + 10 if winner_country matches.
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
  with params as (
    select nullif(lower(trim(query_country)), '') as norm_country
  ),
  query_prefixes as (
    select prefix from public.expand_cpv_prefixes(coalesce(query_cpv_codes, '{}'::text[]))
  ),
  matched as (
    select
      h.id, h.title, h.winner_name, h.winner_company_id, h.winner_country,
      h.contract_value, h.currency, h.award_date, h.cpv_codes,
      array_agg(distinct qp.prefix order by qp.prefix) as shared,
      sum(char_length(qp.prefix))::integer             as cpv_depth_score
    from public.historical_awards h
    cross join params p
    cross join lateral public.expand_cpv_prefixes(h.cpv_codes) as hp(prefix)
    join query_prefixes qp on qp.prefix = hp.prefix
    where p.norm_country is null
       or lower(trim(h.winner_country)) = p.norm_country
       or h.winner_country is null  -- keep un-geolocated historical awards
    group by h.id, h.title, h.winner_name, h.winner_company_id, h.winner_country,
             h.contract_value, h.currency, h.award_date, h.cpv_codes
  )
  select
    m.id, m.title, m.winner_name, m.winner_company_id, m.winner_country,
    m.contract_value, m.currency, m.award_date, m.cpv_codes,
    m.shared as shared_cpv_prefixes,
    (m.cpv_depth_score + case
       when p.norm_country is not null and lower(trim(m.winner_country)) = p.norm_country
       then 10 else 0 end)::integer as score
  from matched m
  cross join params p
  order by score desc, m.award_date desc nulls last
  limit match_count;
$$;

comment on function public.match_historical_awards_by_cpv is
  'Deterministic matcher: past awards sharing CPV prefixes weighted by prefix depth (+ optional country bonus) for winner prediction.';


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
