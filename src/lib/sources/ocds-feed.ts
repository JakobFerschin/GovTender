/**
 * Generic OCDS feed adapter.
 *
 * Any platform that publishes an OCDS package JSON over HTTP (many national
 * portals now do) plugs in here. Configure via constructor:
 *
 *   new OcdsFeedSource({ source: "simap", label: "Swiss SIMAP",
 *                       feedUrl: process.env.SIMAP_FEED_URL })
 *
 * If `feedUrl` is unset the adapter returns an empty result (not an error),
 * so disabled sources are simply skipped by the orchestrator.
 */
import type { OcdsPackage } from "../ingestion/ocds-types.js";
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { safeFetchJson } from "./types.js";

export interface OcdsFeedConfig {
  source: string;
  label: string;
  feedUrl?: string;
}

export class OcdsFeedSource implements SourceAdapter {
  readonly source: string;
  readonly label: string;
  private readonly feedUrl?: string;

  constructor(config: OcdsFeedConfig) {
    this.source = config.source;
    this.label = config.label;
    this.feedUrl = config.feedUrl;
  }

  async fetch(opts: FetchOptions = {}): Promise<SourceResult> {
    if (!this.feedUrl) {
      return {
        source: this.source,
        label: this.label,
        releases: [],
        skipped: 0,
        error: "feed URL not configured — source disabled",
      };
    }

    const payload = await safeFetchJson(this.feedUrl, opts);
    if (!payload) {
      return {
        source: this.source,
        label: this.label,
        releases: [],
        skipped: 0,
        error: "feed unreachable",
      };
    }

    const pkg = payload as OcdsPackage;
    const releases = pkg.releases ?? [];
    return {
      source: this.source,
      label: this.label,
      releases,
      skipped: 0,
    };
  }
}
