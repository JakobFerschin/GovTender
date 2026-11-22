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
  ExtractCallFn,
  ExtractClientLike,
} from "./extract-tender.js";
export {
  TenderExtractionSchema,
  EXTRACTION_FIELD_DOCS,
  type TenderExtraction,
} from "./schema.js";
export { env } from "./env.js";

// Phase 2 — conditional enhancement & deterministic strategic brief
export {
  enhanceTechnologies,
  generateStrategicBrief,
} from "./enhance-tender.js";
export type {
  EnhanceOptions,
  EnhanceResult,
  TechExtraction,
  StrategicBriefInput,
  StrategicBrief,
  BidRecommendation,
} from "./enhance-tender.js";
