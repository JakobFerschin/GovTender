/**
 * Public surface of the deterministic ingestion pipeline.
 */
export {
  mapRelease,
  mapPackage,
  mapTenderStatus,
  normalizeCountry,
  extractCpvCodes,
  extractDeterministicTechnologies,
} from "./ocds-mapper.js";
export type {
  CountryCode,
  TenderStatus,
  ProcurementProcedure,
  MapReleaseOptions,
  TenderRecord,
  HistoricalAwardRecord,
} from "./ocds-mapper.js";
export {
  CpvSet,
  CPV_DIVISION_LABELS,
  getCpvDivisionLabel,
  computeCpvMatch,
  type CpvMatchResult,
} from "./cpv.js";
export {
  getSupabase,
  persistTender,
  persistAward,
  persistMapped,
  recordIngestionRun,
  type IngestResult,
  type IngestionRunRecord,
} from "./persist.js";
export type {
  Currency,
  OcdsClassification,
  OcdsDocument,
  OcdsItem,
  OcdsValue,
  OcdsPeriod,
  OcdsAddress,
  OcdsIdentifier,
  OcdsOrganization,
  OcdsTender,
  OcdsAward,
  OcdsTag,
  OcdsRelease,
  OcdsPackage,
} from "./ocds-types.js";
