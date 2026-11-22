"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  Check,
  Clock,
  Download,
  Filter,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/badge";
import {
  EmptyState,
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
import {
  COUNTRY_LABELS,
  PROCEDURE_LABELS,
  SOURCE_LABELS,
  daysUntil,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/intelligence-engine";
import type {
  BidVerdict,
  ProcurementPlatform,
  SortDirection,
  TenderSortField,
  TenderWithIntelligence,
  TendersFacetCounts,
} from "@/lib/types";

export interface TenderDeskFilters {
  q: string;
  country: string;
  source: string;
  tech: string | null;
  verdict: BidVerdict | "ALL";
  showExpired: boolean;
  watchlistOnly: boolean;
  sortBy: TenderSortField;
  sortDir: SortDirection;
}

export interface TenderDeskProps {
  tenders: TenderWithIntelligence[];
  facets: TendersFacetCounts | null;
  totalCount: number;
  loading: boolean;
  filters: TenderDeskFilters;
  onFiltersChange: (patch: Partial<TenderDeskFilters>) => void;
  onResetFilters: () => void;
  bookmarks: Set<string>;
  onToggleBookmark: (id: string) => void;
  onSelectTender: (id: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const ALL_PLATFORMS: ProcurementPlatform[] = [
  "ted",
  "simap",
  "evergabe",
  "auftragsportal",
  "boamp",
  "appalti",
];

const VERDICT_OPTIONS: {
  value: BidVerdict | "ALL";
  label: string;
  dotClass?: string;
}[] = [
  { value: "ALL", label: "All Verdicts" },
  { value: "STRONG BID", label: "STRONG BID", dotClass: "bg-emerald" },
  { value: "EVALUATE", label: "EVALUATE", dotClass: "bg-amber" },
  { value: "PASS", label: "PASS", dotClass: "bg-subtle-foreground" },
];

const SHORT_PLATFORM_CODES: Record<ProcurementPlatform, string> = {
  ted: "EU TED",
  simap: "SIMAP",
  evergabe: "eVergabe",
  auftragsportal: "Auftragsportal",
  boamp: "BOAMP",
  appalti: "Appalti",
};

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildTendersCsv(tenders: readonly TenderWithIntelligence[]): string {
  const headers = [
    "Source ID",
    "Platform",
    "Country",
    "Awarding Authority",
    "Tender Title",
    "CPV Sector",
    "CPV Codes",
    "Estimated Budget",
    "Currency",
    "Submission Deadline",
    "Days Remaining",
    "Procedure",
    "Status",
    "Technologies",
    "Predicted Winner",
    "Winner Confidence (%)",
    "Bid Fit Score",
    "Verdict",
    "Official Portal URL",
  ];

  const rows = tenders.map((t) => {
    const remaining = daysUntil(t.deadline);
    return [
      t.sourceId,
      SOURCE_LABELS[t.source] ?? t.source,
      t.country,
      t.authority,
      t.title,
      t.cpvSector,
      t.cpvCodes.join(" | "),
      t.budget ?? "",
      t.currency,
      t.deadline.slice(0, 10),
      remaining,
      PROCEDURE_LABELS[t.procedure] ?? t.procedure,
      t.status,
      t.technologies.join(" | "),
      t.topPredictedWinner ?? "Open Field",
      t.topWinnerConfidence,
      t.scorecard.overallScore,
      t.scorecard.verdict,
      t.sourceUrl,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return `\uFEFF${headers.map(escapeCsvCell).join(",")}\r\n${rows.join("\r\n")}`;
}

function formatIsoDate(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function DeadlineChip({
  deadline,
  status,
}: {
  deadline: string;
  status: TenderWithIntelligence["status"];
}) {
  const days = daysUntil(deadline);
  const isExpired = days < 0 || status !== "active";

  if (isExpired) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge
          variant="muted"
          className="font-mono text-[10px] uppercase tracking-[0.04em] tabular-nums-strict"
        >
          Expired
        </Badge>
        <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
          {formatIsoDate(deadline)}
        </span>
      </div>
    );
  }

  const variant = days <= 14 ? "crimson" : days <= 30 ? "amber" : "muted";
  const label = days === 0 ? "Due today" : `${days}d left`;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge
        variant={variant}
        className="font-mono text-[10px] font-medium tabular-nums-strict"
      >
        {label}
      </Badge>
      <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
        {formatIsoDate(deadline)}
      </span>
    </div>
  );
}

function SortIcon({
  field,
  activeField,
  direction,
}: {
  field: TenderSortField;
  activeField: TenderSortField;
  direction: SortDirection;
}) {
  if (field !== activeField) {
    return (
      <ArrowUpDown
        className="h-3 w-3 text-subtle-foreground/70"
        aria-hidden="true"
      />
    );
  }
  return direction === "asc" ? (
    <ArrowUp className="h-3 w-3 text-accent-blue" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-accent-blue" aria-hidden="true" />
  );
}

export function TenderDesk({
  tenders,
  facets,
  totalCount,
  loading,
  filters,
  onFiltersChange,
  onResetFilters,
  bookmarks,
  onToggleBookmark,
  onSelectTender,
  searchInputRef,
}: TenderDeskProps) {
  const [exportConfirmed, setExportConfirmed] = React.useState(false);

  const hasActiveFilters =
    filters.q.trim().length > 0 ||
    filters.country !== "ALL" ||
    filters.source !== "ALL" ||
    filters.tech !== null ||
    filters.verdict !== "ALL" ||
    filters.showExpired ||
    filters.watchlistOnly;

  const countryPills = React.useMemo(() => {
    const raw = facets?.countries ?? [];
    const totalFromFacets = raw.reduce((sum, c) => sum + c.count, 0);
    const allCount = totalFromFacets > 0 ? totalFromFacets : totalCount;

    const list = [
      { code: "ALL", label: COUNTRY_LABELS.ALL ?? "All Regions", count: allCount },
      ...raw,
    ];

    if (
      filters.country !== "ALL" &&
      !list.some((item) => item.code === filters.country)
    ) {
      list.push({
        code: filters.country,
        label: COUNTRY_LABELS[filters.country] ?? filters.country,
        count: 0,
      });
    }

    return list;
  }, [facets, totalCount, filters.country]);

  const sourceCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const s of facets?.sources ?? []) {
      map.set(s.id, s.count);
    }
    return map;
  }, [facets]);

  const techTags = React.useMemo(() => {
    const top = (facets?.technologies ?? []).slice(0, 14);
    if (filters.tech && !top.some((t) => t.name === filters.tech)) {
      return [{ name: filters.tech, count: 0 }, ...top];
    }
    return top;
  }, [facets, filters.tech]);

  const handleSort = React.useCallback(
    (field: TenderSortField) => {
      if (filters.sortBy === field) {
        onFiltersChange({
          sortDir: filters.sortDir === "asc" ? "desc" : "asc",
        });
      } else {
        onFiltersChange({
          sortBy: field,
          sortDir: field === "deadline" ? "asc" : "desc",
        });
      }
    },
    [filters.sortBy, filters.sortDir, onFiltersChange],
  );

  const handleExportCsv = React.useCallback(() => {
    if (tenders.length === 0) return;
    const csv = buildTendersCsv(tenders);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `govtender-pipeline-${dateStamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    setExportConfirmed(true);
    window.setTimeout(() => setExportConfirmed(false), 2000);
  }, [tenders]);

  return (
    <section className="space-y-4">
      <SectionHeader
        kicker="PROCUREMENT INTELLIGENCE DESK"
        title="Active Tender Pipeline"
        subtitle={`Showing ${tenders.length.toLocaleString()} of ${totalCount.toLocaleString()} indexed European public procurement notices with deterministic CPV & incumbent scoring.`}
        right={
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={tenders.length === 0}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-3 text-xs font-medium transition-colors",
                tenders.length === 0
                  ? "cursor-not-allowed border-border bg-muted text-subtle-foreground"
                  : exportConfirmed
                    ? "border-emerald/30 bg-emerald-soft text-emerald"
                    : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {exportConfirmed ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Exported ({tenders.length})
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export CSV
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Institutional Compact Filter Bar */}
      <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)]">
        {/* Top Control Row: Search + Platform + Toggles */}
        <div className="flex flex-col gap-2.5 border-b border-border/80 p-3.5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={filters.q}
              onChange={(e) => onFiltersChange({ q: e.target.value })}
              placeholder="Search awarding authority, tender title, CPV code, or technology…"
              aria-label="Search tenders"
              className="h-9 w-full rounded-[4px] border border-border bg-background/70 pl-9 pr-14 text-[13px] text-foreground placeholder:text-subtle-foreground transition-colors focus:border-accent-blue focus:bg-card focus:outline-none"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {filters.q.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFiltersChange({ q: "" })}
                  aria-label="Clear search query"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] text-subtle-foreground hover:bg-muted hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <kbd
                className="hidden h-5 min-w-5 items-center justify-center rounded-[3px] border border-border-strong bg-card px-1.5 font-mono text-[10px] font-medium text-subtle-foreground sm:inline-flex"
                title="Press / to focus search"
              >
                /
              </kbd>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Platform Dropdown */}
            <div className="relative flex items-center">
              <Filter
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-subtle-foreground"
                aria-hidden="true"
              />
              <select
                value={filters.source}
                onChange={(e) => onFiltersChange({ source: e.target.value })}
                aria-label="Filter by procurement platform"
                className="h-9 cursor-pointer rounded-[4px] border border-border bg-card pl-8 pr-7 text-xs font-medium text-foreground transition-colors hover:border-border-strong focus:border-accent-blue focus:outline-none"
              >
                <option value="ALL">All Platforms</option>
                {ALL_PLATFORMS.map((platform) => {
                  const count = sourceCounts.get(platform);
                  return (
                    <option key={platform} value={platform}>
                      {SOURCE_LABELS[platform]}
                      {typeof count === "number" ? ` (${count})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Show Expired Toggle */}
            <button
              type="button"
              onClick={() =>
                onFiltersChange({ showExpired: !filters.showExpired })
              }
              aria-pressed={filters.showExpired}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-[4px] border px-3 text-xs font-medium transition-colors",
                filters.showExpired
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-primary",
              )}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Show Expired
            </button>

            {/* Watchlist Only Indicator / Toggle */}
            <button
              type="button"
              onClick={() =>
                onFiltersChange({ watchlistOnly: !filters.watchlistOnly })
              }
              aria-pressed={filters.watchlistOnly}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-[4px] border px-3 text-xs font-medium transition-colors",
                filters.watchlistOnly
                  ? "border-accent-blue/35 bg-accent-blue-soft text-accent-blue"
                  : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-primary",
              )}
            >
              <Bookmark
                className={cn(
                  "h-3.5 w-3.5",
                  filters.watchlistOnly && "fill-accent-blue text-accent-blue",
                )}
                aria-hidden="true"
              />
              <span>Watchlist</span>
              <span
                className={cn(
                  "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums-strict",
                  filters.watchlistOnly
                    ? "bg-accent-blue/15 text-accent-blue"
                    : "bg-muted text-subtle-foreground",
                )}
              >
                {bookmarks.size}
              </span>
            </button>
          </div>
        </div>

        {/* Middle Control Row: Country Pills + Verdict Pills */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-3.5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by country"
          >
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
              Region
            </span>
            {countryPills.map((c) => {
              const active = filters.country === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  title={c.label}
                  onClick={() => onFiltersChange({ country: c.code })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-2 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:border-border-strong hover:bg-card hover:text-primary",
                  )}
                >
                  <span className="font-mono text-[11px] font-semibold">
                    {c.code}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums-strict",
                      active ? "text-primary-foreground/80" : "text-subtle-foreground",
                    )}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by Bid/No-Bid verdict"
          >
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
              Verdict
            </span>
            {VERDICT_OPTIONS.map((opt) => {
              const active = filters.verdict === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onFiltersChange({ verdict: opt.value })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:border-border-strong hover:bg-card hover:text-primary",
                  )}
                >
                  {opt.dotClass && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-[1px]",
                        active ? "bg-primary-foreground" : opt.dotClass,
                      )}
                      aria-hidden="true"
                    />
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Control Row: Dynamic Technology Strip from Facets */}
        {techTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 bg-background/40 px-3.5 py-2.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
              Tech Stack
            </span>
            {techTags.map((tag) => {
              const active = filters.tech === tag.name;
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() =>
                    onFiltersChange({ tech: active ? null : tag.name })
                  }
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-[3px] border px-2 text-[11px] font-medium transition-colors",
                    active
                      ? "border-accent-blue bg-accent-blue text-white"
                      : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-primary",
                  )}
                >
                  <span>{tag.name}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums-strict",
                      active ? "text-white/80" : "text-subtle-foreground",
                    )}
                  >
                    {tag.count}
                  </span>
                </button>
              );
            })}
            {filters.tech && (
              <button
                type="button"
                onClick={() => onFiltersChange({ tech: null })}
                className="ml-1 inline-flex h-6 items-center gap-1 rounded-[3px] px-1.5 text-[11px] font-medium text-accent-blue hover:underline"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Clear tech
              </button>
            )}
          </div>
        )}
      </div>

      {/* High-Density Sortable Procurement Table */}
      {!loading && tenders.length === 0 ? (
        <EmptyState
          title="No matching procurement notices"
          description={
            filters.watchlistOnly && bookmarks.size === 0
              ? "Your local watchlist is currently empty. Bookmark tenders from the pipeline table to build a focused bid pursuit list."
              : "No tenders match the current combination of region, platform, verdict, and technology filters."
          }
          action={
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-primary bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset All Filters
            </button>
          }
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-card)] transition-opacity duration-150",
            loading && tenders.length > 0 && "opacity-70",
          )}
        >
          <Table>
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-2.5 text-center">
                  <span className="sr-only">Watchlist</span>
                </TableHead>
                <TableHead className="min-w-[190px]">
                  Authority &amp; Source
                </TableHead>
                <TableHead className="min-w-[260px]">
                  Opportunity &amp; CPV Sector
                </TableHead>
                <TableHead
                  className="w-[115px] text-right"
                  aria-sort={
                    filters.sortBy === "budget"
                      ? filters.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSort("budget")}
                    className="ml-auto inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] hover:text-primary"
                  >
                    <span>Budget</span>
                    <SortIcon
                      field="budget"
                      activeField={filters.sortBy}
                      direction={filters.sortDir}
                    />
                  </button>
                </TableHead>
                <TableHead
                  className="w-[118px]"
                  aria-sort={
                    filters.sortBy === "deadline"
                      ? filters.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSort("deadline")}
                    className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] hover:text-primary"
                  >
                    <span>Deadline</span>
                    <SortIcon
                      field="deadline"
                      activeField={filters.sortBy}
                      direction={filters.sortDir}
                    />
                  </button>
                </TableHead>
                <TableHead className="min-w-[175px]">Tech Stack</TableHead>
                <TableHead className="min-w-[165px]">
                  Predicted Winner
                </TableHead>
                <TableHead
                  className="w-[148px] text-right"
                  aria-sort={
                    filters.sortBy === "score"
                      ? filters.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSort("score")}
                    className="ml-auto inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] hover:text-primary"
                  >
                    <span>Fit Score</span>
                    <SortIcon
                      field="score"
                      activeField={filters.sortBy}
                      direction={filters.sortDir}
                    />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && tenders.length === 0
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`} className="hover:bg-card">
                      <TableCell colSpan={8} className="py-3.5">
                        <div className="flex items-center gap-4">
                          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                : tenders.map((tender) => {
                    const isSaved = bookmarks.has(tender.id);
                    const visibleTechs = tender.technologies.slice(0, 3);
                    const overflowTechs = Math.max(
                      0,
                      tender.technologies.length - 3,
                    );

                    return (
                      <TableRow
                        key={tender.id}
                        onClick={() => onSelectTender(tender.id)}
                        className="group cursor-pointer"
                      >
                        {/* Watchlist Bookmark Toggle */}
                        <TableCell className="px-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleBookmark(tender.id);
                            }}
                            aria-label={
                              isSaved
                                ? `Remove ${tender.title} from watchlist`
                                : `Save ${tender.title} to watchlist`
                            }
                            aria-pressed={isSaved}
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors",
                              isSaved
                                ? "bg-accent-blue-soft text-accent-blue"
                                : "text-subtle-foreground/60 hover:bg-muted hover:text-primary",
                            )}
                          >
                            <Bookmark
                              className={cn(
                                "h-3.5 w-3.5",
                                isSaved && "fill-accent-blue",
                              )}
                              aria-hidden="true"
                            />
                          </button>
                        </TableCell>

                        {/* Awarding Authority + Country + Platform */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="line-clamp-1 font-medium text-primary">
                              {tender.authority}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                title={
                                  COUNTRY_LABELS[tender.country] ??
                                  tender.country
                                }
                                className="inline-flex items-center rounded-[3px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-primary"
                              >
                                {tender.country}
                              </span>
                              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-subtle-foreground">
                                {SHORT_PLATFORM_CODES[tender.source] ??
                                  tender.source}
                              </span>
                              <span className="font-mono text-[10px] text-subtle-foreground/75">
                                · {tender.sourceId}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Tender Title + CPV Sector */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTender(tender.id);
                              }}
                              className="line-clamp-2 text-left text-[13px] font-medium leading-snug text-primary transition-colors group-hover:text-accent-blue"
                            >
                              {tender.title}
                            </button>
                            <div className="flex items-center gap-1.5 text-[11px] text-subtle-foreground">
                              <span className="truncate">
                                {tender.cpvSector}
                              </span>
                              {tender.cpvCodes[0] && (
                                <span className="shrink-0 font-mono text-[10px] text-subtle-foreground/80">
                                  CPV {tender.cpvCodes[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Estimated Budget */}
                        <TableCell className="text-right">
                          <span
                            title={formatCurrency(
                              tender.budget,
                              tender.currency,
                            )}
                            className="font-mono text-[13px] font-semibold text-primary tabular-nums-strict"
                          >
                            {formatCompactCurrency(
                              tender.budget,
                              tender.currency,
                            )}
                          </span>
                          {tender.budget != null && (
                            <div className="font-mono text-[10px] uppercase text-subtle-foreground">
                              {tender.currency}
                            </div>
                          )}
                        </TableCell>

                        {/* Submission Deadline Chip */}
                        <TableCell>
                          <DeadlineChip
                            deadline={tender.deadline}
                            status={tender.status}
                          />
                        </TableCell>

                        {/* Required Technologies */}
                        <TableCell>
                          {visibleTechs.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {visibleTechs.map((tech) => (
                                <Badge
                                  key={tech}
                                  variant={
                                    filters.tech === tech ? "cobalt" : "muted"
                                  }
                                  className="px-1.5 py-0 text-[10px]"
                                >
                                  {tech}
                                </Badge>
                              ))}
                              {overflowTechs > 0 && (
                                <Badge
                                  variant="outline"
                                  className="px-1.5 py-0 font-mono text-[10px] text-subtle-foreground tabular-nums-strict"
                                >
                                  +{overflowTechs}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-subtle-foreground">
                              —
                            </span>
                          )}
                        </TableCell>

                        {/* Predicted Winner + Confidence % */}
                        <TableCell>
                          {tender.topPredictedWinner ? (
                            <div className="flex flex-col gap-1">
                              <span className="line-clamp-1 text-xs font-medium text-primary">
                                {tender.topPredictedWinner}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="h-1 w-14 overflow-hidden rounded-[2px] bg-muted">
                                  <div
                                    className={cn(
                                      "h-full rounded-[2px]",
                                      tender.topWinnerConfidence >= 75
                                        ? "bg-amber"
                                        : "bg-accent-blue",
                                    )}
                                    style={{
                                      width: `${Math.min(100, tender.topWinnerConfidence)}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] font-medium text-muted-foreground tabular-nums-strict">
                                  {tender.topWinnerConfidence}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-[11px] text-subtle-foreground">
                              Open field
                            </span>
                          )}
                        </TableCell>

                        {/* Bid Fit Score + RecommendationBadge */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-baseline gap-1 font-mono tabular-nums-strict">
                              <span className="text-sm font-semibold text-primary">
                                {tender.scorecard.overallScore}
                              </span>
                              <span className="text-[10px] text-subtle-foreground">
                                /100
                              </span>
                            </div>
                            <RecommendationBadge
                              verdict={tender.scorecard.verdict}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>

          {/* Compact Table Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/60 px-4 py-2 text-[11px] text-subtle-foreground">
            <span className="font-mono tabular-nums-strict">
              {tenders.length} row{tenders.length === 1 ? "" : "s"} displayed
              {filters.watchlistOnly ? " · Watchlist filter active" : ""}
            </span>
            <span>
              Click any opportunity row to open the Bid/No-Bid Strategic Dossier
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
