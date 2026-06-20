/**
 * Extraction module public surface (Phase 2).
 *
 * Phase 1's `extractTender` is retained for the "full document" path, but the
 * new primary path is `enhanceTechnologies` — a narrow, conditional LLM call
 * that only fills the one field (technologies) the deterministic parser can't.
 */
export { extractTender } from "./extract-tender.js";
export type {
  ExtractTenderOptions,
  ExtractTenderResult,
} from "./extract-tender.js";
export {
  TenderExtractionSchema,
  type TenderExtraction,
} from "./schema.js";

// Phase 2 — conditional enhancement
export { enhanceTechnologies } from "./enhance-tender.js";
export type {
  EnhanceOptions,
  EnhanceResult,
} from "./enhance-tender.js";
