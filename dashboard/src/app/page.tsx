"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { AppHeader, type AppTab } from "@/components/AppHeader";
import { ExecutiveOverview } from "@/components/views/ExecutiveOverview";
import {
  TenderDesk,
  type TenderDeskFilters,
} from "@/components/views/TenderDesk";
import { TenderDossierDrawer } from "@/components/views/TenderDossierDrawer";
import { CompetitiveRadar } from "@/components/views/CompetitiveRadar";
import { PipelineOpsView } from "@/components/views/PipelineOpsView";
import type {
  AnalyticsResponse,
  BidVerdict,
  DataSourceMode,
  TendersApiResponse,
  TendersFacetCounts,
  TenderWithIntelligence,
} from "@/lib/types";

/* ── Constants ──────────────────────────────────────────────────────────── */

const WATCHLIST_STORAGE_KEY = "govtender:watchlist:v1";
const SEARCH_DEBOUNCE_MS = 180;

const DEFAULT_FILTERS: TenderDeskFilters = {
  q: "",
  country: "ALL",
  source: "ALL",
  tech: null,
  verdict: "ALL",
  showExpired: false,
  watchlistOnly: false,
  sortBy: "score",
  sortDir: "desc",
};

const EMPTY_FACETS: TendersFacetCounts = {
  countries: [],
  sources: [],
  technologies: [],
  sectors: [],
};

interface DeskNavigationPreset {
  country?: string;
  sector?: string;
  tech?: string | null;
  verdict?: BidVerdict | "ALL";
  source?: string;
  q?: string;
  watchlistOnly?: boolean;
  showExpired?: boolean;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

interface ServerTenderFilterParams {
  q: string;
  country: string;
  source: string;
  tech: string | null;
  verdict: BidVerdict | "ALL";
  showExpired: boolean;
  sortBy: TenderDeskFilters["sortBy"];
  sortDir: TenderDeskFilters["sortDir"];
}

function buildTendersQueryParams(filters: ServerTenderFilterParams): string {
  const params = new URLSearchParams();
  const trimmedQ = filters.q.trim();

  if (trimmedQ.length > 0) {
    params.set("q", trimmedQ);
  }
  if (filters.country && filters.country !== "ALL") {
    params.set("country", filters.country);
  }
  if (filters.source && filters.source !== "ALL") {
    params.set("source", filters.source);
  }
  if (filters.tech && filters.tech.trim().length > 0) {
    params.set("tech", filters.tech.trim());
  }
  if (filters.verdict && filters.verdict !== "ALL") {
    params.set("verdict", filters.verdict);
  }
  if (filters.showExpired) {
    params.set("showExpired", "true");
  }
  params.set("sortBy", filters.sortBy);
  params.set("sortDir", filters.sortDir);

  return params.toString();
}

function isDefaultServerFilterSet(filters: ServerTenderFilterParams): boolean {
  return (
    filters.q.trim().length === 0 &&
    filters.country === "ALL" &&
    filters.source === "ALL" &&
    filters.tech === null &&
    filters.verdict === "ALL" &&
    !filters.showExpired
  );
}

/* ── Application Shell ──────────────────────────────────────────────────── */

export default function DashboardPage() {
  // Navigation state (Executive Overview first)
  const [activeTab, setActiveTab] = useState<AppTab>("overview");

  // Global data-source telemetry
  const [dataSource, setDataSource] = useState<DataSourceMode>("sandbox");
  const [refreshTick, setRefreshTick] = useState(0);

  // Executive analytics state (GET /api/analytics)
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Unfiltered baseline tenders (used by ExecutiveOverview & fallback cache)
  const [overviewTenders, setOverviewTenders] = useState<
    TenderWithIntelligence[]
  >([]);
  const [tenderCache, setTenderCache] = useState<
    Record<string, TenderWithIntelligence>
  >({});

  // Tender Desk server-filtered state (GET /api/tenders?...)
  const [filters, setFilters] = useState<TenderDeskFilters>(DEFAULT_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [deskTenders, setDeskTenders] = useState<TenderWithIntelligence[]>([]);
  const [facets, setFacets] = useState<TendersFacetCounts>(EMPTY_FACETS);
  const [totalCount, setTotalCount] = useState(0);
  const [deskLoading, setDeskLoading] = useState(true);
  const [deskError, setDeskError] = useState<string | null>(null);

  // Watchlist state (hydration-safe via useEffect)
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set());
  const watchlistHydratedRef = useRef(false);

  // Global Dossier Drawer state
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  // Search input ref for global `/` shortcut
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSearchFocusRef = useRef(false);

  // Server-bound filter slice (memoized so watchlist/un-debounced search edits don't re-fetch)
  const serverFilters = useMemo<ServerTenderFilterParams>(
    () => ({
      q: debouncedQuery,
      country: filters.country,
      source: filters.source,
      tech: filters.tech,
      verdict: filters.verdict,
      showExpired: filters.showExpired,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    }),
    [
      debouncedQuery,
      filters.country,
      filters.source,
      filters.tech,
      filters.verdict,
      filters.showExpired,
      filters.sortBy,
      filters.sortDir,
    ],
  );

  // Helper to merge tenders into fallback lookup map
  const cacheTenders = useCallback((items: TenderWithIntelligence[]) => {
    if (items.length === 0) return;
    setTenderCache((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[item.id] = item;
      }
      return next;
    });
  }, []);

  /* ── Watchlist Persistence (Hydration-Safe) ──────────────────────────── */

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const validIds = parsed.filter(
              (entry): entry is string =>
                typeof entry === "string" && entry.trim().length > 0,
            );
            if (validIds.length > 0) {
              setBookmarks(new Set(validIds));
            }
          }
        }
      } catch {
        // Ignore storage read errors in restricted browsing contexts
      } finally {
        watchlistHydratedRef.current = true;
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!watchlistHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        WATCHLIST_STORAGE_KEY,
        JSON.stringify(Array.from(bookmarks)),
      );
    } catch {
      // Ignore quota / private-mode write errors
    }
  }, [bookmarks]);

  /* ── Debounce Free-Text Search (180ms) ───────────────────────────────── */

  useEffect(() => {
    const delay = filters.q.length === 0 ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(filters.q);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  /* ── Fetch GET /api/analytics (Mount & Post-Sync) ────────────────────── */

  useEffect(() => {
    const controller = new AbortController();

    async function loadAnalytics() {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const res = await fetch("/api/analytics", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Analytics request failed (HTTP ${res.status})`);
        }
        const payload: AnalyticsResponse = await res.json();
        if (!controller.signal.aborted) {
          setAnalytics(payload);
          setDataSource(payload.dataSource);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Unable to load analytics";
        setAnalyticsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setAnalyticsLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      controller.abort();
    };
  }, [refreshTick]);

  /* ── Fetch GET /api/tenders (Server-Side Filtered & Sorted) ──────────── */

  useEffect(() => {
    const controller = new AbortController();
    const queryString = buildTendersQueryParams(serverFilters);
    const defaultSet = isDefaultServerFilterSet(serverFilters);

    async function loadTenders() {
      setDeskLoading(true);
      setDeskError(null);
      try {
        const res = await fetch(`/api/tenders?${queryString}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Tenders request failed (HTTP ${res.status})`);
        }
        const payload: TendersApiResponse = await res.json();
        if (!controller.signal.aborted) {
          setDeskTenders(payload.tenders);
          setFacets(payload.facets);
          setTotalCount(payload.totalCount);
          setDataSource(payload.dataSource);
          cacheTenders(payload.tenders);
          if (defaultSet) {
            setOverviewTenders(payload.tenders);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Unable to load tenders";
        setDeskError(message);
      } finally {
        if (!controller.signal.aborted) {
          setDeskLoading(false);
        }
      }
    }

    void loadTenders();

    return () => {
      controller.abort();
    };
  }, [serverFilters, refreshTick, cacheTenders]);

  /* ── Refresh Unfiltered Overview Snapshot After Sync When Filtered ───── */

  const refreshOverviewSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/tenders?sortBy=score&sortDir=desc", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload: TendersApiResponse = await res.json();
      setOverviewTenders(payload.tenders);
      setDataSource(payload.dataSource);
      cacheTenders(payload.tenders);
    } catch {
      // Non-fatal; existing overview snapshot remains intact
    }
  }, [cacheTenders]);

  const handleAfterSync = useCallback(async () => {
    setRefreshTick((tick) => tick + 1);
    if (!isDefaultServerFilterSet(serverFilters)) {
      await refreshOverviewSnapshot();
    }
  }, [serverFilters, refreshOverviewSnapshot]);

  /* ── Global Keyboard Shortcuts (`/` & `Escape`) ──────────────────────── */

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedTenderId !== null) {
          event.preventDefault();
          setSelectedTenderId(null);
        }
        return;
      }

      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableElement(event.target)
      ) {
        event.preventDefault();
        if (selectedTenderId !== null) {
          setSelectedTenderId(null);
        }
        if (activeTab === "desk") {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          pendingSearchFocusRef.current = true;
          setActiveTab("desk");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, selectedTenderId]);

  useEffect(() => {
    if (activeTab === "desk" && pendingSearchFocusRef.current) {
      pendingSearchFocusRef.current = false;
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [activeTab]);

  /* ── Interaction Handlers ────────────────────────────────────────────── */

  const handleFiltersChange = useCallback(
    (
      updater:
        | Partial<TenderDeskFilters>
        | ((prev: TenderDeskFilters) => TenderDeskFilters),
    ) => {
      setFilters((prev) =>
        typeof updater === "function" ? updater(prev) : { ...prev, ...updater },
      );
    },
    [],
  );

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedQuery("");
  }, []);

  const handleToggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDrawerToggleBookmark = useCallback(
    (maybeId?: unknown) => {
      const targetId =
        typeof maybeId === "string" && maybeId.length > 0
          ? maybeId
          : selectedTenderId;
      if (targetId) {
        handleToggleBookmark(targetId);
      }
    },
    [selectedTenderId, handleToggleBookmark],
  );

  const handleSelectTender = useCallback(
    (tenderOrId: string | TenderWithIntelligence) => {
      if (typeof tenderOrId === "string") {
        setSelectedTenderId(tenderOrId);
      } else {
        setTenderCache((prev) => ({ ...prev, [tenderOrId.id]: tenderOrId }));
        setSelectedTenderId(tenderOrId.id);
      }
    },
    [],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedTenderId(null);
  }, []);

  const handleNavigateToDesk = useCallback(
    (preset?: DeskNavigationPreset) => {
      if (preset && Object.keys(preset).length > 0) {
        const resolvedSectorQuery =
          preset.q === undefined && preset.sector
            ? (analytics?.bySector.find((s) => s.division === preset.sector)
                ?.label ?? preset.sector)
            : preset.q;

        setFilters({
          ...DEFAULT_FILTERS,
          ...(preset.country !== undefined ? { country: preset.country } : {}),
          ...(preset.tech !== undefined ? { tech: preset.tech } : {}),
          ...(preset.verdict !== undefined ? { verdict: preset.verdict } : {}),
          ...(preset.source !== undefined ? { source: preset.source } : {}),
          ...(resolvedSectorQuery !== undefined
            ? { q: resolvedSectorQuery }
            : {}),
          ...(preset.watchlistOnly !== undefined
            ? { watchlistOnly: preset.watchlistOnly }
            : {}),
          ...(preset.showExpired !== undefined
            ? { showExpired: preset.showExpired }
            : {}),
        });
        setDebouncedQuery(resolvedSectorQuery ?? "");
      }
      setActiveTab("desk");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [analytics],
  );

  const handleFilterByCountry = useCallback(
    (country: string) => {
      handleNavigateToDesk({ country });
    },
    [handleNavigateToDesk],
  );

  const handleWatchlistToggle = useCallback(() => {
    if (activeTab === "desk") {
      setFilters((prev) => ({ ...prev, watchlistOnly: !prev.watchlistOnly }));
    } else {
      setFilters((prev) => ({ ...prev, watchlistOnly: true }));
      setActiveTab("desk");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeTab]);

  const handleManualRetry = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  /* ── Derived View Data ───────────────────────────────────────────────── */

  const visibleDeskTenders = useMemo(() => {
    const base =
      deskTenders.length > 0 || !deskError ? deskTenders : overviewTenders;
    if (!filters.watchlistOnly) return base;
    return base.filter((t) => bookmarks.has(t.id));
  }, [deskTenders, deskError, overviewTenders, filters.watchlistOnly, bookmarks]);

  const selectedFallbackTender = useMemo<TenderWithIntelligence | null>(() => {
    if (!selectedTenderId) return null;
    return (
      deskTenders.find((t) => t.id === selectedTenderId) ??
      overviewTenders.find((t) => t.id === selectedTenderId) ??
      tenderCache[selectedTenderId] ??
      null
    );
  }, [selectedTenderId, deskTenders, overviewTenders, tenderCache]);

  const activeTenderCount = useMemo<number | null>(() => {
    if (analytics) return analytics.kpis.activeTenders;
    if (totalCount > 0) return totalCount;
    if (overviewTenders.length > 0) return overviewTenders.length;
    return null;
  }, [analytics, totalCount, overviewTenders.length]);

  const initialShellLoading =
    analyticsLoading && analytics === null && deskLoading && overviewTenders.length === 0;

  const activeError =
    activeTab === "desk"
      ? deskError
      : activeTab === "overview"
        ? analyticsError ?? deskError
        : analyticsError;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeTenderCount={activeTenderCount}
        dataSource={dataSource}
        loading={initialShellLoading}
        watchlistCount={bookmarks.size}
        watchlistActive={activeTab === "desk" && filters.watchlistOnly}
        onWatchlistToggle={handleWatchlistToggle}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-6 lg:px-8">
        {activeError && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-crimson/25 bg-crimson-soft px-4 py-2.5 text-xs text-crimson"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{activeError}</span>
            </div>
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-crimson/30 bg-card px-2.5 py-1 text-[11px] font-medium text-crimson transition-colors hover:bg-crimson/10"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        <div key={activeTab} className="animate-fade-in">
          {activeTab === "overview" && (
            <ExecutiveOverview
              analytics={analytics}
              tenders={overviewTenders}
              loading={analyticsLoading && analytics === null}
              onSelectTender={handleSelectTender}
              onNavigateToDesk={handleNavigateToDesk}
            />
          )}

          {activeTab === "desk" && (
            <TenderDesk
              tenders={visibleDeskTenders}
              facets={facets}
              totalCount={totalCount}
              loading={deskLoading}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onResetFilters={handleResetFilters}
              bookmarks={bookmarks}
              onToggleBookmark={handleToggleBookmark}
              onSelectTender={handleSelectTender}
              searchInputRef={searchInputRef}
            />
          )}

          {activeTab === "radar" && (
            <CompetitiveRadar
              analytics={analytics}
              loading={analyticsLoading && analytics === null}
              onFilterByCountry={handleFilterByCountry}
            />
          )}

          {activeTab === "ops" && (
            <PipelineOpsView
              analytics={analytics}
              dataSource={dataSource}
              onAfterSync={handleAfterSync}
            />
          )}
        </div>
      </main>

      <footer className="mt-12 border-t border-border bg-card/60">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-subtle-foreground sm:flex-row sm:px-6 lg:px-8">
          <p className="text-center sm:text-left">
            GovTender Intelligence &middot; Deterministic OCDS &amp; CPV Engine
            &middot; Non-LLM-First Architecture
          </p>
          <div className="hidden items-center gap-3 font-mono text-[11px] text-subtle-foreground sm:flex">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded-[3px] border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                /
              </kbd>
              <span>Search Desk</span>
            </span>
            <span className="text-border-strong" aria-hidden="true">
              &middot;
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded-[3px] border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Esc
              </kbd>
              <span>Close Dossier</span>
            </span>
          </div>
        </div>
      </footer>

      {selectedTenderId && (
        <TenderDossierDrawer
          tenderId={selectedTenderId}
          fallbackTender={selectedFallbackTender}
          isBookmarked={bookmarks.has(selectedTenderId)}
          onToggleBookmark={handleDrawerToggleBookmark}
          onClose={handleCloseDrawer}
          onSelectTender={handleSelectTender}
        />
      )}
    </div>
  );
}
