/**
 * Source orchestrator — runs every configured source in parallel, feeds each
 * release through the deterministic pipeline, and aggregates results.
 *
 *   all sources ─► SourceResult[] ─► ingestRelease() per release ─► AggregateReport
 *
 * Fully fail-safe: a single source or release failing never aborts the run.
 * Designed to be invoked by a cron / n8n workflow once a day.
 */
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { TedSource } from "./ted.js";
import { OcdsFeedSource } from "./ocds-feed.js";
import {
  parseOcdsJson,
  ingestRelease,
  type PipelineOptions,
} from "../pipeline.js";

export interface AggregateReport {
  sourcesRun: number;
  releasesFetched: number;
  tendersIngested: number;
  awardsIngested: number;
  errors: { source: string; error: string }[];
  /** Wall-clock duration in ms. */
  durationMs: number;
}

/** Default source registry. Extend here to add national platforms. */
export function defaultSources(): SourceAdapter[] {
  return [
    new TedSource(),
    new OcdsFeedSource({
      source: "simap",
      label: "Swiss SIMAP",
      feedUrl: process.env.SIMAP_FEED_URL,
    }),
    new OcdsFeedSource({
      source: "evergabe",
      label: "German evergabe",
      feedUrl: process.env.EVERGABE_FEED_URL,
    }),
  ];
}

export interface RunOptions extends FetchOptions, PipelineOptions {}

/**
 * Run all sources and ingest their releases. Returns an aggregate report;
 * never throws. Pass `dryRun: true` to fetch+map without writing to Supabase.
 */
export async function runIngestion(
  sources: SourceAdapter[] = defaultSources(),
  opts: RunOptions = {},
): Promise<AggregateReport> {
  const start = Date.now();
  const errors: AggregateReport["errors"] = [];
  let releasesFetched = 0;
  let tendersIngested = 0;
  let awardsIngested = 0;

  // Fan out across sources in parallel; each resolves independently.
  const sourceResults: SourceResult[] = await Promise.all(
    sources.map((s) =>
      s.fetch(opts).catch((err): SourceResult => ({
        source: s.source,
        label: s.label,
        releases: [],
        skipped: 0,
        error: err instanceof Error ? err.message : "source crashed",
      })),
    ),
  );

  for (const result of sourceResults) {
    if (result.error) errors.push({ source: result.source, error: result.error });
    releasesFetched += result.releases.length;

    // Process releases sequentially within a source (cheap, ordered logs).
    for (const raw of result.releases) {
      const release = parseOcdsJson(raw);
      if (!release) {
        // Already malformed before the source's own counter — skip silently.
        continue;
      }
      const outcome = await ingestRelease(release, opts).catch(() => null);
      if (!outcome) continue;
      if (outcome.tenderId) tendersIngested++;
      awardsIngested += outcome.awardIds.filter((id) => id !== null).length;
    }
  }

  return {
    sourcesRun: sources.length,
    releasesFetched,
    tendersIngested,
    awardsIngested,
    errors,
    durationMs: Date.now() - start,
  };
}
