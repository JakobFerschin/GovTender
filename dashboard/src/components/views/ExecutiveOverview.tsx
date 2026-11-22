"use client";

import * as React from "react";
import {
  ArrowRight,
  ChevronRight,
  Cpu,
  FileCheck2,
  Landmark,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/card";
import {
  MonthlyPipelineChart,
  RegionalVolumeChart,
  SectorAllocationChart,
  TechDemandMatrix,
} from "@/components/charts/AnalyticsCharts";
import {
  EmptyState,
  ExecutiveKpiCard,
  RecommendationBadge,
  SectionHeader,
} from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { cn } from "@/lib/cn";
import {
  COUNTRY_LABELS,
  SOURCE_LABELS,
  daysUntil,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/intelligence-engine";
import type {
  AnalyticsResponse,
  BidVerdict,
  TenderWithIntelligence,
} from "@/lib/types";

export interface ExecutiveOverviewProps {
  analytics: AnalyticsResponse | null;
  tenders: TenderWithIntelligence[];
  loading: boolean;
  onSelectTender: (id: string) => void;
  onNavigateToDesk: (preset?: {
    country?: string;
    sector?: string;
    tech?: string;
    verdict?: BidVerdict;
  }) => void;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatShortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_FMT.format(parsed);
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading portfolio briefing">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[126px] rounded-md border border-border border-t-2 border-t-border-strong bg-card p-5"
          >
            <div className="h-3 w-28 rounded-[2px] bg-muted" />
            <div className="mt-4 h-7 w-24 rounded-[2px] bg-muted" />
            <div className="mt-5 h-3 w-40 rounded-[2px] bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-[340px] rounded-md border border-border bg-card p-5" />
        <div className="h-[340px] rounded-md border border-border bg-card p-5" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-[320px] rounded-md border border-border bg-card p-5" />
        <div className="h-[320px] rounded-md border border-border bg-card p-5" />
      </div>

      <div className="h-[280px] rounded-md border border-border bg-card p-5" />
    </div>
  );
}

export function ExecutiveOverview({
  analytics,
  tenders,
  loading,
  onSelectTender,
  onNavigateToDesk,
}: ExecutiveOverviewProps) {
  const priorityShortlist = React.useMemo(() => {
    const active = tenders.filter((t) => t.status === "active");
    const openActive = active.filter((t) => daysUntil(t.deadline) >= 0);
    const pool =
      openActive.length > 0
        ? openActive
        : active.length > 0
          ? active
          : tenders;

    return [...pool]
      .sort(
        (a, b) =>
          b.scorecard.overallScore - a.scorecard.overallScore ||
          (b.budget ?? 0) - (a.budget ?? 0),
      )
      .slice(0, 5);
  }, [tenders]);

  const kpis = analytics?.kpis;
  const strongBidSharePct =
    kpis && kpis.activeTenders > 0
      ? Math.round((kpis.strongBidCount / kpis.activeTenders) * 100)
      : 0;

  return (
    <section className="space-y-6 animate-fade-up">
      <SectionHeader
        kicker="PORTFOLIO BRIEFING"
        title="EU & DACH Procurement Intelligence"
        subtitle="Real-time pipeline telemetry, regional budget concentration, and deterministic bid qualification across European public-sector tenders."
        right={
          <button
            type="button"
            onClick={() => onNavigateToDesk()}
            className="inline-flex items-center gap-2 rounded-[4px] border border-primary bg-primary px-3.5 py-2 text-xs font-medium tracking-[0.01em] text-primary-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-[#0B2D45]"
          >
            <span>Open Full Tender Desk</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
      />

      {loading && !analytics ? (
        <OverviewSkeleton />
      ) : !analytics ? (
        <EmptyState
          title="Portfolio Telemetry Unavailable"
          description="Analytics could not be loaded from the intelligence engine. Open the Tender Desk or trigger an ingestion refresh to populate the briefing."
          action={
            <button
              type="button"
              onClick={() => onNavigateToDesk()}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-border-strong bg-card px-3.5 py-2 text-xs font-medium text-primary hover:bg-muted"
            >
              Open Full Tender Desk
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <>
          {/* ── 4-Column Executive KPI Strip ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ExecutiveKpiCard
              label="Active Opportunities"
              value={analytics.kpis.activeTenders.toLocaleString("en-US")}
              delta={`Avg ${analytics.kpis.avgDeadlineDays}d left`}
              deltaTone="neutral"
              icon={Landmark}
              sub={`Avg deal ${formatCompactCurrency(analytics.kpis.avgDealSizeEur, "EUR")} across ${analytics.byCountry.length} regions`}
            />

            <ExecutiveKpiCard
              label="Total Pipeline Volume (EUR)"
              value={formatCompactCurrency(
                analytics.kpis.totalPipelineEur,
                "EUR",
              )}
              delta="EUR"
              deltaTone="neutral"
              icon={TrendingUp}
              sub={`Exact aggregate ${formatCurrency(analytics.kpis.totalPipelineEur, "EUR")}`}
            />

            <button
              type="button"
              onClick={() => onNavigateToDesk({ verdict: "STRONG BID" })}
              className="group block w-full text-left focus-visible:outline-none"
              aria-label={`Filter Tender Desk to ${analytics.kpis.strongBidCount} Strong-Bid opportunities`}
            >
              <ExecutiveKpiCard
                label="Strong-Bid Opportunities"
                value={analytics.kpis.strongBidCount.toLocaleString("en-US")}
                delta={`${strongBidSharePct}% of active`}
                deltaTone="positive"
                icon={FileCheck2}
                sub="Score ≥ 75 · Click to filter STRONG BID →"
                className="h-full border-t-emerald transition-all duration-150 group-hover:border-accent-blue/40 group-hover:shadow-[var(--shadow-elevated)] group-focus-visible:ring-2 group-focus-visible:ring-accent-blue"
              />
            </button>

            <ExecutiveKpiCard
              label="Deterministic Extraction"
              value={`${analytics.kpis.deterministicExtractionPct.toFixed(1)}%`}
              delta="€0 LLM"
              deltaTone="positive"
              icon={Cpu}
              sub={`${analytics.kpis.historicalAwardsIndexed.toLocaleString("en-US")} historical awards indexed for CPV matching`}
            />
          </div>

          {/* ── Row 1: Regional Pipeline + Monthly Deadline Cadence ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <RegionalVolumeChart
              data={analytics.byCountry}
              onSelectCountry={(country) => onNavigateToDesk({ country })}
            />
            <MonthlyPipelineChart data={analytics.byDeadlineMonth} />
          </div>

          {/* ── Row 2: CPV Sector Allocation + Technology Demand Matrix ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectorAllocationChart
              data={analytics.bySector}
              onSelectSector={(sector) => onNavigateToDesk({ sector })}
            />
            <TechDemandMatrix
              data={analytics.byTechnology}
              onSelectTech={(tech) => onNavigateToDesk({ tech })}
            />
          </div>

          {/* ── Executive Shortlist Table ── */}
          <Card className="overflow-hidden border-t-2 border-t-primary">
            <CardHeader className="border-b border-border/80 pb-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="text-primary">
                    Priority Opportunities — Highest Strategic Fit
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Top 5 active notices ranked by deterministic CPV overlap,
                    geographic fit, budget attractiveness, and timeline
                    feasibility. Select any row to inspect the full dossier.
                  </CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateToDesk()}
                  className="inline-flex shrink-0 items-center gap-1 self-start text-xs font-medium text-accent-blue transition-colors hover:text-primary sm:self-auto"
                >
                  <span>Inspect full pipeline</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {priorityShortlist.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No Active Opportunities Shortlisted"
                    description="Active procurement notices will appear here ranked by strategic fit once loaded."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[21%]">
                        Authority &amp; Country
                      </TableHead>
                      <TableHead className="w-[30%]">Opportunity</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      <TableHead className="text-right">Deadline</TableHead>
                      <TableHead className="w-[18%]">
                        Predicted Incumbent
                      </TableHead>
                      <TableHead className="text-right">Verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priorityShortlist.map((tender) => {
                      const remainingDays = daysUntil(tender.deadline);
                      const isUrgent = remainingDays >= 0 && remainingDays <= 14;
                      const isExpired = remainingDays < 0;
                      const countryLabel =
                        COUNTRY_LABELS[tender.country] ?? tender.country;
                      const sourceLabel =
                        SOURCE_LABELS[tender.source] ?? tender.source;

                      return (
                        <TableRow
                          key={tender.id}
                          tabIndex={0}
                          role="button"
                          onClick={() => onSelectTender(tender.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectTender(tender.id);
                            }
                          }}
                          className="group cursor-pointer focus-visible:bg-accent-blue-soft/50 focus-visible:outline-none"
                          aria-label={`Open dossier for ${tender.title}`}
                        >
                          {/* Authority + Country */}
                          <TableCell>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-primary">
                                {tender.authority}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle-foreground">
                                <span className="inline-flex items-center rounded-[3px] border border-border bg-background px-1.5 py-0 font-mono text-[10px] font-semibold text-primary">
                                  {tender.country}
                                </span>
                                <span className="truncate">{countryLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate font-mono text-[10px]">
                                  {sourceLabel}
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Title + Sector */}
                          <TableCell>
                            <div className="min-w-0">
                              <div className="line-clamp-2 font-medium leading-snug text-primary transition-colors group-hover:text-accent-blue">
                                {tender.title}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-[11px] text-subtle-foreground">
                                  {tender.cpvSector}
                                </span>
                                {tender.technologies.slice(0, 2).map((tech) => (
                                  <Badge
                                    key={tech}
                                    variant="muted"
                                    className="px-1.5 py-0 text-[10px]"
                                  >
                                    {tech}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>

                          {/* Budget */}
                          <TableCell className="text-right whitespace-nowrap">
                            <div
                              className="font-mono text-[13px] font-semibold text-primary tabular-nums-strict"
                              title={formatCurrency(
                                tender.budget,
                                tender.currency,
                              )}
                            >
                              {formatCompactCurrency(
                                tender.budget,
                                tender.currency,
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-subtle-foreground">
                              {tender.currency}
                            </div>
                          </TableCell>

                          {/* Deadline */}
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="font-mono text-xs text-primary tabular-nums-strict">
                              {formatShortDate(tender.deadline)}
                            </div>
                            <div
                              className={cn(
                                "mt-0.5 font-mono text-[10px] font-medium tabular-nums-strict",
                                isExpired
                                  ? "text-crimson"
                                  : isUrgent
                                    ? "text-amber"
                                    : "text-subtle-foreground",
                              )}
                            >
                              {isExpired
                                ? `${Math.abs(remainingDays)}d overdue`
                                : `${remainingDays}d remaining`}
                            </div>
                          </TableCell>

                          {/* Top Predicted Incumbent */}
                          <TableCell>
                            {tender.topPredictedWinner ? (
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-primary">
                                  {tender.topPredictedWinner}
                                </div>
                                <div className="mt-1 inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center rounded-[3px] border border-accent-blue/20 bg-accent-blue-soft px-1.5 py-0 font-mono text-[10px] font-semibold text-accent-blue tabular-nums-strict">
                                    {tender.topWinnerConfidence}% conf.
                                  </span>
                                  <span className="font-mono text-[10px] text-subtle-foreground tabular-nums-strict">
                                    {tender.matches.length} CPV{" "}
                                    {tender.matches.length === 1
                                      ? "match"
                                      : "matches"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs italic text-subtle-foreground">
                                Open competitive field
                              </span>
                            )}
                          </TableCell>

                          {/* Score + RecommendationBadge */}
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2.5">
                              <div className="text-right">
                                <div className="font-mono text-xs font-semibold text-primary tabular-nums-strict">
                                  {tender.scorecard.overallScore}
                                  <span className="text-[10px] font-normal text-subtle-foreground">
                                    /100
                                  </span>
                                </div>
                                <div className="mt-1">
                                  <RecommendationBadge
                                    verdict={tender.scorecard.verdict}
                                  />
                                </div>
                              </div>
                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-subtle-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent-blue"
                                aria-hidden="true"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
