/**
 * E2E & regression test suite for the GovTender AI ingestion & extraction pipeline.
 *
 *   OCDS JSON  ─►  parseOcdsJson()  ─►  mapRelease()
 *              ─►  enhanceTechnologies()  ─►  persistTender()/persistAward()
 *
 * Design goals:
 *   • Fully deterministic & keyless — no Mistral key, no live Supabase, no network.
 *     Uses a mock Supabase client that records upserts and can simulate DB failures.
 *   • Fail-safe — every scenario is wrapped so a single failure prints
 *     `[ERROR]` and continues, never crashing the process.
 *   • Clear verdict — prints `[SUCCESS]` / `[ERROR]` per assertion and exits
 *     non-zero if any assertion fails.
 *
 *   Run:  npm run test:pipeline
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOcdsJson, ingestRelease } from "../lib/pipeline.js";
import {
  mapRelease,
  mapTenderStatus,
  type OcdsRelease,
} from "../lib/ingestion/index.js";
import {
  enhanceTechnologies,
  generateStrategicBrief,
  type BidRecommendation,
} from "../lib/extraction/enhance-tender.js";

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
//   Mimics the fluent API used by persist.ts:
//   sb.from(table).upsert(row, opts).select(col).maybeSingle() -> { data, error }
// ---------------------------------------------------------------------------
interface StoredRow {
  table: string;
  row: Record<string, unknown>;
}

function makeMockSupabase(
  opts: {
    failTable?: string;
  } = {},
): { client: SupabaseClient; rows: StoredRow[] } {
  const rows: StoredRow[] = [];
  let counter = 0;

  const client = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>) {
          if (opts.failTable === table) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: {
                    message: `simulated constraint violation on ${table}`,
                  },
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
        insert(row: Record<string, unknown>) {
          counter += 1;
          const id = `mock-ins-${counter}`;
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
    url: "https://ted.europa.eu/en/notice/-/detail/691420-2026",
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
      tenderPeriod: { endDate: "2026-12-14T12:00:00Z" },
      procurementMethod: "open",
      procuringEntity: { id: "org-buyer" },
      items: [
        { classification: { scheme: "CPV", id: "48000000-8" } },
        { classification: { scheme: "CPV", id: "72267100-7" } },
      ],
      documents: [
        {
          id: "doc-1",
          documentType: "tenderNotice",
          url: "https://ted.europa.eu/en/notice/-/detail/691420-2026/pdf",
        },
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

/** Release whose prose contains zero curated technology keywords (tests LLM fallback / degradation). */
function nonTechRelease(): OcdsRelease {
  return {
    ocid: "ocds-test-nontech-0002",
    id: "release-nontech",
    date: "2026-07-01T00:00:00Z",
    parties: [
      {
        id: "org-buyer-municipal",
        name: "Stadtverwaltung Musterstadt",
        roles: ["buyer"],
        address: { country: "AT" },
      },
    ],
    tender: {
      id: "t-nontech",
      title: "Lieferung von Büromöbeln und Akustikelementen",
      description:
        "Rahmenvereinbarung über die Lieferung, Montage und Entsorgung ergonomischer Arbeitsplatzmöbel für kommunale Dienststellen.",
      status: "active",
      value: { amount: 180000, currency: "EUR" },
      tenderPeriod: { endDate: "2027-01-20T12:00:00Z" },
      procurementMethod: "open",
      procuringEntity: { id: "org-buyer-municipal" },
      items: [{ classification: { scheme: "CPV", id: "39130000-2" } }],
    },
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=== GovTender AI — Pipeline E2E & Regression Test Suite ===");
  console.log(
    `(deterministic mode: MISTRAL_API_KEY ${process.env.MISTRAL_API_KEY ? "set" : "UNSET — OK"})`,
  );

  // --- Case 1: deterministic mapRelease (no I/O) -------------------------
  await case_("mapRelease produces a tender + award with deterministic tech extraction", async () => {
    const { tender, awards } = mapRelease(validRelease());
    assert(!!tender, "tender mapped");
    if (tender) {
      assert(tender.title.includes("Cloud-Native"), "title carried through");
      assert(tender.cpv_codes.length === 2, `cpv_codes length = ${tender.cpv_codes.length}`);
      assert(tender.country === "de", `country normalised to 'de' (got ${tender.country})`);
      assert(tender.estimated_budget === 4250000, "budget mapped");
      const techs = tender.required_technologies ?? [];
      assert(techs.includes("kubernetes"), "deterministic tech includes 'kubernetes'");
      assert(techs.includes("postgresql"), "deterministic tech includes 'postgresql'");
      assert(techs.includes("elasticsearch"), "deterministic tech includes 'elasticsearch'");
      assert(techs.includes("iso 27001"), "deterministic tech includes 'iso 27001'");
    }
    assert(awards.length === 1, "one award mapped");
    assert(awards[0]?.winner_name === "Accelereon IT GmbH", "winner name mapped");
  });

  // --- Case 2: full pipeline happy path (Non-LLM-First deterministic tech) ---
  await case_("ingestRelease happy path uses deterministic tech extraction and persists tender + award", async () => {
    const { client, rows } = makeMockSupabase();
    const result = await ingestRelease(validRelease(), {
      supabase: client,
      allowLlm: false,
    });

    assert(result.ok, "pipeline reports ok");
    assert(
      result.techSource === "deterministic",
      `techSource is 'deterministic' via regex extraction (got ${result.techSource})`,
    );
    assert(result.technologies.includes("kubernetes"), "result.technologies includes 'kubernetes'");
    assert(result.technologies.includes("postgresql"), "result.technologies includes 'postgresql'");
    assert(result.technologies.includes("elasticsearch"), "result.technologies includes 'elasticsearch'");
    assert(result.technologies.includes("iso 27001"), "result.technologies includes 'iso 27001'");
    assert(result.tenderId != null, `tender persisted to DB (got ${result.tenderId})`);
    assert(result.awardIds.length === 1 && result.awardIds[0] != null, "one award persisted");

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
    assert(result.tenderId === null, "tender id null on DB failure");
    assert(result.awardIds.length === 1 && result.awardIds[0] != null, "award path still succeeds");
  });

  // --- Case 6: No Mistral key present degrades gracefully ----------------
  await case_("no Mistral key present degrades cleanly for non-tech descriptions", async () => {
    const { client } = makeMockSupabase();
    const original = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    try {
      const result = await ingestRelease(nonTechRelease(), {
        supabase: client,
        allowLlm: true,
      });
      assert(result.ok, "pipeline ok without Mistral key");
      assert(result.techSource === "none", `techSource is 'none' when no deterministic or LLM techs (got ${result.techSource})`);
      assert(result.technologies.length === 0, "technologies empty when neither regex nor LLM yields matches");
    } finally {
      if (original !== undefined) process.env.MISTRAL_API_KEY = original;
    }
  });

  // --- Case 7 (Regression): Status enum mapping --------------------------
  await case_("Regression: mapTenderStatus maps OCDS statuses to Postgres tender_status enum", async () => {
    assert(mapTenderStatus("complete") === "awarded", "'complete' -> 'awarded'");
    assert(mapTenderStatus("cancelled") === "withdrawn", "'cancelled' -> 'withdrawn'");
    assert(mapTenderStatus("withdrawn") === "withdrawn", "'withdrawn' -> 'withdrawn'");
    assert(mapTenderStatus("unsuccessful") === "closed", "'unsuccessful' -> 'closed'");
    assert(mapTenderStatus("active") === "active", "'active' -> 'active'");
    assert(mapTenderStatus("planning") === "active", "'planning' -> 'active'");
    assert(mapTenderStatus(undefined) === "active", "undefined -> 'active'");

    const rel = validRelease();
    if (rel.tender) rel.tender.status = "complete";
    const { tender } = mapRelease(rel);
    assert(tender?.status === "awarded", "mapRelease propagates mapped status 'awarded'");
  });

  // --- Case 8 (Regression): Award-only release persistence ---------------
  await case_("Regression: award-only release (no tender) persists awards when dryRun=false", async () => {
    const { client, rows } = makeMockSupabase();
    const awardOnlyRelease: OcdsRelease = {
      ocid: "ocds-award-only-001",
      id: "rel-award-only-1",
      date: "2026-09-21T10:15:00Z",
      url: "https://ted.europa.eu/en/notice/-/detail/589204-2026",
      parties: [
        {
          id: "org-buyer-bsi",
          name: "BSI Bonn",
          roles: ["buyer"],
          address: { country: "DE" },
        },
        {
          id: "org-supplier-secu",
          name: "SecuNova AG",
          roles: ["supplier"],
          address: { country: "DE" },
        },
      ],
      awards: [
        {
          id: "award-only-1",
          title: "24/7 SOC Managed Detection & Response",
          status: "active",
          date: "2026-09-14",
          value: { amount: 2850000, currency: "EUR" },
          suppliers: [{ id: "org-supplier-secu", name: "SecuNova AG" }],
          items: [{ classification: { scheme: "CPV", id: "72212730-5" } }],
        },
      ],
    };

    const result = await ingestRelease(awardOnlyRelease, {
      supabase: client,
      dryRun: false,
      allowLlm: false,
      source: "ted",
    });

    assert(result.ok, "award-only ingestion reports ok=true");
    assert(result.skipped === undefined, "award-only release is NOT skipped");
    assert(result.tenderId === null, "tenderId is null for award-only release");
    assert(result.awardIds.length === 1 && result.awardIds[0] != null, "award persisted with non-null id");

    const tenderRows = rows.filter((r) => r.table === "tenders");
    const awardRows = rows.filter((r) => r.table === "historical_awards");
    assert(tenderRows.length === 0, "0 tenders rows upserted");
    assert(awardRows.length === 1, "1 historical_awards row upserted");
    assert(awardRows[0]?.row.winner_name === "SecuNova AG", "persisted award carries winner_name");
    assert(awardRows[0]?.row.source === "ted", "persisted award carries source='ted'");
  });

  // --- Case 9 (Regression): findParty refId priority ---------------------
  await case_("Regression: findParty prioritizes refId over first role match", async () => {
    const multiSupplierRelease: OcdsRelease = {
      ocid: "ocds-multi-supplier-001",
      id: "rel-multi-1",
      date: "2026-08-01T00:00:00Z",
      parties: [
        {
          id: "buyer-1",
          name: "First Buyer",
          roles: ["buyer"],
          address: { country: "DE" },
        },
        {
          id: "buyer-2",
          name: "Second Buyer Austria",
          roles: ["buyer"],
          address: { country: "AT" },
        },
        {
          id: "supplier-1",
          name: "First Supplier GmbH",
          roles: ["supplier"],
          address: { country: "DE" },
        },
        {
          id: "supplier-2",
          name: "Second Supplier AG",
          roles: ["supplier"],
          address: { country: "CH" },
        },
      ],
      tender: {
        id: "t-multi",
        title: "Multi-party procurement notice",
        status: "complete",
        procuringEntity: { id: "buyer-2" },
        items: [{ classification: { scheme: "CPV", id: "72000000-5" } }],
      },
      awards: [
        {
          id: "a-multi",
          title: "Award to Second Supplier",
          status: "active",
          date: "2026-08-10",
          value: { amount: 950000, currency: "CHF" },
          suppliers: [{ id: "supplier-2" }],
          items: [{ classification: { scheme: "CPV", id: "72000000-5" } }],
        },
      ],
    };

    const { tender, awards } = mapRelease(multiSupplierRelease);
    assert(
      tender?.awarding_authority_name === "Second Buyer Austria",
      `buyer resolved via refId ('${tender?.awarding_authority_name}')`,
    );
    assert(
      tender?.country === "at",
      `buyer country resolved from second buyer ('${tender?.country}')`,
    );
    assert(
      awards[0]?.winner_name === "Second Supplier AG",
      `award resolved second supplier via refId ('${awards[0]?.winner_name}')`,
    );
    assert(
      awards[0]?.winner_country === "ch",
      `award resolved second supplier country ('${awards[0]?.winner_country}')`,
    );
  });

  // --- Case 10 (Regression): Source provenance & persisted fields --------
  await case_("Regression: source provenance and source_url/procedure/raw_payload are persisted", async () => {
    const { client, rows } = makeMockSupabase();
    const rel = validRelease();
    const result = await ingestRelease(rel, {
      supabase: client,
      allowLlm: false,
      source: "ted",
    });

    assert(result.ok, "ingestRelease with source='ted' succeeded");

    const tenderRow = rows.find((r) => r.table === "tenders")?.row;
    const awardRow = rows.find((r) => r.table === "historical_awards")?.row;

    assert(tenderRow?.source === "ted", `tender.source === 'ted' (got '${String(tenderRow?.source)}')`);
    assert(awardRow?.source === "ted", `award.source === 'ted' (got '${String(awardRow?.source)}')`);
    assert(
      tenderRow?.source_url === "https://ted.europa.eu/en/notice/-/detail/691420-2026/pdf",
      `tender.source_url populated from document url (${String(tenderRow?.source_url)})`,
    );
    assert(tenderRow?.procedure === "open", `tender.procedure === 'open' (got '${String(tenderRow?.procedure)}')`);
    assert(
      tenderRow?.raw_payload != null &&
        typeof tenderRow.raw_payload === "object" &&
        (tenderRow.raw_payload as { ocid?: string }).ocid === rel.ocid,
      "tender.raw_payload retains original OCDS release",
    );
    assert(
      typeof awardRow?.source_url === "string" && awardRow.source_url.startsWith("https://"),
      "award.source_url populated",
    );
    assert(
      awardRow?.raw_payload != null &&
        (awardRow.raw_payload as { ocid?: string }).ocid === rel.ocid,
      "award.raw_payload retains original OCDS release",
    );
  });

  // --- Case 11 (Regression): Lazy Mistral import safety ------------------
  await case_("Regression: importing extraction module without MISTRAL_API_KEY never throws", async () => {
    const original = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    try {
      const mod = await import("../lib/extraction/index.js");
      assert(typeof mod.extractTender === "function", "extractTender imported cleanly without key");
      assert(typeof mod.enhanceTechnologies === "function", "enhanceTechnologies imported cleanly without key");
      assert(mod.env.hasMistralKey === false, "env.hasMistralKey reports false without throwing");
    } finally {
      if (original !== undefined) process.env.MISTRAL_API_KEY = original;
    }
  });

  // --- Case 12 (Regression): Real timeoutMs abort enforcement ------------
  await case_("Regression: timeoutMs enforces real abort in enhanceTechnologies and extractTender", async () => {
    // 12a. enhanceTechnologies: hangs 200ms with timeoutMs=25 -> degrades cleanly in <150ms
    let enhanceSignalAborted = false;
    const t0 = Date.now();
    const enhanced = await enhanceTechnologies(
      [],
      "Entwicklung einer maßgeschneiderten Fachanwendung für kommunale Bauanträge mit langfristigem Betrieb.",
      {
        allowLlm: true,
        timeoutMs: 25,
        maxAttempts: 1,
        llmCallOverride: (_desc, signal) =>
          new Promise((resolve) => {
            const timer = setTimeout(
              () => resolve({ technologies: ["should-not-resolve"] }),
              200,
            );
            signal.addEventListener(
              "abort",
              () => {
                enhanceSignalAborted = true;
                clearTimeout(timer);
              },
              { once: true },
            );
          }),
      },
    );
    const enhanceElapsed = Date.now() - t0;
    assert(
      enhanced.source === "none" && enhanced.required_technologies.length === 0,
      `enhanceTechnologies degraded cleanly to [] / 'none' on timeout (got source=${enhanced.source})`,
    );
    assert(
      enhanceElapsed < 150,
      `enhanceTechnologies aborted promptly in ${enhanceElapsed}ms (<150ms)`,
    );
    assert(enhanceSignalAborted, "enhanceTechnologies fired AbortSignal on timeout");

    // 12b. extractTender: hangs 200ms with timeoutMs=25 -> rejects with timeout error in <150ms
    const { extractTender } = await import("../lib/extraction/index.js");
    let extractSignalAborted = false;
    let extractErr: Error | null = null;
    const t1 = Date.now();
    try {
      await extractTender(
        "Ausschreibung für den Betrieb einer zentralen Verwaltungsplattform im DACH-Raum mit 4-jähriger Laufzeit.",
        {
          timeoutMs: 25,
          maxAttempts: 1,
          callFn: (_text, opts) =>
            new Promise((resolve) => {
              const timer = setTimeout(() => resolve("{}"), 200);
              opts.signal.addEventListener(
                "abort",
                () => {
                  extractSignalAborted = true;
                  clearTimeout(timer);
                },
                { once: true },
              );
            }),
        },
      );
    } catch (err) {
      extractErr = err instanceof Error ? err : new Error(String(err));
    }
    const extractElapsed = Date.now() - t1;
    assert(extractErr !== null, "extractTender rejected on timeout");
    assert(
      extractErr !== null && /timed out/i.test(extractErr.message),
      `extractTender error mentions timeout ('${extractErr?.message ?? ""}')`,
    );
    assert(
      extractElapsed < 150,
      `extractTender aborted promptly in ${extractElapsed}ms (<150ms)`,
    );
    assert(extractSignalAborted, "extractTender fired AbortSignal on timeout");
  });

  // --- Case 13: generateStrategicBrief deterministic Bid/No-Bid ----------
  await case_("generateStrategicBrief returns valid STRONG BID / EVALUATE / PASS briefs", async () => {
    const validRecommendations = new Set<BidRecommendation>([
      "STRONG BID",
      "EVALUATE",
      "PASS",
    ]);

    const futureDeadline = new Date(Date.now() + 45 * 86_400_000).toISOString();
    const pastDeadline = new Date(Date.now() - 10 * 86_400_000).toISOString();

    const strong = generateStrategicBrief({
      title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
      description: "Kubernetes, PostgreSQL, ISO 27001, BSI C5, Zero Trust",
      country: "DE",
      budget: 4_250_000,
      cpvCodes: ["48000000", "72267100"],
      technologies: ["kubernetes", "postgresql", "iso 27001", "zero trust"],
      deadline: futureDeadline,
    });
    assert(validRecommendations.has(strong.recommendation), "strong brief recommendation is valid enum");
    assert(strong.recommendation === "STRONG BID", `flagship DACH digital tender -> STRONG BID (got ${strong.recommendation})`);
    assert(strong.rationale.length > 20, "strong brief provides executive rationale");
    assert(strong.strategicPriorities.length >= 2, "strong brief includes strategic priorities");

    const evaluate = generateStrategicBrief({
      title: "Regional Municipal Advisory Services",
      country: "FR",
      budget: 180_000,
      cpvCodes: ["79400000"],
      technologies: [],
      deadline: futureDeadline,
    });
    assert(validRecommendations.has(evaluate.recommendation), "evaluate brief recommendation is valid enum");
    assert(evaluate.recommendation === "EVALUATE", `mid-range partial tender -> EVALUATE (got ${evaluate.recommendation})`);
    assert(evaluate.riskFlags.length >= 1, "evaluate brief surfaces risk flags");

    const pass = generateStrategicBrief({
      title: "Expired Legacy Maintenance Notice",
      country: "US",
      budget: 25_000,
      cpvCodes: ["90000000"],
      technologies: [],
      deadline: pastDeadline,
    });
    assert(validRecommendations.has(pass.recommendation), "pass brief recommendation is valid enum");
    assert(pass.recommendation === "PASS", `expired notice -> PASS (got ${pass.recommendation})`);
    assert(
      pass.riskFlags.some((f) => /deadline has already passed/i.test(f)),
      "pass brief flags expired deadline",
    );
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
