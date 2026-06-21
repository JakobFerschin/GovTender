"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Activity,
  TrendingUp,
  Layers,
  ChevronRight,
  Trophy,
  MapPin,
  Calendar,
  Building2,
  Search,
  X,
  Bookmark,
  BookmarkCheck,
  ArrowUpDown,
  Clock,
  ExternalLink,
  AlertTriangle,
  Tag,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/card";
import { Badge } from "@/components/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/table";
import {
  TENDERS,
  COUNTRIES,
  allTechnologies,
  totalBudget,
  formatCurrency,
  daysUntil,
  topTechFor,
  type Tender,
  type HistoricalMatch,
} from "@/lib/mock-data";

/* ── Types ─────────────────────────────────────────────────────────────── */

type SortDir = "asc" | "desc";

/* ── KPI Cards ──────────────────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight font-[family-name:var(--font-serif)]">
          {value}
        </div>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Deadline indicator ────────────────────────────────────────────────── */

function DeadlineChip({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  if (days < 0) return <Badge variant="muted">Expired</Badge>;
  if (days <= 14)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" />
        {days}d
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <Clock className="h-3 w-3" />
        {days}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {days}d
    </span>
  );
}

/* ── Tender Row ───────────────────────────────────────────────────────── */

function TenderRow({
  t,
  isBookmarked,
  onToggleBookmark,
  onSelect,
}: {
  t: Tender;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onSelect: () => void;
}) {
  return (
    <TableRow className="group cursor-pointer" onClick={onSelect}>
      {/* Bookmark */}
      <TableCell className="w-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark();
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title={isBookmarked ? "Remove from watchlist" : "Add to watchlist"}
        >
          {isBookmarked ? (
            <BookmarkCheck className="h-4 w-4 text-primary" />
          ) : (
            <Bookmark className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
          )}
        </button>
      </TableCell>

      {/* Authority */}
      <TableCell className="font-medium min-w-[180px]">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div className="min-w-0">
            <span className="truncate block">{t.authority}</span>
            <span className="text-[11px] text-muted-foreground uppercase">{t.country}</span>
          </div>
        </div>
      </TableCell>

      {/* Title */}
      <TableCell className="min-w-[240px]">
        <span className="line-clamp-1">{t.title}</span>
      </TableCell>

      {/* Budget */}
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatCurrency(t.budget, t.currency)}
      </TableCell>

      {/* Deadline */}
      <TableCell className="whitespace-nowrap">
        <DeadlineChip deadline={t.deadline} />
      </TableCell>

      {/* Technologies */}
      <TableCell className="min-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {t.technologies.length > 0
            ? t.technologies.slice(0, 3).map((tech) => (
                <Badge key={tech}>{tech}</Badge>
              ))
            : <Badge variant="muted">n/a</Badge>}
          {t.technologies.length > 3 && (
            <Badge variant="muted">+{t.technologies.length - 3}</Badge>
          )}
        </div>
      </TableCell>

      {/* Analyze button */}
      <TableCell className="w-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="p-1.5 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          title="Analyze tender"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
    </TableRow>
  );
}

/* ── Detail / Analysis Slide Panel ─────────────────────────────────────── */

function DetailPanel({
  tender,
  isOpen,
  onClose,
  isBookmarked,
  onToggleBookmark,
}: {
  tender: Tender & { matches: HistoricalMatch[]; description: string; cpvCodes: string[] };
  isOpen: boolean;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  if (!isOpen) return null;

  const days = daysUntil(tender.deadline);
  const avgScore =
    tender.matches.length > 0
      ? (tender.matches.reduce((s, m) => s + m.score, 0) / tender.matches.length).toFixed(1)
      : "—";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-card border-l border-border overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tender Analysis
              </span>
              <Badge variant="muted">{tender.country}</Badge>
              <DeadlineChip deadline={tender.deadline} />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Title + Authority */}
          <div>
            <h2 className="text-lg font-semibold leading-snug mb-2">
              {tender.title}
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {tender.authority}
            </div>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground uppercase mb-1">Budget</div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatCurrency(tender.budget, tender.currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground uppercase mb-1">Deadline</div>
                <div className="text-sm font-semibold">
                  {days < 0 ? "Expired" : `${days} days`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground uppercase mb-1">CPV Score</div>
                <div className="text-sm font-semibold tabular-nums">{avgScore}</div>
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-sm leading-relaxed">{tender.description}</p>
          </div>

          {/* Technologies */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              Required Technologies
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {tender.technologies.map((tech) => (
                <Badge key={tech}>{tech}</Badge>
              ))}
            </div>
          </div>

          {/* CPV Codes */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              CPV Codes
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {tender.cpvCodes.map((code) => (
                <Badge key={code} variant="muted">{code}</Badge>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Likely Winners */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Trophy className="h-3 w-3" />
              Likely Winners ({tender.matches.length})
            </h3>

            {tender.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No historical matches found for this tender&apos;s CPV profile.
              </p>
            ) : (
              <div className="space-y-2">
                {tender.matches.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/5 text-primary text-[11px] font-bold shrink-0">
                      {i + 1}
                    </div>

                    {/* Winner info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {m.winnerName}
                        </span>
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5" />
                          {m.winnerCountry}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {m.awardTitle}
                      </p>
                    </div>

                    {/* Score + Value */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">
                        {formatCurrency(m.contractValue, m.currency)}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        {m.awardDate}
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0 w-14">
                      <span className="text-[11px] font-semibold tabular-nums">{m.score}</span>
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full"
                          style={{ width: `${Math.min((m.score / 15) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-3">
              Score = shared CPV prefixes + same-country bonus. Higher indicates stronger historical precedent.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onToggleBookmark}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
            >
              {isBookmarked ? (
                <>
                  <BookmarkCheck className="h-4 w-4" /> On Watchlist
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" /> Add to Watchlist
                </>
              )}
            </button>
            <a
              href={tender.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-4 w-4" /> View Source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  // Filter state
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [techFilter, setTechFilter] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showExpired, setShowExpired] = useState(false);

  // Watchlist
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = TENDERS.find((t) => t.id === selectedId) ?? null;

  // Watchlist view toggle
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  // Filtered tenders
  const filtered = useMemo(() => {
    let result = [...TENDERS];

    // Watchlist
    if (watchlistOnly) {
      result = result.filter((t) => bookmarks.has(t.id));
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.authority.toLowerCase().includes(q),
      );
    }

    // Country
    if (countryFilter !== "ALL") {
      result = result.filter((t) => t.country === countryFilter);
    }

    // Tech
    if (techFilter) {
      result = result.filter((t) =>
        t.technologies.some(
          (tech) => tech.toLowerCase() === techFilter.toLowerCase(),
        ),
      );
    }

    // Show/hide expired
    if (!showExpired) {
      result = result.filter((t) => daysUntil(t.deadline) >= 0);
    }

    // Sort by deadline
    result.sort((a, b) => {
      const diff =
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return sortDir === "asc" ? diff : -diff;
    });

    return result;
  }, [search, countryFilter, techFilter, sortDir, showExpired, bookmarks, watchlistOnly]);

  // KPIs from filtered data
  const activeCount = filtered.filter((t) => daysUntil(t.deadline) >= 0).length;
  const budgetTotal = totalBudget(filtered);
  const topTech = topTechFor(filtered);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-serif)]">
              GovTender Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              EU &amp; DACH Procurement Analytics — Real-time tender intelligence
              with predictive winner matching
            </p>
          </div>
          <button
            onClick={() => setWatchlistOnly((v) => !v)}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors ${
              watchlistOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            Watchlist ({bookmarks.size})
          </button>
        </div>
        <div className="mt-4 h-px bg-border" />
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Active Tenders (DACH)"
          value={String(activeCount)}
          sub={`of ${filtered.length} matching your filters`}
          icon={Activity}
        />
        <KpiCard
          label="Total Budget Volume"
          value={budgetTotal}
          sub="EUR-denominated matching tenders"
          icon={TrendingUp}
        />
        <KpiCard
          label="Top Tech Requirement"
          value={topTech || "—"}
          sub={filtered.length > 0 ? "most frequent in filtered set" : "no tenders match"}
          icon={Layers}
        />
      </section>

      {/* Filters bar */}
      <section className="mb-4 space-y-3">
        {/* Search + Country pills + toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tenders by title or authority…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Country pills */}
          <div className="flex items-center gap-1">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setCountryFilter(c.code)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  countryFilter === c.code
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted border border-border"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Show expired toggle */}
          <button
            onClick={() => setShowExpired((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showExpired
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted border border-border"
            }`}
          >
            Show Expired
          </button>
        </div>

        {/* Tech tag filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Filter by tech:
          </span>
          {allTechnologies().map((tech) => (
            <button
              key={tech}
              onClick={() => setTechFilter((prev) => (prev === tech ? null : tech))}
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                techFilter === tech
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/5 text-primary border border-primary/10 hover:bg-primary/10"
              }`}
            >
              {tech}
            </button>
          ))}
          {techFilter && (
            <button
              onClick={() => setTechFilter(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Active filter summary */}
        {(search || countryFilter !== "ALL" || techFilter || watchlistOnly) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing {filtered.length} of {TENDERS.length} tenders
            </span>
            <button
              onClick={() => {
                setSearch("");
                setCountryFilter("ALL");
                setTechFilter(null);
                setWatchlistOnly(false);
                setShowExpired(false);
              }}
              className="underline hover:text-foreground"
            >
              Reset all filters
            </button>
          </div>
        )}
      </section>

      {/* Intelligence Table */}
      <section className="mb-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle>Active Procurement Notices</CardTitle>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              Deadline {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No tenders match your current filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10" />
                    <TableHead>Awarding Authority</TableHead>
                    <TableHead>Project Title</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Technologies</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TenderRow
                      key={t.id}
                      t={t}
                      isBookmarked={bookmarks.has(t.id)}
                      onToggleBookmark={() => toggleBookmark(t.id)}
                      onSelect={() => setSelectedId(t.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground pb-6">
        GovTender AI — Intelligence Dashboard &middot; Data refreshes daily
        &middot; Predictions based on deterministic CPV matching
      </footer>

      {/* Detail Panel Overlay */}
      {selected && (
        <DetailPanel
          tender={selected}
          isOpen={true}
          onClose={() => setSelectedId(null)}
          isBookmarked={bookmarks.has(selected.id)}
          onToggleBookmark={() => toggleBookmark(selected.id)}
        />
      )}
    </div>
  );
}
