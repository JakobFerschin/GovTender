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

/**
 * Race a promise against an abortable timeout. Clears its timer immediately on
 * settlement and aborts the controller + rejects if `timeoutMs` elapses first.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  controller: AbortController,
): Promise<T> {
  if (timeoutMs === undefined) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Technology enhancement timed out after ${timeoutMs}ms`);
      err.name = "AbortError";
      controller.abort(err);
      reject(err);
    }, Math.max(0, timeoutMs));

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Low-level: ask Mistral for the technology list. Throws on failure. */
async function callMistralForTechs(
  description: string,
  signal: AbortSignal,
): Promise<TechExtraction> {
  const response = await getClient().chat.complete(
    {
      model: env.mistralModel,
      responseFormat: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `--- DESCRIPTION ---\n${description}` },
      ],
    },
    {
      signal,
      fetchOptions: { signal },
    },
  );
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
  /**
   * Optional LLM call override for deterministic unit tests (timeout, retries,
   * graceful degradation) without live network calls or API keys.
   */
  llmCallOverride?: (
    description: string,
    signal: AbortSignal,
  ) => Promise<TechExtraction>;
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

  // 3. LLM disabled (deterministic-only mode) or unconfigured without override — skip.
  if (!allowLlm) {
    return { required_technologies: [], source: "none" };
  }
  if (!options.llmCallOverride && !env.hasMistralKey) {
    return { required_technologies: [], source: "none" };
  }

  // 4. Focused LLM extraction with real timeout enforcement and bounded retries.
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
  const invoke = options.llmCallOverride ?? callMistralForTechs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    try {
      const rawResult = await withTimeout(
        invoke(description!, controller.signal),
        options.timeoutMs,
        controller,
      );
      const validated = TechExtractionSchema.safeParse(rawResult);
      if (!validated.success) {
        throw new Error(
          `Tech extraction validation failed: ${validated.error.message}`,
        );
      }
      return { required_technologies: validated.data.technologies, source: "llm" };
    } catch (err) {
      // Last attempt failed — log and degrade gracefully.
      if (attempt === maxAttempts) {
        console.warn(
          "[enhance] LLM tech extraction failed, degrading to []:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return { required_technologies: [], source: "none" };
}

// ---------------------------------------------------------------------------
// Deterministic Strategic Bid/No-Bid Brief Generator (0ms, €0 cost)
// ---------------------------------------------------------------------------

export interface StrategicBriefInput {
  title: string;
  description?: string;
  country?: string;
  budget?: number | null;
  cpvCodes: string[];
  technologies: string[];
  deadline?: string;
}

export type BidRecommendation = "STRONG BID" | "EVALUATE" | "PASS";

export interface StrategicBrief {
  recommendation: BidRecommendation;
  rationale: string;
  riskFlags: string[];
  strategicPriorities: string[];
}

const DACH_COUNTRIES = new Set(["de", "at", "ch"]);
const EU_EEA_COUNTRIES = new Set([
  "be", "bg", "cy", "cz", "dk", "ee", "es", "eu", "fi", "fr",
  "gr", "hr", "hu", "ie", "is", "it", "li", "lt", "lu", "lv",
  "mt", "nl", "no", "pl", "pt", "ro", "se", "si", "sk",
]);
const CORE_DIGITAL_CPV_PREFIXES = ["48", "72", "302", "64", "794"];

function formatBudgetEur(budget: number): string {
  if (budget >= 1_000_000) {
    return `€${(budget / 1_000_000).toFixed(2)}M`;
  }
  if (budget >= 1_000) {
    return `€${Math.round(budget / 1_000)}k`;
  }
  return `€${Math.round(budget)}`;
}

/**
 * Deterministic McKinsey-style Bid/No-Bid strategic brief generator.
 * Runs synchronously in 0ms at €0 cost — never calls an LLM and never throws.
 */
export function generateStrategicBrief(
  input: StrategicBriefInput,
): StrategicBrief {
  const title = input.title.trim() || "Untitled Public Tender";
  const country = input.country?.trim().toLowerCase();
  const cpvCodes = input.cpvCodes.map((c) => c.trim()).filter(Boolean);
  const technologies = Array.from(
    new Set(input.technologies.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  );
  const corpus = [title, input.description ?? "", ...technologies]
    .join(" ")
    .toLowerCase();

  let score = 0;
  let deadlineExpired = false;
  const riskFlags: string[] = [];
  const strategicPriorities: string[] = [];

  // 1. Commercial / Budget Sizing (max 30 pts)
  const budget =
    typeof input.budget === "number" && Number.isFinite(input.budget)
      ? input.budget
      : null;

  let budgetSummary: string;
  if (budget === null) {
    score += 10;
    budgetSummary = "undisclosed contract value";
    riskFlags.push(
      "Contract value is undisclosed — validate budget ceiling and pricing model from full tender dossier before committing capture spend.",
    );
  } else if (budget >= 1_000_000) {
    score += 30;
    budgetSummary = `flagship ${formatBudgetEur(budget)} contract value`;
    strategicPriorities.push(
      "Assign executive sponsor and structured win-theme review given high contract value and likely tier-1 competition.",
    );
  } else if (budget >= 250_000) {
    score += 22;
    budgetSummary = `core mid-market ${formatBudgetEur(budget)} contract value`;
  } else if (budget >= 75_000) {
    score += 14;
    budgetSummary = `tactical ${formatBudgetEur(budget)} contract value`;
  } else {
    score += 5;
    budgetSummary = `small ${formatBudgetEur(budget)} contract value`;
    riskFlags.push(
      `Low estimated contract value (${formatBudgetEur(budget)}) — verify bid-cost-to-margin economics before proceeding.`,
    );
  }

  // 2. Domain & Technical Alignment (max 35 pts)
  const hasCoreDigitalCpv = cpvCodes.some((code) =>
    CORE_DIGITAL_CPV_PREFIXES.some((prefix) => code.startsWith(prefix)),
  );

  if (hasCoreDigitalCpv) {
    score += 20;
  } else if (cpvCodes.length > 0) {
    score += 8;
    riskFlags.push(
      `Non-core CPV classification (${cpvCodes.slice(0, 3).join(", ")}) — confirm technical lot eligibility and core scope fit.`,
    );
  } else {
    score += 5;
    riskFlags.push(
      "Missing CPV codes — verify official procurement classification and lot breakdown.",
    );
  }

  if (technologies.length >= 3) {
    score += 15;
  } else if (technologies.length >= 1) {
    score += 10;
  } else {
    riskFlags.push(
      "No explicit technology stack identified in notice — inspect technical annex (Leistungsbeschreibung) to validate delivery capabilities.",
    );
  }

  // 3. Geographic & Market Fit (max 15 pts)
  let geoSummary: string;
  if (country && DACH_COUNTRIES.has(country)) {
    score += 15;
    geoSummary = `core DACH market (${country.toUpperCase()})`;
  } else if (country && EU_EEA_COUNTRIES.has(country)) {
    score += 10;
    geoSummary = `EU/EEA market (${country.toUpperCase()})`;
    strategicPriorities.push(
      `Verify local language submission requirements and regional delivery references for ${country.toUpperCase()}.`,
    );
  } else if (country) {
    score += 5;
    geoSummary = `non-core jurisdiction (${country.toUpperCase()})`;
    riskFlags.push(
      `Outside primary EU/DACH footprint (${country.toUpperCase()}) — assess local entity, language, and legal compliance overhead.`,
    );
  } else {
    score += 5;
    geoSummary = "unspecified jurisdiction";
    riskFlags.push(
      "Contracting jurisdiction is unspecified — confirm country, language, and contracting authority eligibility.",
    );
  }

  // 4. Timeline & Capture Feasibility (max 20 pts)
  if (input.deadline) {
    const parsedDeadline = new Date(input.deadline);
    if (!Number.isNaN(parsedDeadline.getTime())) {
      const daysRemaining = Math.ceil(
        (parsedDeadline.getTime() - Date.now()) / 86_400_000,
      );
      if (daysRemaining < 0) {
        deadlineExpired = true;
        riskFlags.push(
          "Submission deadline has already passed — archive for competitor/award intelligence rather than active bidding.",
        );
      } else if (daysRemaining < 10) {
        score += 4;
        riskFlags.push(
          `Compressed submission window (${daysRemaining} day(s) remaining) — high bid execution risk unless pre-positioned.`,
        );
      } else if (daysRemaining < 21) {
        score += 12;
        riskFlags.push(
          `Tight capture window (${daysRemaining} days remaining) — fast-track compliance matrix and reference sign-off.`,
        );
      } else {
        score += 20;
      }
    } else {
      score += 10;
      riskFlags.push(
        "Unparseable submission deadline — verify exact closing date directly on the contracting portal.",
      );
    }
  } else {
    score += 10;
    riskFlags.push(
      "Submission deadline not provided — confirm closing date and clarification Q&A cut-off on portal.",
    );
  }

  // 5. Domain-Specific Strategic Priorities & Risk Signals
  if (
    /\b(iso\s*27001|bsi|c5|tisax|gdpr|dsgvo|vs-nfd|zero[\s-]?trust|security|siem|sicherheit)\b/i.test(
      corpus,
    )
  ) {
    strategicPriorities.push(
      "Lead with sovereign security posture, ISO 27001 / BSI compliance credentials, and audited public-sector references.",
    );
  }

  if (
    /\b(kubernetes|cloud|aws|azure|gcp|docker|terraform|postgresql|devops|microservices)\b/i.test(
      corpus,
    )
  ) {
    strategicPriorities.push(
      "Differentiate on cloud-native reference architecture, automated DevSecOps delivery, and measurable 3-year TCO reduction.",
    );
  }

  if (/\b(sap|s\/4hana|erp|oracle|mainframe|legacy|migration)\b/i.test(corpus)) {
    strategicPriorities.push(
      "Emphasize zero-downtime migration methodology, cutover de-risking milestones, and senior architect continuity.",
    );
  }

  if (/\b(rahmenvertrag|framework|konsortium|consortium)\b/i.test(corpus)) {
    riskFlags.push(
      "Framework or multi-party structure detected — clarify call-off volume guarantees and consortium/subcontractor terms.",
    );
  }

  if (strategicPriorities.length === 0) {
    strategicPriorities.push(
      "Conduct rapid qualification against mandatory exclusion/selection criteria (Eignungskriterien) and price-quality weighting.",
    );
  }
  if (strategicPriorities.length < 2) {
    strategicPriorities.push(
      "Benchmark incumbent pricing and historical awards for this contracting authority to calibrate commercial competitiveness.",
    );
  }

  // 6. Final Recommendation & Executive Rationale
  const recommendation: BidRecommendation = deadlineExpired
    ? "PASS"
    : score >= 65
      ? "STRONG BID"
      : score >= 40
        ? "EVALUATE"
        : "PASS";

  const techSummary =
    technologies.length > 0
      ? `explicit stack alignment (${technologies.slice(0, 5).join(", ")})`
      : "unverified technical stack";

  const actionLine =
    recommendation === "STRONG BID"
      ? "Proceed directly to full capture mobilization and executive pricing sign-off."
      : recommendation === "EVALUATE"
        ? "Run a focused 48-hour qualification gate on scope fit, margin, and compliance before committing full bid resources."
        : "Decline active bid investment and retain notice for market and incumbent award tracking.";

  const rationale = `${recommendation} (readiness score ${score}/100) for "${title}": ${budgetSummary} in ${geoSummary} with ${techSummary}. ${actionLine}`;

  return {
    recommendation,
    rationale,
    riskFlags,
    strategicPriorities,
  };
}
