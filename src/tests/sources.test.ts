/**
 * Source adapter smoke test.
 *
 *   Run:  npx tsx src/tests/sources.test.ts
 *
 * Verifies:
 *   1. TED adapter returns fixture data when no token is set (keyless).
 *   2. OCDS feed adapter is gracefully disabled without a URL.
 *   3. Orchestrator runs all sources + ingests without throwing, even with
 *      no Supabase configured (dryRun + mock client).
 *   4. Malformed releases are skipped, not crashed on.
 */
import {
  TedSource,
  OcdsFeedSource,
  runIngestion,
  isOcdsRelease,
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
          // Valid OCDS release.
          {
            ocid: "ocds-test-valid",
            id: "r1",
            date: "2026-06-01T00:00:00Z",
            parties: [{ id: "b1", name: "Test Buyer", roles: ["buyer"], address: { country: "DE" } }],
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
  console.log("=== GovTender AI — Source Adapter Test ===");

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
      if (original) process.env.TED_API_TOKEN = original;
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
      new Response(JSON.stringify({
        releases: [{ ocid: "ocds-mock-1", id: "r1" }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
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
    // dryRun means no tenderId, so tendersIngested may be 0 — that's fine.
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
