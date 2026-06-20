/**
 * Minimal OCDS (Open Contracting Data Standard 1.1+) type definitions.
 *
 * Only the fields the deterministic mapper consumes are declared — everything
 * else is typed as `unknown` and ignored. EU TED publishes an OCDS-compatible
 * feed, and national platforms increasingly expose OCDS, so this is our
 * canonical structured input.
 *
 * Spec: https://standard.open-contracting.org/latest/en/
 */

/** ISO-4217 currency code, e.g. "EUR". */
export type Currency = string;

/** Classification on an item (we read CPV). scheme="CPV", id="48000000". */
export interface OcdsClassification {
  scheme?: string;
  id?: string;
}

export interface OcdsItem {
  id?: string | number;
  description?: string;
  classification?: OcdsClassification;
  additionalClassifications?: OcdsClassification[];
}

export interface OcdsValue {
  amount?: number | null;
  currency?: Currency;
}

export interface OcdsPeriod {
  startDate?: string;
  endDate?: string;
}

export interface OcdsAddress {
  country?: string;
  region?: string;
  streetAddress?: string;
}

export interface OcdsIdentifier {
  id?: string;
  scheme?: string; // e.g. "VAT", "TED_ORG_ID"
  legalName?: string;
}

export interface OcdsOrganization {
  id?: string;
  name?: string;
  roles?: string[];
  address?: OcdsAddress;
  identifier?: OcdsIdentifier;
  additionalIdentifiers?: OcdsIdentifier[];
  contactPoint?: { email?: string; url?: string };
}

export interface OcdsTender {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  items?: OcdsItem[];
  value?: OcdsValue;
  tenderPeriod?: OcdsPeriod;
  procurementMethod?: string;
  procuringEntity?: { id?: string; name?: string };
}

export interface OcdsAward {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  date?: string;
  value?: OcdsValue;
  items?: OcdsItem[];
  suppliers?: { id?: string; name?: string }[];
}

export type OcdsTag =
  | "planning"
  | "tender"
  | "tenderUpdate"
  | "tenderCancellation"
  | "award"
  | "awardUpdate"
  | "awardCancellation"
  | "contract"
  | "contractUpdate"
  | "contractTermination"
  | string;

export interface OcdsRelease {
  ocid: string;
  id: string;
  date?: string;
  tag?: OcdsTag[];
  tender?: OcdsTender;
  awards?: OcdsAward[];
  parties?: OcdsOrganization[];
}

export interface OcdsPackage {
  uri?: string;
  publishedDate?: string;
  releases?: OcdsRelease[];
}
