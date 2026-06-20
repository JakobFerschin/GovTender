/**
 * Conditional LLM enhancement (Phase 2 — "Non-LLM First").
 *
 * The deterministic OCDS mapper already populated title, budget, CPV, country,
 * authority, and deadlines. The ONE field OCDS almost never carries is
 * `required_technologies` — that lives inside free-text descriptions.
 *
 * So the LLM is used as a narrow, optional middleware:
 *   • Runs ONLY when `required_technologies` is empty.
 *   • Extracts ONLY technologies (not title/budget/authority — those are
 *     already trusted from the structured payload).
 *   • Reads ONLY the description string, not the whole document.
 *
 * This keeps LLM cost/latency to a minimum and means the pipeline is fully
 * functional even if the Mistral API is down or unconfigured (technologies
 * just stays []).
 */
import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";
import { env } from "./env.js";

/** Minimal, focused schema: just the one field we couldn't get deterministically. */
const TechExtractionSchema = z.object({
  technologies: z
    .array(z.string().min(1))
    .default([])
    .transform((arr) =>
      Array.from(
        new Set(
          arr
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0),
        ),
      ).sort(),
    ),
});
export type TechExtraction = z.infer<typeof TechExtractionSchema>;

let client: Mistral | null = null;
function getClient(): Mistral {
  if (!client) client = new Mistral({ apiKey: env.mistralApiKey });
  return client;
}

/** Cheap, dependency-free guard so we don't burn an LLM call on nothing. */
function isDescribable(text: string | undefined): boolean {
  return !!text && text.trim().length >= 40;
}

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* swallow */
    }
  }
  throw new Error("LLM tech extraction returned non-JSON.");
}

const SYSTEM_PROMPT = [
  "You extract ONLY technology names from a procurement description.",
  "Return JSON: { \"technologies\": string[] }.",
  "Rules:",
  "1. Include concrete technologies, products, frameworks, certifications,",
  "   or skill areas the tender explicitly requires. Lowercase.",
  "2. Never invent items not stated in the text. Empty array if none.",
  "3. No prose, no markdown — only the JSON object.",
].join("\n");

/** Low-level: ask Mistral for the technology list. Throws on failure. */
async function callMistralForTechs(description: string): Promise<TechExtraction> {
  const response = await getClient().chat.complete({
    model: env.mistralModel,
    responseFormat: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `--- DESCRIPTION ---\n${description}` },
    ],
  });
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Mistral returned an empty message.");
  }
  const parsed = TechExtractionSchema.safeParse(safeJsonParse(content));
  if (!parsed.success) {
    throw new Error(`Tech extraction validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export interface EnhanceOptions {
  /**
   * Whether the LLM fallback is permitted at all. Default true. Set false in
   * environments with no API key to guarantee a deterministic-only run.
   */
  allowLlm?: boolean;
  /** Max model round-trips (retry on validation/parse failure). Default 1. */
  maxAttempts?: number;
  /** Abort after this many ms. */
  timeoutMs?: number;
}

export interface EnhanceResult {
  /** The technologies, either deterministic (already present) or LLM-derived. */
  required_technologies: string[];
  /** Where the values came from — for observability and cost tracking. */
  source: "deterministic" | "llm" | "none";
}

/**
 * The conditional gate. Returns the existing technologies untouched when they
 * are already populated, and only invokes the LLM when they are empty AND a
 * description is available AND `allowLlm` is true. On any LLM failure it
 * degrades gracefully to an empty array — the pipeline never throws here.
 */
export async function enhanceTechnologies(
  existingTechnologies: string[],
  description: string | undefined,
  options: EnhanceOptions = {},
): Promise<EnhanceResult> {
  const allowLlm = options.allowLlm ?? true;

  // 1. Deterministic data already present — do not touch.
  if (existingTechnologies.length > 0) {
    return { required_technologies: existingTechnologies, source: "deterministic" };
  }

  // 2. Nothing to read from — can't enhance.
  if (!isDescribable(description)) {
    return { required_technologies: [], source: "none" };
  }

  // 3. LLM disabled (no key / deterministic-only mode) — skip.
  if (!allowLlm) {
    return { required_technologies: [], source: "none" };
  }

  // 4. Focused LLM extraction with bounded retries.
  const maxAttempts = options.maxAttempts ?? 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;
    try {
      const { technologies } = await callMistralForTechs(description!);
      return { required_technologies: technologies, source: "llm" };
    } catch (err) {
      // Last attempt failed — log and degrade.
      if (attempt === maxAttempts) {
        console.warn(
          "[enhance] LLM tech extraction failed, degrading to []:",
          err instanceof Error ? err.message : err,
        );
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { required_technologies: [], source: "none" };
}
