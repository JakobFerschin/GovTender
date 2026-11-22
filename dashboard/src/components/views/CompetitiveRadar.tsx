"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Award,
  Building2,
  PieChart,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/card";
import {
  EmptyState,
  ExecutiveKpiCard,
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
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/intelligence-engine";
import type { AnalyticsResponse, IncumbentProfile } from "@/lib/types";

export interface CompetitiveRadarProps {
  analytics: AnalyticsResponse | null;
  loading: boolean;
  onFilterByCountry?: (country: string) => void;
}

type IncumbentSortKey = "volume" | "wins" | "avgDeal";

const AWARD_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAwardDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return AWARD_DATE_FMT.format(parsed);
}

interface EnrichedIncumbent extends IncumbentProfile {
  volumeSharePct: number;
  globalRank: number;
}

function RadarSkeleton() {
  return (
    <div
      className="space-y-6 animate-pulse"
      aria-busy="true"
      aria-label="Loading competitive landscape"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[126px] rounded-md border border-border border-t-2 border-t-border-strong bg-card p-5"
          >
            <div className="h-3 w-32 rounded-[2px] bg-muted" />
            <div className="mt-4 h-7 w-28 rounded-[2px] bg-muted" />
            <div className="mt-5 h-3 w-44 rounded-[2px] bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-[54px] rounded-md border border-border bg-card" />
      <div className="h-[340px] rounded-md border border-border bg-card" />
      <div className="h-[360px] rounded-md border border-border bg-card" />
    </div>
  );
}

export function CompetitiveRadar({
  analytics,
  loading,
  onFilterByCountry,
}: CompetitiveRadarProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCountry, setSelectedCountry] = React.useState<string>("ALL");
  const [sortBy, setSortBy] = React.useState<IncumbentSortKey>("volume");
  const [hoveredSupplier, setHoveredSupplier] = React.useState<string | null>(
    null,
  );

  // Enrich all incumbents with volume-weighted market share & global rank
  const {
    allIncumbents,
    totalMarketVolumeEur,
    leadingIncumbent,
    top3VolumeEur,
    top3ConcentrationPct,
    availableCountries,
  } = React.useMemo(() => {
    const raw = analytics?.incumbents ?? [];
    const byVolume = [...raw].sort(
      (a, b) => b.totalVolumeEur - a.totalVolumeEur || b.totalWins - a.totalWins,
    );
    const totalVol = byVolume.reduce((sum, inc) => sum + inc.totalVolumeEur, 0);

    const enriched: EnrichedIncumbent[] = byVolume.map((inc, index) => ({
      ...inc,
      volumeSharePct: totalVol > 0 ? (inc.totalVolumeEur / totalVol) * 100 : 0,
      globalRank: index + 1,
    }));

    const top3Vol = enriched
      .slice(0, 3)
      .reduce((sum, inc) => sum + inc.totalVolumeEur, 0);
    const cr3 = totalVol > 0 ? (top3Vol / totalVol) * 100 : 0;

    const countryCounts = new Map<string, number>();
    for (const inc of enriched) {
      const seen = new Set<string>([inc.country, ...inc.countriesActive]);
      for (const code of seen) {
        if (!code) continue;
        countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
      }
    }
    const countries = [...countryCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]) => ({ code, count }));

    return {
      allIncumbents: enriched,
      totalMarketVolumeEur: totalVol,
      leadingIncumbent: enriched[0] ?? null,
      top3VolumeEur: top3Vol,
      top3ConcentrationPct: cr3,
      availableCountries: countries,
    };
  }, [analytics]);

  // Filtered & sorted list
  const filteredIncumbents = React.useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const list = allIncumbents.filter((inc) => {
      if (selectedCountry !== "ALL") {
        const matchesCountry =
          inc.country === selectedCountry ||
          inc.countriesActive.includes(selectedCountry);
        if (!matchesCountry) return false;
      }
      if (!needle) return true;
      const countryName = (COUNTRY_LABELS[inc.country] ?? "").toLowerCase();
      return (
        inc.name.toLowerCase().includes(needle) ||
        inc.country.toLowerCase().includes(needle) ||
        countryName.includes(needle) ||
        inc.primarySectors.some((s) => s.toLowerCase().includes(needle))
      );
    });

    const sorted = [...list];
    if (sortBy === "wins") {
      sorted.sort(
        (a, b) =>
          b.totalWins - a.totalWins || b.totalVolumeEur - a.totalVolumeEur,
      );
    } else if (sortBy === "avgDeal") {
      sorted.sort(
        (a, b) =>
          b.avgContractEur - a.avgContractEur ||
          b.totalVolumeEur - a.totalVolumeEur,
      );
    } else {
      sorted.sort(
        (a, b) =>
          b.totalVolumeEur - a.totalVolumeEur || b.totalWins - a.totalWins,
      );
    }
    return sorted;
  }, [allIncumbents, searchQuery, selectedCountry, sortBy]);

  // Top 8 for horizontal market-share comparison chart
  const chartIncumbents = React.useMemo(
    () =>
      [...filteredIncumbents]
        .sort(
          (a, b) =>
            b.totalVolumeEur - a.totalVolumeEur || b.totalWins - a.totalWins,
        )
        .slice(0, 8),
    [filteredIncumbents],
  );

  const maxChartShare = React.useMemo(
    () => Math.max(...chartIncumbents.map((i) => i.volumeSharePct), 1),
    [chartIncumbents],
  );

  const hoveredItem = hoveredSupplier
    ? chartIncumbents.find((i) => i.name === hoveredSupplier) ?? null
    : null;

  const hasActiveFilters =
    searchQuery.trim().length > 0 || selectedCountry !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCountry("ALL");
  };

  return (
    <section className="space-y-6 animate-fade-up">
      <SectionHeader
        kicker="COMPETITIVE INTELLIGENCE"
        title="Incumbent Landscape & Market Share"
        subtitle="Historical contract awards indexed across European public-sector buyers, revealing supplier concentration, recurring incumbents, and cross-border CPV strongholds."
        right={
          analytics && (
            <div className="flex items-center gap-2 rounded-[4px] border border-border bg-card px-3 py-1.5 text-xs">
              <span className="text-subtle-foreground">Indexed Volume</span>
              <span className="font-mono font-semibold text-primary tabular-nums-strict">
                {formatCompactCurrency(totalMarketVolumeEur, "EUR")}
              </span>
            </div>
          )
        }
      />

      {loading && !analytics ? (
        <RadarSkeleton />
      ) : !analytics ? (
        <EmptyState
          title="Competitive Landscape Unavailable"
          description="Historical award records could not be retrieved. Refresh the dataset to inspect supplier market share."
        />
      ) : (
        <>
          {/* ── Top 3 Summary KPIs ── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ExecutiveKpiCard
              label="Indexed Historical Awards"
              value={analytics.kpis.historicalAwardsIndexed.toLocaleString(
                "en-US",
              )}
              delta={`${allIncumbents.length} suppliers`}
              deltaTone="neutral"
              icon={Award}
              sub={`Aggregate awarded volume ${formatCurrency(totalMarketVolumeEur, "EUR")}`}
            />

            <ExecutiveKpiCard
              label="Leading Incumbent"
              value={leadingIncumbent ? leadingIncumbent.name : "—"}
              delta={
                leadingIncumbent
                  ? `${leadingIncumbent.volumeSharePct.toFixed(1)}% share`
                  : undefined
              }
              deltaTone="positive"
              icon={Building2}
              sub={
                leadingIncumbent
                  ? `${formatCompactCurrency(leadingIncumbent.totalVolumeEur, "EUR")} across ${leadingIncumbent.totalWins} wins · HQ ${COUNTRY_LABELS[leadingIncumbent.country] ?? leadingIncumbent.country}`
                  : "No historical winner recorded"
              }
              className="[&_div.font-serif]:truncate [&_div.font-serif]:text-[22px] [&_div.font-serif]:leading-snug"
            />

            <ExecutiveKpiCard
              label="Top-3 Concentration Ratio"
              value={`${top3ConcentrationPct.toFixed(1)}%`}
              delta="CR3"
              deltaTone={top3ConcentrationPct >= 55 ? "caution" : "neutral"}
              icon={PieChart}
              sub={`${formatCompactCurrency(top3VolumeEur, "EUR")} captured by top 3 incumbents`}
            />
          </div>

          {/* ── Search & Country Filter Toolbar ── */}
          <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search supplier, sector, or HQ…"
                  aria-label="Search incumbent suppliers"
                  className="h-8 w-full rounded-[4px] border border-border-strong bg-background/60 pl-8 pr-7 text-xs text-primary placeholder:text-subtle-foreground focus:border-accent-blue focus:bg-card focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search query"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle-foreground hover:text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Country filter pills */}
              <div
                role="group"
                aria-label="Filter incumbents by country"
                className="flex flex-wrap items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCountry("ALL")}
                  className={cn(
                    "rounded-[4px] border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    selectedCountry === "ALL"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-primary",
                  )}
                >
                  All ({allIncumbents.length})
                </button>
                {availableCountries.map(({ code, count }) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setSelectedCountry(code)}
                    title={COUNTRY_LABELS[code] ?? code}
                    className={cn(
                      "rounded-[4px] border px-2 py-1 font-mono text-[11px] font-medium transition-colors tabular-nums-strict",
                      selectedCountry === code
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-primary",
                    )}
                  >
                    {code}
                    <span className="ml-1 opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 pt-2.5 lg:border-t-0 lg:pt-0">
              <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                {filteredIncumbents.length} of {allIncumbents.length} suppliers
              </span>

              <div
                role="group"
                aria-label="Sort incumbent table"
                className="inline-flex rounded-[4px] border border-border bg-background p-0.5 text-[11px]"
              >
                {(
                  [
                    { key: "volume", label: "Volume" },
                    { key: "wins", label: "Wins" },
                    { key: "avgDeal", label: "Avg Deal" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSortBy(option.key)}
                    className={cn(
                      "rounded-[3px] px-2 py-0.5 font-medium transition-colors",
                      sortBy === option.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-primary",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Visual Horizontal Market Share Comparison Chart (Top 8) ── */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>
                    Market Share Comparison — Top {chartIncumbents.length}{" "}
                    Incumbents
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Share of total indexed EUR award volume across{" "}
                    {selectedCountry === "ALL"
                      ? "all European regions"
                      : COUNTRY_LABELS[selectedCountry] ?? selectedCountry}
                  </CardDescription>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-subtle-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[1px] bg-primary" />
                    Top 3 (CR3)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[1px] bg-accent-blue" />
                    Tier-2 Challengers
                  </span>
                </div>
              </div>

              {/* Financial Times-style CR3 Concentration Strip */}
              {allIncumbents.length > 0 && selectedCountry === "ALL" && !searchQuery && (
                <div className="mt-3 pt-2">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">
                      Market Concentration Breakdown
                    </span>
                    <span className="font-mono text-subtle-foreground tabular-nums-strict">
                      Top 3: {top3ConcentrationPct.toFixed(1)}% · Rest of Market:{" "}
                      {Math.max(0, 100 - top3ConcentrationPct).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-[2px] bg-muted">
                    {allIncumbents.slice(0, 3).map((inc, idx) => (
                      <div
                        key={inc.name}
                        title={`${inc.name}: ${inc.volumeSharePct.toFixed(1)}% (${formatCompactCurrency(inc.totalVolumeEur, "EUR")})`}
                        className={cn(
                          "h-full border-r border-card transition-opacity",
                          idx === 0
                            ? "bg-primary"
                            : idx === 1
                              ? "bg-[#1C3D5A]"
                              : "bg-accent-blue",
                        )}
                        style={{ width: `${inc.volumeSharePct}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-4">
              {chartIncumbents.length === 0 ? (
                <EmptyState
                  title="No Matching Incumbents"
                  description="Adjust your supplier search query or region filter to inspect market share."
                  action={
                    hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-[4px] border border-border-strong bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                      >
                        Reset filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div
                  className="space-y-2"
                  onMouseLeave={() => setHoveredSupplier(null)}
                >
                  {chartIncumbents.map((inc, idx) => {
                    const relativeWidthPct = Math.max(
                      4,
                      Math.round((inc.volumeSharePct / maxChartShare) * 100),
                    );
                    const isHovered = hoveredSupplier === inc.name;
                    const isDimmed = hoveredSupplier !== null && !isHovered;
                    const isTopThree = inc.globalRank <= 3;

                    return (
                      <div
                        key={inc.name}
                        tabIndex={0}
                        onMouseEnter={() => setHoveredSupplier(inc.name)}
                        onFocus={() => setHoveredSupplier(inc.name)}
                        onBlur={() => setHoveredSupplier(null)}
                        className={cn(
                          "grid grid-cols-1 gap-2 rounded-[4px] px-2.5 py-2 transition-colors duration-150 sm:grid-cols-[230px_1fr_170px] sm:items-center sm:gap-4",
                          isHovered && "bg-[#F3F5F8]",
                          isDimmed && "opacity-65",
                        )}
                      >
                        {/* Left: Rank + Supplier + HQ */}
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-5 shrink-0 font-mono text-[11px] font-medium text-subtle-foreground tabular-nums-strict">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="truncate text-[13px] font-medium text-primary">
                            {inc.name}
                          </span>
                          <span className="inline-flex shrink-0 items-center rounded-[3px] border border-border bg-background px-1.5 py-0 font-mono text-[10px] font-semibold text-muted-foreground">
                            {inc.country}
                          </span>
                        </div>

                        {/* Middle: Crisp Horizontal Share Bar */}
                        <div className="relative flex items-center">
                          <div className="relative h-5 w-full overflow-hidden rounded-[2px] bg-muted/80">
                            {/* Subtle 25/50/75 reference rules */}
                            <div
                              className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-card/80"
                              aria-hidden="true"
                            />
                            <div
                              className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-card/80"
                              aria-hidden="true"
                            />
                            <div
                              className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-card/80"
                              aria-hidden="true"
                            />

                            <div
                              className={cn(
                                "h-full rounded-[2px] transition-all duration-300 ease-out",
                                isHovered
                                  ? "bg-emerald"
                                  : isTopThree
                                    ? "bg-primary"
                                    : "bg-accent-blue",
                              )}
                              style={{ width: `${relativeWidthPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Right: Market Share % + Volume + Wins */}
                        <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums-strict sm:justify-end">
                          <span className="text-[11px] text-subtle-foreground">
                            {inc.totalWins}w
                          </span>
                          <span className="w-16 text-right text-xs font-semibold text-primary">
                            {formatCompactCurrency(inc.totalVolumeEur, "EUR")}
                          </span>
                          <span
                            className={cn(
                              "w-12 text-right text-xs font-semibold",
                              isTopThree
                                ? "text-primary"
                                : "text-accent-blue",
                            )}
                          >
                            {inc.volumeSharePct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>

            <CardFooter className="justify-between gap-2 text-[11px] text-subtle-foreground">
              {hoveredItem ? (
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-primary">
                    {hoveredItem.name} (
                    {COUNTRY_LABELS[hoveredItem.country] ?? hoveredItem.country}
                    ):{" "}
                    <span className="font-mono tabular-nums-strict">
                      {formatCurrency(hoveredItem.totalVolumeEur, "EUR")}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums-strict">
                    {hoveredItem.volumeSharePct.toFixed(1)}% volume share ·{" "}
                    {hoveredItem.winSharePct.toFixed(1)}% win count share · Avg{" "}
                    {formatCompactCurrency(hoveredItem.avgContractEur, "EUR")}
                  </span>
                </div>
              ) : (
                <>
                  <span>
                    Hover any bar for exact volume, win-rate share, and average
                    contract size
                  </span>
                  <span className="font-mono tabular-nums-strict">
                    Bars scaled to top incumbent ({maxChartShare.toFixed(1)}%)
                  </span>
                </>
              )}
            </CardFooter>
          </Card>

          {/* ── High-Density Incumbent Leaderboard Table ── */}
          <Card className="overflow-hidden border-t-2 border-t-primary">
            <CardHeader className="border-b border-border/80 pb-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="text-primary">
                    Incumbent Leaderboard
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Complete supplier register with awarded EUR volume, average
                    contract value, CPV focus, and active jurisdictions.
                    {onFilterByCountry
                      ? " Click any active country badge to filter the Tender Desk."
                      : ""}
                  </CardDescription>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="self-start text-xs font-medium text-accent-blue hover:text-primary sm:self-auto"
                  >
                    Clear active filters
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredIncumbents.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No Suppliers Match Current Filters"
                    description="Try clearing the search query or selecting All regions to view the full incumbent directory."
                    action={
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-[4px] border border-border-strong bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                      >
                        Reset filters
                      </button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead className="min-w-[190px]">
                        Supplier &amp; HQ
                      </TableHead>
                      <TableHead className="text-right">Wins</TableHead>
                      <TableHead className="text-right">
                        Awarded Volume
                      </TableHead>
                      <TableHead className="text-right">
                        Avg Contract
                      </TableHead>
                      <TableHead className="w-[124px] text-right">
                        Market Share
                      </TableHead>
                      <TableHead className="min-w-[190px]">
                        Primary CPV Sectors
                      </TableHead>
                      <TableHead>Active Countries</TableHead>
                      <TableHead className="text-right">
                        Latest Award
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncumbents.map((inc, idx) => {
                      const hqLabel =
                        COUNTRY_LABELS[inc.country] ?? inc.country;

                      return (
                        <TableRow key={inc.name}>
                          {/* Rank */}
                          <TableCell className="font-mono text-xs font-medium text-subtle-foreground tabular-nums-strict">
                            {String(idx + 1).padStart(2, "0")}
                          </TableCell>

                          {/* Supplier Name + HQ Country */}
                          <TableCell>
                            <div className="min-w-0">
                              <div className="font-medium text-primary">
                                {inc.name}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle-foreground">
                                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                                  HQ {inc.country}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{hqLabel}</span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Total Wins */}
                          <TableCell className="text-right font-mono text-xs font-medium text-primary tabular-nums-strict">
                            {inc.totalWins}
                          </TableCell>

                          {/* Awarded Volume (EUR) */}
                          <TableCell className="text-right whitespace-nowrap">
                            <span
                              className="font-mono text-[13px] font-semibold text-primary tabular-nums-strict"
                              title={formatCurrency(inc.totalVolumeEur, "EUR")}
                            >
                              {formatCompactCurrency(inc.totalVolumeEur, "EUR")}
                            </span>
                          </TableCell>

                          {/* Avg Contract Size */}
                          <TableCell className="text-right whitespace-nowrap">
                            <span
                              className="font-mono text-xs text-muted-foreground tabular-nums-strict"
                              title={formatCurrency(inc.avgContractEur, "EUR")}
                            >
                              {formatCompactCurrency(inc.avgContractEur, "EUR")}
                            </span>
                          </TableCell>

                          {/* Market Share % */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="hidden h-1.5 w-14 overflow-hidden rounded-[2px] bg-muted sm:block">
                                <div
                                  className={cn(
                                    "h-full rounded-[2px]",
                                    inc.globalRank <= 3
                                      ? "bg-primary"
                                      : "bg-accent-blue",
                                  )}
                                  style={{
                                    width: `${Math.min(100, Math.max(6, Math.round((inc.volumeSharePct / maxChartShare) * 100)))}%`,
                                  }}
                                />
                              </div>
                              <span className="w-11 text-right font-mono text-xs font-semibold text-primary tabular-nums-strict">
                                {inc.volumeSharePct.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>

                          {/* Primary CPV Sectors */}
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {inc.primarySectors.length > 0 ? (
                                inc.primarySectors.map((sector) => (
                                  <Badge
                                    key={sector}
                                    variant="muted"
                                    className="max-w-[200px] truncate text-[10px]"
                                    title={sector}
                                  >
                                    {sector}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-subtle-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Active Countries (clickable -> onFilterByCountry) */}
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              {inc.countriesActive.map((code) => {
                                const fullCountry =
                                  COUNTRY_LABELS[code] ?? code;
                                if (onFilterByCountry) {
                                  return (
                                    <button
                                      key={code}
                                      type="button"
                                      onClick={() => onFilterByCountry(code)}
                                      title={`Filter Tender Desk by ${fullCountry}`}
                                      className="group/btn inline-flex items-center gap-0.5 rounded-[3px] border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary transition-colors hover:border-accent-blue hover:bg-accent-blue-soft hover:text-accent-blue"
                                    >
                                      <span>{code}</span>
                                      <ArrowUpRight
                                        className="h-2.5 w-2.5 opacity-60 group-hover/btn:opacity-100"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  );
                                }
                                return (
                                  <Badge
                                    key={code}
                                    variant="outline"
                                    className="px-1.5 py-0 font-mono text-[10px]"
                                    title={fullCountry}
                                  >
                                    {code}
                                  </Badge>
                                );
                              })}
                            </div>
                          </TableCell>

                          {/* Latest Award Date */}
                          <TableCell className="text-right font-mono text-xs text-subtle-foreground whitespace-nowrap tabular-nums-strict">
                            {formatAwardDate(inc.latestAwardDate)}
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
