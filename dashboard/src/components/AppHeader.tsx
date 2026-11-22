"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { DataSourceBadge } from "@/components/primitives";
import type { DataSourceMode } from "@/lib/types";

export type AppTab = "overview" | "desk" | "radar" | "ops";

export interface AppHeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  activeTenderCount: number | null;
  dataSource: DataSourceMode;
  loading: boolean;
  watchlistCount: number;
  watchlistActive: boolean;
  onWatchlistToggle: () => void;
}

interface NavTabItem {
  id: AppTab;
  label: string;
  shortLabel: string;
}

const NAV_TABS: NavTabItem[] = [
  { id: "overview", label: "Overview", shortLabel: "Overview" },
  { id: "desk", label: "Tender Desk", shortLabel: "Desk" },
  { id: "radar", label: "Competitive Radar", shortLabel: "Radar" },
  { id: "ops", label: "Pipeline Ops", shortLabel: "Ops" },
];

export function AppHeader({
  activeTab,
  onTabChange,
  activeTenderCount,
  dataSource,
  loading,
  watchlistCount,
  watchlistActive,
  onWatchlistToggle,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Primary top bar */}
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Left: Institutional Brand Mark */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => onTabChange("overview")}
              className="group flex items-center gap-2.5 text-left focus-visible:rounded-[4px]"
              aria-label="GovTender Intelligence — Return to Executive Overview"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-primary font-serif text-[13px] font-bold tracking-tight text-primary-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-colors group-hover:bg-primary/90"
                aria-hidden="true"
              >
                GT
              </span>
              <span className="truncate font-serif text-[17px] font-bold tracking-tight text-primary">
                GovTender Intelligence
              </span>
            </button>

            <span
              className="hidden h-4 w-px shrink-0 bg-border-strong xl:block"
              aria-hidden="true"
            />
            <span className="hidden truncate text-[11px] font-medium tracking-[0.03em] text-muted-foreground xl:inline">
              EU &amp; DACH Procurement Advisory
            </span>
          </div>

          {/* Center: Clean 4-Tab Navigation (Desktop) */}
          <nav
            aria-label="Primary sections"
            className="hidden h-full items-stretch gap-1 lg:flex"
          >
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-full items-center gap-2 px-3.5 text-[13px] tracking-[-0.005em] transition-colors",
                    isActive
                      ? "font-semibold text-primary"
                      : "font-medium text-muted-foreground hover:text-primary",
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.id === "desk" && activeTenderCount !== null && (
                    <span
                      className={cn(
                        "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tabular-nums-strict transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {activeTenderCount.toLocaleString()}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute inset-x-2 bottom-0 h-[2px] transition-opacity",
                      isActive ? "bg-primary opacity-100" : "bg-primary/30 opacity-0",
                    )}
                  />
                </button>
              );
            })}
          </nav>

          {/* Right: Telemetry Badge + Watchlist Toggle */}
          <div className="flex shrink-0 items-center gap-2.5">
            <DataSourceBadge
              mode={dataSource}
              loading={loading}
              className="hidden sm:inline-flex"
            />

            <button
              type="button"
              onClick={onWatchlistToggle}
              aria-pressed={watchlistActive}
              title={
                watchlistActive
                  ? "Showing watchlisted tenders — click to show all"
                  : "Open Tender Desk filtered to watchlisted opportunities"
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-xs font-medium transition-colors",
                watchlistActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-border-strong hover:bg-muted/60",
              )}
            >
              {watchlistActive ? (
                <BookmarkCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Bookmark
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="hidden sm:inline">Watchlist</span>
              <span
                className={cn(
                  "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tabular-nums-strict",
                  watchlistActive
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-muted text-primary",
                )}
              >
                {watchlistCount}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Navigation Bar */}
        <nav
          aria-label="Primary sections"
          className="-mx-4 flex items-stretch overflow-x-auto border-t border-border/80 px-4 sm:-mx-6 sm:px-6 lg:hidden"
        >
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap transition-colors",
                  isActive
                    ? "font-semibold text-primary"
                    : "font-medium text-muted-foreground hover:text-primary",
                )}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === "desk" && activeTenderCount !== null && (
                  <span
                    className={cn(
                      "rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tabular-nums-strict",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {activeTenderCount.toLocaleString()}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-x-2 bottom-0 h-[2px]",
                    isActive ? "bg-primary opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}

          <div className="ml-auto flex shrink-0 items-center pl-3 sm:hidden">
            <DataSourceBadge mode={dataSource} loading={loading} />
          </div>
        </nav>
      </div>
    </header>
  );
}
