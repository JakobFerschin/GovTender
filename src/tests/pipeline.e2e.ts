/**
 * E2E smoke test for the ingestion pipeline.
 *
 *   OCDS JSON  ─►  parseOcdsJson()  ─►  mapRelease()
 *              ─►  enhanceTechnologies()  ─►  persistTender()/persistAward()
 *
 * Design goals:
 *   • Fully deterministic — no Mistral key, no live Supabase. Uses a mock
 *     Supabase client that records upserts and can simulate DB failures.
 *   • Fail-safe — every scenario is wrapped so a single failure prints
 *     `[ERROR]` and continues, never crashing the process.
 *   • Clear verdict — prints `[SUCCESS]` / `[ERROR]` per case and a final
 *     summary; exits non-zero if any assertion failed.
 *
 *   Run:  npx tsx src/tests/pipeline.e2e.ts
 */
import {
  parseOcdsJson,
  ingestRelease,
} from "../lib/pipeline.js";
import { mapRelease } from "../lib/ingestion/index.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OcdsRelease } from "../lib/ingestion/index.js";

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  [SUCCESS] ${msg}`);
  } else {
    failed++;
    console.log(`  [ERROR]   ${msg}`);
  }
}

async function case_(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n— ${name}`);
  try {
    await fn();
  } catch (err) {
    failed++;
    console.log(
      `  [ERROR]   threw unexpectedly: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Mock Supabase client
//   Mimics the slice of the fluent API used by persist.ts:
//   sb.from(table).upsert(row, opts).select(col).maybeSingle() -> { data, error }
// ---------------------------------------------------------------------------
interface StoredRow {
  table: string;
  row: Record<string, unknown>;
}

function makeMockSupabase(opts: {
  failTable?: string; // force an error on upserts to this table
} = {}): { client: SupabaseClient; rows: StoredRow[] } {
  const rows: StoredRow[] = [];
  let counter = 0;

  const client = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>) {
          // Simulate a constraint violation on a flagged table.
          if (opts.failTable === table) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: `simulated constraint violation on ${table}` },
                }),
              }),
            };
          }
          counter += 1;
          const id = `mock-${counter}`;
          rows.push({ table, row: { id, ...row } });
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id }, error: null }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, rows };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function validRelease(): OcdsRelease {
  return {
    ocid: "ocds-test-0001",
    id: "release-1",
    date: "2026-06-01T00:00:00Z",
    parties: [
      {
        id: "org-buyer",
        name: "Bundesministerium für Digitales",
        roles: ["buyer"],
        address: { country: "DE" },
      },
      {
        id: "org-supplier",
        name: "Accelereon IT GmbH",
        roles: ["supplier"],
        address: { country: "DE" },
      },
    ],
    tender: {
      id: "t1",
      title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
      description:
        "Aufbau einer Kubernetes-basierten Plattform mit PostgreSQL-Migration " +
        "und ElasticSearch-SIEM; Beratung zu Zero-Trust und ISO 27001.",
      status: "active",
      value: { amount: 4250000, currency: "EUR" },
      tenderPeriod: { endDate: "2026-07-14T12:00:00Z" },
      procurementMethod: "open",
      procuringEntity: { id: "org-buyer" },
      items: [
        { classification: { scheme: "CPV", id: "48000000-8" } },
        { classification: { scheme: "CPV", id: "72267100-7" } },
      ],
    },
    awards: [
      {
        id: "a1",
        title: "Vergabe Cloud-Plattform",
        status: "active",
        date: "2025-11-01",
        value: { amount: 3900000, currency: "EUR" },
        suppliers: [{ id: "org-supplier" }],
        items: [{ classification: { scheme: "CPV", id: "48000000" } }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=== GovTender AI — Pipeline E2E Smoke Test ===");
  console.log(`(deterministic mode: MISTRAL_API_KEY ${process.env.MISTRAL_API_KEY ? "set" : "UNSET — OK"})`);

  // --- Case 1: deterministic mapRelease (no I/O) -------------------------
  await case_("mapRelease produces a tender + award from valid OCDS", async () => {
    const { tender, awards } = mapRelease(validRelease());
    assert(!!tender, "tender mapped");
    if (tender) {
      assert(tender.title.includes("Cloud-Native"), "title carried through");
      assert(tender.cpv_codes.length === 2, `cpv_codes length = ${tender.cpv_codes.length}`);
      assert(tender.country === "de", `country normalised to 'de' (got ${tender.country})`);
      assert(tender.estimated_budget === 4250000, "budget mapped");
    }
    assert(awards.length === 1, "one award mapped");
    assert(awards[0]?.winner_name === "Accelereon IT GmbH", "winner name mapped");
  });

  // --- Case 2: full pipeline happy path (mock DB, LLM disabled) ----------
  await case_("ingestRelease happy path persists tender + award", async () => {
    const { client, rows } = makeMockSupabase();
    const result = await ingestRelease(validRelease(), {
      supabase: client,
      allowLlm: false, // deterministic — no Mistral call
    });

    assert(result.ok, "pipeline reports ok");
    assert(result.techSource === "none", `techSource is 'none' with LLM off (got ${result.techSource})`);
    assert(result.tenderId != null, `tender persisted to DB (got ${result.tenderId})`);
    // mock-1=company(buyer), mock-2=company(supplier), mock-3=tender, mock-4=company again (winner resolve)...
    assert(result.awardIds.length === 1, "one award id returned");

    const tenderRows = rows.filter((r) => r.table === "tenders");
    assert(tenderRows.length === 1, "exactly one tenders row upserted");
    const awardRows = rows.filter((r) => r.table === "historical_awards");
    assert(awardRows.length === 1, "exactly one historical_awards row upserted");
  });

  // --- Case 3: fail-safe JSON parsing ------------------------------------
  await case_("parseOcdsJson handles malformed input without throwing", async () => {
    assert(parseOcdsJson("{ not json") === null, "malformed JSON string -> null");
    assert(parseOcdsJson(null) === null, "null -> null");
    assert(parseOcdsJson("undefined") === null, "non-object literal -> null");
    assert(parseOcdsJson({ id: "x" }) === null, "object missing ocid -> null");
    assert(parseOcdsJson({ ocid: "ocds-x" }) !== null, "object with ocid -> release");
    assert(parseOcdsJson('{"ocid":"ocds-y"}') !== null, "valid JSON string -> release");
  });

  // --- Case 4: missing / partial fields ----------------------------------
  await case_("ingestRelease skips gracefully on empty release", async () => {
    const { client } = makeMockSupabase();
    const result = await ingestRelease(
      { ocid: "ocds-empty", id: "r-empty" },
      { supabase: client, allowLlm: false },
    );
    assert(result.ok, "ok=true even when nothing to do");
    assert(!!result.skipped, "skipped reason provided");
    assert(result.tenderId === null, "no tender persisted");
  });

  // --- Case 5: DB constraint violation on tenders ------------------------
  await case_("ingestRelease survives a tender upsert failure", async () => {
    const { client } = makeMockSupabase({ failTable: "tenders" });
    const result = await ingestRelease(validRelease(), {
      supabase: client,
      allowLlm: false,
    });
    // tender upsert fails -> id null, but process does NOT crash.
    assert(result.tenderId === null, "tender id null on DB failure");
    // ok stays true: the pipeline handled it; the award path still runs.
    assert(result.awardIds.length === 1, "award path still attempted");
  });

  // --- Case 6: LLM disabled by default when no key -----------------------
  await case_("no Mistral key present does not break enhancement", async () => {
    const { client } = makeMockSupabase();
    const original = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    try {
      const result = await ingestRelease(validRelease(), {
        supabase: client,
        allowLlm: true, // even if allowed, no key => must degrade
      });
      assert(result.ok, "pipeline ok without Mistral key");
      assert(result.technologies.length === 0, "technologies empty when LLM unavailable");
    } finally {
      if (original) process.env.MISTRAL_API_KEY = original;
    }
  });

  // --- Summary -----------------------------------------------------------
  console.log("\n=== Summary ===");
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log("[ERROR] pipeline e2e test FAILED");
    process.exit(1);
  } else {
    console.log("[SUCCESS] pipeline e2e test PASSED");
    process.exit(0);
  }
}

void main();
