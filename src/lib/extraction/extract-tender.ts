import { Mistral } from "@mistralai/mistralai";
import {
  TenderExtractionSchema,
  type TenderExtraction,
  EXTRACTION_FIELD_DOCS,
} from "./schema.js";
import { env } from "./env.js";

/**
 * GovTender AI — structured tender extraction (Phase 1).
 *
 * `extractTender()` takes the cleaned text of a scraped procurement document
 * (the output of the LlamaParse / OCR step) and returns a validated
 * `TenderExtraction` object. It uses Mistral's JSON-mode chat completion plus
 * a Zod validation/repair loop, because LLMs occasionally wrap output in
 * markdown fences or drop a required field.
 *
 * Flow:
 *   raw text  ──►  Mistral (json_mode)  ──►  JSON.parse
 *                                          ──►  Zod validate
 *                                          ──►  (on failure) one repair retry
 *                                          ──►  typed result
 */

const client = new Mistral({ apiKey: env.mistralApiKey });

/** Builds the system prompt that constrains the model to our schema. */
function buildSystemPrompt(): string {
  const fieldLines = (
    Object.keys(EXTRACTION_FIELD_DOCS) as (keyof TenderExtraction)[]
  )
    .map((k) => `  - "${k}": ${EXTRACTION_FIELD_DOCS[k]}`)
    .join("\n");

  return [
    "You are a procurement analyst specialised in EU and DACH public tenders",
    "(TED, SIMAP, evergabe, e-at, BOAMP).",
    "",
    "Extract structured data from the tender document given by the user.",
    "Respond with ONLY a single JSON object — no prose, no markdown, no code",
    "fences — matching exactly this schema:",
    "{",
    fieldLines,
    "}",
    "",
    "Rules:",
    "1. Use the document's own language only inside field values; field names",
    "   are fixed and must be in English/snake_case as shown.",
    "2. `estimated_budget` is a NUMBER (no currency symbol, no thousands",
    "   separators). Use `null` if the document does not state a value.",
    "3. `required_technologies` contains only technologies, products,",
    "   certifications, or skill areas the tender explicitly requires.",
    "   Lowercase. Empty array [] if none are stated. Never invent items.",
    "4. `awarding_authority` is the contracting body issuing the tender.",
    "5. If a field is genuinely absent, prefer null/empty-array over guessing.",
  ].join("\n");
}

/** Tries hard to recover a JSON object from a possibly-messy model response. */
function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();

  // 1. Direct parse — happy path.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // 2. Strip ```json ... ``` / ``` ... ``` fences (common with chat models).
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }

  // 3. Grab the outermost {...} block in case the model prefixed commentary.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      /* fall through */
    }
  }

  throw new Error("Model response was not valid JSON and could not be repaired.");
}

/**
 * One attempt at extraction. Returns parsed-but-unvalidated JSON so the caller
 * can decide whether to validate, repair, or retry.
 */
async function callMistral(
  text: string,
  opts: { repairHint?: string } = {},
): Promise<string> {
  const userMessage = opts.repairHint
    ? `Previous output failed validation: ${opts.repairHint}\n\nReturn a corrected JSON object only.\n\n--- DOCUMENT ---\n${text}`
    : `--- DOCUMENT ---\n${text}`;

  const response = await client.chat.complete({
    model: env.mistralModel,
    // `json` response format forces the model to emit syntactically valid JSON.
    responseFormat: { type: "json_object" },
    temperature: 0, // deterministic extraction
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userMessage },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Mistral returned an empty message.");
  }
  return content;
}

export interface ExtractTenderOptions {
  /**
   * Max model round-trips. Each round-trip beyond the first is a "repair"
   * attempt that feeds the Zod error back to the model. Default: 2.
   */
  maxAttempts?: number;
  /** Abort the underlying HTTP request after this many ms. */
  timeoutMs?: number;
}

export interface ExtractTenderResult {
  data: TenderExtraction;
  /** Number of model calls actually made (1 = succeeded first try). */
  attempts: number;
}

/**
 * Extract a validated `TenderExtraction` from raw tender text.
 *
 * @example
 * const { data } = await extractTender(scrapedPdfText);
 * // data.title, data.estimated_budget, data.required_technologies, ...
 */
export async function extractTender(
  rawText: string,
  options: ExtractTenderOptions = {},
): Promise<ExtractTenderResult> {
  const maxAttempts = options.maxAttempts ?? 2;

  if (rawText.trim().length < 20) {
    throw new Error(
      "Input text is too short to extract a tender from (<20 chars).",
    );
  }

  let lastError: unknown = null;
  let repairHint: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    try {
      const rawResponse = await callMistral(rawText, { repairHint });
      const parsed = safeJsonParse(rawResponse);
      const result = TenderExtractionSchema.safeParse(parsed);

      if (result.success) {
        return { data: result.data, attempts: attempt };
      }

      // Validation failed — turn the Zod issues into a repair hint for retry.
      lastError = result.error;
      repairHint = result.error.issues
        .map((i) => `field "${i.path.join(".")}" — ${i.message}`)
        .join("; ");
    } catch (err) {
      lastError = err;
      // Network / parse error: no structured hint, but retry once more.
      repairHint = err instanceof Error ? err.message : "unknown error";
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Tender extraction failed after ${maxAttempts} attempt(s). Last error: ${detail}`,
  );
}
