/**
 * Source orchestrator — runs every configured source in parallel, feeds each
 * release through the deterministic pipeline, aggregates per-source telemetry,
 * and optionally persists run logs to `ingestion_runs`.
 *
 *   all sources ─► SourceResult[] ─► ingestRelease() per release ─► AggregateReport
 *
 * Fully fail-safe: a single source or release failing never aborts the run.
 * Designed to be invoked by a cron / n8n workflow or the CLI (`src/cli/ingest.ts`).
 */
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { TedSource } from "./ted.js";
import { OcdsFeedSource } from "./ocds-feed.js";
import { SIMAP_FIXTURES, EVERGABE_FIXTURES } from "./fixtures.js";
import { recordIngestionRun } from "../ingestion/index.js";
import {
  parseOcdsJson,
  ingestRelease,
  type PipelineOptions,
} from "../pipeline.js";

export interface SourceReport {
  source: string;
  label: string;
  mode: string;
  releasesFetched: number;
  tendersIngested: number;
  awardsIngested: number;
  skipped: number;
  latencyMs: number;
  error?: string;
}

export interface AggregateReport {
  sourcesRun: number;
  releasesFetched: number;
  tendersIngested: number;
  awardsIngested: number;
  errors: { source: string; error: string }[];
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Per-source operational telemetry. */
  sourceReports: SourceReport[];
}

export interface DefaultSourcesOptions {
  /**
   * When true, national adapters (SIMAP, evergabe) fall back to bundled
   * sandbox fixtures if their feed URLs are unset. Defaults to checking
   * `GOVTENDER_SANDBOX_FIXTURES=true|1`.
   */
  includeSandboxFixtures?: boolean;
}

/** Default source registry. Extend here to add national platforms. */
export function defaultSources(
  options: DefaultSourcesOptions = {},
): SourceAdapter[] {
  const useSandbox =
    options.includeSandboxFixtures ??
    (process.env.GOVTENDER_SANDBOX_FIXTURES === "true" ||
      process.env.GOVTENDER_SANDBOX_FIXTURES === "1");

  return [
    new TedSource(),
    new OcdsFeedSource({
      source: "simap",
      label: "Swiss SIMAP",
      feedUrl: process.env.SIMAP_FEED_URL,
      apiKey: process.env.SIMAP_API_KEY,
      fallbackFixtures: useSandbox ? SIMAP_FIXTURES : undefined,
    }),
    new OcdsFeedSource({
      source: "evergabe",
      label: "German evergabe",
      feedUrl: process.env.EVERGABE_FEED_URL,
      apiKey: process.env.EVERGABE_API_KEY,
      fallbackFixtures: useSandbox ? EVERGABE_FIXTURES : undefined,
    }),
  ];
}

export interface RunOptions extends FetchOptions, PipelineOptions {}

function inferMode(result: SourceResult): string {
  if (result.mode) return result.mode;
  if (result.releases.length === 0 && result.error) return "disabled";
  return "live";
}

function isSupabaseAvailable(opts: RunOptions): boolean {
  if (opts.supabase) return true;
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/**
 * Run all sources and ingest their releases. Returns an aggregate report with
 * per-source telemetry; never throws. Pass `dryRun: true` to fetch+map without
 * writing to Supabase.
 */
export async function runIngestion(
  sources: SourceAdapter[] = defaultSources(),
  opts: RunOptions = {},
): Promise<AggregateReport> {
  const startedAt = new Date();
  const start = Date.now();
  const errors: AggregateReport["errors"] = [];
  const sourceReports: SourceReport[] = [];
  let releasesFetched = 0;
  let tendersIngested = 0;
  let awardsIngested = 0;

  // Fan out across sources in parallel; each resolves independently.
  const sourceResults: SourceResult[] = await Promise.all(
    sources.map(async (s): Promise<SourceResult> => {
      const fetchStart = Date.now();
      try {
        const res = await s.fetch(opts);
        return {
          ...res,
          latencyMs: res.latencyMs ?? Date.now() - fetchStart,
        };
      } catch (err) {
        return {
          source: s.source,
          label: s.label,
          releases: [],
          skipped: 0,
          mode: "live",
          latencyMs: Date.now() - fetchStart,
          error: err instanceof Error ? err.message : "source crashed",
        };
      }
    }),
  );

  for (const result of sourceResults) {
    if (result.error) {
      errors.push({ source: result.source, error: result.error });
    }
    const fetchedCount = result.releases.length;
    releasesFetched += fetchedCount;

    let sourceTenders = 0;
    let sourceAwards = 0;
    let sourceSkipped = result.skipped;

    // Process releases sequentially within a source (cheap, ordered logs).
    for (const raw of result.releases) {
      const release = parseOcdsJson(raw);
      if (!release) {
        sourceSkipped++;
        continue;
      }
      const outcome = await ingestRelease(release, {
        ...opts,
        source: result.source,
      }).catch(() => null);
      if (!outcome) {
        sourceSkipped++;
        continue;
      }
      if (!outcome.ok || (outcome.skipped && !opts.dryRun)) {
        sourceSkipped++;
      }
      if (outcome.tenderId) {
        sourceTenders++;
        tendersIngested++;
      }
      const persistedAwards = outcome.awardIds.filter((id) => id !== null).length;
      sourceAwards += persistedAwards;
      awardsIngested += persistedAwards;
    }

    sourceReports.push({
      source: result.source,
      label: result.label,
      mode: inferMode(result),
      releasesFetched: fetchedCount,
      tendersIngested: sourceTenders,
      awardsIngested: sourceAwards,
      skipped: sourceSkipped,
      latencyMs: result.latencyMs ?? 0,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  const finishedAt = new Date();
  const durationMs = Date.now() - start;

  // Optionally persist per-source telemetry to `ingestion_runs` in live mode.
  if (!opts.dryRun && isSupabaseAvailable(opts)) {
    for (const sr of sourceReports) {
      try {
        const status = !sr.error
          ? "success"
          : sr.releasesFetched === 0 && sr.mode !== "disabled"
            ? "error"
            : "partial";

        await recordIngestionRun(
          {
            source: sr.source,
            status,
            releases_fetched: sr.releasesFetched,
            tenders_upserted: sr.tendersIngested,
            awards_upserted: sr.awardsIngested,
            errors: sr.error ? [{ source: sr.source, error: sr.error }] : [],
            error_message: sr.error ?? null,
            duration_ms: sr.latencyMs,
            started_at: startedAt,
            finished_at: finishedAt,
            metadata: {
              label: sr.label,
              mode: sr.mode,
              skipped: sr.skipped,
            },
          },
          opts.supabase,
        );
      } catch {
        // Never allow telemetry recording failures to break ingestion.
      }
    }
  }

  return {
    sourcesRun: sources.length,
    releasesFetched,
    tendersIngested,
    awardsIngested,
    errors,
    durationMs,
    sourceReports,
  };
}
