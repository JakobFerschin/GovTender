<div align="center">

<img src="https://img.shields.io/badge/Architecture-Non%20LLM%20First-0f172a?style=flat-square" alt="Non-LLM First">
<img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs" alt="Next.js">
<img src="https://img.shields.io/badge/Supabase-pgvector-1c8c5e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase">
<img src="https://img.shields.io/badge/Mistral%20AI-Optional%20Enhancement-f97316?style=flat-square" alt="Mistral AI">

<br><br>

# GovTender AI

**EU & DACH Government Tender Intelligence Platform**

Deterministic parsing, relational matching, and optional LLM enhancement
for public procurement analytics.

<br>

</div>

---

## What it does

GovTender AI ingests public procurement notices from EU TED, Swiss SIMAP,
German evergabe, and other OCDS-compatible sources. It extracts structured
data **without requiring an LLM**, matches tenders against historical awards
using **pure relational CPV+geography queries**, and surfaces actionable
intelligence in a premium executive dashboard.

The LLM (Mistral AI) is an **optional enhancement layer** — the pipeline
runs fully deterministic and failsafe even when no API key is configured.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Sources (n8n / API)                       │
│   TED · SIMAP · evergabe · e-VERGABE · OCDS feeds               │
└─────────────┬───────────────────────────────────────────────────┘
              │  raw JSON / XML
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1 — Deterministic Ingestion (zero LLM dependency)        │
│                                                                 │
│  parseOcdsJson()  →  mapRelease()  →  TenderRecord              │
│  ─────────────────────────────────────────────────               │
│  • Strict OCDS 1.1 parsing with Zod-validated types             │
│  • CPV code normalization (check-digit stripping, 8-digit pad)  │
│  • Country normalization (ISO-3166 alpha-2 from any input)     │
│  • Fail-safe: malformed input → null, never crashes             │
└─────────────┬───────────────────────────────────────────────────┘
              │  TenderRecord (technologies = [])
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2 — Conditional LLM Enhancement (optional)              │
│                                                                 │
│  enhanceTechnologies(existing, description)                     │
│  ─────────────────────────────────────────────────               │
│  • Runs ONLY when required_technologies is empty               │
│  • Extracts ONLY tech names from the description string         │
│  • On failure: degrades to [] — pipeline never throws           │
│  • Full document extraction (extractTender) retained as        │
│    a fallback for non-OCDS / scanned documents                  │
└─────────────┬───────────────────────────────────────────────────┘
              │  TenderRecord (technologies filled)
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3 — Persistence (Supabase)                                │
│                                                                 │
│  persistTender()  ·  persistAward()                             │
│  ─────────────────────────────────────────────────               │
│  • Idempotent upserts on (source, source_id)                    │
│  • Company deduplication on (name, country)                     │
│  • pgvector embeddings for semantic search (future use)         │
│  • Row Level Security: reads open, writes via service role      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Matching Engine                                                 │
│                                                                 │
│  match_tenders_by_cpv_and_location()     ← pure relational      │
│  match_historical_awards_by_cpv()        ← pure relational      │
│  match_tenders() / match_awards()        ← pgvector (future)    │
│  ─────────────────────────────────────────────────               │
│  • CPV hierarchical prefix expansion (8-digit → division-2)    │
│  • Same-country bonus scoring                                   │
│  • No embeddings required for core matching                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js 16 · Tailwind v4)                            │
│                                                                 │
│  KPI Cards · Intelligence Table · Predictive Match Panel        │
│  ─────────────────────────────────────────────────               │
│  • Executive-grade UI, minimal ink, high data density           │
│  • Real-time tender tracking across DACH region                 │
│  • Predicted winner rankings from historical CPV overlap        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project structure

```
govtender-ai/
├── supabase/migrations/
│   ├── 0001_init.sql                    # Schema: companies, tenders, awards, pgvector
│   └── 0002_deterministic_matching.sql  # CPV prefix expansion + relational matching
│
├── src/lib/
│   ├── ingestion/
│   │   ├── ocds-types.ts                # OCDS 1.1 type definitions
│   │   ├── ocds-mapper.ts               # Deterministic OCDS → TenderRecord mapper
│   │   ├── cpv.ts                        # CPV normalization & prefix expansion
│   │   ├── persist.ts                    # Supabase upsert layer (client-injectable)
│   │   └── index.ts
│   │
│   ├── extraction/
│   │   ├── schema.ts                     # Zod schema (single source of truth)
│   │   ├── extract-tender.ts             # Full-document extraction (Phase 1 fallback)
│   │   ├── enhance-tender.ts             # Conditional tech-only LLM enhancement
│   │   ├── env.ts                        # Lazy env loading (never throws at import)
│   │   └── index.ts
│   │
│   └── pipeline.ts                       # Orchestrator: parse → map → enhance → persist
│
├── src/tests/
│   └── pipeline.e2e.ts                    # 26-case E2E test (runs keyless)
│
├── dashboard/                            # Next.js 16 executive dashboard
│   └── src/
│       ├── app/
│       │   ├── layout.tsx                # Inter + Source Serif 4 typography
│       │   ├── globals.css               # Tailwind v4 theme (navy/slate palette)
│       │   └── page.tsx                  # Dashboard: KPIs, table, predictive panel
│       ├── components/
│       │   ├── card.tsx                  # Card primitives
│       │   ├── table.tsx                 # Table primitives
│       │   └── badge.tsx                 # Badge (default + muted)
│       └── lib/
│           ├── cn.ts                     # clsx + tailwind-merge
│           └── mock-data.ts              # Demo tender & match data
│
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- Supabase project with `pgvector` enabled
- (Optional) Mistral AI API key for LLM enhancement

### 1. Install backend dependencies

```bash
npm install
cp .env.example .env    # add keys (MISTRAL_API_KEY is optional)
```

### 2. Run the E2E test (no keys required)

```bash
npx tsx src/tests/pipeline.e2e.ts
# → 26/26 [SUCCESS]
```

### 3. Apply database migrations

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste the SQL files into the Supabase Dashboard → SQL Editor.

### 4. Launch the dashboard

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:3000
```

### 5. (Optional) Test LLM extraction

```bash
MISTRAL_API_KEY=your_key npm run extract:demo
```

---

## Database schema

```
companies ─┐
           │  awarding_authority_id / winner_company_id
           ├─◄── tenders            (active notices, + embedding vector(1024))
           └─◄── historical_awards  (past winners,  + embedding vector(1024))
```

| Table | Rows (typical) | Key features |
|---|---|---|
| `companies` | Buyers + suppliers | Deduped on `(name, country)`, trigram search |
| `tenders` | Active procurement notices | CPV GIN index, country, HNSW embedding index |
| `historical_awards` | Past contract awards | Own embedding for direct winner prediction |

### Matching functions

| Function | Type | Use case |
|---|---|---|
| `match_tenders_by_cpv_and_location()` | Relational (CPV + country) | Find similar active tenders |
| `match_historical_awards_by_cpv()` | Relational (CPV + country) | Predict likely winners |
| `match_tenders()` | Semantic (pgvector) | Fuzzy similarity search (future) |
| `match_historical_awards()` | Semantic (pgvector) | Fuzzy winner prediction (future) |

---

## Key design decisions

### "Non-LLM First" architecture

The core pipeline — parsing, mapping, country normalization, CPV extraction,
persistence, and relational matching — runs entirely on deterministic code.
The Mistral LLM is invoked **only** as an optional enhancement when
`required_technologies` cannot be derived from the structured OCDS payload.

This means:
- The pipeline works offline, keyless, and in air-gapped environments
- Cost per tender is effectively €0 (no LLM API calls for standard OCDS)
- LLM latency is avoided on the critical path
- The system degrades gracefully: if Mistral is down, tenders still ingest

### CPV hierarchical matching

Rather than relying solely on vector similarity (which requires embedding
generation per tender), the primary matching engine expands CPV codes into
their 2–8 digit hierarchical prefixes. This means `"48000000"` (software
package) matches `"48217000"` (network software) at the `"48"` division
level — using a standard SQL join, no embeddings required.

### Lazy environment loading

`env.ts` uses JavaScript getters so the module can be imported without
requiring `MISTRAL_API_KEY`. The key is only demanded when an actual LLM
call is attempted. This was necessary to keep the deterministic ingestion
path and E2E tests fully independent of LLM configuration.

### Client injection for testability

`persistTender()` and `persistAward()` accept an optional Supabase client
parameter. The E2E test injects a mock client — no real database needed,
no Supabase credentials required.

---

## Tech stack

| Layer | Technology |
|---|---|
| Database & Auth | Supabase (PostgreSQL + pgvector) |
| Ingestion orchestration | n8n (automated daily scraping) |
| LLM enhancement | Mistral AI (optional, `mistral-small-latest`) |
| Embeddings | Mistral Embed (`mistral-embed`, 1024 dims) |
| Backend | TypeScript, Zod, OCDS types |
| Frontend | Next.js 16 (App Router), Tailwind CSS v4 |
| Document parsing | LlamaParse (for scanned PDFs, future) |

---

## Roadmap

- [x] **Phase 1** — Database schema with pgvector, Zod-validated extraction
- [x] **Phase 2** — Deterministic OCDS ingestion, CPV matching, conditional LLM
- [x] **Phase 3** — E2E test suite, executive dashboard
- [ ] **Phase 4** — n8n scraping workflows (TED, SIMAP, evergabe)
- [ ] **Phase 5** — Auth (organisation-scoped access, multi-tenant)
- [ ] **Phase 6** — Live Supabase integration in dashboard, real-time updates
- [ ] **Phase 7** — Embedding generation + semantic search toggle

---

## License

Private — all rights reserved.
