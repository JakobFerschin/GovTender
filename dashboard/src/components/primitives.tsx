import * as React from "react";
import { Loader2, FileSearch } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/badge";

/* ── ExecutiveKpiCard ───────────────────────────────────────────────────── */

export interface ExecutiveKpiCardProps {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaTone?: "positive" | "neutral" | "caution";
  icon?: React.ElementType;
  className?: string;
}

const DELTA_TONE_STYLES: Record<
  NonNullable<ExecutiveKpiCardProps["deltaTone"]>,
  string
> = {
  positive: "text-emerald bg-emerald-soft border-emerald/20",
  neutral: "text-muted-foreground bg-muted border-border",
  caution: "text-amber bg-amber-soft border-amber/20",
};

export function ExecutiveKpiCard({
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  icon: Icon,
  className,
}: ExecutiveKpiCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-md border border-border border-t-2 border-t-primary bg-card px-5 py-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground leading-4">
          {label}
        </span>
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0 text-subtle-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="font-serif text-[28px] font-semibold leading-none tracking-tight text-primary tabular-nums-strict">
          {value}
        </div>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums-strict",
              DELTA_TONE_STYLES[deltaTone],
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {sub && (
        <p className="mt-2.5 border-t border-border/60 pt-2 text-xs leading-4 text-subtle-foreground">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── SectionHeader ──────────────────────────────────────────────────────── */

export interface SectionHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  kicker,
  title,
  subtitle,
  right,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-4 border-b border-border sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-blue">
            {kicker}
          </p>
        )}
        <h2 className="font-serif text-xl font-semibold tracking-tight text-primary sm:text-2xl leading-snug">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {right && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {right}
        </div>
      )}
    </div>
  );
}

/* ── ScoreBar ───────────────────────────────────────────────────────────── */

export type ScoreBarTone = "navy" | "cobalt" | "emerald" | "amber" | "crimson";

export interface ScoreBarProps {
  value: number;
  max?: number;
  label?: string;
  tone?: ScoreBarTone;
  className?: string;
}

const SCORE_BAR_FILL: Record<ScoreBarTone, string> = {
  navy: "bg-primary",
  cobalt: "bg-accent-blue",
  emerald: "bg-emerald",
  amber: "bg-amber",
  crimson: "bg-crimson",
};

const SCORE_BAR_TEXT: Record<ScoreBarTone, string> = {
  navy: "text-primary",
  cobalt: "text-accent-blue",
  emerald: "text-emerald",
  amber: "text-amber",
  crimson: "text-crimson",
};

export function ScoreBar({
  value,
  max = 100,
  label,
  tone = "navy",
  className,
}: ScoreBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = Math.round((clamped / safeMax) * 100);

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {label !== undefined && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-medium text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] font-medium tabular-nums-strict",
              SCORE_BAR_TEXT[tone],
            )}
          >
            {Math.round(clamped)}
            {safeMax === 100 ? "%" : ` / ${safeMax}`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? "Score"}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        className="h-1.5 w-full overflow-hidden rounded-[2px] bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-[2px] transition-[width] duration-300 ease-out",
            SCORE_BAR_FILL[tone],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── RecommendationBadge ────────────────────────────────────────────────── */

export type RecommendationVerdict = "STRONG BID" | "EVALUATE" | "PASS";

export interface RecommendationBadgeProps {
  verdict: RecommendationVerdict;
  className?: string;
}

const VERDICT_CONFIG: Record<
  RecommendationVerdict,
  { variant: "emerald" | "amber" | "muted"; dotClass: string }
> = {
  "STRONG BID": {
    variant: "emerald",
    dotClass: "bg-emerald",
  },
  EVALUATE: {
    variant: "amber",
    dotClass: "bg-amber",
  },
  PASS: {
    variant: "muted",
    dotClass: "bg-subtle-foreground",
  },
};

export function RecommendationBadge({
  verdict,
  className,
}: RecommendationBadgeProps) {
  const cfg = VERDICT_CONFIG[verdict];
  return (
    <Badge
      variant={cfg.variant}
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-[1px]", cfg.dotClass)}
        aria-hidden="true"
      />
      {verdict}
    </Badge>
  );
}

/* ── DataSourceBadge ────────────────────────────────────────────────────── */

export interface DataSourceBadgeProps {
  mode: "supabase" | "sandbox";
  loading?: boolean;
  count?: number;
  className?: string;
}

export function DataSourceBadge({
  mode,
  loading = false,
  count,
  className,
}: DataSourceBadgeProps) {
  if (loading) {
    return (
      <Badge variant="muted" className={cn("font-mono text-[11px]", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
        <span>Connecting data source…</span>
      </Badge>
    );
  }

  const isLive = mode === "supabase";

  return (
    <Badge
      variant={isLive ? "emerald" : "amber"}
      className={cn("font-mono text-[11px] tabular-nums-strict", className)}
      title={
        isLive
          ? "Connected to live Supabase procurement database"
          : "Operating on deterministic sandbox dataset (no live Supabase connection)"
      }
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0",
          isLive ? "rounded-full bg-emerald" : "rounded-[1px] bg-amber",
        )}
        aria-hidden="true"
      />
      <span>{isLive ? "Live Supabase DB" : "Deterministic Sandbox Engine"}</span>
      {typeof count === "number" && (
        <span className="ml-0.5 opacity-75">· {count.toLocaleString()}</span>
      )}
    </Badge>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────── */

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong bg-card/70 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[4px] border border-border bg-background text-muted-foreground">
        <FileSearch className="h-4 w-4" aria-hidden="true" />
      </div>
      <h3 className="font-serif text-base font-semibold tracking-tight text-primary">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
