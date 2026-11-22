<div align="center">

<img src="https://img.shields.io/badge/Architecture-Non%20LLM%20First-0f172a?style=flat-square" alt="Non-LLM First">
<img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs" alt="Next.js">
<img src="https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20pgvector-1c8c5e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase">
<img src="https://img.shields.io/badge/Mistral%20AI-Optional%20Enhancement-f97316?style=flat-square" alt="Mistral AI">
<img src="https://img.shields.io/badge/Tests-215%20Keyless%20Assertions-16a34a?style=flat-square" alt="Tests">

<br><br>

# GovTender AI

**EU & DACH Government Tender Intelligence Platform**

Deterministic OCDS ingestion, hierarchical CPV matching, incumbent winner prediction,
optional Mistral AI enhancement, and a McKinsey-grade executive dashboard for public procurement capture teams.

<br>

</div>

---

## Executive Summary

GovTender AI ingests public procurement notices and historical awards from **EU TED**, **Swiss SIMAP**, **German evergabe**, and OCDS-compatible national feeds. Every core intelligence step runs **deterministically at €0 LLM cost**:

- **Zero-dependency parsing & normalization** — Strict OCDS 1.1 ingestion with fail-safe JSON parsing, EU-27/EFTA country normalization (alpha-2, alpha-3, localized names, composite city strings), check-digit CPV normalization, `refId`-first party resolution, and canonical Postgres enum mapping.
- **Deterministic technology & strategic brief extraction** — Curated 70+ pattern enterprise stack & compliance extractor (`kubernetes`, `sap s/4hana`, `postgresql`, `iso 27001`, `bsi c5`, `zero trust`, …) plus a 0ms McKinsey-style Bid/No-Bid readiness generator (`STRONG BID` / `EVALUATE` / `PASS`).
- **Pure relational CPV + geography matching** — Hierarchical 2–8 digit CPV prefix expansion (`CpvSet`, `computeCpvMatch`) paired with PostgreSQL RPCs (`match_tenders_by_cpv_and_location`, `match_historical_awards_by_cpv`, `predict_tender_winners`) — no embeddings required on the critical path.
- **Conditional Mistral AI layer** — Lazy-loaded and strictly optional. Invoked only when deterministic technology extraction returns `[]`, bounded by real `AbortController` `timeoutMs` enforcement, with full-document OCR extraction (`extractTender`) retained for non-OCDS PDFs.
- **4-View McKinsey Executive Dashboard** — High-density Next.js 16 interface backed by 4 live API routes (`/api/tenders`, `/api/tenders/[id]`, `/api/analytics`, `/api/ingest`) with seamless Supabase-to-sandbox fallback.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│  1. Multi-Platform Source Adapters (src/lib/sources/)                     │
│     TedSource (EU TED v3) · OcdsFeedSource (Swiss SIMAP, German evergabe) │
│  ───────────────────────────────────────────────────────────────────────  │
│  • Parallel fan-out via runIngestion() with per-source telemetry          │
│  • TED_API_TOKEN forwarded via Authorization: Bearer + x-api-key          │
│  • safeFetchJsonDetailed(): custom headers, POST, 5xx retries, timeouts   │
│  • Graceful fallback to bundled DACH/EU fixtures (keyless dev & CI)       │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  OcdsRelease[] + source provenance
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  2. Deterministic Ingestion & Enrichment (src/lib/ingestion/)             │
│     parseOcdsJson() → mapRelease() → CpvSet / computeCpvMatch()           │
│  ───────────────────────────────────────────────────────────────────────  │
│  • Fail-safe OCDS parsing (malformed input → null, never crashes)         │
│  • Source provenance propagated ("ted", "simap", "evergabe")              │
│  • Status enum mapping (complete→awarded, cancelled→withdrawn, …)         │
│  • findParty() prioritizes refId before role fallback                     │
│  • EU-27 + EFTA normalizeCountry() (alpha-2/3, DE/EN/FR/IT, city strings) │
│  • extractDeterministicTechnologies(): 70+ cloud/DB/ERP/compliance tags   │
│  • generateStrategicBrief(): 0ms deterministic Bid/No-Bid brief           │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  TenderRecord + HistoricalAwardRecord[]
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  3. Optional Mistral AI Enhancement (src/lib/extraction/)                 │
│     enhanceTechnologies() · extractTender() · lazy env.ts                 │
│  ───────────────────────────────────────────────────────────────────────  │
│  • Runs ONLY when deterministic required_technologies is empty            │
│  • Lazy env getters: importing NEVER requires MISTRAL_API_KEY             │
│  • Real AbortController timeoutMs enforcement & graceful degradation      │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  Enriched records
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  4. Supabase Persistence & Matching Engine (supabase/migrations/)         │
│     persistTender() · persistAward() · recordIngestionRun()               │
│  ───────────────────────────────────────────────────────────────────────  │
│  • Idempotent upserts on (source, source_id); award-only releases saved   │
│  • Persists source_url, procedure, raw_payload, required_technologies     │
│  • Tables: companies, tenders, historical_awards, ingestion_runs,         │
│            watchlist_items + tender_portfolio_metrics view                │
│  • Relational CPV matching + calibrated predict_tender_winners() RPC      │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │  Next.js App Router API (4 routes)
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  5. Executive Dashboard (dashboard/ — Next.js 16 · Tailwind CSS v4)       │
│  ───────────────────────────────────────────────────────────────────────  │
│  • Overview                   — Executive KPIs, valuation & market mix    │
│  • Tender Desk + Dossier      — Faceted notice desk & Bid/No-Bid dossier  │
│  • Competitive Radar          — Incumbent leaderboard & win analytics     │
│  • Pipeline Ops               — Connector health, run logs & live trigger │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
govtender-ai/
├── supabase/migrations/
│   ├── 0001_init.sql                      # Core schema: companies, tenders, historical_awards, pgvector, RLS
│   ├── 0002_deterministic_matching.sql    # CPV prefix expansion + relational CPV/country matching RPCs
│   └── 0003_enterprise_intelligence.sql   # ingestion_runs, watchlist_items, predict_tender_winners(), portfolio view
│
├── src/
│   ├── cli/
│   │   └── ingest.ts                      # Multi-platform CLI runner (--dry-run, --live, --sandbox, --source, --json)
│   ├── lib/
│   │   ├── pipeline.ts                    # Canonical ingestRelease() orchestrator & parseOcdsJson()
│   │   ├── ingestion/
│   │   │   ├── ocds-types.ts              # OCDS 1.1 schema types
│   │   │   ├── ocds-mapper.ts             # mapRelease(), normalizeCountry(), extractDeterministicTechnologies()
│   │   │   ├── cpv.ts                     # CpvSet, CPV_DIVISION_LABELS, getCpvDivisionLabel(), computeCpvMatch()
│   │   │   ├── persist.ts                 # Idempotent Supabase upserts + recordIngestionRun()
│   │   │   └── index.ts
│   │   ├── sources/
│   │   │   ├── types.ts                   # SourceAdapter contract & safeFetchJsonDetailed() (retries, timeout, POST)
│   │   │   ├── ted.ts                     # EU TED v3 OCDS adapter (Bearer + x-api-key auth, fixture fallback)
│   │   │   ├── ocds-feed.ts               # Generic OCDS feed adapter (Swiss SIMAP, German evergabe)
│   │   │   ├── fixtures.ts                # Bundled DACH/EU active tenders & award-only releases (2026–2027)
│   │   │   ├── orchestrator.ts            # defaultSources() & runIngestion() with sourceReports telemetry
│   │   │   └── index.ts
│   │   └── extraction/
│   │       ├── env.ts                     # Lazy getter-based env config (keyless import safety)
│   │       ├── schema.ts                  # Zod TenderExtractionSchema
│   │       ├── enhance-tender.ts          # enhanceTechnologies() (timeout-enforced) & generateStrategicBrief()
│   │       ├── extract-tender.ts          # Full-document Mistral JSON extraction with repair retry & timeout
│   │       ├── demo.ts                    # Optional Mistral CLI demo
│   │       └── index.ts
│   └── tests/
│       ├── pipeline.e2e.ts                # 83-assertion E2E & regression suite (keyless)
│       ├── sources.test.ts                # 51-assertion source adapter, HTTP & telemetry suite (keyless)
│       └── matching.test.ts               # 81-assertion CPV, EU-27/EFTA country & tech extraction suite (keyless)
│
├── dashboard/                             # Next.js 16 Executive Dashboard
│   └── src/
│       ├── app/
│       │   ├── page.tsx                   # 4-view McKinsey Executive Dashboard
│       │   ├── layout.tsx                 # Inter + Source Serif 4 editorial typography
│       │   ├── globals.css                # Tailwind v4 navy/slate executive theme
│       │   └── api/
│       │       ├── tenders/route.ts       # GET  /api/tenders       (multi-facet query & Bid Scorecards)
│       │       ├── tenders/[id]/route.ts  # GET  /api/tenders/[id]  (Strategic Dossier, matches, winners)
│       │       ├── analytics/route.ts     # GET  /api/analytics     (KPIs, breakdowns, incumbents, health)
│       │       └── ingest/route.ts        # POST /api/ingest        (on-demand ingestion + telemetry log)
│       ├── components/                    # Card, Table, Badge & executive UI primitives
│       └── lib/
│           ├── intelligence-engine.ts     # Deterministic scoring, CPV matching & currency normalization
│           ├── server/data-service.ts     # Supabase PostgREST connector with sandbox fallback
│           ├── mock-data.ts               # Curated DACH/EU sandbox dataset
│           └── types.ts                   # Shared API & intelligence contracts
│
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Quick Start

### Prerequisites

- **Node.js ≥ 20**
- *(Optional)* Supabase project with `pgvector` enabled (for live persistence)
- *(Optional)* EU TED API token / SIMAP / evergabe feed URLs
- *(Optional)* Mistral AI API key (only needed for LLM fallback or full-document PDF extraction)

### 1. Install & configure

```bash
npm install
cp .env.example .env    # All variables are optional for keyless tests and sandbox dry-runs
```

### 2. Verify TypeScript & run the keyless test suite

```bash
npm run typecheck
npm test
```

Individual test suites can also be run directly:

```bash
npm run test:pipeline   # 83/83 [SUCCESS] — E2E ingestion, status/refId/provenance/award-only/timeout regressions
npm run test:sources    # 51/51 [SUCCESS] — TED auth headers, HTTP retries/timeout, orchestrator telemetry, fixtures
npm run test:matching   # 81/81 [SUCCESS] — CpvSet, computeCpvMatch, EU-27/EFTA country & deterministic tech tags
```

### 3. Run the CLI ingestion runner

```bash
# Keyless dry-run across TED, Swiss SIMAP, and German evergabe sandbox fixtures
npm run ingest:dry

# Full CLI options
npm run ingest -- --help
npm run ingest -- --dry-run --sandbox --json
npm run ingest -- --live --source ted,simap --limit 25 --timeout 15000 --retries 2
npm run ingest -- --live --allow-llm    # Enable optional Mistral tech fallback when regex yields []
```

### 4. Apply all 3 Supabase migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or run the SQL files sequentially in **Supabase Dashboard → SQL Editor**:
1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
2. [`supabase/migrations/0002_deterministic_matching.sql`](supabase/migrations/0002_deterministic_matching.sql)
3. [`supabase/migrations/0003_enterprise_intelligence.sql`](supabase/migrations/0003_enterprise_intelligence.sql)

### 5. Launch the Executive Dashboard

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:3000
```

### 6. *(Optional)* Run the Mistral full-document extraction demo

```bash
MISTRAL_API_KEY=your_key npm run extract:demo
```

---

## Database Schema & Migrations

| Migration | Objects Added | Purpose |
|---|---|---|
| `0001_init.sql` | `companies`, `tenders`, `historical_awards`, `tender_status`, `procurement_procedure`, HNSW `vector(1024)` indexes, `match_tenders()`, `match_historical_awards()`, RLS policies | Core relational + pgvector procurement schema with idempotent `(source, source_id)` uniqueness and buyer/supplier deduplication |
| `0002_deterministic_matching.sql` | `tenders.country`, `expand_cpv_prefixes()`, `cpv_prefixes` generated columns + GIN indexes, `match_tenders_by_cpv_and_location()`, `match_historical_awards_by_cpv()` | Pure SQL hierarchical CPV prefix matching + same-country bonus scoring with zero embedding dependency |
| `0003_enterprise_intelligence.sql` | `ingestion_runs`, `watchlist_items`, `predict_tender_winners()`, `tender_portfolio_metrics` view | Operational pipeline audit logs, analyst capture watchlists, calibrated 0–99% incumbent winner prediction, and executive portfolio metrics |

### Matching & Prediction RPCs

| Function | Engine | Role |
|---|---|---|
| `match_tenders_by_cpv_and_location()` | Relational SQL | Finds similar active notices via hierarchical 2–8 digit CPV prefix overlap + country alignment |
| `match_historical_awards_by_cpv()` | Relational SQL | Matches active tenders against historical contract awards by CPV depth and jurisdiction |
| `predict_tender_winners()` | Relational SQL | Aggregates historical wins per supplier into a calibrated 0–99% confidence score (CPV depth + logarithmic win count + recency + country match) |
| `match_tenders()` / `match_historical_awards()` | `pgvector` HNSW | Semantic cosine similarity search (`vector(1024)`) for future hybrid retrieval |

---

## Next.js API Routes

All 4 routes live under `dashboard/src/app/api/` and connect to Supabase PostgREST when configured, cleanly degrading to the deterministic sandbox engine when credentials are absent.

| Method & Endpoint | Description | Key Parameters / Body |
|---|---|---|
| `GET /api/tenders` | Returns enriched active tenders with CPV matches, incumbent winner predictions, 4-axis Bid Scorecards, and facet counts | `?country=DE`, `?q=kubernetes`, `?tech=postgresql`, `?source=ted`, `?sector=72`, `?verdict=STRONG%20BID`, `?showExpired=true`, `?minBudget=1000000`, `?sortBy=deadline\|budget\|score`, `?sortDir=asc\|desc` |
| `GET /api/tenders/[id]` | Returns a full Strategic Dossier for a single tender: metadata, historical award matches, predicted winners, Bid/No-Bid scorecard, and CPV-similar sibling notices | Path param `[id]` |
| `GET /api/analytics` | Returns executive KPIs, country/sector/monthly/technology breakdowns, incumbent supplier leaderboard, and platform connector health | — |
| `POST /api/ingest` | Triggers an on-demand deterministic ingestion & CPV re-indexing pass and returns step-by-step telemetry logs | JSON body `{ "sources": ["ted", "simap"], "dryRun": true }` |

---

## Executive Dashboard Views

The Next.js 16 dashboard (`dashboard/`) is structured into **4 McKinsey-style executive workspaces**:

1. **Overview** — Portfolio KPI strip (total addressable pipeline value, active notice count, strong-bid pipeline, average readiness score), geographic & CPV sector breakdowns, and technology demand distribution.
2. **Tender Desk + Strategic Dossier** — High-density procurement notice desk with real-time text search, country/platform/sector/verdict/technology filters, deadline urgency chips, and a slide-over **Strategic Dossier** containing the 4-axis Bid/No-Bid Scorecard, risk flags, strategic priorities, CPV-matched historical awards, predicted incumbent winners, and capture watchlist controls.
3. **Competitive Radar** — Incumbent supplier intelligence across DACH & EU markets: win counts, cumulative contract volume, average award ticket size, dominant CPV sectors, and geographic footprint.
4. **Pipeline Ops** — Live connector health across EU TED, Swiss SIMAP, German evergabe, and regional feeds, deterministic extraction rates, ingestion run audit history, and an interactive **Run Ingestion** trigger wired to `POST /api/ingest`.

---

## Deterministic Intelligence Engine

### Curated Technology Extraction (`extractDeterministicTechnologies`)
Before any LLM is considered, `mapRelease()` scans tender titles and descriptions against 70+ word-boundary patterns spanning cloud & containers (`kubernetes`, `openshift`, `docker`, `aws`, `azure`, `gcp`, `terraform`), databases (`postgresql`, `oracle`, `timescaledb`, `elasticsearch`), enterprise ERP (`sap s/4hana`, `sap`, `servicenow`), security & compliance (`iso 27001`, `bsi c5`, `bsi grundschutz`, `nis2`, `zero trust`, `siem`, `gdpr/dsgvo`), and DACH procurement terms (`glasfaser` → `fiber optics`, `roboter` → `robotics`, `projektmanagement` → `project management`). Negative lookaheads prevent false positives (e.g., `JavaScript` never matches `java`).

### Hierarchical CPV Matching (`CpvSet` & `computeCpvMatch`)
CPV codes such as `48000000-8` are stripped of check digits, right-padded to 8 canonical digits, and rolled up across all 2–8 digit hierarchical prefixes (`division → group → class → category → exact`). `computeCpvMatch()` scores pairs with progressive depth weights (`2→2`, `3→4`, `4→6`, `5→9`, `6→12`, `7→15`, `8→20`) plus shared-prefix count so exact 8-digit matches strictly outscore 4-digit class matches, which strictly outscore 2-digit division matches, while disjoint codes score `0`.

### Strategic Bid/No-Bid Brief (`generateStrategicBrief`)
Produces a deterministic executive brief (`STRONG BID` / `EVALUATE` / `PASS`, rationale, risk flags, strategic priorities) in 0ms based on commercial budget sizing, core digital CPV alignment, explicit stack depth, DACH/EU geographic fit, and submission timeline feasibility.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Core Backend & CLI | TypeScript 5.6 (strict, NodeNext), Zod, `tsx` |
| Source Adapters | EU TED v3 API (OCDS), Generic OCDS feeds (Swiss SIMAP, German evergabe) |
| Database & Matching | Supabase (PostgreSQL 15+, GIN CPV prefix indexes, `pgvector` HNSW) |
| Optional LLM Layer | Mistral AI (`mistral-small-latest`, `mistral-embed` 1024-dim) |
| Web & API | Next.js 16 (App Router), React, Tailwind CSS v4, Lucide Icons |

---

## License

Private — all rights reserved.
