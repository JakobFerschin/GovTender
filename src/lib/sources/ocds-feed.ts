/**
 * Generic OCDS feed adapter.
 *
 * Any platform that publishes an OCDS package JSON over HTTP (Swiss SIMAP,
 * German evergabe, national portals, etc.) plugs in here. Configure via:
 *
 *   new OcdsFeedSource({
 *     source: "simap",
 *     label: "Swiss SIMAP",
 *     feedUrl: process.env.SIMAP_FEED_URL,
 *     apiKey: process.env.SIMAP_API_KEY,
 *   })
 *
 * If `feedUrl` is unset and no `fallbackFixtures` are provided, the adapter
 * returns a clean disabled result (`releases: []`, `mode: "disabled"`).
 */
import type { OcdsPackage, OcdsRelease } from "../ingestion/ocds-types.js";
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { safeFetchJsonDetailed } from "./types.js";
import { isOcdsRelease } from "./ted.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface OcdsFeedConfig {
  source: string;
  label: string;
  feedUrl?: string;
  /** Optional API key forwarded as `Authorization: Bearer <key>` and `x-api-key`. */
  apiKey?: string;
  /** Optional static headers included with every request to this feed. */
  headers?: Record<string, string>;
  /** Optional sandbox fixtures served when `feedUrl` is unset or unreachable. */
  fallbackFixtures?: OcdsRelease[];
}

export class OcdsFeedSource implements SourceAdapter {
  readonly source: string;
  readonly label: string;
  private readonly feedUrl?: string;
  private readonly apiKey?: string;
  private readonly headers?: Record<string, string>;
  private readonly fallbackFixtures?: OcdsRelease[];

  constructor(config: OcdsFeedConfig) {
    this.source = config.source;
    this.label = config.label;
    this.feedUrl = config.feedUrl?.trim() || undefined;
    this.apiKey = config.apiKey?.trim() || undefined;
    this.headers = config.headers;
    this.fallbackFixtures = config.fallbackFixtures;
  }

  async fetch(opts: FetchOptions = {}): Promise<SourceResult> {
    const start = Date.now();
    const limit = opts.limit;

    if (!this.feedUrl) {
      if (this.fallbackFixtures && this.fallbackFixtures.length > 0) {
        const releases =
          limit !== undefined
            ? this.fallbackFixtures.slice(0, limit)
            : [...this.fallbackFixtures];
        return {
          source: this.source,
          label: this.label,
          releases,
          skipped: 0,
          mode: "fixtures",
          latencyMs: Date.now() - start,
          error: "feed URL not configured — using sandbox fixtures",
        };
      }

      return {
        source: this.source,
        label: this.label,
        releases: [],
        skipped: 0,
        mode: "disabled",
        latencyMs: Date.now() - start,
        error: "feed URL not configured — source disabled",
      };
    }

    const requestHeaders: Record<string, string> = {
      ...this.headers,
      ...(this.apiKey
        ? {
            Authorization: `Bearer ${this.apiKey}`,
            "x-api-key": this.apiKey,
          }
        : {}),
      ...opts.headers,
    };

    const response = await safeFetchJsonDetailed(this.feedUrl, {
      ...opts,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: opts.retries ?? (opts.fetchImpl ? 0 : 1),
      headers: requestHeaders,
    });

    if (!response.data) {
      const detail = response.error ? ` (${response.error})` : "";
      if (this.fallbackFixtures && this.fallbackFixtures.length > 0) {
        const releases =
          limit !== undefined
            ? this.fallbackFixtures.slice(0, limit)
            : [...this.fallbackFixtures];
        return {
          source: this.source,
          label: this.label,
          releases,
          skipped: 0,
          mode: "fixtures",
          latencyMs: response.latencyMs,
          error: `feed unreachable${detail} — using sandbox fixtures`,
        };
      }

      return {
        source: this.source,
        label: this.label,
        releases: [],
        skipped: 0,
        mode: "live",
        latencyMs: response.latencyMs,
        error: `feed unreachable${detail}`,
      };
    }

    const pkg = response.data as OcdsPackage;
    const rawReleases = Array.isArray(pkg.releases)
      ? (pkg.releases as unknown[])
      : [];

    const validReleases: OcdsRelease[] = [];
    let skipped = 0;
    for (const item of rawReleases) {
      if (isOcdsRelease(item)) {
        validReleases.push(item);
      } else {
        skipped++;
      }
    }

    const releases =
      limit !== undefined ? validReleases.slice(0, limit) : validReleases;

    return {
      source: this.source,
      label: this.label,
      releases,
      skipped,
      mode: "live",
      latencyMs: response.latencyMs,
    };
  }
}
