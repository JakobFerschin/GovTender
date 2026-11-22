import type {
  BidScorecard,
  BidVerdict,
  HistoricalAwardRecord,
  HistoricalMatch,
  ProcurementPlatform,
  Tender,
  TenderWithIntelligence,
  WinnerPrediction,
} from "./types";

/* ── Reference Catalogs ─────────────────────────────────────────────────── */

export const COUNTRY_LABELS: Record<string, string> = {
  ALL: "All Regions",
  DE: "Germany",
  AT: "Austria",
  CH: "Switzerland",
  FR: "France",
  IT: "Italy",
  NL: "Netherlands",
  BE: "Belgium",
  ES: "Spain",
  PL: "Poland",
  SE: "Sweden",
  DK: "Denmark",
  LU: "Luxembourg",
  EU: "European Union",
};

export const SOURCE_LABELS: Record<ProcurementPlatform, string> = {
  ted: "EU TED",
  simap: "Swiss SIMAP",
  evergabe: "German eVergabe",
  auftragsportal: "Austrian Auftragsportal",
  boamp: "French BOAMP",
  appalti: "Italian Appalti BZ",
};

export const PROCEDURE_LABELS: Record<string, string> = {
  open: "Open Procedure",
  restricted: "Restricted Procedure",
  negotiated: "Negotiated Procedure",
  competitive_dialogue: "Competitive Dialogue",
  innovation_partnership: "Innovation Partnership",
  design_contest: "Design Contest",
  other: "Other Procedure",
};

/**
 * EU Common Procurement Vocabulary (CPV) 2-digit division catalog.
 * Reference: Commission Regulation (EC) No 213/2008.
 */
export const CPV_SECTORS: Record<string, string> = {
  "30": "Office & Computing Hardware",
  "31": "Electrical Systems & Smart Sensors",
  "32": "Telecoms & Network Infrastructure",
  "34": "Transport & Mobility Systems",
  "35": "Security, Defense & Emergency Tech",
  "45": "Civil Engineering & Infrastructure",
  "48": "Software Packages & Information Systems",
  "50": "IT Maintenance & Support Services",
  "64": "Postal & Telecommunications Services",
  "71": "Engineering, Architecture & Technical Advisory",
  "72": "IT Services, Consulting & Development",
  "73": "Research, AI & Development Services",
  "79": "Business, Legal & Management Advisory",
  "80": "Education & Training Services",
  "85": "Healthcare & Social Care Systems",
};

const FX_TO_EUR: Record<string, number> = {
  EUR: 1.0,
  CHF: 1.06,
  GBP: 1.18,
  USD: 0.92,
  PLN: 0.23,
  SEK: 0.088,
  DKK: 0.134,
};

/* ── CPV Prefix Expansion & Deterministic Scoring ──────────────────────── */

/**
 * Normalize raw CPV strings like "48000000-8" or "7226" into bare 8-digit
 * canonical form ("48000000", "72260000"). Returns null if invalid.
 */
export function normalizeCpvCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 2 || digits.length > 9) return null;
  return digits.slice(0, 8).padEnd(8, "0");
}

/**
 * Expand an array of CPV codes into all unique 2..8-digit hierarchical
 * prefixes, sorted ascending. Mirrors `public.expand_cpv_prefixes()` in
 * `supabase/migrations/0002_deterministic_matching.sql`.
 */
export function expandCpvPrefixes(codes: readonly string[]): string[] {
  const prefixes = new Set<string>();
  for (const raw of codes) {
    const normalized = normalizeCpvCode(raw);
    if (!normalized) continue;
    for (let len = 2; len <= 8; len++) {
      prefixes.add(normalized.slice(0, len));
    }
  }
  return [...prefixes].sort();
}

export function getCpvDivision(cpvCodes: readonly string[]): string {
  for (const raw of cpvCodes) {
    const normalized = normalizeCpvCode(raw);
    if (normalized) return normalized.slice(0, 2);
  }
  return "72";
}

export function getCpvSectorLabel(cpvCodes: readonly string[]): string {
  const division = getCpvDivision(cpvCodes);
  return CPV_SECTORS[division] ?? `CPV Division ${division}`;
}

export interface CpvOverlapResult {
  sharedCpvPrefixes: string[];
  sharedCount: number;
  maxPrefixDepth: number;
  sameCountryBonus: number;
  score: number;
}

/**
 * Deterministic hierarchical CPV similarity + geographic alignment score.
 * Mirrors `match_historical_awards_by_cpv` / `match_tenders_by_cpv_and_location`:
 *   score = count(shared 2..8-digit CPV prefixes) + (sameCountry ? 5 : 0)
 */
export function scoreCpvOverlap(
  queryCodes: readonly string[],
  targetCodes: readonly string[],
  queryCountry?: string | null,
  targetCountry?: string | null,
): CpvOverlapResult {
  const queryPrefixes = expandCpvPrefixes(queryCodes);
  const targetPrefixSet = new Set(expandCpvPrefixes(targetCodes));

  const sharedCpvPrefixes = queryPrefixes.filter((p) => targetPrefixSet.has(p));
  const sharedCount = sharedCpvPrefixes.length;

  if (sharedCount === 0) {
    return {
      sharedCpvPrefixes: [],
      sharedCount: 0,
      maxPrefixDepth: 0,
      sameCountryBonus: 0,
      score: 0,
    };
  }

  let maxPrefixDepth = 0;
  for (const prefix of sharedCpvPrefixes) {
    if (prefix.length > maxPrefixDepth) maxPrefixDepth = prefix.length;
  }

  const sameCountry =
    Boolean(queryCountry) &&
    Boolean(targetCountry) &&
    queryCountry!.trim().toUpperCase() === targetCountry!.trim().toUpperCase();

  const sameCountryBonus = sameCountry ? 5 : 0;

  return {
    sharedCpvPrefixes,
    sharedCount,
    maxPrefixDepth,
    sameCountryBonus,
    score: sharedCount + sameCountryBonus,
  };
}

/**
 * Match a single tender against all indexed historical awards using
 * deterministic CPV prefix expansion + geography scoring.
 */
export function matchHistoricalAwards(
  tender: Pick<Tender, "cpvCodes" | "country">,
  awards: readonly HistoricalAwardRecord[],
  limit = 10,
): HistoricalMatch[] {
  const matched: HistoricalMatch[] = [];

  for (const award of awards) {
    const overlap = scoreCpvOverlap(
      tender.cpvCodes,
      award.cpvCodes,
      tender.country,
      award.winnerCountry,
    );
    if (overlap.sharedCount === 0) continue;

    matched.push({
      id: award.id,
      awardTitle: award.awardTitle,
      winnerName: award.winnerName,
      winnerCountry: award.winnerCountry,
      contractValue: award.contractValue,
      currency: award.currency,
      awardDate: award.awardDate,
      score: overlap.score,
      sharedCpvPrefixes: overlap.sharedCpvPrefixes,
      maxPrefixDepth: overlap.maxPrefixDepth,
    });
  }

  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.maxPrefixDepth !== a.maxPrefixDepth) {
      return b.maxPrefixDepth - a.maxPrefixDepth;
    }
    const dateDiff =
      new Date(b.awardDate).getTime() - new Date(a.awardDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return toEur(b.contractValue, b.currency) - toEur(a.contractValue, a.currency);
  });

  return matched.slice(0, limit);
}

/* ── Winner Aggregation & Confidence Engine ─────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Group matched historical awards by winning supplier and compute deterministic
 * incumbent probability / confidence scores (bounded 25–96%).
 */
export function computeWinnerPredictions(
  matches: readonly HistoricalMatch[],
  tenderCountry = "",
): WinnerPrediction[] {
  if (matches.length === 0) return [];

  const grouped = new Map<
    string,
    {
      winnerName: string;
      winnerCountry: string;
      awards: HistoricalMatch[];
      totalScore: number;
      maxScore: number;
      totalEurValue: number;
      latestAwardDate: string;
      prefixSet: Set<string>;
    }
  >();

  let overallScorePool = 0;

  for (const match of matches) {
    const key = match.winnerName.trim().toLowerCase();
    overallScorePool += match.score;

    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        winnerName: match.winnerName.trim(),
        winnerCountry: match.winnerCountry.trim().toUpperCase(),
        awards: [],
        totalScore: 0,
        maxScore: 0,
        totalEurValue: 0,
        latestAwardDate: match.awardDate,
        prefixSet: new Set<string>(),
      };
      grouped.set(key, entry);
    }

    entry.awards.push(match);
    entry.totalScore += match.score;
    if (match.score > entry.maxScore) entry.maxScore = match.score;
    entry.totalEurValue += toEur(match.contractValue, match.currency);
    if (match.awardDate > entry.latestAwardDate) {
      entry.latestAwardDate = match.awardDate;
    }
    for (const p of match.sharedCpvPrefixes) {
      entry.prefixSet.add(p);
    }
  }

  const normalizedTenderCountry = tenderCountry.trim().toUpperCase();
  const predictions: WinnerPrediction[] = [];

  for (const entry of grouped.values()) {
    const winCount = entry.awards.length;
    const totalContractValue = Math.round(entry.totalEurValue);
    const avgContractValue =
      winCount > 0 ? Math.round(totalContractValue / winCount) : 0;

    const scoreSignal = Math.min(entry.maxScore, 22) * 2.15;
    const repeatWinSignal = Math.min(winCount - 1, 4) * 9.5;
    const poolShareSignal =
      overallScorePool > 0
        ? (entry.totalScore / overallScorePool) * 24
        : 0;
    const geoBonus =
      normalizedTenderCountry &&
      entry.winnerCountry === normalizedTenderCountry
        ? 6
        : 0;
    const recencyBonus =
      entry.latestAwardDate >= "2026-01-01"
        ? 5
        : entry.latestAwardDate >= "2025-01-01"
          ? 2
          : 0;

    const confidencePct = Math.round(
      clamp(
        16 + scoreSignal + repeatWinSignal + poolShareSignal + geoBonus + recencyBonus,
        25,
        96,
      ),
    );

    const sortedAwards = [...entry.awards].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.awardDate.localeCompare(a.awardDate);
    });

    predictions.push({
      winnerName: entry.winnerName,
      winnerCountry: entry.winnerCountry,
      winCount,
      totalContractValue,
      avgContractValue,
      confidencePct,
      maxScore: entry.maxScore,
      latestAwardDate: entry.latestAwardDate,
      sharedCpvPrefixes: [...entry.prefixSet].sort(),
      awards: sortedAwards,
    });
  }

  predictions.sort((a, b) => {
    if (b.confidencePct !== a.confidencePct) {
      return b.confidencePct - a.confidencePct;
    }
    if (b.winCount !== a.winCount) return b.winCount - a.winCount;
    return b.totalContractValue - a.totalContractValue;
  });

  return predictions;
}

/* ── 4-Axis McKinsey Bid / No-Bid Scorecard ────────────────────────────── */

/**
 * Deterministic 4-axis Bid/No-Bid Scorecard evaluating CPV Fit (30%),
 * Geographic Fit (20%), Budget Attractiveness (25%), and Timeline
 * Feasibility (25%).
 */
export function computeBidScorecard(
  tender: Tender,
  matches: readonly HistoricalMatch[],
  winnerPredictions?: readonly WinnerPrediction[],
  referenceNow?: number,
): BidScorecard {
  const predictions =
    winnerPredictions ?? computeWinnerPredictions(matches, tender.country);
  const topWinner = predictions[0] ?? null;
  const division = getCpvDivision(tender.cpvCodes);
  const days = daysUntil(tender.deadline, referenceNow);
  const isExpired = days < 0 || tender.status !== "active";

  // 1. CPV Fit (0–100)
  const coreDivisions = new Set(["48", "72"]);
  const adjacentDivisions = new Set(["31", "32", "71", "73"]);
  let cpvBase = 50;
  if (coreDivisions.has(division)) cpvBase = 70;
  else if (adjacentDivisions.has(division)) cpvBase = 60;
  else if (division === "79") cpvBase = 56;

  const maxDepth = matches.reduce(
    (acc, m) => Math.max(acc, m.maxPrefixDepth),
    0,
  );
  const depthBonus =
    maxDepth >= 8 ? 17 : maxDepth >= 5 ? 13 : maxDepth >= 4 ? 10 : maxDepth >= 2 ? 5 : -6;
  const breadthBonus = Math.min(matches.length, 5) * 2;
  const techBonus =
    tender.technologies.length >= 3
      ? 4
      : tender.technologies.length >= 1
        ? 2
        : -4;
  const cpvFit = Math.round(clamp(cpvBase + depthBonus + breadthBonus + techBonus, 24, 98));

  // 2. Geographic Fit (0–100)
  const geoTable: Record<string, number> = {
    DE: 94,
    AT: 91,
    CH: 88,
    NL: 83,
    FR: 81,
    IT: 78,
    BE: 79,
    LU: 80,
  };
  const geoBase = geoTable[tender.country.toUpperCase()] ?? 70;
  const hasLocalPrecedent = matches.some(
    (m) => m.winnerCountry.toUpperCase() === tender.country.toUpperCase(),
  );
  const geographicFit = Math.round(
    clamp(geoBase + (hasLocalPrecedent ? 3 : -6), 38, 98),
  );

  // 3. Budget Attractiveness (0–100)
  let budgetAttractiveness = 50;
  const eurBudget =
    tender.budget != null ? toEur(tender.budget, tender.currency) : null;
  if (eurBudget == null) {
    budgetAttractiveness = 50;
  } else if (eurBudget >= 1_500_000 && eurBudget <= 8_500_000) {
    budgetAttractiveness = Math.round(
      87 + ((eurBudget - 1_500_000) / 7_000_000) * 9,
    );
  } else if (eurBudget > 8_500_000 && eurBudget <= 18_000_000) {
    budgetAttractiveness = 84;
  } else if (eurBudget > 18_000_000) {
    budgetAttractiveness = 76;
  } else if (eurBudget >= 750_000) {
    budgetAttractiveness = Math.round(
      75 + ((eurBudget - 750_000) / 750_000) * 10,
    );
  } else if (eurBudget >= 300_000) {
    budgetAttractiveness = Math.round(
      60 + ((eurBudget - 300_000) / 450_000) * 14,
    );
  } else {
    budgetAttractiveness = 46;
  }

  // 4. Timeline Feasibility (0–100)
  let timelineFeasibility: number;
  if (isExpired) {
    timelineFeasibility = 10;
  } else if (days < 14) {
    timelineFeasibility = 34;
  } else if (days < 25) {
    timelineFeasibility = 56;
  } else if (days < 45) {
    timelineFeasibility = 80;
  } else if (days <= 120) {
    timelineFeasibility = 94;
  } else {
    timelineFeasibility = 87;
  }

  const competitiveFriction =
    (topWinner && topWinner.confidencePct >= 80 ? 4 : 0) +
    (tender.procedure === "competitive_dialogue" ||
    tender.procedure === "restricted"
      ? 3
      : 0);

  const weighted = Math.round(
    clamp(
      cpvFit * 0.3 +
        geographicFit * 0.2 +
        budgetAttractiveness * 0.25 +
        timelineFeasibility * 0.25 -
        competitiveFriction,
      15,
      98,
    ),
  );
  const overallScore = isExpired ? Math.min(weighted, 42) : weighted;

  let verdict: BidVerdict;
  if (isExpired) {
    verdict = "PASS";
  } else if (overallScore >= 84) {
    verdict = "STRONG BID";
  } else if (overallScore >= 68) {
    verdict = "EVALUATE";
  } else {
    verdict = "PASS";
  }

  // Tailored Risk Flags
  const riskFlags: string[] = [];
  if (isExpired) {
    riskFlags.push(
      `Submission window closed (${Math.abs(days)}d ago) — track for award notice & incumbent capture.`,
    );
  } else if (days < 21) {
    riskFlags.push(
      `Compressed ${days}-day proposal timeline leaves limited window for consortium & compliance review.`,
    );
  }
  if (eurBudget == null) {
    riskFlags.push(
      "Estimated contract value undisclosed in notice — requires direct buyer clarification before pricing.",
    );
  } else if (eurBudget >= 8_000_000) {
    riskFlags.push(
      `Large ${formatCompactCurrency(tender.budget, tender.currency)} scope likely requires Tier-1 reference revenue thresholds or consortium structure.`,
    );
  }
  if (topWinner && topWinner.confidencePct >= 75) {
    riskFlags.push(
      `High incumbent concentration: ${topWinner.winnerName} holds ${topWinner.confidencePct}% predicted win likelihood across ${topWinner.winCount} matched award${topWinner.winCount === 1 ? "" : "s"}.`,
    );
  }
  if (
    tender.procedure === "restricted" ||
    tender.procedure === "competitive_dialogue"
  ) {
    riskFlags.push(
      `${PROCEDURE_LABELS[tender.procedure] ?? tender.procedure} requires upfront qualification dossier & reference verification.`,
    );
  }
  if (!["DE", "AT"].includes(tender.country.toUpperCase())) {
    const label = COUNTRY_LABELS[tender.country.toUpperCase()] ?? tender.country;
    riskFlags.push(
      `Cross-border delivery in ${label} (${tender.currency}) — validate local data residency, language, and procurement compliance.`,
    );
  }
  if (matches.length === 0) {
    riskFlags.push(
      "Sparse CPV historical precedent in index — competitive field pricing is less predictable.",
    );
  }
  if (riskFlags.length === 0) {
    riskFlags.push(
      "Standard EU public procurement compliance & formal documentation audit required prior to submission.",
    );
  }

  // Tailored Strategic Priorities
  const strategicPriorities: string[] = [];
  if (tender.technologies.length > 0) {
    const leadTechs = tender.technologies.slice(0, 3).join(", ");
    strategicPriorities.push(
      `Anchor technical proposal around certified ${leadTechs} delivery references in ${COUNTRY_LABELS[tender.country] ?? tender.country}.`,
    );
  }
  if (topWinner) {
    strategicPriorities.push(
      `Counter-position against ${topWinner.winnerName} (avg precedent ${formatCompactCurrency(topWinner.avgContractValue, "EUR")}) via open-standards architecture and transparent TCO.`,
    );
  }
  if (!isExpired && days >= 30) {
    strategicPriorities.push(
      `Use the ${days}-day runway to submit structured buyer clarification questions on SLA penalties and evaluation weights.`,
    );
  } else if (!isExpired) {
    strategicPriorities.push(
      `Activate rapid-response bid desk immediately and reuse pre-vetted ISO 27001 / GDPR compliance annexures.`,
    );
  } else {
    strategicPriorities.push(
      "Monitor upcoming award publication to benchmark winning pricing and position for Phase 2 extension lots.",
    );
  }
  if (tender.cpvCodes.length > 0) {
    strategicPriorities.push(
      `Align mandatory eligibility references explicitly to CPV ${tender.cpvCodes.join(" / ")} (${tender.cpvSector}).`,
    );
  }

  // Executive Rationale
  const budgetText =
    tender.budget != null
      ? formatCompactCurrency(tender.budget, tender.currency)
      : "undisclosed budget";
  const incumbentText = topWinner
    ? `${topWinner.winnerName} leads historical CPV precedent (${topWinner.confidencePct}% confidence)`
    : "open competitive field with no entrenched CPV incumbent";

  let rationale: string;
  if (isExpired) {
    rationale = `Closed notice in ${tender.cpvSector} (${budgetText}). Retained for competitive intelligence: ${incumbentText}.`;
  } else if (verdict === "STRONG BID") {
    rationale = `High-conviction ${COUNTRY_LABELS[tender.country] ?? tender.country} opportunity (${budgetText}, ${days}d remaining) with strong ${tender.cpvSector} alignment; ${incumbentText}.`;
  } else if (verdict === "EVALUATE") {
    rationale = `Selective pursue candidate (${budgetText}, ${days}d remaining) requiring qualification validation in ${tender.cpvSector}; ${incumbentText}.`;
  } else {
    rationale = `Low near-term capture attractiveness given timeline, scope visibility, or competitive hurdles; ${incumbentText}.`;
  }

  return {
    overallScore,
    verdict,
    cpvFit,
    geographicFit,
    budgetAttractiveness,
    timelineFeasibility,
    rationale,
    riskFlags: riskFlags.slice(0, 4),
    strategicPriorities: strategicPriorities.slice(0, 4),
  };
}

/**
 * Compute full deterministic intelligence (matches, winner predictions, and
 * 4-axis Bid Scorecard) for a raw tender against indexed historical awards.
 */
export function enrichTender(
  tender: Tender,
  awards: readonly HistoricalAwardRecord[],
  referenceNow?: number,
): TenderWithIntelligence {
  const matches = matchHistoricalAwards(tender, awards, 10);
  const winnerPredictions = computeWinnerPredictions(matches, tender.country);
  const scorecard = computeBidScorecard(
    tender,
    matches,
    winnerPredictions,
    referenceNow,
  );
  const top = winnerPredictions[0] ?? null;

  return {
    ...tender,
    matches,
    winnerPredictions,
    scorecard,
    topPredictedWinner: top ? top.winnerName : null,
    topWinnerConfidence: top ? top.confidencePct : 0,
  };
}

/**
 * Find active/recent sibling tenders sharing CPV prefixes with `target`.
 */
export function findSimilarTenders(
  target: Tender,
  pool: readonly Tender[],
  limit = 4,
): {
  id: string;
  title: string;
  authority: string;
  country: string;
  budget: number | null;
  currency: string;
  sharedPrefixes: string[];
  score: number;
}[] {
  const results: {
    id: string;
    title: string;
    authority: string;
    country: string;
    budget: number | null;
    currency: string;
    sharedPrefixes: string[];
    score: number;
  }[] = [];

  for (const candidate of pool) {
    if (candidate.id === target.id) continue;
    const overlap = scoreCpvOverlap(
      target.cpvCodes,
      candidate.cpvCodes,
      target.country,
      candidate.country,
    );
    if (overlap.sharedCount === 0) continue;

    results.push({
      id: candidate.id,
      title: candidate.title,
      authority: candidate.authority,
      country: candidate.country,
      budget: candidate.budget,
      currency: candidate.currency,
      sharedPrefixes: overlap.sharedCpvPrefixes,
      score: overlap.score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/* ── Currency & Timeline Formatting Helpers ─────────────────────────────── */

export function toEur(amount: number | null, currency: string): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  const rate = FX_TO_EUR[currency.toUpperCase()] ?? 1.0;
  return amount * rate;
}

export function formatCurrency(
  value: number | null,
  currency = "EUR",
): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("de-DE")} ${currency}`;
  }
}

export function formatCompactCurrency(
  value: number | null,
  currency = "EUR",
): string {
  if (value == null) return "—";
  const symbol =
    currency === "EUR"
      ? "€"
      : currency === "CHF"
        ? "CHF "
        : currency === "GBP"
          ? "£"
          : currency === "USD"
            ? "$"
            : `${currency} `;

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2);
    return `${sign}${symbol}${formatted.replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${Math.round(abs / 1_000)}K`;
  }
  return `${sign}${symbol}${Math.round(abs)}`;
}

/** Days until submission deadline. Negative values indicate an expired notice. */
export function daysUntil(deadline: string, referenceNow = Date.now()): number {
  const targetMs = new Date(deadline).getTime();
  if (Number.isNaN(targetMs)) return 0;
  return Math.ceil((targetMs - referenceNow) / 86_400_000);
}
