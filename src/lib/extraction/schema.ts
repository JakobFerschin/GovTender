import { z } from "zod";

/**
 * Zod schema describing the canonical structure we force the Mistral model to
 * return for every parsed tender document.
 *
 * This is the single source of truth for the extraction contract — the same
 * schema is:
 *   1. rendered into the prompt instructions,
 *   2. used to validate/repair the model output, and
 *   3. (Phase 2) mapped onto the `public.tenders` columns.
 *
 * Keep the field set minimal and stable; the full raw text + model output are
 * always preserved in `tenders.raw_payload` for re-processing later.
 */
export const TenderExtractionSchema = z.object({
  /** Short human-readable title of the procurement (not the full document title). */
  title: z
    .string()
    .min(3, "title must be at least 3 characters")
    .max(500, "title is unreasonably long (>500 chars)"),

  /**
   * Estimated contract value in the procurement's native currency.
   * `null` when the document does not state a value (very common for
   * framework agreements and RfI notices).
   */
  estimated_budget: z
    .number()
    .nonnegative("estimated_budget must be >= 0")
    .finite()
    .nullable(),

  /**
   * Technologies, products, or skill areas explicitly required by the notice.
   * Normalised to lowercase, trimmed, deduplicated. May be empty.
   * e.g. ["kubernetes", "sap s/4hana", "postgresql", "iso 27001"]
   */
  required_technologies: z
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

  /** The contracting body / buyer issuing the tender (German: "Vergabestelle"). */
  awarding_authority: z
    .string()
    .min(2, "awarding_authority must be at least 2 characters")
    .max(300),
});

/** The validated, post-transform TypeScript type returned by extraction. */
export type TenderExtraction = z.infer<typeof TenderExtractionSchema>;

/** Verbose JSON Schema fragment we inject into the prompt. */
export const EXTRACTION_FIELD_DOCS: Record<
  keyof TenderExtraction,
  string
> = {
  title: "string — concise title of the procurement (3–500 chars)",
  estimated_budget:
    "number | null — estimated contract value in the document's currency; null if unknown",
  required_technologies:
    "string[] — explicit tech/skill/product requirements, lowercase; [] if none",
  awarding_authority: "string — the contracting body issuing the tender",
};
