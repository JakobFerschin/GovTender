/**
 * EU TED (Tenders Electronic Daily) source adapter.
 *
 * TED publishes notices as XML, and also exposes an OCDS-compatible API
 * endpoint (`https://api.ted.europa.eu/v3/notices/search`) returning JSON
 * releases. We consume the OCDS view so the rest of the pipeline stays
 * format-agnostic.
 *
 * In development (no `TED_API_TOKEN` configured) or when TED is unreachable,
 * the adapter degrades gracefully to the bundled sample fixtures so local
 * dev and CI stay keyless and resilient.
 *
 * Docs: https://docs.ted.europa.eu/
 */
import type { OcdsRelease, OcdsPackage } from "../ingestion/ocds-types.js";
import type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
import { safeFetchJsonDetailed } from "./types.js";
import { TED_FIXTURES } from "./fixtures.js";

export const DEFAULT_TED_API_BASE = "https://api.ted.europa.eu/v3";
const DEFAULT_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 15_000;

export class TedSource implements SourceAdapter {
  readonly source = "ted";
  readonly label = "EU TED (Tenders Electronic Daily)";

  /**
   * Read the optional TED API token from the environment. When absent we
   * fall back to fixtures — this keeps local dev and CI keyless.
   */
  private get token(): string | undefined {
    const raw = process.env.TED_API_TOKEN?.trim();
    return raw ? raw : undefined;
  }

  /**
   * Configurable TED API base URL via `process.env.TED_API_BASE`
   * (defaults to `https://api.ted.europa.eu/v3`).
   */
  private get apiBase(): string {
    const configured = process.env.TED_API_BASE?.trim();
    const base = configured && configured.length > 0 ? configured : DEFAULT_TED_API_BASE;
    return base.replace(/\/+$/, "");
  }

  async fetch(opts: FetchOptions = {}): Promise<SourceResult> {
    const start = Date.now();
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const token = this.token;

    // No token → fixtures. Never throws, always returns data for the UI.
    if (!token) {
      const releases = TED_FIXTURES.slice(0, limit);
      return {
        source: this.source,
        label: this.label,
        releases,
        skipped: 0,
        mode: "fixtures",
        latencyMs: Date.now() - start,
        error: "TED_API_TOKEN not set — using sample fixtures",
      };
    }

    const url = `${this.apiBase}/notices/search?fields=OCDS&limit=${limit}`;
    const response = await safeFetchJsonDetailed(url, {
      ...opts,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: opts.retries ?? (opts.fetchImpl ? 0 : 1),
      headers: {
        ...opts.headers,
        Authorization: `Bearer ${token}`,
        "x-api-key": token,
      },
    });

    if (!response.data) {
      // Network/HTTP error — fall back to fixtures so the pipeline still runs.
      const detail = response.error ? ` (${response.error})` : "";
      return {
        source: this.source,
        label: this.label,
        releases: TED_FIXTURES.slice(0, limit),
        skipped: 0,
        mode: "fixtures",
        latencyMs: response.latencyMs,
        error: `TED API unreachable${detail} — using sample fixtures`,
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

    return {
      source: this.source,
      label: this.label,
      releases: validReleases.slice(0, limit),
      skipped,
      mode: "live",
      latencyMs: response.latencyMs,
    };
  }
}

/** Convenience: fetch TED releases in one call. */
export async function fetchTed(opts?: FetchOptions): Promise<SourceResult> {
  return new TedSource().fetch(opts);
}

/** Type guard reused by the orchestrator, OCDS feed adapter, and tests. */
export function isOcdsRelease(v: unknown): v is OcdsRelease {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as OcdsRelease).ocid === "string" &&
    (v as OcdsRelease).ocid.trim().length > 0
  );
}
