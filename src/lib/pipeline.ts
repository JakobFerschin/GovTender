/**
 * Phase 2/3 pipeline orchestrator — deterministic first, LLM only as fallback.
 *
 * Canonical ingestion entry point. Fixed order:
 *
 *   OCDS JSON
 *     │  (1) parseOcdsJson()      — fail-safe: malformed JSON -> null, no throw
 *     │  (2) mapRelease()          — deterministic, no LLM
 *     ▼
 *   TenderRecord (technologies = [])
 *     │  (3) enhanceTechnologies() — runs LLM ONLY if technologies empty
 *     ▼
 *   TenderRecord (technologies filled if a description existed)
 *     │  (4) persistTender()       — idempotent upsert to Supabase
 *     ▼
 *   row id
 *
 * The pipeline is fail-safe: malformed input, missing fields, or DB errors
 * degrade gracefully (logged, skipped) and never crash the Node process.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapRelease, persistTender, persistAward } from "./ingestion/index.js";
import type { OcdsRelease } from "./ingestion/index.js";
import { enhanceTechnologies, type EnhanceOptions } from "./extraction/enhance-tender.js";

/**
 * Fail-safe JSON parse. Returns `null` on any malformed input instead of
 * throwing. Callers treat `null` as "skip this release".
 */
export function parseOcdsJson(raw: unknown): OcdsRelease | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // Absolute minimum to be a usable OCDS release.
  if (typeof obj.ocid !== "string" || obj.ocid.trim() === "") return null;
  return raw as OcdsRelease;
}

export interface PipelineOptions extends EnhanceOptions {
  /** Skip Supabase writes (useful for tests / dry runs). Default false. */
  dryRun?: boolean;
  /** Injected client; if omitted, the default Supabase client is built lazily. */
  supabase?: SupabaseClient;
  /** Source platform identifier propagated to `mapRelease` (e.g. "ted", "simap", "evergabe"). */
  source?: string;
}

export interface PipelineResult {
  tenderId: string | null;
  awardIds: (string | null)[];
  techSource: "deterministic" | "llm" | "none";
  technologies: string[];
  /** Always resolves — never throws. */
  ok: boolean;
  /** Populated only when the whole release was rejected (e.g. bad JSON). */
  skipped?: string;
}

/**
 * Run a single OCDS release through the full pipeline. Never throws — any
 * failure is captured and surfaced via `result.ok` / `result.skipped`.
 */
export async function ingestRelease(
  release: OcdsRelease,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  try {
    // (1)+(2) Deterministic parse (propagating source identifier).
    const { tender, awards } = mapRelease(release, { source: options.source });

    if (!tender && awards.length === 0) {
      return {
        tenderId: null,
        awardIds: [],
        techSource: "none",
        technologies: [],
        ok: true,
        skipped: "no tender and no awards in release",
      };
    }

    let techSource: PipelineResult["techSource"] = "none";
    let technologies: string[] = [];

    if (tender) {
      const existingTechs = tender.required_technologies ?? [];
      if (options.dryRun) {
        // Dry-run path: report deterministic technologies without LLM or DB writes.
        technologies = existingTechs;
        techSource = existingTechs.length > 0 ? "deterministic" : "none";
      } else {
        // (3) Conditional LLM enhancement — returns "deterministic" immediately
        // if mapRelease already populated technologies, else invokes LLM fallback.
        const enhanced = await enhanceTechnologies(
          existingTechs,
          tender.description,
          options,
        ).catch(
          (
            err,
          ): {
            required_technologies: string[];
            source: "deterministic" | "none";
          } => {
            console.warn("[pipeline] enhancement failed, degrading:", err);
            return {
              required_technologies: existingTechs,
              source: existingTechs.length > 0 ? "deterministic" : "none",
            };
          },
        );
        technologies = enhanced.required_technologies;
        techSource = enhanced.source;
      }
    }

    // Dry-run path: skip persistence, still report mapped data.
    if (options.dryRun) {
      return {
        tenderId: null,
        awardIds: [],
        techSource,
        technologies,
        ok: true,
        skipped: "dry run",
      };
    }

    // (4) Persist tender (if present) and awards independently so award-only
    // releases are always persisted even when `tender` is undefined.
    let tenderId: string | null = null;
    if (tender) {
      tenderId = await persistTender(
        { ...tender, required_technologies: technologies },
        options.supabase,
      ).catch((err): null => {
        console.warn("[pipeline] tender persist failed:", err);
        return null;
      });
    }

    const awardIds: (string | null)[] = [];
    for (const award of awards) {
      awardIds.push(
        await persistAward(award, options.supabase).catch((err): null => {
          console.warn("[pipeline] award persist failed:", err);
          return null;
        }),
      );
    }

    return { tenderId, awardIds, techSource, technologies, ok: true };
  } catch (err) {
    // Truly unexpected — log and resolve, never throw.
    console.error("[pipeline] unexpected error:", err);
    return {
      tenderId: null,
      awardIds: [],
      techSource: "none",
      technologies: [],
      ok: false,
      skipped: err instanceof Error ? err.message : "unknown error",
    };
  }
}
