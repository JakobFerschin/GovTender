/**
 * Source adapter contract & resilient HTTP utilities.
 *
 * A "source" knows how to fetch procurement notices from one platform
 * (EU TED, Swiss SIMAP, German evergabe, …) and return them as OCDS
 * releases — the canonical shape our deterministic pipeline consumes.
 *
 * Every adapter is fail-safe: network errors, malformed payloads, and
 * missing credentials must resolve to a valid SourceResult, never throw. The
 * orchestrator collects results across all sources without crashing.
 */
import type { OcdsRelease } from "../ingestion/ocds-types.js";

export type SourceMode = "live" | "fixtures" | "disabled";

export interface FetchOptions {
  /** Abort the underlying HTTP request after this many ms. */
  timeoutMs?: number;
  /** Max number of releases to return per source. */
  limit?: number;
  /** Inject a fetch implementation (for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Extra HTTP headers merged on top of `{ accept: "application/json" }`. */
  headers?: Record<string, string>;
  /** HTTP method. Defaults to "GET". */
  method?: "GET" | "POST";
  /** Optional serialized request body (used with POST requests). */
  body?: string;
  /** Number of retry attempts on transient 5xx or network/timeout failures. Defaults to 0. */
  retries?: number;
}

export interface SafeFetchResult {
  data: unknown | null;
  status: number | null;
  latencyMs: number;
  error?: string;
}

export interface SourceResult {
  /** Stable source identifier matching the `source` column in Supabase. */
  source: string;
  /** Human-readable label for logs / UI. */
  label: string;
  releases: OcdsRelease[];
  /** Number of releases skipped due to malformed data (observability). */
  skipped: number;
  /** Populated if the whole source failed to respond or fell back. */
  error?: string;
  /** Total fetch duration in milliseconds. */
  latencyMs?: number;
  /** Execution mode of this source fetch. */
  mode?: SourceMode;
}

export interface SourceAdapter {
  readonly source: string;
  readonly label: string;
  /** Fetch notices and map them to OCDS releases. Never throws. */
  fetch(opts?: FetchOptions): Promise<SourceResult>;
}

function mergeHeaders(
  customHeaders?: Record<string, string>,
  hasBody = false,
): Record<string, string> {
  const merged: Record<string, string> = {};
  const lowerKeys = new Set<string>();

  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      merged[key] = value;
      lowerKeys.add(key.toLowerCase());
    }
  }

  if (!lowerKeys.has("accept")) {
    merged.accept = "application/json";
  }
  if (hasBody && !lowerKeys.has("content-type")) {
    merged["content-type"] = "application/json";
  }

  return merged;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared resilient HTTP JSON helper with timeout, custom headers/method/body,
 * retry on transient 5xx/network errors, and full observability metadata.
 * Never throws.
 */
export async function safeFetchJsonDetailed(
  url: string,
  opts: FetchOptions = {},
): Promise<SafeFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = Math.max(0, Math.floor(opts.retries ?? 0));
  const method = opts.method ?? "GET";
  const headers = mergeHeaders(opts.headers, opts.body !== undefined);
  const start = Date.now();

  let lastStatus: number | null = null;
  let lastError = "unknown fetch error";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Short bounded exponential backoff: 50ms, 100ms, 200ms, ... capped at 1s.
      const backoffMs = Math.min(50 * 2 ** (attempt - 1), 1_000);
      await delay(backoffMs);
    }

    const controller = new AbortController();
    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => controller.abort(), opts.timeoutMs)
        : undefined;

    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers,
      };
      if (opts.body !== undefined) {
        init.body = opts.body;
      }

      const res = await fetchImpl(url, init);
      lastStatus = res.status;

      if (res.ok) {
        try {
          const data: unknown = await res.json();
          return {
            data,
            status: res.status,
            latencyMs: Date.now() - start,
          };
        } catch (parseErr) {
          return {
            data: null,
            status: res.status,
            latencyMs: Date.now() - start,
            error:
              parseErr instanceof Error
                ? `Invalid JSON response: ${parseErr.message}`
                : "Invalid JSON response",
          };
        }
      }

      const statusSuffix = res.statusText ? ` ${res.statusText}` : "";
      lastError = `HTTP ${res.status}${statusSuffix}`;

      // Only retry transient 5xx server errors; 4xx errors are non-retryable.
      if (res.status >= 500 && res.status < 600 && attempt < maxRetries) {
        continue;
      }

      return {
        data: null,
        status: res.status,
        latencyMs: Date.now() - start,
        error: lastError,
      };
    } catch (err) {
      lastStatus = null;
      if (err instanceof Error && err.name === "AbortError") {
        lastError = opts.timeoutMs
          ? `Request timed out after ${opts.timeoutMs}ms`
          : "Request aborted";
      } else {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (attempt < maxRetries) {
        continue;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    data: null,
    status: lastStatus,
    latencyMs: Date.now() - start,
    error: lastError,
  };
}

/**
 * Shared helper: race a fetch against a timeout with optional retries.
 * Returns `null` on any failure so callers can degrade gracefully.
 */
export async function safeFetchJson(
  url: string,
  opts: FetchOptions = {},
): Promise<unknown | null> {
  const result = await safeFetchJsonDetailed(url, opts);
  return result.data;
}
