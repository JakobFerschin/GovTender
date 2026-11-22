/**
 * Shared domain & REST API contracts for GovTender AI.
 *
 * Every Next.js API route and frontend view imports from this module so
 * server responses and UI state stay strictly type-checked end to end.
 */

export type DataSourceMode = "supabase" | "sandbox";

export type BidVerdict = "STRONG BID" | "EVALUATE" | "PASS";

export type ProcurementPlatform =
  | "ted"
  | "simap"
  | "evergabe"
  | "auftragsportal"
  | "boamp"
  | "appalti";

export interface HistoricalMatch {
  id: string;
  awardTitle: string;
  winnerName: string;
  winnerCountry: string;
  contractValue: number | null;
  currency: string;
  awardDate: string;
  score: number;
  sharedCpvPrefixes: string[];
  maxPrefixDepth: number;
}

export interface WinnerPrediction {
  winnerName: string;
  winnerCountry: string;
  winCount: number;
  totalContractValue: number;
  avgContractValue: number;
  confidencePct: number;
  maxScore: number;
  latestAwardDate: string;
  sharedCpvPrefixes: string[];
  awards: HistoricalMatch[];
}

export interface BidScorecard {
  overallScore: number;
  verdict: BidVerdict;
  cpvFit: number;
  geographicFit: number;
  budgetAttractiveness: number;
  timelineFeasibility: number;
  rationale: string;
  riskFlags: string[];
  strategicPriorities: string[];
}

export interface Tender {
  id: string;
  source: ProcurementPlatform;
  sourceId: string;
  authority: string;
  title: string;
  budget: number | null;
  currency: string;
  country: string;
  deadline: string;
  publicationDate: string;
  procedure: string;
  status: "active" | "closed" | "withdrawn" | "awarded";
  technologies: string[];
  cpvCodes: string[];
  cpvSector: string;
  description: string;
  sourceUrl: string;
}

export interface TenderWithIntelligence extends Tender {
  matches: HistoricalMatch[];
  winnerPredictions: WinnerPrediction[];
  scorecard: BidScorecard;
  topPredictedWinner: string | null;
  topWinnerConfidence: number;
}

export interface TendersFacetCounts {
  countries: { code: string; label: string; count: number }[];
  sources: { id: string; label: string; count: number }[];
  technologies: { name: string; count: number }[];
  sectors: { code: string; label: string; count: number }[];
}

export interface TendersApiResponse {
  count: number;
  totalCount: number;
  dataSource: DataSourceMode;
  generatedAt: string;
  tenders: TenderWithIntelligence[];
  facets: TendersFacetCounts;
  summary: {
    activeCount: number;
    totalEurVolume: number;
    avgScore: number;
    strongBidCount: number;
    topTech: string | null;
  };
}

export interface TenderDetailResponse {
  dataSource: DataSourceMode;
  tender: TenderWithIntelligence;
  similarTenders: {
    id: string;
    title: string;
    authority: string;
    country: string;
    budget: number | null;
    currency: string;
    sharedPrefixes: string[];
    score: number;
  }[];
}

export interface SourceHealthItem {
  source: string;
  label: string;
  region: string;
  mode: "live" | "sandbox" | "disabled";
  status: "operational" | "degraded" | "unconfigured";
  noticesTracked: number;
  lastSyncIso: string;
  avgLatencyMs: number;
  deterministicRatePct: number;
  notes: string;
}

export interface IncumbentProfile {
  name: string;
  country: string;
  totalWins: number;
  totalVolumeEur: number;
  avgContractEur: number;
  primarySectors: string[];
  countriesActive: string[];
  latestAwardDate: string;
  winSharePct: number;
}

export interface AnalyticsResponse {
  dataSource: DataSourceMode;
  generatedAt: string;
  kpis: {
    activeTenders: number;
    totalPipelineEur: number;
    avgDealSizeEur: number;
    strongBidCount: number;
    avgDeadlineDays: number;
    historicalAwardsIndexed: number;
    deterministicExtractionPct: number;
  };
  byCountry: {
    code: string;
    label: string;
    count: number;
    volumeEur: number;
    sharePct: number;
  }[];
  bySector: {
    division: string;
    label: string;
    count: number;
    volumeEur: number;
  }[];
  byDeadlineMonth: {
    month: string;
    label: string;
    count: number;
    volumeEur: number;
  }[];
  byTechnology: {
    name: string;
    count: number;
    volumeEur: number;
  }[];
  incumbents: IncumbentProfile[];
  sources: SourceHealthItem[];
}

export interface IngestTriggerResponse {
  ok: boolean;
  mode: "supabase" | "dry-run-sandbox";
  startedAt: string;
  durationMs: number;
  sourcesRun: number;
  releasesProcessed: number;
  tendersUpserted: number;
  awardsUpserted: number;
  deterministicTechCount: number;
  llmFallbackCount: number;
  logs: {
    timestamp: string;
    level: "info" | "warn" | "success";
    source: string;
    message: string;
  }[];
}

/**
 * Raw historical award notice stored in Supabase (`historical_awards`) or the
 * curated sandbox dataset prior to deterministic CPV matching.
 */
export interface HistoricalAwardRecord {
  id: string;
  source: ProcurementPlatform;
  sourceId: string;
  awardTitle: string;
  authority: string;
  winnerName: string;
  winnerCountry: string;
  contractValue: number | null;
  currency: string;
  awardDate: string;
  cpvCodes: string[];
  technologies: string[];
}

export type TenderSortField = "deadline" | "budget" | "score";
export type SortDirection = "asc" | "desc";

export interface TenderQueryFilters {
  country?: string;
  q?: string;
  tech?: string;
  source?: string;
  sector?: string;
  verdict?: BidVerdict;
  showExpired?: boolean;
  minBudget?: number;
  sortBy?: TenderSortField;
  sortDir?: SortDirection;
}
