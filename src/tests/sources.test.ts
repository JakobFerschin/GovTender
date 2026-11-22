/**
 * Source adapter & orchestrator test suite (keyless, deterministic).
 *
 *   Run:  npm run test:sources
 *
 * Verifies:
 *   1. TED adapter returns fixture data when no token is set (keyless).
 *   2. OCDS feed adapter is gracefully disabled without a URL.
 *   3. OCDS feed fetches via injected fetchImpl.
 *   4. Orchestrator runs all sources + ingests without throwing (dryRun + crash resilience).
 *   5. TED_API_TOKEN is sent via Authorization: Bearer <token> and x-api-key headers.
 *   6. safeFetchJsonDetailed supports custom headers, POST body, transient 503 retries,
 *      non-retryable 4xx, and real timeout aborts.
 *   7. runIngestion propagates true platform source ("ted", "simap", "evergabe") into
 *      persisted rows and populates sourceReports telemetry.
 *   8. ALL_FIXTURES releases have valid OCDS ocids and future 2026-12+ / 2027 deadlines.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TedSource,
  OcdsFeedSource,
  runIngestion,
  defaultSources,
  isOcdsRelease,
  safeFetchJsonDetailed,
  TED_FIXTURES,
  SIMAP_FIXTURES,
  EVERGABE_FIXTURES,
  ALL_FIXTURES,
  type SourceAdapter,
  type SourceResult,
} from "../lib/sources/index.js";

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
    console.log(`  [ERROR]   threw: ${err instanceof Error ? err.message : err}`);
  }
}

function readHeader(
  headers: RequestInit["headers"],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const pair = headers.find((entry) => entry[0]?.toLowerCase() === target);
    return typeof pair?.[1] === "string" ? pair[1] : undefined;
  }
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === target && typeof v === "string") return v;
  }
  return undefined;
}

interface StoredRow {
  table: string;
  op: "upsert" | "insert";
  row: Record<string, unknown>;
}

function makeMockSupabase(): { client: SupabaseClient; rows: StoredRow[] } {
  const rows: StoredRow[] = [];
  let counter = 0;

  const client = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>) {
          counter += 1;
          const id = `mock-up-${counter}`;
          rows.push({ table, op: "upsert", row: { id, ...row } });
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id }, error: null }),
            }),
          };
        },
        insert(row: Record<string, unknown>) {
          counter += 1;
          const id = `mock-in-${counter}`;
          rows.push({ table, op: "insert", row: { id, ...row } });
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

// A mock source that injects a malformed release + a good one.
function makeMalformedSource(): SourceAdapter {
  return {
    source: "malformed-test",
    label: "Malformed Test Source",
    async fetch(): Promise<SourceResult> {
      return {
        source: "malformed-test",
        label: "Malformed Test Source",
        releases: [
          {
            ocid: "ocds-test-valid",
            id: "r1",
            date: "2026-06-01T00:00:00Z",
            parties: [
              {
                id: "b1",
                name: "Test Buyer",
                roles: ["buyer"],
                address: { country: "DE" },
              },
            ],
            tender: {
              id: "t1",
              title: "Valid Test Tender",
              value: { amount: 100000, currency: "EUR" },
              procuringEntity: { id: "b1" },
              items: [{ classification: { scheme: "CPV", id: "48000000-8" } }],
              tenderPeriod: { endDate: "2026-12-01T12:00:00Z" },
            },
          },
          // Malformed: no ocid.
          { id: "bad", tender: { title: "no ocid" } } as never,
        ],
        skipped: 0,
      };
    },
  };
}

async function main(): Promise<void> {
  console.log("=== GovTender AI — Source Adapter & Orchestrator Test Suite ===");

  // --- Original 15 baseline assertions (preserved) -----------------------
  await case_("TED adapter returns fixtures when no token set", async () => {
    const original = process.env.TED_API_TOKEN;
    delete process.env.TED_API_TOKEN;
    try {
      const result = await new TedSource().fetch({ limit: 10 });
      assert(result.source === "ted", "source = 'ted'");
      assert(result.releases.length > 0, `returned ${result.releases.length} releases`);
      assert(!!result.error, "reports fallback reason in error field");
      assert(isOcdsRelease(result.releases[0]), "first release is valid OCDS");
    } finally {
      if (original !== undefined) process.env.TED_API_TOKEN = original;
    }
  });

  await case_("OCDS feed disabled gracefully without URL", async () => {
    const src = new OcdsFeedSource({ source: "test", label: "Test Feed" });
    const result = await src.fetch();
    assert(result.releases.length === 0, "empty releases when no feedUrl");
    assert(!!result.error, "reports disabled reason in error field");
  });

  await case_("OCDS feed fetches via injected fetchImpl", async () => {
    const src = new OcdsFeedSource({
      source: "mock-feed",
      label: "Mock Feed",
      feedUrl: "https://example.test/feed",
    });
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          releases: [{ ocid: "ocds-mock-1", id: "r1" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    const result = await src.fetch({ fetchImpl: fakeFetch });
    assert(result.releases.length === 1, `fetched ${result.releases.length} release`);
    assert(!result.error, "no error on successful fetch");
  });

  await case_("Orchestrator ingests without DB (dryRun)", async () => {
    const report = await runIngestion([new TedSource(), makeMalformedSource()], {
      dryRun: true,
      allowLlm: false,
    });
    assert(report.sourcesRun === 2, `ran ${report.sourcesRun} sources`);
    assert(report.releasesFetched > 0, `fetched ${report.releasesFetched} releases`);
    assert(report.durationMs >= 0, "durationMs reported");
    assert(report.tendersIngested === 0, `dryRun → 0 persisted (got ${report.tendersIngested})`);
  });

  await case_("Orchestrator handles a crashing source", async () => {
    const crashy: SourceAdapter = {
      source: "crash",
      label: "Crash",
      async fetch() {
        throw new Error("boom");
      },
    };
    const report = await runIngestion([crashy], { dryRun: true });
    assert(report.errors.length === 1, "crashing source captured in errors");
    assert(report.errors[0]?.error === "boom", "error message preserved");
    assert(report.releasesFetched === 0, "no releases from crashed source");
  });

  // --- Regression 1: TED_API_TOKEN headers spy ---------------------------
  await case_("Regression: TedSource sends TED_API_TOKEN in Authorization Bearer & x-api-key headers", async () => {
    const originalToken = process.env.TED_API_TOKEN;
    const originalBase = process.env.TED_API_BASE;
    process.env.TED_API_TOKEN = "ted-secret-token-42";
    process.env.TED_API_BASE = "https://ted.mock.local/v3";

    let capturedUrl = "";
    let capturedAuth: string | undefined;
    let capturedApiKey: string | undefined;

    const spyFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedAuth = readHeader(init?.headers, "authorization");
      capturedApiKey = readHeader(init?.headers, "x-api-key");
      return new Response(
        JSON.stringify({
          releases: [{ ocid: "ocds-ted-live-99", id: "rel-99" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const result = await new TedSource().fetch({ fetchImpl: spyFetch, limit: 5 });
      assert(
        capturedUrl === "https://ted.mock.local/v3/notices/search?fields=OCDS&limit=5",
        `requested configured TED_API_BASE URL (${capturedUrl})`,
      );
      assert(
        capturedAuth === "Bearer ted-secret-token-42",
        `Authorization header = 'Bearer ted-secret-token-42' (got '${capturedAuth ?? ""}')`,
      );
      assert(
        capturedApiKey === "ted-secret-token-42",
        `x-api-key header = 'ted-secret-token-42' (got '${capturedApiKey ?? ""}')`,
      );
      assert(result.mode === "live", `mode === 'live' (got '${String(result.mode)}')`);
      assert(result.releases.length === 1, "parsed 1 live OCDS release");
      assert(!result.error, "no error reported on live success");
    } finally {
      if (originalToken !== undefined) process.env.TED_API_TOKEN = originalToken;
      else delete process.env.TED_API_TOKEN;
      if (originalBase !== undefined) process.env.TED_API_BASE = originalBase;
      else delete process.env.TED_API_BASE;
    }
  });

  // --- Regression 2: safeFetchJsonDetailed headers, POST, retries, timeout ---
  await case_("Regression: safeFetchJsonDetailed handles custom headers, POST body, 503 retries, and timeout aborts", async () => {
    // 2a. Custom headers + POST body
    let seenMethod = "";
    let seenBody: unknown;
    let seenCustomHeader: string | undefined;
    let seenContentType: string | undefined;
    let seenAccept: string | undefined;

    const postSpy: typeof fetch = async (_url, init) => {
      seenMethod = init?.method ?? "GET";
      seenBody = init?.body;
      seenCustomHeader = readHeader(init?.headers, "x-trace-id");
      seenContentType = readHeader(init?.headers, "content-type");
      seenAccept = readHeader(init?.headers, "accept");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const postRes = await safeFetchJsonDetailed("https://api.example.test/search", {
      method: "POST",
      headers: { "x-trace-id": "trace-abc" },
      body: JSON.stringify({ query: "kubernetes" }),
      fetchImpl: postSpy,
    });
    assert(postRes.status === 200 && postRes.data !== null, "POST returned 200 with parsed JSON");
    assert(seenMethod === "POST", `HTTP method forwarded ('${seenMethod}')`);
    assert(seenBody === '{"query":"kubernetes"}', "POST JSON body forwarded verbatim");
    assert(seenCustomHeader === "trace-abc", "custom header x-trace-id forwarded");
    assert(seenContentType === "application/json", "content-type defaulted to application/json for body");
    assert(seenAccept === "application/json", "accept defaulted to application/json");

    // 2b. Transient 503 retry succeeds on 3rd attempt
    let retryAttempts = 0;
    const retrySpy: typeof fetch = async () => {
      retryAttempts++;
      if (retryAttempts < 3) {
        return new Response("Service Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
      return new Response(JSON.stringify({ recovered: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const retryRes = await safeFetchJsonDetailed("https://api.example.test/flaky", {
      retries: 2,
      fetchImpl: retrySpy,
    });
    assert(retryAttempts === 3, `retried transient 503 until attempt 3 (actual=${retryAttempts})`);
    assert(retryRes.status === 200 && retryRes.data !== null, "503 retry recovered with 200 JSON");

    // 2c. Non-retryable 404 stops immediately
    let notFoundAttempts = 0;
    const notFoundSpy: typeof fetch = async () => {
      notFoundAttempts++;
      return new Response("Not Found", { status: 404, statusText: "Not Found" });
    };
    const notFoundRes = await safeFetchJsonDetailed("https://api.example.test/missing", {
      retries: 2,
      fetchImpl: notFoundSpy,
    });
    assert(notFoundAttempts === 1, `404 is not retried (attempts=${notFoundAttempts})`);
    assert(notFoundRes.data === null && notFoundRes.status === 404, "404 returns data=null, status=404");

    // 2d. Timeout abort
    let aborted = false;
    const slowFetch: typeof fetch = (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response("{}", { status: 200 })),
          250,
        );
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            clearTimeout(timer);
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true },
        );
      });

    const t0 = Date.now();
    const timeoutRes = await safeFetchJsonDetailed("https://api.example.test/slow", {
      timeoutMs: 25,
      retries: 0,
      fetchImpl: slowFetch,
    });
    const elapsed = Date.now() - t0;
    assert(aborted, "safeFetchJsonDetailed triggered AbortSignal on timeout");
    assert(timeoutRes.data === null && timeoutRes.status === null, "timeout returns data=null, status=null");
    assert(
      typeof timeoutRes.error === "string" && /timed out/i.test(timeoutRes.error),
      `timeout error message recorded ('${timeoutRes.error ?? ""}')`,
    );
    assert(elapsed < 150, `timeout aborted promptly in ${elapsed}ms (<150ms)`);
  });

  // --- Regression 3: runIngestion provenance & sourceReports telemetry ---
  await case_("Regression: runIngestion propagates true platform source and populates sourceReports telemetry", async () => {
    const saved = {
      TED_API_TOKEN: process.env.TED_API_TOKEN,
      SIMAP_FEED_URL: process.env.SIMAP_FEED_URL,
      EVERGABE_FEED_URL: process.env.EVERGABE_FEED_URL,
    };
    delete process.env.TED_API_TOKEN;
    delete process.env.SIMAP_FEED_URL;
    delete process.env.EVERGABE_FEED_URL;

    try {
      const { client, rows } = makeMockSupabase();
      const sources = defaultSources({ includeSandboxFixtures: true });
      const report = await runIngestion(sources, {
        dryRun: false,
        allowLlm: false,
        supabase: client,
      });

      assert(report.sourcesRun === 3, `ran all 3 default sources (got ${report.sourcesRun})`);
      assert(report.sourceReports.length === 3, "sourceReports has 3 per-source telemetry entries");

      const reportSources = new Set(report.sourceReports.map((s) => s.source));
      assert(
        reportSources.has("ted") && reportSources.has("simap") && reportSources.has("evergabe"),
        "sourceReports includes 'ted', 'simap', and 'evergabe'",
      );

      for (const sr of report.sourceReports) {
        assert(
          sr.releasesFetched > 0 && sr.latencyMs >= 0 && sr.mode === "fixtures",
          `sourceReport[${sr.source}] telemetry populated (fetched=${sr.releasesFetched}, tenders=${sr.tendersIngested}, awards=${sr.awardsIngested}, mode=${sr.mode})`,
        );
      }

      const tenderRows = rows.filter((r) => r.table === "tenders");
      const awardRows = rows.filter((r) => r.table === "historical_awards");
      const telemetryRows = rows.filter((r) => r.table === "ingestion_runs");

      const tenderSources = new Set(tenderRows.map((r) => String(r.row.source)));
      const awardSources = new Set(awardRows.map((r) => String(r.row.source)));

      assert(
        tenderSources.has("ted") && tenderSources.has("simap") && tenderSources.has("evergabe"),
        `persisted tenders propagate true sources (${[...tenderSources].join(", ")})`,
      );
      assert(!tenderSources.has("ocds"), "no persisted tender fell back to hardcoded 'ocds'");
      assert(
        awardSources.has("ted") && awardSources.has("simap") && awardSources.has("evergabe"),
        `persisted awards propagate true sources (${[...awardSources].join(", ")})`,
      );
      assert(
        telemetryRows.length === 3,
        `recorded 3 ingestion_runs telemetry rows (got ${telemetryRows.length})`,
      );
    } finally {
      if (saved.TED_API_TOKEN !== undefined) process.env.TED_API_TOKEN = saved.TED_API_TOKEN;
      if (saved.SIMAP_FEED_URL !== undefined) process.env.SIMAP_FEED_URL = saved.SIMAP_FEED_URL;
      if (saved.EVERGABE_FEED_URL !== undefined) process.env.EVERGABE_FEED_URL = saved.EVERGABE_FEED_URL;
    }
  });

  // --- Regression 4: ALL_FIXTURES validity & future deadlines ------------
  await case_("Regression: ALL_FIXTURES have valid OCDS ocids and future 2026-12+ / 2027 deadlines", async () => {
    const expectedCount =
      TED_FIXTURES.length + SIMAP_FIXTURES.length + EVERGABE_FIXTURES.length;
    assert(
      ALL_FIXTURES.length === expectedCount && ALL_FIXTURES.length >= 10,
      `ALL_FIXTURES combines all 3 platforms (${ALL_FIXTURES.length} releases)`,
    );

    const ocids = new Set<string>();
    let allValidOcds = true;
    let activeCount = 0;
    let awardOnlyCount = 0;
    let allActiveDeadlinesFuture = true;
    const minDeadlineMs = Date.parse("2026-12-01T00:00:00Z");

    for (const rel of ALL_FIXTURES) {
      if (!isOcdsRelease(rel)) {
        allValidOcds = false;
      }
      ocids.add(rel.ocid);

      if (!rel.tender && (rel.awards?.length ?? 0) > 0) {
        awardOnlyCount++;
      }

      if (rel.tender && rel.tender.status === "active") {
        activeCount++;
        const endDate = rel.tender.tenderPeriod?.endDate;
        const parsed = endDate ? Date.parse(endDate) : Number.NaN;
        if (!Number.isFinite(parsed) || parsed < minDeadlineMs) {
          allActiveDeadlinesFuture = false;
        }
      }
    }

    assert(allValidOcds, "every fixture in ALL_FIXTURES satisfies isOcdsRelease()");
    assert(ocids.size === ALL_FIXTURES.length, "all fixture ocids are unique");
    assert(activeCount >= 6, `contains ${activeCount} active procurement tenders`);
    assert(
      allActiveDeadlinesFuture,
      "all active fixtures have valid future 2026-12+ / 2027 deadlines",
    );
    assert(
      awardOnlyCount >= 3,
      `contains ${awardOnlyCount} award-only historical releases across platforms`,
    );
  });

  console.log("\n=== Summary ===");
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log("[ERROR] source adapter test FAILED");
    process.exit(1);
  } else {
    console.log("[SUCCESS] source adapter test PASSED");
    process.exit(0);
  }
}

void main();
