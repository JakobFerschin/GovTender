/**
 * Deterministic OCDS → internal domain mapper.
 *
 * No I/O, no LLM, no side effects. Pure transformation from the OCDS release
 * structure into the shape of our Supabase rows. Everything here must be
 * derivable from the structured payload alone.
 *
 * "Non-LLM First": the pipeline calls `mapRelease()` first; LLM enhancement
 * only fills in gaps (e.g. technologies) afterwards, see `extraction/`.
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

/** The canonical internal row we intend to insert/update. Mirrors the
 *  `tenders` and `historical_awards` columns. */
export interface TenderRecord {
  source: "ocds";
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
  procedure?: string;
  status: string;
  /** Filled by the conditional LLM enhancer; empty after deterministic parse. */
  required_technologies?: string[];
}

export interface HistoricalAwardRecord {
  source: "ocds";
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
}

/** Normalise a raw country string ("Deutschland" / "DEU" / "de ") -> "de". */
export function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Already alpha-2 (most common from TED/OCDS).
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toLowerCase();
  // Fall back to last token for names like "Munich, Germany" / "Stuttgart DE".
  const last = trimmed.split(/[\s,]+/).filter(Boolean).pop();
  if (last && /^[A-Za-z]{2}$/.test(last)) return last.toLowerCase();
  // Best-effort mapping for common German/DACH country names.
  const nameMap: Record<string, string> = {
    deutschland: "de", germany: "de",
    österreich: "at", oesterreich: "at", austria: "at",
    schweiz: "ch", switzerland: "ch", suisse: "ch",
    france: "fr", frankreich: "fr",
    italia: "it", italy: "it", italien: "it",
  };
  return nameMap[trimmed.toLowerCase()];
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

/** Map the OCDS procedure code to our enum-ish string. Pass-through otherwise. */
function mapProcedure(method?: string): string | undefined {
  if (!method) return undefined;
  const m = method.toLowerCase();
  if (m.includes("open")) return "open";
  if (m.includes("restricted")) return "restricted";
  if (m.includes("negotiated")) return "negotiated";
  if (m.includes("dialogue")) return "competitive_dialogue";
  return "other";
}

/** Find the party in `parties` with a given role; falls back to embedded name. */
function findParty(
  parties: OcdsOrganization[] | undefined,
  refId: string | undefined,
  role: "buyer" | "supplier",
): OcdsOrganization | undefined {
  if (!parties) return undefined;
  const byRole = parties.find((p) => p.roles?.includes(role));
  if (byRole) return byRole;
  return refId ? parties.find((p) => p.id === refId) : undefined;
}

/**
 * Map a single OCDS release. A release may carry a tender AND/OR awards, so
 * this returns 0..N records (a tender is only emitted if the release actually
 * carries tender data).
 */
export function mapRelease(release: OcdsRelease): {
  tender?: TenderRecord;
  awards: HistoricalAwardRecord[];
} {
  const parties = release.parties;
  const result: { tender?: TenderRecord; awards: HistoricalAwardRecord[] } = {
    awards: [],
  };

  // ---- Tender (active notice) --------------------------------------------
  const t = release.tender;
  if (t && (t.title || t.description)) {
    const buyer = findParty(parties, t.procuringEntity?.id, "buyer");
    const country =
      normalizeCountry(buyer?.address?.country) ??
      // buyer country is most reliable for location matching
      undefined;
    const cpv = extractCpvCodes(t.items);
    const value = takeValue(t.value);
    const period = t.tenderPeriod;

    result.tender = {
      source: "ocds",
      source_id: `${release.ocid}::tender`,
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
      status: t.status === "complete" || t.status === "cancelled" ? t.status : "active",
    };
  }

  // ---- Awards (historical) -----------------------------------------------
  const awards = release.awards ?? [];
  for (const a of awards) {
    if (a.status && a.status !== "active" && a.status !== "complete") continue;
    const supplier = findParty(parties, a.suppliers?.[0]?.id, "supplier");
    const value = takeValue(a.value);
    result.awards.push({
      source: "ocds",
      source_id: `${release.ocid}::award::${a.id ?? result.awards.length}`,
      title: (a.title ?? "(untitled award)").trim(),
      description: a.description,
      cpv_codes: extractCpvCodes(a.items),
      awarding_authority_name: t?.procuringEntity?.name ?? findParty(parties, undefined, "buyer")?.name,
      winner_name: supplier?.name ?? a.suppliers?.[0]?.name,
      winner_country: normalizeCountry(supplier?.address?.country),
      contract_value: value.amount,
      currency: value.currency,
      award_date: parseDate(a.date),
    });
  }

  return result;
}

/** Map a full OCDS package (many releases). */
export function mapPackage(pkg: OcdsPackage): {
  tenders: TenderRecord[];
  awards: HistoricalAwardRecord[];
} {
  const tenders: TenderRecord[] = [];
  const awards: HistoricalAwardRecord[] = [];
  for (const release of pkg.releases ?? []) {
    const { tender, awards: releaseAwards } = mapRelease(release);
    if (tender) tenders.push(tender);
    awards.push(...releaseAwards);
  }
  return { tenders, awards };
}
