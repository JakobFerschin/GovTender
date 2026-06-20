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
