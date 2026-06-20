/**
 * Public surface of the deterministic ingestion pipeline.
 */
export { mapRelease, mapPackage } from "./ocds-mapper.js";
export type {
  TenderRecord,
  HistoricalAwardRecord,
} from "./ocds-mapper.js";
export { CpvSet } from "./cpv.js";
export {
  getSupabase,
  persistTender,
  persistAward,
  persistMapped,
  type IngestResult,
} from "./persist.js";
export type {
  OcdsRelease,
  OcdsPackage,
} from "./ocds-types.js";
