# GovTender AI

AI-driven analyzer for EU & DACH public procurement tenders. Scrapes notices,
parses bureaucratic PDFs into structured data, and uses LLM + vector search to
predict likely winners and surface technology trends.

> **Status:** Phase 1 — Database & extraction schema. This is the foundation;
> ingestion orchestration (n8n), the predictive engine, and the dashboard land
> in later phases.

---

## Phase 1 deliverables

| Deliverable | Location |
|---|---|
| Supabase SQL schema (pgvector, RLS, search fns) | `supabase/migrations/0001_init.sql` |
| Typed Mistral extraction utility (Zod-validated) | `src/lib/extraction/` |
| Runnable demo against a sample tender | `src/lib/extraction/demo.ts` |

---

## Quick start

### 1. Database

Create a Supabase project (pgvector is enabled by default on new projects), then
apply the migration. Either:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

…or paste `supabase/migrations/0001_init.sql` into the Supabase **SQL Editor**
and run it. The migration is idempotent.

### 2. Extraction utility

```bash
npm install
cp .env.example .env      # then add your MISTRAL_API_KEY
npm run extract:demo      # runs the sample DACH tender through the extractor
```

### 3. Use it programmatically

```ts
import { extractTender } from "./src/lib/extraction/index.js";

const { data, attempts } = await extractTender(scrapedPdfText);
// data.title, data.estimated_budget, data.required_technologies, data.awarding_authority
```

---

## Schema overview

```
companies ─┐
           │  awarding_authority_id / winner_company_id
           ├─◄── tenders            (active notices, + embedding vector(1024))
           └─◄── historical_awards  (past winners,  + embedding vector(1024))
```

- **`companies`** — both buyers and suppliers, deduped on `(name, country)`.
- **`tenders`** — active notices. `embedding` (mistral-embed, 1024 dims) is built
  from title + description + CPV codes + required tech. Indexed with HNSW.
- **`historical_awards`** — past award notices with their winners. Own embedding
  so the predictive engine can match a *new* tender directly against past awards.

### Vector search

Two `STABLE` SQL functions back the (Phase 3) predictive engine:

- `match_tenders(query_embedding, match_count, threshold, status)` — nearest
  active tenders by cosine similarity.
- `match_historical_awards(query_embedding, match_count, threshold)` — nearest
  past awards; the winner names of the top hits feed winner prediction.

Similarity is returned as `1 - cosine_distance` (1.0 = identical).

### Row Level Security

Procurement notices are public data, so **read access is open** to the
`anon`/`authenticated` roles. **No write policies are defined** — writes are
expected to come from trusted workers (n8n, Edge Functions) using the
**service role key**, which bypasses RLS. Organisation-scoped write policies
land in Phase 2.

---

## Extraction design

`extractTender(rawText)` enforces a strict contract using three layers:

1. **Prompt constraint** — `responseFormat: { type: 'json_object' }` plus a
   system prompt that lists exact field names, types, and extraction rules.
2. **Defensive parsing** — `safeJsonParse()` handles raw JSON, ```` ```json ````
   fences, and leading commentary.
3. **Zod validation + repair** — `TenderExtractionSchema` validates and
   normalises (e.g. lowercases + dedupes technologies). On failure, the Zod
   issues are fed back to the model as a repair hint for one retry.

The schema lives in one place (`schema.ts`) and is reused as the prompt
contract, the validator, and (Phase 2) the mapper onto DB columns.

---

## Roadmap

- **Phase 2** — Data ingestion: n8n scraping jobs (TED, SIMAP, evergabe),
  LlamaParse PDF/OCR step, embedding generation, Supabase write paths.
- **Phase 3** — Predictive matching engine: vector search → win-probability
  scoring against `historical_awards`.
- **Phase 4** — Next.js analytics dashboard with AI summaries & tech-trend
  filters.

---

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MISTRAL_API_KEY` | *(required)* | Mistral platform key |
| `MISTRAL_MODEL` | `mistral-small-latest` | Chat model for extraction |
| `MISTRAL_EMBEDDING_MODEL` | `mistral-embed` | Must match the `vector(1024)` column |
| `SUPABASE_URL` | — | Phase 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Phase 2 |

> If you ever change the embedding provider, recreate the `embedding` columns
> with the matching dimension and update the `match_*` functions. The header
> comment in `0001_init.sql` lists the common dimensions.
