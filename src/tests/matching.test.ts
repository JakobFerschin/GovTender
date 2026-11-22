/**
 * Deterministic matching, CPV taxonomy, country normalization, and tech
 * extraction test suite (keyless, pure unit tests).
 *
 *   Run:  npm run test:matching
 *
 * Verifies:
 *   1. CpvSet.normalize (check-digit stripping, right-padding, invalid rejection).
 *   2. CpvSet.toMatchKeys & toSortedArray (hierarchical prefix rollup, longest-first).
 *   3. getCpvDivisionLabel (known divisions, fallback division label, invalid input).
 *   4. computeCpvMatch (exact 8-digit > 4-digit class > 2-digit division > disjoint 0).
 *   5. normalizeCountry across EU-27 + EFTA alpha-2, alpha-3, localized names, and composite strings.
 *   6. extractDeterministicTechnologies (cloud, DB, security, ERP, German terms, negative lookaheads).
 */
import {
  CpvSet,
  getCpvDivisionLabel,
  computeCpvMatch,
  normalizeCountry,
  extractDeterministicTechnologies,
} from "../lib/ingestion/index.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  [SUCCESS] ${msg}`);
  } else {
    failed++;
    console.log(`  [ERROR]   ${msg}`);
  }
}

async function case_(name: string, fn: () => Promise<void> | void): Promise<void> {
  console.log(`\n— ${name}`);
  try {
    await fn();
  } catch (err) {
    failed++;
    console.log(
      `  [ERROR]   threw unexpectedly: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("=== GovTender AI — Deterministic Matching & Normalization Test Suite ===");

  // --- Case 1: CpvSet.normalize ------------------------------------------
  await case_("CpvSet.normalize strips check digits, pads to 8 digits, and rejects invalid inputs", () => {
    assert(CpvSet.normalize("48000000-8") === "48000000", "'48000000-8' -> '48000000'");
    assert(CpvSet.normalize("48000000") === "48000000", "'48000000' -> '48000000'");
    assert(CpvSet.normalize("48") === "48000000", "'48' -> '48000000' (right-padded)");
    assert(CpvSet.normalize("7226") === "72260000", "'7226' -> '72260000' (right-padded)");
    assert(CpvSet.normalize(" 72267100-7 ") === "72267100", "trimmed '72267100-7' -> '72267100'");
    assert(CpvSet.normalize(undefined) === undefined, "undefined -> undefined");
    assert(CpvSet.normalize("") === undefined, "empty string -> undefined");
    assert(CpvSet.normalize("7") === undefined, "1-digit string -> undefined");
    assert(CpvSet.normalize("not-a-cpv") === undefined, "non-numeric string -> undefined");
    assert(CpvSet.normalize("1234567890") === undefined, "10-digit string -> undefined");
  });

  // --- Case 2: CpvSet.toMatchKeys & toSortedArray ------------------------
  await case_("CpvSet.toMatchKeys expands 8-digit codes into longest-first deduped prefixes", () => {
    const single = new CpvSet(["48000000-8"]);
    const keys = single.toMatchKeys();
    const expected = [
      "48000000",
      "4800000",
      "480000",
      "48000",
      "4800",
      "480",
      "48",
    ];
    assert(
      keys.length === expected.length &&
        keys.every((k, i) => k === expected[i]),
      `single CPV expanded to 7 longest-first prefixes (${keys.join(", ")})`,
    );

    const multi = new CpvSet(["72267100-7", "48000000-8", "48000000", "invalid"]);
    const sorted = multi.toSortedArray();
    assert(
      sorted.length === 2 && sorted[0] === "48000000" && sorted[1] === "72267100",
      `toSortedArray deduplicates and sorts ascending (${sorted.join(", ")})`,
    );
    const multiKeys = multi.toMatchKeys();
    assert(
      multiKeys.includes("7226") && multiKeys.includes("72") && multiKeys.includes("48"),
      "multi-code match keys contain division and class prefixes for both codes",
    );
    assert(
      multiKeys.every((k, i) => i === 0 || (multiKeys[i - 1]?.length ?? 0) >= k.length),
      "toMatchKeys ordered longest-first",
    );
  });

  // --- Case 3: getCpvDivisionLabel ---------------------------------------
  await case_("getCpvDivisionLabel resolves known EU CPV divisions and safe fallbacks", () => {
    assert(
      getCpvDivisionLabel("48000000-8") === "Software Packages & Information Systems",
      "48000000-8 -> Software Packages & Information Systems",
    );
    assert(
      getCpvDivisionLabel("72") === "IT Services, Consulting & Development",
      "72 -> IT Services, Consulting & Development",
    );
    assert(
      getCpvDivisionLabel("31620000-8") === "Electrical & Smart Infrastructure",
      "31620000-8 -> Electrical & Smart Infrastructure",
    );
    assert(
      getCpvDivisionLabel("99000000") === "Division 99",
      "unmapped division '99000000' -> 'Division 99'",
    );
    assert(
      getCpvDivisionLabel("bad") === "Unclassified",
      "invalid code -> 'Unclassified'",
    );
  });

  // --- Case 4: computeCpvMatch scoring hierarchy -------------------------
  await case_("computeCpvMatch scores exact (8-digit) > class (4-digit) > division (2-digit) > disjoint (0)", () => {
    const exact = computeCpvMatch(["72267100-7"], ["72267100-7"]);
    const classMatch = computeCpvMatch(["72267100-7"], ["72261000-2"]);
    const divisionMatch = computeCpvMatch(["72267100-7"], ["72990000-0"]);
    const disjoint = computeCpvMatch(["48000000-8"], ["45000000-7"]);
    const empty = computeCpvMatch([], ["72267100-7"]);

    assert(exact.maxDepth === 8, `exact match maxDepth = ${exact.maxDepth} (expected 8)`);
    assert(classMatch.maxDepth === 4, `class match maxDepth = ${classMatch.maxDepth} (expected 4)`);
    assert(divisionMatch.maxDepth === 2, `division match maxDepth = ${divisionMatch.maxDepth} (expected 2)`);
    assert(
      exact.score > classMatch.score,
      `exact (${exact.score}) outscores 4-digit class (${classMatch.score})`,
    );
    assert(
      classMatch.score > divisionMatch.score,
      `4-digit class (${classMatch.score}) outscores 2-digit division (${divisionMatch.score})`,
    );
    assert(
      divisionMatch.score > 0,
      `2-digit division match has positive score (${divisionMatch.score})`,
    );
    assert(
      disjoint.score === 0 && disjoint.maxDepth === 0 && disjoint.sharedPrefixes.length === 0,
      "disjoint CPV codes score 0 with no shared prefixes",
    );
    assert(
      empty.score === 0 && empty.maxDepth === 0 && empty.sharedPrefixes.length === 0,
      "empty query codes score 0 cleanly",
    );
  });

  // --- Case 5: EU-27 / EFTA normalizeCountry -----------------------------
  await case_("normalizeCountry handles EU-27/EFTA alpha-2, alpha-3, localized names, and composite strings", () => {
    const cases: readonly [string, string][] = [
      ["DE", "de"],
      ["AT", "at"],
      ["CH", "ch"],
      ["IT", "it"],
      ["FR", "fr"],
      ["NL", "nl"],
      ["DEU", "de"],
      ["AUT", "at"],
      ["CHE", "ch"],
      ["FRA", "fr"],
      ["ITA", "it"],
      ["NLD", "nl"],
      ["NOR", "no"],
      ["SWE", "se"],
      ["EL", "gr"],
      ["UK", "gb"],
      ["Österreich", "at"],
      ["Oesterreich", "at"],
      ["Schweiz", "ch"],
      ["Suisse", "ch"],
      ["Deutschland", "de"],
      ["Frankreich", "fr"],
      ["Italien", "it"],
      ["Niederlande", "nl"],
      ["Munich, Germany", "de"],
      ["Prague, Czech Republic", "cz"],
      ["Vienna AUT", "at"],
      ["Zürich, Schweiz", "ch"],
    ];

    for (const [input, expected] of cases) {
      const actual = normalizeCountry(input);
      assert(actual === expected, `'${input}' -> '${expected}' (got '${String(actual)}')`);
    }

    assert(normalizeCountry(undefined) === undefined, "undefined -> undefined");
    assert(normalizeCountry("   ") === undefined, "whitespace -> undefined");
  });

  // --- Case 6: extractDeterministicTechnologies --------------------------
  await case_("extractDeterministicTechnologies extracts curated cloud/DB/security/ERP tags deterministically", () => {
    const cloudTechs = extractDeterministicTechnologies(
      "Aufbau einer Kubernetes (k8s) Plattform mit PostgreSQL, ElasticSearch SIEM, Zero-Trust, ISO 27001, BSI C5 und DSGVO-Konformität.",
    );
    for (const tag of [
      "bsi c5",
      "elasticsearch",
      "gdpr/dsgvo",
      "iso 27001",
      "kubernetes",
      "postgresql",
      "siem",
      "zero trust",
    ]) {
      assert(cloudTechs.includes(tag), `cloud/security text extracts '${tag}'`);
    }

    const erpAndAppTechs = extractDeterministicTechnologies(
      "Migration auf SAP S/4HANA mit Java Spring Boot Microservices, TypeScript, React.js, Node.js und OpenID Connect.",
    );
    for (const tag of [
      "java",
      "node.js",
      "openid connect",
      "react",
      "sap",
      "sap s/4hana",
      "spring boot",
      "typescript",
    ]) {
      assert(erpAndAppTechs.includes(tag), `ERP/app text extracts '${tag}'`);
    }

    const jsOnly = extractDeterministicTechnologies("Pure JavaScript browser UI without JVM");
    assert(!jsOnly.includes("java"), "'JavaScript' does NOT false-positive match 'java'");

    const germanDomain = extractDeterministicTechnologies(
      "Kommunaler Glasfaser-Ausbau, Roboter-Steuerung und externes Projektmanagement.",
    );
    assert(germanDomain.includes("fiber optics"), "German 'Glasfaser' -> 'fiber optics'");
    assert(germanDomain.includes("robotics"), "German 'Roboter' -> 'robotics'");
    assert(germanDomain.includes("project management"), "German 'Projektmanagement' -> 'project management'");

    const sortedCopy = [...cloudTechs].sort();
    assert(
      cloudTechs.every((t, i) => t === sortedCopy[i] && t === t.toLowerCase()),
      "output is lowercase, deduplicated, and sorted ascending",
    );

    assert(extractDeterministicTechnologies(undefined).length === 0, "undefined -> []");
    assert(extractDeterministicTechnologies("   ").length === 0, "blank string -> []");
    assert(
      extractDeterministicTechnologies("Lieferung von Büromöbeln und Schreibwaren.").length === 0,
      "non-technical procurement prose -> []",
    );
  });

  console.log("\n=== Summary ===");
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log("[ERROR] matching & normalization test FAILED");
    process.exit(1);
  } else {
    console.log("[SUCCESS] matching & normalization test PASSED");
    process.exit(0);
  }
}

void main();
