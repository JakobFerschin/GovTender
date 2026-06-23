/**
 * Source adapter contract.
 *
 * A "source" knows how to fetch procurement notices from one platform
 * (EU TED, Swiss SIMAP, German evergabe, …) and return them as OCDS
 * releases — the canonical shape our deterministic pipeline consumes.
 *
 * Every adapter is fail-safe: network errors, malformed payloads, and
 * missing credentials must resolve to an empty array, never throw. The
 * orchestrator collects results across all sources without crashing.
 */
import type { OcdsRelease } from "../ingestion/ocds-types.js";

export interface FetchOptions {
  /** Abort the underlying HTTP request after this many ms. */
  timeoutMs?: number;
  /** Max number of releases to return per source. */
  limit?: number;
  /** Inject a fetch implementation (for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SourceResult {
  /** Stable source identifier matching the `source` column in Supabase. */
  source: string;
  /** Human-readable label for logs / UI. */
  label: string;
  releases: OcdsRelease[];
  /** Number of releases skipped due to malformed data (observability). */
  skipped: number;
  /** Populated if the whole source failed to respond. */
  error?: string;
}

export interface SourceAdapter {
  readonly source: string;
  readonly label: string;
  /** Fetch notices and map them to OCDS releases. Never throws. */
  fetch(opts?: FetchOptions): Promise<SourceResult>;
}

/**
 * Shared helper: race a fetch against a timeout. Returns `null` on any
 * failure so callers can degrade to an empty result.
 */
export async function safeFetchJson(
  url: string,
  opts: FetchOptions = {},
): Promise<unknown | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined;
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
