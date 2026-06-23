/**
 * EU TED (Tenders Electronic Daily) source adapter.
 *
 * TED publishes notices as XML, but also exposes an OCDS-compatible API
 * endpoint (`https://api.ted.europa.eu/v3/notices`) returning JSON releases.
 * We consume the OCDS view so the rest of the pipeline stays format-agnostic.
 *
 * In development (no API token configured) the adapter degrades to the
 * bundled sample fixtures so the dashboard still has data.
 *
 * Docs: https://docs.ted.europa.eu/
 */
import type { OcdsRelease, OcdsPackage } from "../ingestion/ocds-types.js";
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { safeFetchJson } from "./types.js";
import { TED_FIXTURES } from "./fixtures.js";

const TED_API_BASE = "https://api.ted.europa.eu/v3";
const DEFAULT_LIMIT = 50;

export class TedSource implements SourceAdapter {
  readonly source = "ted";
  readonly label = "EU TED (Tenders Electronic Daily)";

  /**
   * Read the optional TED API token from the environment. When absent we
   * fall back to fixtures — this keeps local dev and CI keyless.
   */
  private get token(): string | undefined {
    return process.env.TED_API_TOKEN;
  }

  async fetch(opts: FetchOptions = {}): Promise<SourceResult> {
    const limit = opts.limit ?? DEFAULT_LIMIT;

    // No token → fixtures. Never throws, always returns data for the UI.
    if (!this.token) {
      const releases = TED_FIXTURES.slice(0, limit);
      return {
        source: this.source,
        label: this.label,
        releases,
        skipped: 0,
        error: "TED_API_TOKEN not set — using sample fixtures",
      };
    }

    const url = `${TED_API_BASE}/notices/search?fields=OCDS&limit=${limit}`;
    const payload = await safeFetchJson(url, opts);

    if (!payload) {
      // Network failed — fall back to fixtures so the pipeline still runs.
      return {
        source: this.source,
        label: this.label,
        releases: TED_FIXTURES.slice(0, limit),
        skipped: 0,
        error: "TED API unreachable — using sample fixtures",
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

/** Convenience: fetch TED releases in one call. */
export async function fetchTed(opts?: FetchOptions): Promise<SourceResult> {
  return new TedSource().fetch(opts);
}

/** Type guard reused by the orchestrator and tests. */
export function isOcdsRelease(v: unknown): v is OcdsRelease {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as OcdsRelease).ocid === "string"
  );
}
