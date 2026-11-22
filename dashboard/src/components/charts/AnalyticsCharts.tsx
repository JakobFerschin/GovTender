"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/card";
import { cn } from "@/lib/cn";
import {
  COUNTRY_LABELS,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/intelligence-engine";
import type { AnalyticsResponse } from "@/lib/types";

/* ── Shared Axis & Scale Helpers ────────────────────────────────────────── */

function computeNiceMax(rawMax: number): number {
  if (rawMax <= 0) return 1_000_000;
  const exponent = Math.floor(Math.log10(rawMax));
  const magnitude = Math.pow(10, exponent);
  const normalized = rawMax / magnitude;
  let niceNormalized: number;
  if (normalized <= 1.2) niceNormalized = 1.2;
  else if (normalized <= 1.5) niceNormalized = 1.5;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 3) niceNormalized = 3;
  else if (normalized <= 4) niceNormalized = 4;
  else if (normalized <= 5) niceNormalized = 5;
  else if (normalized <= 6) niceNormalized = 6;
  else if (normalized <= 8) niceNormalized = 8;
  else niceNormalized = 10;
  return niceNormalized * magnitude;
}

function ChartEmptyNotice({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-[4px] border border-dashed border-border bg-background/60 px-4 text-center text-xs text-subtle-foreground">
      {message}
    </div>
  );
}

/* ── 1. RegionalVolumeChart ─────────────────────────────────────────────── */

export interface RegionalVolumeChartProps {
  data: AnalyticsResponse["byCountry"];
  onSelectCountry?: (countryCode: string) => void;
  selectedCountry?: string;
  className?: string;
}

export function RegionalVolumeChart({
  data,
  onSelectCountry,
  selectedCountry,
  className,
}: RegionalVolumeChartProps) {
  const [hoveredCode, setHoveredCode] = React.useState<string | null>(null);

  const sorted = React.useMemo(
    () =>
      [...data].sort(
        (a, b) => b.volumeEur - a.volumeEur || b.count - a.count,
      ),
    [data],
  );

  const maxVolume = React.useMemo(
    () => Math.max(...sorted.map((d) => d.volumeEur), 1),
    [sorted],
  );
  const totalVolume = React.useMemo(
    () => sorted.reduce((sum, d) => sum + d.volumeEur, 0),
    [sorted],
  );
  const totalNotices = React.useMemo(
    () => sorted.reduce((sum, d) => sum + d.count, 0),
    [sorted],
  );

  const hoveredItem = hoveredCode
    ? sorted.find((d) => d.code === hoveredCode) ?? null
    : null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b border-border/70 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Regional Pipeline Allocation</CardTitle>
            <CardDescription className="mt-1">
              Active EUR volume &amp; share across EU / DACH jurisdictions
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm font-semibold text-primary tabular-nums-strict">
              {formatCompactCurrency(totalVolume, "EUR")}
            </div>
            <div className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
              {sorted.length} regions · {totalNotices} notices
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        {sorted.length === 0 ? (
          <ChartEmptyNotice message="No active regional pipeline data available." />
        ) : (
          <div className="space-y-1.5">
            {sorted.map((item, idx) => {
              const widthPct = Math.max(
                4,
                Math.round((item.volumeEur / maxVolume) * 100),
              );
              const isSelected = selectedCountry === item.code;
              const isHovered = hoveredCode === item.code;
              const isDimmed = hoveredCode !== null && !isHovered;
              const countryLabel = COUNTRY_LABELS[item.code] ?? item.label;
              const isInteractive = Boolean(onSelectCountry);

              return (
                <button
                  key={item.code}
                  type="button"
                  disabled={!isInteractive}
                  onClick={() => onSelectCountry?.(item.code)}
                  onMouseEnter={() => setHoveredCode(item.code)}
                  onMouseLeave={() => setHoveredCode(null)}
                  onFocus={() => setHoveredCode(item.code)}
                  onBlur={() => setHoveredCode(null)}
                  className={cn(
                    "group relative block w-full rounded-[4px] px-2.5 py-2 text-left transition-colors duration-150",
                    isInteractive && "cursor-pointer hover:bg-[#F3F5F8]",
                    isSelected && "bg-accent-blue-soft/70 ring-1 ring-accent-blue/25",
                    isDimmed && "opacity-70",
                  )}
                  aria-label={`Filter tender desk by ${countryLabel}: ${formatCurrency(item.volumeEur, "EUR")}, ${item.sharePct.toFixed(1)}% share, ${item.count} notices`}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[10px] font-semibold tracking-wider",
                          idx === 0 || isSelected
                            ? "border-primary/20 bg-primary text-primary-foreground"
                            : "border-border bg-background text-primary",
                        )}
                      >
                        {item.code}
                      </span>
                      <span className="truncate text-[13px] font-medium text-primary">
                        {countryLabel}
                      </span>
                      {isInteractive && (
                        <ArrowUpRight
                          className="h-3.5 w-3.5 shrink-0 text-accent-blue opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 items-baseline gap-2.5 font-mono tabular-nums-strict">
                      <span className="text-[11px] text-subtle-foreground">
                        {item.count} {item.count === 1 ? "notice" : "notices"}
                      </span>
                      <span className="w-11 text-right text-[11px] font-medium text-muted-foreground">
                        {item.sharePct.toFixed(1)}%
                      </span>
                      <span className="w-16 text-right text-xs font-semibold text-primary">
                        {formatCompactCurrency(item.volumeEur, "EUR")}
                      </span>
                    </div>
                  </div>

                  {/* Crisp proportional track */}
                  <div className="relative h-2 w-full overflow-hidden rounded-[2px] bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-[2px] transition-all duration-300 ease-out",
                        isHovered || isSelected
                          ? "bg-accent-blue"
                          : idx === 0
                            ? "bg-primary"
                            : "bg-[#2C4A63]",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2 text-[11px] text-subtle-foreground">
        {hoveredItem ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-primary">
              {COUNTRY_LABELS[hoveredItem.code] ?? hoveredItem.label}:{" "}
              <span className="font-mono tabular-nums-strict">
                {formatCurrency(hoveredItem.volumeEur, "EUR")}
              </span>
            </span>
            <span className="font-mono tabular-nums-strict">
              Avg{" "}
              {formatCompactCurrency(
                hoveredItem.count > 0
                  ? hoveredItem.volumeEur / hoveredItem.count
                  : 0,
                "EUR",
              )}
              /notice · {hoveredItem.sharePct.toFixed(1)}% of portfolio
            </span>
          </div>
        ) : (
          <>
            <span>
              {onSelectCountry
                ? "Select any jurisdiction to drill into active notices"
                : "Sorted by aggregate EUR pipeline volume"}
            </span>
            <span className="font-mono tabular-nums-strict">
              FX-normalized EUR
            </span>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

/* ── 2. MonthlyPipelineChart ────────────────────────────────────────────── */

export interface MonthlyPipelineChartProps {
  data: AnalyticsResponse["byDeadlineMonth"];
  className?: string;
}

export function MonthlyPipelineChart({
  data,
  className,
}: MonthlyPipelineChartProps) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  const maxRawVolume = React.useMemo(
    () => Math.max(...data.map((d) => d.volumeEur), 0),
    [data],
  );
  const niceMax = React.useMemo(() => computeNiceMax(maxRawVolume), [maxRawVolume]);

  const peakMonth = React.useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((best, cur) =>
      cur.volumeEur > best.volumeEur ? cur : best,
    );
  }, [data]);

  const totalNotices = React.useMemo(
    () => data.reduce((sum, d) => sum + d.count, 0),
    [data],
  );

  // SVG layout geometry
  const svgWidth = 560;
  const svgHeight = 250;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 26;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const slotCount = Math.max(data.length, 1);
  const slotW = plotW / slotCount;
  const barW = Math.min(44, Math.max(18, slotW * 0.52));

  const activeItem = activeIndex !== null ? data[activeIndex] ?? null : null;

  // Tooltip horizontal anchor (%) inside container
  const tooltipLeftPct =
    activeIndex !== null && data.length > 0
      ? ((padLeft + slotW * (activeIndex + 0.5)) / svgWidth) * 100
      : 50;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b border-border/70 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Submission Deadline Cadence</CardTitle>
            <CardDescription className="mt-1">
              Scheduled EUR pipeline volume &amp; notice count by closing month
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-subtle-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[1px] bg-primary" />
              Volume (EUR)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-blue" />
              Notices
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        {data.length === 0 ? (
          <ChartEmptyNotice message="No upcoming submission deadlines indexed." />
        ) : (
          <div
            className="relative select-none"
            onMouseLeave={() => setActiveIndex(null)}
          >
            {/* Floating Institutional Tooltip */}
            {activeItem && activeIndex !== null && (
              <div
                role="status"
                className={cn(
                  "pointer-events-none absolute top-1 z-20 w-48 rounded-[4px] border border-primary/15 bg-card/95 px-3 py-2.5 shadow-[var(--shadow-elevated)] backdrop-blur-[2px] transition-all duration-150",
                  tooltipLeftPct > 65
                    ? "-translate-x-[calc(100%+8px)]"
                    : tooltipLeftPct < 30
                      ? "translate-x-2"
                      : "-translate-x-1/2",
                )}
                style={{ left: `${tooltipLeftPct}%` }}
              >
                <div className="flex items-center justify-between border-b border-border/80 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
                    {activeItem.label}
                  </span>
                  <span className="font-mono text-[10px] font-medium text-accent-blue tabular-nums-strict">
                    {activeItem.count}{" "}
                    {activeItem.count === 1 ? "notice" : "notices"}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-subtle-foreground">Volume</span>
                    <span className="font-mono font-semibold text-primary tabular-nums-strict">
                      {formatCurrency(activeItem.volumeEur, "EUR")}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-subtle-foreground">Avg Deal</span>
                    <span className="font-mono text-muted-foreground tabular-nums-strict">
                      {formatCompactCurrency(
                        activeItem.count > 0
                          ? activeItem.volumeEur / activeItem.count
                          : 0,
                        "EUR",
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-[246px] w-full overflow-visible"
              role="img"
              aria-label="Monthly procurement pipeline volume by submission deadline"
            >
              {/* Horizontal Gridlines & Y-Axis Labels */}
              {yTicks.map((ratio) => {
                const value = niceMax * ratio;
                const y = padTop + plotH * (1 - ratio);
                const isBaseline = ratio === 0;
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      x2={svgWidth - padRight}
                      y1={y}
                      y2={y}
                      stroke={isBaseline ? "#CBD3DF" : "#E2E6EC"}
                      strokeWidth={isBaseline ? 1.25 : 1}
                      strokeDasharray={isBaseline ? undefined : "3 3"}
                    />
                    <text
                      x={padLeft - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-[#64748B] font-mono text-[10px] tabular-nums-strict"
                    >
                      {ratio === 0 ? "€0" : formatCompactCurrency(value, "EUR")}
                    </text>
                  </g>
                );
              })}

              {/* Columns */}
              {data.map((item, idx) => {
                const slotX = padLeft + idx * slotW;
                const barX = slotX + (slotW - barW) / 2;
                const barH = Math.max(
                  item.volumeEur > 0 ? 4 : 0,
                  (item.volumeEur / niceMax) * plotH,
                );
                const barY = padTop + plotH - barH;
                const isActive = activeIndex === idx;
                const isDimmed = activeIndex !== null && !isActive;

                // Compact X-axis label ("Apr 2026" -> "Apr '26")
                const parts = item.label.split(" ");
                const shortLabel =
                  parts.length === 2
                    ? `${parts[0]} '${parts[1].slice(2)}`
                    : item.label;

                return (
                  <g
                    key={item.month}
                    tabIndex={0}
                    role="button"
                    aria-label={`${item.label}: ${formatCurrency(item.volumeEur, "EUR")} across ${item.count} notices`}
                    className="cursor-pointer outline-none"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                    onBlur={() => setActiveIndex(null)}
                  >
                    {/* Invisible full-height hover column target */}
                    <rect
                      x={slotX + 2}
                      y={padTop - 8}
                      width={Math.max(slotW - 4, 8)}
                      height={plotH + padBottom}
                      rx={3}
                      fill={isActive ? "#EFF2F6" : "transparent"}
                      opacity={isActive ? 0.85 : 0}
                    />

                    {/* Primary Volume Column */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barH}
                      rx={2}
                      fill={isActive ? "#0052CC" : "#051C2C"}
                      opacity={isDimmed ? 0.45 : 1}
                      className="transition-all duration-150"
                    />

                    {/* Top Cap Accent Line on Hover */}
                    {isActive && (
                      <rect
                        x={barX}
                        y={barY}
                        width={barW}
                        height={2.5}
                        rx={1}
                        fill="#0D7A5F"
                      />
                    )}

                    {/* Notice Count Micro-Label Above Bar */}
                    <text
                      x={slotX + slotW / 2}
                      y={Math.max(14, barY - 7)}
                      textAnchor="middle"
                      className={cn(
                        "font-mono text-[10px] font-medium tabular-nums-strict transition-colors",
                        isActive ? "fill-[#0052CC]" : "fill-[#64748B]",
                      )}
                    >
                      {item.count}
                    </text>

                    {/* X-Axis Month Label */}
                    <text
                      x={slotX + slotW / 2}
                      y={padTop + plotH + 18}
                      textAnchor="middle"
                      className={cn(
                        "font-mono text-[10px] tabular-nums-strict transition-colors",
                        isActive
                          ? "fill-[#051C2C] font-semibold"
                          : "fill-[#475569]",
                      )}
                    >
                      {shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2 text-[11px] text-subtle-foreground">
        <span>
          {peakMonth ? (
            <>
              Peak month:{" "}
              <strong className="font-semibold text-primary">
                {peakMonth.label}
              </strong>{" "}
              <span className="font-mono tabular-nums-strict">
                ({formatCompactCurrency(peakMonth.volumeEur, "EUR")})
              </span>
            </>
          ) : (
            "No scheduled peak"
          )}
        </span>
        <span className="font-mono tabular-nums-strict">
          {totalNotices} scheduled closing{totalNotices === 1 ? "" : "s"}
        </span>
      </CardFooter>
    </Card>
  );
}

/* ── 3. SectorAllocationChart ───────────────────────────────────────────── */

export interface SectorAllocationChartProps {
  data: AnalyticsResponse["bySector"];
  onSelectSector?: (division: string) => void;
  className?: string;
}

export function SectorAllocationChart({
  data,
  onSelectSector,
  className,
}: SectorAllocationChartProps) {
  const [hoveredDiv, setHoveredDiv] = React.useState<string | null>(null);

  const ranked = React.useMemo(
    () =>
      [...data]
        .sort((a, b) => b.volumeEur - a.volumeEur || b.count - a.count)
        .slice(0, 8),
    [data],
  );

  const maxVolume = React.useMemo(
    () => Math.max(...ranked.map((s) => s.volumeEur), 1),
    [ranked],
  );
  const totalVolume = React.useMemo(
    () => data.reduce((sum, s) => sum + s.volumeEur, 0),
    [data],
  );

  const hoveredItem = hoveredDiv
    ? ranked.find((s) => s.division === hoveredDiv) ?? null
    : null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b border-border/70 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>CPV Sector Allocation</CardTitle>
            <CardDescription className="mt-1">
              Volume concentration by EU 2-digit CPV division
            </CardDescription>
          </div>
          <span className="rounded-[3px] border border-border bg-background px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            EC 213/2008
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        {ranked.length === 0 ? (
          <ChartEmptyNotice message="No CPV sector allocations indexed." />
        ) : (
          <div className="space-y-1.5">
            {ranked.map((sector, idx) => {
              const widthPct = Math.max(
                4,
                Math.round((sector.volumeEur / maxVolume) * 100),
              );
              const sharePct =
                totalVolume > 0 ? (sector.volumeEur / totalVolume) * 100 : 0;
              const isHovered = hoveredDiv === sector.division;
              const isDimmed = hoveredDiv !== null && !isHovered;
              const isInteractive = Boolean(onSelectSector);

              return (
                <button
                  key={sector.division}
                  type="button"
                  disabled={!isInteractive}
                  onClick={() => onSelectSector?.(sector.division)}
                  onMouseEnter={() => setHoveredDiv(sector.division)}
                  onMouseLeave={() => setHoveredDiv(null)}
                  onFocus={() => setHoveredDiv(sector.division)}
                  onBlur={() => setHoveredDiv(null)}
                  className={cn(
                    "group block w-full rounded-[4px] px-2.5 py-2 text-left transition-colors duration-150",
                    isInteractive && "cursor-pointer hover:bg-[#F3F5F8]",
                    isDimmed && "opacity-70",
                  )}
                  aria-label={`Filter tender desk by CPV division ${sector.division} ${sector.label}: ${formatCurrency(sector.volumeEur, "EUR")}`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide tabular-nums-strict",
                          idx === 0
                            ? "border-accent-blue/25 bg-accent-blue-soft text-accent-blue"
                            : "border-border bg-background text-primary",
                        )}
                      >
                        CPV {sector.division}
                      </span>
                      <span className="truncate text-[13px] font-medium text-primary">
                        {sector.label}
                      </span>
                      {isInteractive && (
                        <ArrowUpRight
                          className="h-3.5 w-3.5 shrink-0 text-accent-blue opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 items-baseline gap-2.5 font-mono tabular-nums-strict">
                      <span className="text-[11px] text-subtle-foreground">
                        {sector.count} {sector.count === 1 ? "tender" : "tenders"}
                      </span>
                      <span className="w-16 text-right text-xs font-semibold text-primary">
                        {formatCompactCurrency(sector.volumeEur, "EUR")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="h-2 flex-1 overflow-hidden rounded-[2px] bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-[2px] transition-all duration-300 ease-out",
                          isHovered
                            ? "bg-accent-blue"
                            : idx === 0
                              ? "bg-accent-blue"
                              : "bg-primary",
                        )}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                      {sharePct.toFixed(0)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2 text-[11px] text-subtle-foreground">
        {hoveredItem ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="truncate font-medium text-primary">
              CPV {hoveredItem.division} · {hoveredItem.label}
            </span>
            <span className="font-mono font-medium text-primary tabular-nums-strict">
              {formatCurrency(hoveredItem.volumeEur, "EUR")} ({hoveredItem.count}{" "}
              active)
            </span>
          </div>
        ) : (
          <>
            <span>
              {onSelectSector
                ? "Click a CPV division to filter the Tender Desk"
                : "Top EU CPV divisions ranked by EUR budget"}
            </span>
            <span className="font-mono tabular-nums-strict">
              {data.length} divisions tracked
            </span>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

/* ── 4. TechDemandMatrix ────────────────────────────────────────────────── */

export interface TechDemandMatrixProps {
  data: AnalyticsResponse["byTechnology"];
  onSelectTech?: (techName: string) => void;
  className?: string;
}

type TechSortMode = "volume" | "count";

export function TechDemandMatrix({
  data,
  onSelectTech,
  className,
}: TechDemandMatrixProps) {
  const [sortMode, setSortMode] = React.useState<TechSortMode>("volume");
  const [hoveredTech, setHoveredTech] = React.useState<string | null>(null);

  const ranked = React.useMemo(() => {
    const copy = [...data];
    if (sortMode === "volume") {
      copy.sort((a, b) => b.volumeEur - a.volumeEur || b.count - a.count);
    } else {
      copy.sort((a, b) => b.count - a.count || b.volumeEur - a.volumeEur);
    }
    return copy.slice(0, 8);
  }, [data, sortMode]);

  const maxMetric = React.useMemo(() => {
    if (ranked.length === 0) return 1;
    return Math.max(
      ...ranked.map((item) =>
        sortMode === "volume" ? item.volumeEur : item.count,
      ),
      1,
    );
  }, [ranked, sortMode]);

  const hoveredItem = hoveredTech
    ? ranked.find((t) => t.name === hoveredTech) ?? null
    : null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="border-b border-border/70 pb-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Technology Demand Matrix</CardTitle>
            <CardDescription className="mt-1">
              Deterministic stack tags ranked by tender density &amp; budget
            </CardDescription>
          </div>

          <div
            role="group"
            aria-label="Sort technology demand"
            className="inline-flex rounded-[4px] border border-border bg-background p-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => setSortMode("volume")}
              className={cn(
                "rounded-[3px] px-2 py-0.5 font-medium transition-colors",
                sortMode === "volume"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary",
              )}
            >
              EUR Volume
            </button>
            <button
              type="button"
              onClick={() => setSortMode("count")}
              className={cn(
                "rounded-[3px] px-2 py-0.5 font-medium transition-colors",
                sortMode === "count"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary",
              )}
            >
              Mentions
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        {ranked.length === 0 ? (
          <ChartEmptyNotice message="No structured technology tags extracted yet." />
        ) : (
          <div className="space-y-1.5">
            {ranked.map((item, idx) => {
              const metric =
                sortMode === "volume" ? item.volumeEur : item.count;
              const widthPct = Math.max(
                6,
                Math.round((metric / maxMetric) * 100),
              );
              const isHovered = hoveredTech === item.name;
              const isDimmed = hoveredTech !== null && !isHovered;
              const isInteractive = Boolean(onSelectTech);

              return (
                <button
                  key={item.name}
                  type="button"
                  disabled={!isInteractive}
                  onClick={() => onSelectTech?.(item.name)}
                  onMouseEnter={() => setHoveredTech(item.name)}
                  onMouseLeave={() => setHoveredTech(null)}
                  onFocus={() => setHoveredTech(item.name)}
                  onBlur={() => setHoveredTech(null)}
                  className={cn(
                    "group block w-full rounded-[4px] px-2.5 py-2 text-left transition-colors duration-150",
                    isInteractive && "cursor-pointer hover:bg-[#F3F5F8]",
                    isDimmed && "opacity-70",
                  )}
                  aria-label={`Filter tender desk by technology ${item.name}: ${item.count} tenders, ${formatCurrency(item.volumeEur, "EUR")}`}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate text-[13px] font-medium text-primary">
                        {item.name}
                      </span>
                      {isInteractive && (
                        <ArrowUpRight
                          className="h-3.5 w-3.5 shrink-0 text-emerald opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 items-baseline gap-2.5 font-mono tabular-nums-strict">
                      <span
                        className={cn(
                          "rounded-[3px] border px-1.5 py-0.5 text-[10px] leading-none",
                          sortMode === "count"
                            ? "border-emerald/25 bg-emerald-soft font-semibold text-emerald"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {item.count} {item.count === 1 ? "notice" : "notices"}
                      </span>
                      <span
                        className={cn(
                          "w-16 text-right text-xs",
                          sortMode === "volume"
                            ? "font-semibold text-primary"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {formatCompactCurrency(item.volumeEur, "EUR")}
                      </span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-[2px] transition-all duration-300 ease-out",
                        isHovered
                          ? "bg-accent-blue"
                          : idx < 3
                            ? "bg-emerald"
                            : "bg-[#4A6B82]",
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2 text-[11px] text-subtle-foreground">
        {hoveredItem ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-primary">
              {hoveredItem.name} ·{" "}
              <span className="font-mono tabular-nums-strict">
                {formatCurrency(hoveredItem.volumeEur, "EUR")}
              </span>
            </span>
            <span className="font-mono tabular-nums-strict">
              Avg{" "}
              {formatCompactCurrency(
                hoveredItem.count > 0
                  ? hoveredItem.volumeEur / hoveredItem.count
                  : 0,
                "EUR",
              )}
              /tender
            </span>
          </div>
        ) : (
          <>
            <span>
              {onSelectTech
                ? "Click any technology to filter matching notices"
                : "Zero-LLM deterministic regex & CPV taxonomy tags"}
            </span>
            <span className="font-mono tabular-nums-strict">
              Top {ranked.length} of {data.length} tags
            </span>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
