"use client";

import * as React from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Loader2,
  Play,
  Server,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/card";
import {
  DataSourceBadge,
  ExecutiveKpiCard,
  ScoreBar,
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
import type {
  AnalyticsResponse,
  DataSourceMode,
  IngestTriggerResponse,
  SourceHealthItem,
} from "@/lib/types";

export interface PipelineOpsViewProps {
  analytics: AnalyticsResponse | null;
  dataSource: DataSourceMode;
  onAfterSync?: () => void;
}

const MODE_BADGE_CONFIG: Record<
  SourceHealthItem["mode"],
  { label: string; variant: "emerald" | "amber" | "muted" }
> = {
  live: { label: "LIVE", variant: "emerald" },
  sandbox: { label: "SANDBOX", variant: "amber" },
  disabled: { label: "DISABLED", variant: "muted" },
};

const STATUS_BADGE_CONFIG: Record<
  SourceHealthItem["status"],
  { label: string; variant: "emerald" | "amber" | "muted"; dotClass: string }
> = {
  operational: {
    label: "Operational",
    variant: "emerald",
    dotClass: "bg-emerald",
  },
  degraded: {
    label: "Degraded",
    variant: "amber",
    dotClass: "bg-amber",
  },
  unconfigured: {
    label: "Unconfigured",
    variant: "muted",
    dotClass: "bg-subtle-foreground",
  },
};

const PIPELINE_STAGES = [
  {
    step: "01",
    title: "OCDS Parse",
    icon: FileCode2,
    tag: "Deterministic Schema",
    description:
      "Ingests structured Open Contracting Data Standard JSON/XML feeds across TED, SIMAP, eVergabe, Auftragsportal, BOAMP, and Appalti BZ with retry & schema validation.",
  },
  {
    step: "02",
    title: "CPV & Country Normalize",
    icon: GitBranch,
    tag: "Prefix Expansion 2..8",
    description:
      "Canonicalizes raw CPV codes into 8-digit keys and expands 2..8-digit hierarchical prefixes plus ISO-3166 region & EUR FX normalization for exact SQL overlap.",
  },
  {
    step: "03",
    title: "Deterministic Tech Extract",
    icon: Cpu,
    tag: "Non-LLM-First + Optional Mistral",
    description:
      "Applies curated zero-cost regex & procurement lexicon matchers for ~90%+ deterministic technology extraction; invokes optional Mistral fallback only for unstructured specs.",
  },
  {
    step: "04",
    title: "Supabase Upsert",
    icon: Database,
    tag: "Idempotent Index",
    description:
      "Commits deduplicated notices into tenders and historical_awards tables, immediately feeding CPV incumbent winner predictions and 4-axis Bid/No-Bid scorecards.",
  },
] as const;

function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 19) || "00:00:00";
  return d.toISOString().slice(11, 23);
}

function formatSyncTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function PipelineOpsView({
  analytics,
  dataSource,
  onAfterSync,
}: PipelineOpsViewProps) {
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] =
    React.useState<IngestTriggerResponse | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const sources = React.useMemo(() => analytics?.sources ?? [], [analytics]);

  const opsSummary = React.useMemo(() => {
    const operationalCount = sources.filter(
      (s) => s.status === "operational",
    ).length;
    const totalNotices = sources.reduce((sum, s) => sum + s.noticesTracked, 0);
    const activeLatencySources = sources.filter((s) => s.avgLatencyMs > 0);
    const avgLatency =
      activeLatencySources.length > 0
        ? Math.round(
            activeLatencySources.reduce((sum, s) => sum + s.avgLatencyMs, 0) /
              activeLatencySources.length,
          )
        : 0;
    const deterministicPct =
      analytics?.kpis.deterministicExtractionPct ??
      (sources.length > 0
        ? Math.round(
            sources.reduce((sum, s) => sum + s.deterministicRatePct, 0) /
              sources.length,
          )
        : 0);

    return {
      operationalCount,
      totalConnectors: sources.length,
      totalNotices,
      avgLatency,
      deterministicPct,
    };
  }, [analytics, sources]);

  const handleRunSync = React.useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await res.json()) as IngestTriggerResponse & {
        error?: string;
      };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? `Ingestion failed (HTTP ${res.status})`);
      }

      setSyncResult(payload);
      onAfterSync?.();
    } catch (err: unknown) {
      setSyncError(
        err instanceof Error ? err.message : "Failed to execute pipeline sync",
      );
    } finally {
      setSyncing(false);
    }
  }, [syncing, onAfterSync]);

  return (
    <section className="space-y-6">
      <SectionHeader
        kicker="INGESTION & DATA OPS"
        title="Multi-Platform Source Connectors"
        subtitle="Non-LLM-First deterministic OCDS ingestion telemetry, connector latency diagnostics, and on-demand synchronization across European procurement portals."
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <DataSourceBadge mode={dataSource} />
            <button
              type="button"
              onClick={handleRunSync}
              disabled={syncing}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-[4px] border border-primary bg-primary px-4 text-xs font-medium text-primary-foreground shadow-[var(--shadow-card)] transition-colors",
                syncing
                  ? "cursor-wait opacity-80"
                  : "hover:bg-primary/90",
              )}
            >
              {syncing ? (
                <>
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Running Pipeline Sync…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Run Pipeline Sync
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Ops KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ExecutiveKpiCard
          label="Connector Health"
          value={
            analytics
              ? `${opsSummary.operationalCount} / ${opsSummary.totalConnectors}`
              : "—"
          }
          delta={
            analytics && opsSummary.operationalCount === opsSummary.totalConnectors
              ? "100% UP"
              : analytics
                ? "MONITORED"
                : undefined
          }
          deltaTone={
            opsSummary.operationalCount === opsSummary.totalConnectors
              ? "positive"
              : "caution"
          }
          sub="European national & EU TED feeds"
          icon={Server}
        />
        <ExecutiveKpiCard
          label="Notices Indexed"
          value={analytics ? opsSummary.totalNotices.toLocaleString() : "—"}
          sub="Active tenders & historical awards tracked"
          icon={Database}
        />
        <ExecutiveKpiCard
          label="Avg Connector Latency"
          value={analytics ? `${opsSummary.avgLatency} ms` : "—"}
          delta={opsSummary.avgLatency > 0 && opsSummary.avgLatency <= 500 ? "LOW" : undefined}
          deltaTone="positive"
          sub="Mean OCDS fetch & parse turnaround"
          icon={Activity}
        />
        <ExecutiveKpiCard
          label="Deterministic Tech Rate"
          value={analytics ? `${opsSummary.deterministicPct}%` : "—"}
          delta="ZERO-LLM"
          deltaTone="positive"
          sub="Extracted via regex/lexicon before LLM fallback"
          icon={Cpu}
        />
      </div>

      {/* Error Alert from Sync Trigger */}
      {syncError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-crimson/25 bg-crimson-soft px-4 py-3 text-xs text-crimson"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-semibold">Pipeline Sync Error</div>
            <p className="mt-0.5 text-crimson/90">{syncError}</p>
          </div>
        </div>
      )}

      {/* Live Pipeline Sync Run Report & Execution Log */}
      {syncResult && (
        <Card className="border-t-2 border-t-accent-blue animate-fade-up">
          <CardHeader className="border-b border-border/80 pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 text-emerald"
                  aria-hidden="true"
                />
                <CardTitle className="text-primary">
                  Latest Pipeline Sync Run Report
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    syncResult.mode === "supabase" ? "emerald" : "amber"
                  }
                  className="font-mono text-[10px] uppercase"
                >
                  {syncResult.mode}
                </Badge>
                <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                  {formatSyncTime(syncResult.startedAt)} · {syncResult.durationMs}ms
                </span>
              </div>
            </div>
            <CardDescription>
              Deterministic ingestion pass completed across{" "}
              {syncResult.sourcesRun} source connector
              {syncResult.sourcesRun === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Run KPI Strip */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "Duration",
                  value: `${syncResult.durationMs}ms`,
                },
                {
                  label: "Sources Run",
                  value: String(syncResult.sourcesRun),
                },
                {
                  label: "Releases Parsed",
                  value: syncResult.releasesProcessed.toLocaleString(),
                },
                {
                  label: "Tenders Upserted",
                  value: syncResult.tendersUpserted.toLocaleString(),
                },
                {
                  label: "Awards Upserted",
                  value: syncResult.awardsUpserted.toLocaleString(),
                },
                {
                  label: "Determ. / LLM",
                  value: `${syncResult.deterministicTechCount} / ${syncResult.llmFallbackCount}`,
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[4px] border border-border bg-background/70 px-3 py-2"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">
                    {metric.label}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-primary tabular-nums-strict">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Timestamped Institutional Execution Log */}
            <div className="overflow-hidden rounded-[4px] border border-primary/20 bg-[#071826] text-[#E2E8F0]">
              <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
                <div className="flex items-center gap-2 font-mono text-[11px] font-medium text-[#94A3B8]">
                  <Terminal className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
                  <span>ingestion-runner.log</span>
                </div>
                <span className="font-mono text-[10px] text-[#64748B] tabular-nums-strict">
                  {syncResult.logs.length} events
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto px-3.5 py-2.5 font-mono text-[11px] leading-5">
                {syncResult.logs.map((entry, idx) => (
                  <div
                    key={`${entry.timestamp}-${idx}`}
                    className="flex items-start gap-2.5 py-0.5"
                  >
                    <span className="shrink-0 text-[#64748B] tabular-nums-strict">
                      {formatLogTimestamp(entry.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "w-12 shrink-0 font-semibold uppercase",
                        entry.level === "success"
                          ? "text-[#34D399]"
                          : entry.level === "warn"
                            ? "text-[#FBBF24]"
                            : "text-[#60A5FA]",
                      )}
                    >
                      [{entry.level === "success" ? "OK" : entry.level.toUpperCase()}]
                    </span>
                    <span className="w-24 shrink-0 truncate text-[#CBD5E1]">
                      {entry.source}
                    </span>
                    <span className="min-w-0 flex-1 text-[#F1F5F9]">
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Connector Health Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/80 pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Procurement Source Connector Matrix</CardTitle>
              <CardDescription className="mt-1">
                Live operational diagnostics, regional coverage, and
                deterministic extraction yield by feed.
              </CardDescription>
            </div>
            {analytics?.generatedAt && (
              <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                Snapshot {formatSyncTime(analytics.generatedAt)}
              </span>
            )}
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[170px]">Platform</TableHead>
              <TableHead className="min-w-[120px]">Region</TableHead>
              <TableHead className="w-[105px]">Mode</TableHead>
              <TableHead className="w-[125px]">Status</TableHead>
              <TableHead className="w-[120px] text-right">
                Notices Tracked
              </TableHead>
              <TableHead className="w-[115px] text-right">
                Avg Latency
              </TableHead>
              <TableHead className="w-[165px]">
                Deterministic Tech Rate
              </TableHead>
              <TableHead className="min-w-[230px]">Notes</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sources.length === 0
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`ops-skeleton-${idx}`} className="hover:bg-card">
                    <TableCell colSpan={8} className="py-3.5">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : sources.map((item) => {
                  const modeCfg = MODE_BADGE_CONFIG[item.mode];
                  const statusCfg = STATUS_BADGE_CONFIG[item.status];
                  return (
                    <TableRow key={item.source}>
                      <TableCell>
                        <div className="font-medium text-primary">
                          {item.label}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-subtle-foreground">
                          {item.source}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.region}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={modeCfg.variant}
                          className="font-mono text-[10px]"
                        >
                          {modeCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant} className="text-[11px]">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              statusCfg.dotClass,
                            )}
                            aria-hidden="true"
                          />
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-primary tabular-nums-strict">
                        {item.noticesTracked.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums-strict">
                        {item.avgLatencyMs > 0 ? `${item.avgLatencyMs} ms` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-20">
                            <ScoreBar
                              value={item.deterministicRatePct}
                              tone={
                                item.deterministicRatePct >= 88
                                  ? "emerald"
                                  : item.deterministicRatePct >= 70
                                    ? "cobalt"
                                    : "amber"
                              }
                            />
                          </div>
                          <span className="font-mono text-[11px] font-medium text-primary tabular-nums-strict">
                            {item.deterministicRatePct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs leading-snug text-muted-foreground">
                          {item.notes}
                        </p>
                        <span className="mt-0.5 block font-mono text-[10px] text-subtle-foreground tabular-nums-strict">
                          Last sync: {formatSyncTime(item.lastSyncIso)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </Card>

      {/* Architectural Telemetry Card: 4-Stage Deterministic Pipeline */}
      <Card className="border-t-2 border-t-primary">
        <CardHeader className="border-b border-border/80 pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>
                Non-LLM-First Deterministic Pipeline Architecture
              </CardTitle>
              <CardDescription className="mt-1">
                Four-stage auditable ingestion &amp; enrichment workflow
                designed for zero-hallucination public procurement intelligence.
              </CardDescription>
            </div>
            <Badge variant="cobalt" className="font-mono text-[10px]">
              OCDS v1.1 · CPV 2..8 · SQL Overlap
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            {PIPELINE_STAGES.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.step}
                  className="relative flex flex-col justify-between rounded-md border border-border bg-background/60 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-accent-blue tabular-nums-strict">
                        STAGE {stage.step}
                      </span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-border bg-card text-primary">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                    </div>

                    <h4 className="mt-3 font-serif text-base font-semibold tracking-tight text-primary">
                      {stage.title}
                    </h4>

                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between border-t border-border/70 pt-2.5">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-subtle-foreground">
                      {stage.tag}
                    </span>
                    {index < PIPELINE_STAGES.length - 1 && (
                      <ArrowRight
                        className="hidden h-3.5 w-3.5 text-subtle-foreground lg:block"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
