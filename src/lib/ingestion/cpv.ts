/**
 * CPV (Common Procurement Vocabulary) helpers.
 *
 * CPV codes look like "48000000-8" — 8 digits + a check digit. For matching,
 * the leading digits encode the division/group/class (e.g. "48" = software,
 * "48000000" = software package). We store the bare 8-digit form and, for
 * deterministic matching, also expand each code into its prefixes so a tender
 * tagged "48000000" matches an award tagged "48217000" (network software) at
 * the division level.
 *
 * Reference: https://simap.ted.europa.eu/cpv
 */
export class CpvSet {
  private readonly codes = new Set<string>(); // 8-digit canonical form

  constructor(input: string[]) {
    for (const raw of input) this.add(raw);
  }

  add(raw: string): void {
    const code = CpvSet.normalize(raw);
    if (code) this.codes.add(code);
  }

  /** All canonical 8-digit codes, sorted ascending. */
  toSortedArray(): string[] {
    return [...this.codes].sort();
  }

  /**
   * All division/group/class prefixes for matching, sorted, deduped, longest
   * first. Includes the full codes themselves.
   *   e.g. "48000000" -> ["48000000", "4800000", "480000", "48000", "4800", "480", "48"]
   */
  toMatchKeys(): string[] {
    const keys = new Set<string>();
    for (const code of this.codes) {
      keys.add(code);
      // Roll up: 8 -> 2 digits. CPV structure is division(2) group(3) class(4).
      for (let len = 2; len < code.length; len++) {
        keys.add(code.slice(0, len));
      }
    }
    return [...keys].sort((a, b) => b.length - a.length);
  }

  /** "48000000-8" / "48" / "48000000" -> "48000000" (right-padded). Invalid -> undefined. */
  static normalize(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 2 || digits.length > 9) return undefined;
    return digits.slice(0, 8).padEnd(8, "0");
  }
}

/**
 * Human-readable labels for EU Common Procurement Vocabulary (CPV) 2-digit
 * divisions. Covers all major public-sector procurement divisions, with
 * emphasis on IT, infrastructure, engineering, advisory, and public services.
 */
export const CPV_DIVISION_LABELS: Record<string, string> = {
  "03": "Agricultural, Farming & Forestry Products",
  "09": "Petroleum, Fuel & Energy Products",
  "15": "Food, Beverages & Related Products",
  "22": "Printed Matter & Related Products",
  "30": "Office & IT Equipment",
  "31": "Electrical & Smart Infrastructure",
  "32": "Telecom & Networking Equipment",
  "33": "Medical Equipment & Pharmaceuticals",
  "34": "Transport Equipment & Mobility",
  "35": "Security, Defence & Safety Equipment",
  "38": "Laboratory, Optical & Precision Instruments",
  "42": "Industrial Machinery",
  "44": "Construction Structures & Materials",
  "45": "Construction & Civil Works",
  "48": "Software Packages & Information Systems",
  "50": "Repair & Maintenance Services",
  "55": "Hotel, Restaurant & Retail Services",
  "60": "Transport Services",
  "64": "Postal & Telecom Services",
  "65": "Public Utilities",
  "66": "Financial & Insurance Services",
  "70": "Real Estate Services",
  "71": "Architecture & Engineering",
  "72": "IT Services, Consulting & Development",
  "73": "R&D & Innovation Services",
  "75": "Public Administration & Defence Services",
  "77": "Agricultural, Forestry & Landscape Services",
  "79": "Business & Advisory Services",
  "80": "Education & Training",
  "85": "Health & Social Services",
  "90": "Environmental, Waste & Cleaning Services",
  "92": "Recreational, Cultural & Sporting Services",
  "98": "Other Community, Social & Personal Services",
};

/**
 * Resolve the human-readable CPV division label for any raw or canonical CPV
 * code (e.g. `"48000000-8"` or `"72"`). Falls back deterministically when a
 * division is outside the curated map or the input is invalid.
 */
export function getCpvDivisionLabel(code: string): string {
  const normalized = CpvSet.normalize(code);
  if (!normalized) return "Unclassified";
  const division = normalized.slice(0, 2);
  return CPV_DIVISION_LABELS[division] ?? `Division ${division}`;
}

export interface CpvMatchResult {
  /** Shared CPV prefixes (2..8 digits), sorted longest-first then ascending. */
  sharedPrefixes: string[];
  /** Deepest shared prefix length across all pairs (0 if no division overlap). */
  maxDepth: number;
  /**
   * Deterministic, transparent match score:
   *   sum over matching code pairs of DEPTH_WEIGHT[deepestSharedPrefix(q, t)]
   *   + sharedPrefixes.length
   */
  score: number;
}

/**
 * Progressive weights by shared CPV prefix depth (digits 2..8):
 *   2 = Division, 3 = Group, 4 = Class, 5 = Category, 6..7 = Sub-category, 8 = Exact code.
 */
const CPV_DEPTH_WEIGHTS: Record<number, number> = {
  2: 2,
  3: 4,
  4: 6,
  5: 9,
  6: 12,
  7: 15,
  8: 20,
};

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) {
    i++;
  }
  return i;
}

/**
 * Deterministically score the CPV overlap between a query set (e.g. an active
 * tender) and a target set (e.g. a historical award or supplier profile).
 *
 * Pure, side-effect-free, and transparent:
 *  - Normalizes both code lists through `CpvSet`.
 *  - Computes all shared 2..8-digit hierarchical prefixes.
 *  - Evaluates the deepest shared prefix for every matching (query, target)
 *    code pair (depth >= 2), sums their progressive depth weights, and adds
 *    the total count of distinct shared prefixes.
 */
export function computeCpvMatch(
  queryCodes: string[],
  targetCodes: string[],
): CpvMatchResult {
  const querySet = new CpvSet(queryCodes);
  const targetSet = new CpvSet(targetCodes);

  const normalizedQuery = querySet.toSortedArray();
  const normalizedTarget = targetSet.toSortedArray();

  if (normalizedQuery.length === 0 || normalizedTarget.length === 0) {
    return { sharedPrefixes: [], maxDepth: 0, score: 0 };
  }

  const targetKeys = new Set(targetSet.toMatchKeys());
  const sharedPrefixes = querySet
    .toMatchKeys()
    .filter((prefix) => targetKeys.has(prefix))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));

  if (sharedPrefixes.length === 0) {
    return { sharedPrefixes: [], maxDepth: 0, score: 0 };
  }

  let maxDepth = 0;
  let pairDepthScore = 0;

  for (const q of normalizedQuery) {
    for (const t of normalizedTarget) {
      const depth = commonPrefixLength(q, t);
      if (depth >= 2) {
        if (depth > maxDepth) maxDepth = depth;
        pairDepthScore += CPV_DEPTH_WEIGHTS[depth] ?? 0;
      }
    }
  }

  const score = pairDepthScore + sharedPrefixes.length;
  return { sharedPrefixes, maxDepth, score };
}

