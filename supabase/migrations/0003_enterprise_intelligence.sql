-- ============================================================================
-- GovTender AI — Phase 3: Enterprise Intelligence, Telemetry & Watchlists
-- File: supabase/migrations/0003_enterprise_intelligence.sql
-- Target: Supabase (PostgreSQL 15+).
--
-- Adds operational telemetry (`ingestion_runs`), analyst triage watchlists
-- (`watchlist_items`), deterministic winner-prediction aggregation
-- (`predict_tender_winners`), executive portfolio analytics view
-- (`tender_portfolio_metrics`), RLS policies, and supporting indexes.
--
-- Idempotent. Apply after 0001_init.sql and 0002_deterministic_matching.sql.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ingestion_runs
--    Operational audit log and per-source telemetry for scheduled / on-demand
--    procurement ingestion runs across EU & DACH feeds (TED, OCDS, SIMAP...).
-- ---------------------------------------------------------------------------
create table if not exists public.ingestion_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  duration_ms       integer check (duration_ms is null or duration_ms >= 0),
  sources_run       integer not null default 0 check (sources_run >= 0),
  releases_fetched  integer not null default 0 check (releases_fetched >= 0),
  tenders_ingested  integer not null default 0 check (tenders_ingested >= 0),
  awards_ingested   integer not null default 0 check (awards_ingested >= 0),
  errors            jsonb not null default '[]'::jsonb,
  source_telemetry  jsonb not null default '[]'::jsonb,
  status            text not null default 'success'
                    check (status in ('success', 'partial', 'failed'))
);

comment on table public.ingestion_runs is
  'Execution audit log and per-source telemetry for procurement ingestion pipeline runs.';

create index if not exists ingestion_runs_started_at_idx
  on public.ingestion_runs (started_at desc);

create index if not exists ingestion_runs_status_started_idx
  on public.ingestion_runs (status, started_at desc);


-- ---------------------------------------------------------------------------
-- 2. watchlist_items
--    Saved/tracked tenders for capture managers and bid teams, scoped by
--    `user_scope` (defaults to ''default'' until multi-tenant auth is enabled).
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_scope  text not null default 'default',
  tender_id   uuid not null references public.tenders(id) on delete cascade,
  notes       text,
  priority    text not null default 'medium'
              check (priority in ('low', 'medium', 'high', 'critical')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint watchlist_items_scope_tender_unique unique (user_scope, tender_id)
);

comment on table public.watchlist_items is
  'User/team watchlist entries tracking high-interest procurement tenders with triage priority and notes.';

drop trigger if exists trg_watchlist_items_updated_at on public.watchlist_items;
create trigger trg_watchlist_items_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

create index if not exists watchlist_items_scope_created_idx
  on public.watchlist_items (user_scope, created_at desc);

create index if not exists watchlist_items_tender_id_idx
  on public.watchlist_items (tender_id);

create index if not exists watchlist_items_scope_priority_idx
  on public.watchlist_items (user_scope, priority);


-- ---------------------------------------------------------------------------
-- 3. predict_tender_winners
--    Deterministic winner-prediction engine built directly on top of
--    `match_historical_awards_by_cpv`. Aggregates matched historical awards by
--    (winner_name, winner_country) and computes a calibrated 0..99 confidence
--    heuristic combining:
--      • CPV match depth score   (up to 45 pts, from weighted prefix lengths)
--      • Historical win count    (up to 30 pts, logarithmic diminishing curve)
--      • Latest award recency    (up to 15 pts, 1y=15 / 2y=11 / 4y=7 / older=3)
--      • Geographic alignment    (up to  9 pts, same country=9 / unfiltered=5)
-- ---------------------------------------------------------------------------
create or replace function public.predict_tender_winners(
  query_cpv_codes text[],
  query_country   text default null,
  max_winners     int  default 10
)
returns table (
  winner_name          text,
  winner_company_id    uuid,
  winner_country       text,
  win_count            integer,
  total_contract_value numeric(15,2),
  avg_contract_value   numeric(15,2),
  max_cpv_score        integer,
  latest_award_date    date,
  confidence_pct       integer,
  sample_awards        jsonb
)
language sql stable
as $$
  with params as (
    select
      nullif(lower(trim(query_country)), '') as norm_country,
      greatest(coalesce(max_winners, 10), 0) as winner_limit
  ),
  matched_awards as (
    select m.*
    from params p
    cross join lateral public.match_historical_awards_by_cpv(
      query_cpv_codes,
      p.norm_country,
      greatest(p.winner_limit * 25, 250)
    ) as m
    where nullif(trim(m.winner_name), '') is not null
  ),
  grouped as (
    select
      a.winner_name,
      (
        array_agg(a.winner_company_id order by a.award_date desc nulls last)
        filter (where a.winner_company_id is not null)
      )[1]                                     as winner_company_id,
      a.winner_country,
      count(*)::integer                        as win_count,
      sum(a.contract_value)::numeric(15,2)     as total_contract_value,
      round(avg(a.contract_value), 2)::numeric(15,2) as avg_contract_value,
      max(a.score)::integer                    as max_cpv_score,
      max(a.award_date)                        as latest_award_date
    from matched_awards a
    group by a.winner_name, a.winner_country
  ),
  scored as (
    select
      g.*,
      greatest(
        0,
        least(
          99,
          (
            -- CPV match specificity (0..45)
            least(45, greatest(0, g.max_cpv_score))
            -- Win track-record with diminishing returns (0..30)
            + least(30, round(ln((g.win_count + 1)::numeric) * 14)::integer)
            -- Recency of most recent win (0..15)
            + case
                when g.latest_award_date >= (current_date - interval '1 year')::date  then 15
                when g.latest_award_date >= (current_date - interval '2 years')::date then 11
                when g.latest_award_date >= (current_date - interval '4 years')::date then 7
                when g.latest_award_date is not null                                  then 3
                else 0
              end
            -- Geographic alignment (0..9)
            + case
                when p.norm_country is not null
                 and lower(trim(g.winner_country)) = p.norm_country then 9
                when p.norm_country is null                         then 5
                else 0
              end
          )
        )
      )::integer as confidence_pct
    from grouped g
    cross join params p
  )
  select
    s.winner_name,
    s.winner_company_id,
    s.winner_country,
    s.win_count,
    s.total_contract_value,
    s.avg_contract_value,
    s.max_cpv_score,
    s.latest_award_date,
    s.confidence_pct,
    coalesce(sa.sample_awards, '[]'::jsonb) as sample_awards
  from scored s
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'title', x.title,
        'contract_value', x.contract_value,
        'currency', x.currency,
        'award_date', x.award_date,
        'cpv_codes', x.cpv_codes,
        'shared_cpv_prefixes', x.shared_cpv_prefixes,
        'score', x.score
      )
      order by x.score desc, x.award_date desc nulls last
    ) as sample_awards
    from (
      select a2.*
      from matched_awards a2
      where a2.winner_name = s.winner_name
        and a2.winner_country is not distinct from s.winner_country
      order by a2.score desc, a2.award_date desc nulls last
      limit 3
    ) x
  ) sa on true
  order by
    s.confidence_pct desc,
    s.win_count desc,
    s.max_cpv_score desc,
    s.total_contract_value desc nulls last,
    s.latest_award_date desc nulls last
  limit greatest(coalesce(max_winners, 10), 0);
$$;

comment on function public.predict_tender_winners is
  'Aggregate historical CPV award matches by supplier to predict likely tender winners with a 0..99 confidence heuristic and sample awards.';


-- ---------------------------------------------------------------------------
-- 4. tender_portfolio_metrics
--    Active tender rollup by country and 2-digit CPV division. Deduplicates
--    divisions per tender so a notice tagged with multiple codes in the same
--    CPV division is counted once per division.
--    Uses security_invoker = true (PostgreSQL 15+) so caller RLS applies.
-- ---------------------------------------------------------------------------
create or replace view public.tender_portfolio_metrics
with (security_invoker = true)
as
  with tender_divisions as (
    select
      t.id,
      coalesce(nullif(lower(trim(t.country)), ''), 'unknown') as country,
      coalesce(d.cpv_division, '00')                          as cpv_division,
      t.estimated_budget,
      t.currency,
      t.submission_deadline
    from public.tenders t
    left join lateral (
      select distinct left(regexp_replace(code, '[^0-9]', '', 'g'), 2) as cpv_division
      from unnest(t.cpv_codes) as u(code)
      where char_length(regexp_replace(code, '[^0-9]', '', 'g')) >= 2
    ) d on true
    where t.status = 'active'
  )
  select
    td.country,
    td.cpv_division,
    count(*)::integer as tender_count,
    coalesce(
      sum(case when upper(td.currency) = 'EUR' then td.estimated_budget else null end),
      0
    )::numeric(15,2) as total_eur_budget,
    coalesce(
      min(td.submission_deadline) filter (where td.submission_deadline >= now()),
      min(td.submission_deadline)
    ) as nearest_deadline
  from tender_divisions td
  group by td.country, td.cpv_division
  order by tender_count desc, total_eur_budget desc;

comment on view public.tender_portfolio_metrics is
  'Active procurement portfolio metrics summarized by country and 2-digit CPV division (count, total EUR budget, nearest deadline).';


-- ---------------------------------------------------------------------------
-- 5. Supporting indexes on core tables
-- ---------------------------------------------------------------------------
create index if not exists tenders_procedure_idx
  on public.tenders (procedure);

create index if not exists tenders_source_idx
  on public.tenders (source);

create index if not exists tenders_status_deadline_idx
  on public.tenders (status, submission_deadline asc nulls last);

create index if not exists historical_awards_winner_name_country_idx
  on public.historical_awards (winner_name, winner_country);

create index if not exists historical_awards_winner_country_lower_idx
  on public.historical_awards (lower(trim(winner_country)));


-- ---------------------------------------------------------------------------
-- 6. Row Level Security
--    Consistent with Phase 1: read access is open; writes go through trusted
--    backend workers / API routes using the service role key (bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.ingestion_runs  enable row level security;
alter table public.watchlist_items enable row level security;

drop policy if exists "ingestion runs are publicly readable" on public.ingestion_runs;
create policy "ingestion runs are publicly readable"
  on public.ingestion_runs for select using (true);

drop policy if exists "watchlist items are publicly readable" on public.watchlist_items;
create policy "watchlist items are publicly readable"
  on public.watchlist_items for select using (true);


-- ---------------------------------------------------------------------------
-- 7. Done
-- ---------------------------------------------------------------------------
do $$ begin
  raise notice 'GovTender AI: Phase 3 enterprise intelligence schema ready (ingestion_runs, watchlist_items, predict_tender_winners, tender_portfolio_metrics).';
end $$;
