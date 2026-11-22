/**
 * Public surface of the source-adapter module.
 */
export type {
  SourceAdapter,
  SourceResult,
  SourceMode,
  FetchOptions,
  SafeFetchResult,
} from "./types.js";
export { safeFetchJson, safeFetchJsonDetailed } from "./types.js";
export {
  TedSource,
  fetchTed,
  isOcdsRelease,
  DEFAULT_TED_API_BASE,
} from "./ted.js";
export { OcdsFeedSource, type OcdsFeedConfig } from "./ocds-feed.js";
export {
  runIngestion,
  defaultSources,
  type AggregateReport,
  type SourceReport,
  type RunOptions,
  type DefaultSourcesOptions,
} from "./orchestrator.js";
export {
  TED_FIXTURES,
  SIMAP_FIXTURES,
  EVERGABE_FIXTURES,
  ALL_FIXTURES,
} from "./fixtures.js";
