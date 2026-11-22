/**
 * Deterministic OCDS → internal domain mapper.
 *
 * No I/O, no LLM, no side effects. Pure transformation from the OCDS release
 * structure into the shape of our Supabase rows. Everything here must be
 * derivable from the structured payload alone.
 *
 * "Non-LLM First": the pipeline calls `mapRelease()` first — including curated
 * deterministic technology extraction at €0 cost; LLM enhancement only fills
 * in gaps afterwards when `required_technologies` is still empty.
 */
import type {
  OcdsRelease,
  OcdsPackage,
  OcdsOrganization,
  OcdsItem,
  OcdsClassification,
  OcdsValue,
} from "./ocds-types.js";
import { CpvSet } from "./cpv.js";

/** Normalised ISO-3166 alpha-2 country, lowercased — the join key for the
 *  deterministic matcher. */
export type CountryCode = string;

/** Canonical Supabase `tender_status` enum values (migration 0001). */
export type TenderStatus = "active" | "closed" | "withdrawn" | "awarded";

/** Canonical Supabase `procurement_procedure` enum values (migration 0001). */
export type ProcurementProcedure =
  | "open"
  | "restricted"
  | "negotiated"
  | "competitive_dialogue"
  | "innovation_partnership"
  | "design_contest"
  | "other";

export interface MapReleaseOptions {
  /** Provenance tag written to `source` (e.g. "ted", "simap", "evergabe"). Defaults to "ocds". */
  source?: string;
}

/** The canonical internal row we intend to insert/update. Mirrors the
 *  `tenders` and `historical_awards` columns. */
export interface TenderRecord {
  source: string;
  source_id: string;
  source_url?: string;
  title: string;
  description?: string;
  cpv_codes: string[];
  country?: CountryCode;
  awarding_authority_name?: string;
  estimated_budget?: number | null;
  currency: string;
  publication_date?: Date;
  submission_deadline?: Date;
  procedure?: ProcurementProcedure;
  status: TenderStatus;
  /** Extracted deterministically first; conditionally enhanced by LLM if empty. */
  required_technologies?: string[];
  /** Original OCDS payload retained for audit and re-processing. */
  raw_payload?: unknown;
}

export interface HistoricalAwardRecord {
  source: string;
  source_id: string;
  source_url?: string;
  title: string;
  description?: string;
  cpv_codes: string[];
  awarding_authority_name?: string;
  winner_name?: string;
  winner_country?: CountryCode;
  contract_value?: number | null;
  currency: string;
  award_date?: Date;
  /** Original OCDS payload retained for audit and re-processing. */
  raw_payload?: unknown;
}

/** Non-ISO alpha-2 aliases occasionally emitted by EU/TED feeds. */
const ALPHA2_ALIASES: Record<string, string> = {
  el: "gr",
  uk: "gb",
};

/** ISO-3166 alpha-3 -> alpha-2 for EU-27, EFTA, and key trading partners. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  // EU-27
  aut: "at",
  bel: "be",
  bgr: "bg",
  hrv: "hr",
  cyp: "cy",
  cze: "cz",
  dnk: "dk",
  est: "ee",
  fin: "fi",
  fra: "fr",
  deu: "de",
  grc: "gr",
  hun: "hu",
  irl: "ie",
  ita: "it",
  lva: "lv",
  ltu: "lt",
  lux: "lu",
  mlt: "mt",
  nld: "nl",
  pol: "pl",
  prt: "pt",
  rou: "ro",
  svk: "sk",
  svn: "si",
  esp: "es",
  swe: "se",
  // EFTA
  che: "ch",
  nor: "no",
  isl: "is",
  lie: "li",
  // Additional major European / international partners
  gbr: "gb",
  usa: "us",
  can: "ca",
};

/**
 * Localized German, English, French, Italian (and native) country names for
 * EU-27 + EFTA (+ GB). Keys are lowercased and accent-stripped.
 */
const COUNTRY_NAME_MAP: Record<string, string> = {
  // Germany (DE)
  deutschland: "de",
  germany: "de",
  allemagne: "de",
  germania: "de",
  "bundesrepublik deutschland": "de",
  // Austria (AT)
  osterreich: "at",
  oesterreich: "at",
  austria: "at",
  autriche: "at",
  // Switzerland (CH)
  schweiz: "ch",
  switzerland: "ch",
  suisse: "ch",
  svizzera: "ch",
  "confoederatio helvetica": "ch",
  // France (FR)
  france: "fr",
  frankreich: "fr",
  francia: "fr",
  // Italy (IT)
  italia: "it",
  italy: "it",
  italien: "it",
  italie: "it",
  // Netherlands (NL)
  netherlands: "nl",
  "the netherlands": "nl",
  niederlande: "nl",
  "pays-bas": "nl",
  "pays bas": "nl",
  "paesi bassi": "nl",
  nederland: "nl",
  holland: "nl",
  // Belgium (BE)
  belgium: "be",
  belgien: "be",
  belgique: "be",
  belgio: "be",
  belgie: "be",
  // Luxembourg (LU)
  luxembourg: "lu",
  luxemburg: "lu",
  lussemburgo: "lu",
  // Spain (ES)
  spain: "es",
  spanien: "es",
  espagne: "es",
  spagna: "es",
  espana: "es",
  // Portugal (PT)
  portugal: "pt",
  portogallo: "pt",
  // Poland (PL)
  poland: "pl",
  polen: "pl",
  pologne: "pl",
  polonia: "pl",
  polska: "pl",
  // Sweden (SE)
  sweden: "se",
  schweden: "se",
  suede: "se",
  svezia: "se",
  sverige: "se",
  // Denmark (DK)
  denmark: "dk",
  danemark: "dk",
  daenemark: "dk",
  danimarca: "dk",
  danmark: "dk",
  // Finland (FI)
  finland: "fi",
  finnland: "fi",
  finlande: "fi",
  finlandia: "fi",
  suomi: "fi",
  // Norway (NO)
  norway: "no",
  norwegen: "no",
  norvege: "no",
  norvegia: "no",
  norge: "no",
  // Ireland (IE)
  ireland: "ie",
  irland: "ie",
  irlande: "ie",
  irlanda: "ie",
  eire: "ie",
  // Czechia (CZ)
  czechia: "cz",
  "czech republic": "cz",
  tschechien: "cz",
  "tschechische republik": "cz",
  "republique tcheque": "cz",
  tchequie: "cz",
  "repubblica ceca": "cz",
  cechia: "cz",
  cesko: "cz",
  // Slovakia (SK)
  slovakia: "sk",
  "slovak republic": "sk",
  slowakei: "sk",
  slovaquie: "sk",
  slovacchia: "sk",
  slovensko: "sk",
  // Slovenia (SI)
  slovenia: "si",
  slowenien: "si",
  slovenie: "si",
  slovenija: "si",
  // Hungary (HU)
  hungary: "hu",
  ungarn: "hu",
  hongrie: "hu",
  ungheria: "hu",
  magyarorszag: "hu",
  // Romania (RO)
  romania: "ro",
  rumanien: "ro",
  rumaenien: "ro",
  roumanie: "ro",
  // Bulgaria (BG)
  bulgaria: "bg",
  bulgarien: "bg",
  bulgarie: "bg",
  // Croatia (HR)
  croatia: "hr",
  kroatien: "hr",
  croatie: "hr",
  croazia: "hr",
  hrvatska: "hr",
  // Greece (GR)
  greece: "gr",
  griechenland: "gr",
  grece: "gr",
  grecia: "gr",
  // Cyprus (CY)
  cyprus: "cy",
  zypern: "cy",
  chypre: "cy",
  cipro: "cy",
  // Malta (MT)
  malta: "mt",
  malte: "mt",
  // Estonia (EE)
  estonia: "ee",
  estland: "ee",
  estonie: "ee",
  eesti: "ee",
  // Latvia (LV)
  latvia: "lv",
  lettland: "lv",
  lettonie: "lv",
  lettonia: "lv",
  latvija: "lv",
  // Lithuania (LT)
  lithuania: "lt",
  litauen: "lt",
  lituanie: "lt",
  lituania: "lt",
  lietuva: "lt",
  // Iceland (IS)
  iceland: "is",
  island: "is",
  islande: "is",
  islanda: "is",
  // Liechtenstein (LI)
  liechtenstein: "li",
  // United Kingdom (GB)
  "united kingdom": "gb",
  "great britain": "gb",
  "vereinigtes konigreich": "gb",
  "vereinigtes koenigreich": "gb",
  grossbritannien: "gb",
  großbritannien: "gb",
  "royaume-uni": "gb",
  "royaume uni": "gb",
  "regno unito": "gb",
  "gran bretagna": "gb",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function lookupCountryToken(token: string): string | undefined {
  const cleaned = token.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return undefined;

  if (/^[a-z]{2}$/.test(cleaned)) {
    return ALPHA2_ALIASES[cleaned] ?? cleaned;
  }

  if (/^[a-z]{3}$/.test(cleaned)) {
    const alpha2 = ALPHA3_TO_ALPHA2[cleaned];
    if (alpha2) return alpha2;
  }

  const directName = COUNTRY_NAME_MAP[cleaned];
  if (directName) return directName;

  const ascii = stripDiacritics(cleaned);
  return COUNTRY_NAME_MAP[ascii];
}

/**
 * Normalise a raw country string ("Deutschland" / "DEU" / "de " / "Munich, Germany")
 * into a lowercased ISO-3166 alpha-2 code (e.g. "de").
 * Supports full EU-27 + EFTA alpha-2, alpha-3, and German/English/French/Italian names.
 */
export function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. Direct full-string match (alpha-2, alpha-3, or localized country name).
  const direct = lookupCountryToken(trimmed);
  if (direct) return direct;

  // 2. Last comma-separated segment (e.g. "Prague, Czech Republic" / "Munich, Germany").
  if (trimmed.includes(",")) {
    const lastSegment = trimmed.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (lastSegment) {
      const fromSegment = lookupCountryToken(lastSegment);
      if (fromSegment) return fromSegment;
    }
  }

  // 3. Last whitespace/comma-separated token (e.g. "Stuttgart DE" / "Vienna AUT").
  const lastToken = trimmed.split(/[\s,()]+/).filter(Boolean).pop();
  if (lastToken) {
    return lookupCountryToken(lastToken);
  }

  return undefined;
}

/**
 * Curated enterprise procurement technology & compliance matcher.
 * Ordered as [canonical lowercase tag, word-boundary regex].
 * Runs deterministically at €0 cost before any LLM fallback.
 */
const DETERMINISTIC_TECH_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["kubernetes", /\b(?:kubernetes|k8s)\b/i],
  ["openshift", /\bopenshift\b/i],
  ["docker", /\bdocker\b/i],
  ["postgresql", /\b(?:postgresql|postgres)\b/i],
  ["oracle", /\boracle\b/i],
  ["sap s/4hana", /\b(?:sap[\s-]+)?s\/?4\s*hana\b/i],
  ["sap", /\bsap\b/i],
  ["vmware", /\bvmware\b/i],
  ["aws", /\b(?:aws|amazon\s+web\s+services)\b/i],
  ["azure", /\b(?:microsoft\s+)?azure\b/i],
  ["gcp", /\b(?:gcp|google\s+cloud(?:\s+platform)?)\b/i],
  ["terraform", /\bterraform\b/i],
  ["ansible", /\bansible\b/i],
  ["linux", /\b(?:linux|rhel|red\s+hat\s+enterprise|suse|ubuntu|debian)\b/i],
  ["python", /\bpython\b/i],
  ["java", /\bjava\b(?!\s*script)/i],
  ["typescript", /\btypescript\b/i],
  ["react", /\breact(?:\.?js)?\b/i],
  ["node.js", /\bnode\.?js\b/i],
  ["elasticsearch", /\belastic\s*search\b/i],
  ["splunk", /\bsplunk\b/i],
  ["siem", /\bsiem\b/i],
  ["zero trust", /\bzero[\s-]+trust\b/i],
  ["iso 27001", /\biso(?:\/iec)?[\s-]?27001\b/i],
  ["bsi c5", /\bbsi[\s-]+c5\b/i],
  ["gdpr/dsgvo", /\b(?:gdpr|dsgvo)\b/i],
  ["openid connect", /\b(?:openid[\s-]+connect|oidc)\b/i],
  ["oauth2", /\boauth[\s-]?2(?:\.0)?\b/i],
  ["rest api", /\b(?:rest(?:ful)?[\s-]+api|api[\s-]+gateway)\b/i],
  ["graphql", /\bgraphql\b/i],
  ["iot", /\b(?:iot|internet\s+of\s+things)\b/i],
  ["mqtt", /\bmqtt\b/i],
  ["timescaledb", /\btimescale\s*db\b/i],
  ["llm", /\b(?:llm|large\s+language\s+models?)\b/i],
  ["nlp", /\b(?:nlp|natural\s+language\s+processing)\b/i],
  ["document ocr", /\b(?:document[\s-]+ocr|ocr)\b/i],
  ["fiber optics", /\b(?:fiber[\s-]+optics?|fibre[\s-]+optics?|glasfaser|ftth|fttb|breitband)\b/i],
  ["edge computing", /\bedge[\s-]+computing\b/i],
  ["robotics", /\b(?:robotics?|roboter(?:ik)?)\b|roboter\b/i],
  ["kafka", /\b(?:apache\s+)?kafka\b/i],
  ["redis", /\bredis\b/i],
  ["prometheus", /\bprometheus\b/i],
  ["grafana", /\bgrafana\b/i],
  ["active directory", /\b(?:active[\s-]+directory|entra[\s-]+id)\b/i],
  ["servicenow", /\bservicenow\b/i],
  ["salesforce", /\bsalesforce\b/i],
  ["devsecops", /\bdevsecops\b/i],
  ["disaster recovery", /\bdisaster[\s-]+recovery\b/i],
  ["change management", /\bchange[\s-]+management\b/i],
  ["project management", /\b(?:project|projekt)[\s-]*management\b/i],
  ["bsi grundschutz", /\b(?:bsi[\s-]+)?it[\s-]?grundschutz\b/i],
  ["nis2", /\bnis[\s-]?2\b/i],
  ["mysql", /\bmysql\b/i],
  ["mongodb", /\bmongodb\b/i],
  ["sql server", /\b(?:ms[\s-]+)?sql[\s-]+server\b/i],
  ["ci/cd", /\bci\/cd\b/i],
  ["gitlab", /\bgitlab\b/i],
  ["github", /\bgithub\b/i],
  ["angular", /\bangular\b/i],
  ["vue.js", /\bvue\.?js\b/i],
  ["next.js", /\bnext\.?js\b/i],
  ["spring boot", /\bspring[\s-]+boot\b/i],
  ["keycloak", /\bkeycloak\b/i],
  ["saml", /\bsaml(?:\s*2(?:\.0)?)?\b/i],
  ["sharepoint", /\bsharepoint\b/i],
  ["microsoft 365", /\b(?:microsoft|ms|office)[\s-]+365\b|\bm365\b/i],
  ["power bi", /\bpower[\s-]+bi\b/i],
  ["snowflake", /\bsnowflake\b/i],
  ["databricks", /\bdatabricks\b/i],
  ["citrix", /\bcitrix\b/i],
  ["cisco", /\bcisco\b/i],
  ["fortinet", /\bfortinet\b/i],
  ["palo alto", /\bpalo[\s-]+alto\b/i],
];

/**
 * Deterministically extract concrete technologies, cloud platforms, frameworks,
 * ERP systems, databases, and security/compliance standards from free text.
 * Returns lowercase, deduplicated, alphabetically sorted tags.
 */
export function extractDeterministicTechnologies(text: string | undefined): string[] {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return [];
  }

  const found = new Set<string>();
  for (const [label, pattern] of DETERMINISTIC_TECH_PATTERNS) {
    if (pattern.test(text)) {
      found.add(label);
    }
  }
  return [...found].sort();
}

function cpvFromItem(item: OcdsItem): string[] {
  const classifications: OcdsClassification[] = [];
  if (item.classification) classifications.push(item.classification);
  if (item.additionalClassifications) classifications.push(...item.additionalClassifications);
  return classifications
    .filter((c) => (c.scheme ?? "").toUpperCase() === "CPV" && c.id)
    .map((c) => (c.id as string).trim());
}

/** Extract + normalise the CPV code set from a tender/award's items. */
export function extractCpvCodes(items?: OcdsItem[]): string[] {
  if (!items || items.length === 0) return [];
  const codes = items.flatMap(cpvFromItem);
  const set = new CpvSet(codes);
  return set.toSortedArray();
}

function takeValue(value: OcdsValue | undefined): {
  amount?: number | null;
  currency: string;
} {
  const currency = (value?.currency ?? "EUR").toUpperCase();
  if (value?.amount === null || value?.amount === undefined) {
    return { amount: null, currency };
  }
  const n = typeof value.amount === "number" ? value.amount : Number(value.amount);
  return { amount: Number.isFinite(n) ? n : null, currency };
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s || typeof s !== "string") return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function firstNonEmptyUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Map OCDS `tender.status` onto the Postgres `tender_status` enum. */
export function mapTenderStatus(status?: string): TenderStatus {
  const normalized = status?.trim().toLowerCase();
  switch (normalized) {
    case "complete":
      return "awarded";
    case "unsuccessful":
      return "closed";
    case "cancelled":
    case "withdrawn":
      return "withdrawn";
    case "active":
    case "planning":
    case "planned":
    default:
      return "active";
  }
}

/** Map the OCDS procedure code to our Postgres `procurement_procedure` enum. */
function mapProcedure(method?: string): ProcurementProcedure | undefined {
  if (!method) return undefined;
  const m = method.toLowerCase();
  if (m.includes("open")) return "open";
  if (m.includes("restricted") || m.includes("selective")) return "restricted";
  if (m.includes("negotiated") || m.includes("limited") || m.includes("direct")) {
    return "negotiated";
  }
  if (m.includes("dialogue")) return "competitive_dialogue";
  if (m.includes("innovation")) return "innovation_partnership";
  if (m.includes("design")) return "design_contest";
  return "other";
}

/**
 * Find the referenced party in `parties`: match `refId` FIRST, and ONLY fall
 * back to role lookup if `refId` is absent or not found in `parties`.
 */
function findParty(
  parties: OcdsOrganization[] | undefined,
  refId: string | undefined,
  role: "buyer" | "supplier",
): OcdsOrganization | undefined {
  if (!parties || parties.length === 0) return undefined;
  if (refId) {
    const byId = parties.find((p) => p.id === refId);
    if (byId) return byId;
  }
  return parties.find((p) => p.roles?.includes(role));
}

/**
 * Map a single OCDS release. A release may carry a tender AND/OR awards, so
 * this returns 0..N records (a tender is only emitted if the release actually
 * carries tender data).
 */
export function mapRelease(
  release: OcdsRelease,
  options: MapReleaseOptions = {},
): {
  tender?: TenderRecord;
  awards: HistoricalAwardRecord[];
} {
  const source = options.source?.trim() || "ocds";
  const parties = release.parties;
  const result: { tender?: TenderRecord; awards: HistoricalAwardRecord[] } = {
    awards: [],
  };

  const t = release.tender;
  const buyer = findParty(parties, t?.procuringEntity?.id, "buyer");

  // ---- Tender (active notice) --------------------------------------------
  if (t && (t.title || t.description)) {
    const country =
      normalizeCountry(buyer?.address?.country) ??
      // buyer country is most reliable for location matching
      undefined;
    const cpv = extractCpvCodes(t.items);
    const value = takeValue(t.value);
    const period = t.tenderPeriod;
    const sourceUrl = firstNonEmptyUrl(
      t.documents?.[0]?.url,
      release.url,
      release.sourceUrl,
      buyer?.contactPoint?.url,
    );
    const requiredTechnologies = extractDeterministicTechnologies(
      `${t.title ?? ""} ${t.description ?? ""}`,
    );

    result.tender = {
      source,
      source_id: `${release.ocid}::tender`,
      source_url: sourceUrl,
      title: (t.title ?? "(untitled tender)").trim(),
      description: t.description,
      cpv_codes: cpv,
      country,
      awarding_authority_name: buyer?.name ?? t.procuringEntity?.name,
      estimated_budget: value.amount,
      currency: value.currency,
      publication_date: parseDate(release.date),
      submission_deadline: parseDate(period?.endDate),
      procedure: mapProcedure(t.procurementMethod),
      status: mapTenderStatus(t.status),
      required_technologies: requiredTechnologies,
      raw_payload: release,
    };
  }

  // ---- Awards (historical) -----------------------------------------------
  const awards = release.awards ?? [];
  for (const a of awards) {
    if (a.status && a.status !== "active" && a.status !== "complete") continue;
    const supplier = findParty(parties, a.suppliers?.[0]?.id, "supplier");
    const value = takeValue(a.value);
    const awardSourceUrl = firstNonEmptyUrl(
      a.documents?.[0]?.url,
      t?.documents?.[0]?.url,
      release.url,
      release.sourceUrl,
      buyer?.contactPoint?.url,
    );
    result.awards.push({
      source,
      source_id: `${release.ocid}::award::${a.id ?? result.awards.length}`,
      source_url: awardSourceUrl,
      title: (a.title ?? "(untitled award)").trim(),
      description: a.description,
      cpv_codes: extractCpvCodes(a.items),
      awarding_authority_name: t?.procuringEntity?.name ?? buyer?.name,
      winner_name: supplier?.name ?? a.suppliers?.[0]?.name,
      winner_country: normalizeCountry(supplier?.address?.country),
      contract_value: value.amount,
      currency: value.currency,
      award_date: parseDate(a.date),
      raw_payload: release,
    });
  }

  return result;
}

/** Map a full OCDS package (many releases). */
export function mapPackage(
  pkg: OcdsPackage,
  options: MapReleaseOptions = {},
): {
  tenders: TenderRecord[];
  awards: HistoricalAwardRecord[];
} {
  const tenders: TenderRecord[] = [];
  const awards: HistoricalAwardRecord[] = [];
  for (const release of pkg.releases ?? []) {
    const { tender, awards: releaseAwards } = mapRelease(release, options);
    if (tender) tenders.push(tender);
    awards.push(...releaseAwards);
  }
  return { tenders, awards };
}

