-- ============================================================================
-- GovTender AI — Phase 1: Database & Extraction Schema
-- File: supabase/migrations/0001_init.sql
-- Target: Supabase (PostgreSQL 15+) with the pgvector extension enabled.
--
-- Run via:  supabase db push     (local)
--        or paste into the Supabase SQL editor (dashboard).
-- Idempotent: safe to re-run (guards with IF NOT EXISTS / exception blocks).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "vector";    -- pgvector: semantic / vector search
create extension if not exists "pg_trgm";   -- trigram fuzzy search on titles/names

-- NOTE — embedding dimensionality
-- We standardise on 1024 dimensions to match Mistral's `mistral-embed` model.
-- If you switch providers, recreate the `embedding` columns with the matching
-- dimension and update the `match_*` functions accordingly:
--   • mistral-embed            -> 1024
--   • OpenAI text-embedding-3-small -> 1536
--   • OpenAI text-embedding-3-large -> 3072


-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type tender_status as enum ('active', 'closed', 'withdrawn', 'awarded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type procurement_procedure as enum (
    'open', 'restricted', 'negotiated',
    'competitive_dialogue', 'innovation_partnership',
    'design_contest', 'other'
  );
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 2. updated_at trigger helper (shared by every table)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. companies
--    Both issuing authorities (buyers) and bidding / winning suppliers.
--    Deduplicated via (name_normalized, country).
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  name_normalized  text generated always as (lower(trim(name))) stored,
  country          text,                          -- ISO-3166 alpha-2: DE, AT, CH, FR ...
  website          text,
  vat_id           text,
  sector           text,                          -- e.g. 'IT Services', 'Construction'
  source           text,                          -- provenance: 'ted', 'simap', 'evergabe'...
  external_ids     jsonb not null default '{}'::jsonb,  -- { "ted_org_id": "..." }
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint companies_unique unique (name_normalized, country)
);

create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create index if not exists companies_name_trgm
  on public.companies using gin (name gin_trgm_ops);
create index if not exists companies_country_idx
  on public.companies (country);


-- ---------------------------------------------------------------------------
-- 4. tenders  (active / current procurement notices)
-- ---------------------------------------------------------------------------
create table if not exists public.tenders (
  id                      uuid primary key default gen_random_uuid(),

  -- provenance / identity -------------------------------------------------
  source                  text not null,        -- 'ted' | 'simap' | 'evergabe' | ...
  source_id               text not null,        -- native notice id (e.g. TED document id)
  source_url              text,

  -- core content ----------------------------------------------------------
  title                   text not null,
  description             text,                 -- cleaned long-form description text
  awarding_authority_id   uuid references public.companies(id) on delete set null,
  awarding_authority_name text,                 -- denormalised snapshot for fast listing

  -- procurement classification -------------------------------------------
  cpv_codes               text[] not null default '{}',  -- EU Common Procurement Vocabulary
  procedure               procurement_procedure,
  status                  tender_status not null default 'active',

  -- money & timeline ------------------------------------------------------
  estimated_budget        numeric(15,2),
  currency                text not null default 'EUR',
  publication_date        timestamptz,
  submission_deadline     timestamptz,

  -- structured extraction (filled by the Mistral pipeline) ---------------
  extracted_data          jsonb,                -- full structured payload + provenance
  required_technologies   text[] not null default '{}',

  -- vector embedding over (title + description + cpv + tech) -------------
  -- mistral-embed = 1024 dims (see header note)
  embedding               vector(1024),
  embedding_model         text default 'mistral-embed',
  embedding_generated_at  timestamptz,

  -- audit / meta ----------------------------------------------------------
  raw_payload             jsonb,                -- original scraped JSON, kept for re-processing
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint tenders_source_unique unique (source, source_id)
);

create trigger trg_tenders_updated_at
  before update on public.tenders
  for each row execute function public.set_updated_at();

-- scalar indexes (dashboard filtering / sorting)
create index if not exists tenders_status_idx            on public.tenders (status);
create index if not exists tenders_deadline_idx          on public.tenders (submission_deadline);
create index if not exists tenders_publication_date_idx  on public.tenders (publication_date desc);

-- array indexes (filter by CPV code or required technology)
create index if not exists tenders_cpv_gin        on public.tenders using gin (cpv_codes);
create index if not exists tenders_tech_gin       on public.tenders using gin (required_technologies);
create index if not exists tenders_extracted_gin  on public.tenders using gin (extracted_data jsonb_path_ops);

-- semantic search index (HNSW, cosine distance) — powers predictive matching
create index if not exists tenders_embedding_hnsw
  on public.tenders using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);


-- ---------------------------------------------------------------------------
-- 5. historical_awards  (past contract award notices + winners)
--    Own embedding so the predictive engine can match a NEW tender against
--    past awards directly, even when no active `tenders` row exists.
-- ---------------------------------------------------------------------------
create table if not exists public.historical_awards (
  id                      uuid primary key default gen_random_uuid(),

  -- link back to the underlying tender (nullable: pure-historical rows often
  -- predate an active tender record)
  tender_id               uuid references public.tenders(id) on delete set null,

  -- provenance / identity -------------------------------------------------
  source                  text not null,
  source_id               text not null,
  source_url              text,

  -- content ---------------------------------------------------------------
  title                   text not null,
  description             text,
  cpv_codes               text[] not null default '{}',

  -- the winner ------------------------------------------------------------
  winner_company_id       uuid references public.companies(id) on delete set null,
  winner_name             text,
  winner_country          text,

  -- outcome ---------------------------------------------------------------
  contract_value          numeric(15,2),         -- final awarded value (may differ from estimate)
  currency                text not null default 'EUR',
  award_date              date,
  awarding_authority_name text,

  -- structured extraction -------------------------------------------------
  extracted_data          jsonb,
  required_technologies   text[] not null default '{}',

  -- vector embedding (title + description + cpv + tech + winner) ----------
  embedding               vector(1024),
  embedding_model         text default 'mistral-embed',
  embedding_generated_at  timestamptz,

  -- audit / meta ----------------------------------------------------------
  raw_payload             jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint historical_awards_source_unique unique (source, source_id)
);

create trigger trg_historical_awards_updated_at
  before update on public.historical_awards
  for each row execute function public.set_updated_at();

create index if not exists historical_awards_award_date_idx  on public.historical_awards (award_date desc);
create index if not exists historical_awards_cpv_gin         on public.historical_awards using gin (cpv_codes);
create index if not exists historical_awards_tech_gin        on public.historical_awards using gin (required_technologies);
create index if not exists historical_awards_winner_idx       on public.historical_awards (winner_company_id);
create index if not exists historical_awards_embedding_hnsw
  on public.historical_awards using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);


-- ---------------------------------------------------------------------------
-- 6. Semantic search functions  (used by the Predictive Matching Engine)
-- ---------------------------------------------------------------------------

-- Find active tenders most similar to a query embedding.
-- similarity = 1 - cosine_distance  (1.0 = identical, 0.0 = orthogonal)
create or replace function public.match_tenders(
  query_embedding vector(1024),
  match_count     int            default 10,
  match_threshold float          default 0.0,    -- min cosine similarity, 0..1
  filter_status   tender_status  default 'active'
)
returns table (
  id                    uuid,
  title                 text,
  source                text,
  source_id             text,
  estimated_budget      numeric(15,2),
  currency              text,
  submission_deadline   timestamptz,
  required_technologies text[],
  similarity            float
)
language sql stable
as $$
  select
    t.id, t.title, t.source, t.source_id,
    t.estimated_budget, t.currency, t.submission_deadline,
    t.required_technologies,
    (1 - (t.embedding <=> query_embedding))::float as similarity
  from public.tenders t
  where t.embedding is not null
    and (filter_status is null or t.status = filter_status)
    and (1 - (t.embedding <=> query_embedding)) >= match_threshold
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- Find past awards most similar to a NEW tender's embedding (winner prediction).
create or replace function public.match_historical_awards(
  query_embedding vector(1024),
  match_count     int   default 10,
  match_threshold float default 0.0
)
returns table (
  id                    uuid,
  title                 text,
  winner_name           text,
  winner_company_id     uuid,
  contract_value        numeric(15,2),
  currency              text,
  award_date            date,
  cpv_codes             text[],
  required_technologies text[],
  similarity            float
)
language sql stable
as $$
  select
    h.id, h.title, h.winner_name, h.winner_company_id,
    h.contract_value, h.currency, h.award_date,
    h.cpv_codes, h.required_technologies,
    (1 - (h.embedding <=> query_embedding))::float as similarity
  from public.historical_awards h
  where h.embedding is not null
    and (1 - (h.embedding <=> query_embedding)) >= match_threshold
  order by h.embedding <=> query_embedding
  limit match_count;
$$;


-- ---------------------------------------------------------------------------
-- 7. Row Level Security
--    Procurement notices are PUBLIC data by law in the EU/DACH region, so
--    read access is open. All writes are expected to come from trusted
--    workers (n8n / Edge Functions) using the SERVICE ROLE key, which
--    bypasses RLS. Tighten write policies before exposing a public API.
-- ---------------------------------------------------------------------------
alter table public.companies         enable row level security;
alter table public.tenders           enable row level security;
alter table public.historical_awards enable row level security;

create policy "companies are publicly readable"
  on public.companies for select using (true);

create policy "tenders are publicly readable"
  on public.tenders for select using (true);

create policy "historical awards are publicly readable"
  on public.historical_awards for select using (true);

-- Reminder: no INSERT/UPDATE/DELETE policies are defined on purpose.
-- Writes must go through the service role key until auth roles (Phase 2)
-- introduce organisation-scoped write policies.


-- ---------------------------------------------------------------------------
-- 8. Done
-- ---------------------------------------------------------------------------
do $$ begin
  raise notice 'GovTender AI: Phase 1 schema ready (companies, tenders, historical_awards).';
end $$;
