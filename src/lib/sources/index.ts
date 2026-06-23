/**
 * Public surface of the source-adapter module.
 */
export type { SourceAdapter, SourceResult, FetchOptions } from "./types.js";
export { safeFetchJson } from "./types.js";
export { TedSource, fetchTed, isOcdsRelease } from "./ted.js";
export { OcdsFeedSource, type OcdsFeedConfig } from "./ocds-feed.js";
export { runIngestion, defaultSources, type AggregateReport, type RunOptions } from "./orchestrator.js";
export { TED_FIXTURES } from "./fixtures.js";
