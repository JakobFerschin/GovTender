"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Compass,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/badge";
import {
  RecommendationBadge,
  ScoreBar,
  type ScoreBarTone,
} from "@/components/primitives";
import {
  COUNTRY_LABELS,
  PROCEDURE_LABELS,
  SOURCE_LABELS,
  daysUntil,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/intelligence-engine";
import type {
  TenderDetailResponse,
  TenderWithIntelligence,
  WinnerPrediction,
} from "@/lib/types";

export interface TenderDossierDrawerProps {
  tenderId: string | null;
  fallbackTender: TenderWithIntelligence | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onClose: () => void;
  onSelectTender: (id: string) => void;
}

function scoreToTone(score: number): ScoreBarTone {
  if (score >= 80) return "emerald";
  if (score >= 65) return "cobalt";
  if (score >= 45) return "amber";
  return "crimson";
}

function formatDateLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildExecutiveMemoMarkdown(tender: TenderWithIntelligence): string {
  const days = daysUntil(tender.deadline);
  const deadlineStatus =
    days < 0 || tender.status !== "active"
      ? `Closed (${Math.abs(days)}d ago)`
      : `${days}d remaining`;
  const countryName = COUNTRY_LABELS[tender.country] ?? tender.country;
  const platformName = SOURCE_LABELS[tender.source] ?? tender.source;
  const procedureName = PROCEDURE_LABELS[tender.procedure] ?? tender.procedure;
  const budgetText =
    tender.budget != null
      ? `${formatCurrency(tender.budget, tender.currency)} (${formatCompactCurrency(tender.budget, tender.currency)})`
      : "Undisclosed";

  const topIncumbent = tender.winnerPredictions[0];
  const incumbentSummary = topIncumbent
    ? `${topIncumbent.winnerName} (${topIncumbent.winnerCountry}) — ${topIncumbent.confidencePct}% confidence across ${topIncumbent.winCount} matched award(s), avg ${formatCompactCurrency(topIncumbent.avgContractValue, "EUR")}`
    : "Open competitive field (no historical CPV incumbent matched)";

  const lines = [
    `# Bid / No-Bid Executive Dossier — ${tender.title}`,
    "",
    `**Verdict:** ${tender.scorecard.verdict} (${tender.scorecard.overallScore} / 100)`,
    `**Awarding Authority:** ${tender.authority}`,
    `**Region & Platform:** ${countryName} (${tender.country}) · ${platformName} · Ref \`${tender.sourceId}\``,
    `**Estimated Budget:** ${budgetText}`,
    `**Submission Deadline:** ${formatDateLabel(tender.deadline)} (${deadlineStatus})`,
    `**Procedure:** ${procedureName}`,
    `**CPV Classification:** ${tender.cpvSector} (${tender.cpvCodes.join(", ") || "N/A"})`,
    "",
    "## Executive Rationale",
    tender.scorecard.rationale,
    "",
    "## 4-Axis Bid Scorecard",
    `- CPV Alignment: ${tender.scorecard.cpvFit}/100`,
    `- Geographic Fit: ${tender.scorecard.geographicFit}/100`,
    `- Budget Attractiveness: ${tender.scorecard.budgetAttractiveness}/100`,
    `- Timeline Feasibility: ${tender.scorecard.timelineFeasibility}/100`,
    "",
    "## Risk Flags",
    ...tender.scorecard.riskFlags.map((flag) => `- ${flag}`),
    "",
    "## Strategic Priorities",
    ...tender.scorecard.strategicPriorities.map((item) => `- ${item}`),
    "",
    "## Incumbent Intelligence",
    `- Lead Predicted Incumbent: ${incumbentSummary}`,
    `- Required Technologies: ${tender.technologies.length > 0 ? tender.technologies.join(", ") : "None explicitly detected"}`,
    "",
    `Official Notice: ${tender.sourceUrl}`,
  ];

  return lines.join("\n");
}

function WinnerPredictionCard({
  prediction,
  rank,
}: {
  prediction: WinnerPrediction;
  rank: number;
}) {
  const [expanded, setExpanded] = React.useState(rank === 1);
  const countryLabel =
    COUNTRY_LABELS[prediction.winnerCountry] ?? prediction.winnerCountry;

  return (
    <div className="rounded-md border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] font-mono text-[11px] font-semibold tabular-nums-strict",
                rank === 1
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted text-muted-foreground",
              )}
            >
              #{rank}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="truncate text-sm font-semibold text-primary">
                  {prediction.winnerName}
                </h4>
                <Badge variant="muted" className="font-mono text-[10px]">
                  {prediction.winnerCountry} · {countryLabel}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle-foreground">
                <span className="font-mono tabular-nums-strict">
                  {prediction.winCount} matched win
                  {prediction.winCount === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums-strict">
                  Avg{" "}
                  {formatCompactCurrency(prediction.avgContractValue, "EUR")}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums-strict">
                  Latest {formatDateLabel(prediction.latestAwardDate)}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-mono text-base font-semibold leading-none text-primary tabular-nums-strict">
              {prediction.confidencePct}%
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-subtle-foreground">
              Confidence
            </div>
          </div>
        </div>

        <div className="mt-3">
          <ScoreBar
            value={prediction.confidencePct}
            tone={
              prediction.confidencePct >= 75
                ? "amber"
                : prediction.confidencePct >= 55
                  ? "cobalt"
                  : "navy"
            }
          />
        </div>

        {/* Expandable Historical Award Precedents */}
        {prediction.awards.length > 0 && (
          <div className="mt-3 border-t border-border/70 pt-2.5">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between text-left text-[11px] font-medium text-accent-blue hover:underline"
            >
              <span>
                {expanded ? "Hide" : "Inspect"} {prediction.awards.length}{" "}
                historical award precedent
                {prediction.awards.length === 1 ? "" : "s"}
              </span>
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            {expanded && (
              <div className="mt-2.5 space-y-2">
                {prediction.awards.map((award) => (
                  <div
                    key={award.id}
                    className="rounded-[4px] border border-border/80 bg-background/70 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium leading-snug text-primary">
                        {award.awardTitle}
                      </p>
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-primary tabular-nums-strict">
                        {formatCompactCurrency(
                          award.contractValue,
                          award.currency,
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {award.sharedCpvPrefixes.slice(-4).map((prefix) => (
                          <span
                            key={prefix}
                            className="rounded-[2px] border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground"
                          >
                            CPV {prefix}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-[10px] text-subtle-foreground tabular-nums-strict">
                        {formatDateLabel(award.awardDate)} · Match pts{" "}
                        {award.score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TenderDossierDrawer({
  tenderId,
  fallbackTender,
  isBookmarked,
  onToggleBookmark,
  onClose,
  onSelectTender,
}: TenderDossierDrawerProps) {
  const [fetched, setFetched] = React.useState<{
    id: string;
    data: TenderDetailResponse;
  } | null>(null);
  const [fetchError, setFetchError] = React.useState<{
    id: string;
    message: string;
  } | null>(null);
  const [copiedMemo, setCopiedMemo] = React.useState(false);

  // Hydrate full detail & similar tenders when tenderId changes
  React.useEffect(() => {
    if (!tenderId) return;

    const controller = new AbortController();
    fetch(`/api/tenders/${encodeURIComponent(tenderId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as TenderDetailResponse;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setFetched({ id: tenderId, data });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to hydrate dossier";
        setFetchError({ id: tenderId, message });
      });

    return () => controller.abort();
  }, [tenderId]);

  // Close on Escape key & lock background scroll while open
  React.useEffect(() => {
    if (!tenderId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [tenderId, onClose]);

  const activeTender: TenderWithIntelligence | null = React.useMemo(() => {
    if (!tenderId) return null;
    if (fetched?.id === tenderId) return fetched.data.tender;
    if (fallbackTender && fallbackTender.id === tenderId) return fallbackTender;
    return fallbackTender;
  }, [tenderId, fetched, fallbackTender]);

  const similarTenders = React.useMemo(() => {
    if (!tenderId || fetched?.id !== tenderId) return [];
    return fetched.data.similarTenders;
  }, [tenderId, fetched]);

  const isHydrating =
    Boolean(tenderId) &&
    fetched?.id !== tenderId &&
    fetchError?.id !== tenderId;

  const handleCopyMemo = React.useCallback(async () => {
    if (!activeTender) return;
    const memo = buildExecutiveMemoMarkdown(activeTender);
    try {
      await navigator.clipboard.writeText(memo);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = memo;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedMemo(true);
    window.setTimeout(() => setCopiedMemo(false), 2200);
  }, [activeTender]);

  if (!tenderId) return null;

  const daysRemaining = activeTender ? daysUntil(activeTender.deadline) : 0;
  const isExpired = activeTender
    ? daysRemaining < 0 || activeTender.status !== "active"
    : false;
  const deadlineBadgeVariant = isExpired
    ? "muted"
    : daysRemaining <= 14
      ? "crimson"
      : daysRemaining <= 30
        ? "amber"
        : "muted";
  const deadlineBadgeText = isExpired
    ? "Expired"
    : daysRemaining === 0
      ? "Due today"
      : `${daysRemaining}d left`;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={
        activeTender
          ? `Strategic Dossier: ${activeTender.title}`
          : "Tender Strategic Dossier"
      }
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-primary/30 backdrop-blur-[1.5px] animate-fade-in"
        aria-hidden="true"
      />

      {/* Right Slide-Over Dossier */}
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border-strong bg-card shadow-[var(--shadow-drawer)] animate-slide-in">
        {/* Sticky Executive Header */}
        <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-3.5 backdrop-blur-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {activeTender ? (
              <>
                <span className="rounded-[3px] border border-border-strong bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  {activeTender.sourceId}
                </span>
                <Badge variant="default" className="font-mono text-[10px]">
                  {activeTender.country}
                </Badge>
                <Badge variant="muted" className="font-mono text-[10px]">
                  {SOURCE_LABELS[activeTender.source] ?? activeTender.source}
                </Badge>
                <Badge
                  variant={deadlineBadgeVariant}
                  className="font-mono text-[10px] tabular-nums-strict"
                >
                  {deadlineBadgeText}
                </Badge>
                <RecommendationBadge verdict={activeTender.scorecard.verdict} />
              </>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                Loading tender dossier…
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dossier drawer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border bg-background text-muted-foreground transition-colors hover:border-border-strong hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!activeTender ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2
                className="h-5 w-5 animate-spin text-accent-blue"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Retrieving procurement dossier &amp; CPV intelligence…
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Executive Title & Metadata */}
              <section className="space-y-3 border-b border-border pb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-blue">
                  BID / NO-BID STRATEGIC DOSSIER
                </p>
                <h2 className="font-serif text-xl font-semibold leading-snug tracking-tight text-primary sm:text-[22px]">
                  {activeTender.title}
                </h2>

                <div className="grid grid-cols-1 gap-2.5 pt-1 text-xs sm:grid-cols-2">
                  <div className="flex items-start gap-2 rounded-[4px] border border-border/80 bg-background/60 px-3 py-2">
                    <Building2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">
                        Awarding Authority
                      </div>
                      <div className="mt-0.5 font-medium text-primary">
                        {activeTender.authority}
                      </div>
                      <div className="text-[11px] text-subtle-foreground">
                        {COUNTRY_LABELS[activeTender.country] ??
                          activeTender.country}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-[4px] border border-border/80 bg-background/60 px-3 py-2">
                    <Calendar
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle-foreground">
                        Commercials &amp; Timeline
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-sm font-semibold text-primary tabular-nums-strict">
                          {formatCurrency(
                            activeTender.budget,
                            activeTender.currency,
                          )}
                        </span>
                        <span className="text-[11px] text-subtle-foreground">
                          ·{" "}
                          {PROCEDURE_LABELS[activeTender.procedure] ??
                            activeTender.procedure}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                        Published {formatDateLabel(activeTender.publicationDate)}{" "}
                        · Due {formatDateLabel(activeTender.deadline)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* McKinsey Bid/No-Bid Strategic Scorecard */}
              <section className="rounded-md border border-border border-t-2 border-t-primary bg-card p-4 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      <Compass className="h-3.5 w-3.5 text-accent-blue" aria-hidden="true" />
                      Bid / No-Bid Strategic Scorecard
                    </div>
                    <p className="mt-0.5 text-xs text-subtle-foreground">
                      Weighted deterministic assessment: CPV 30% · Geo 20% ·
                      Budget 25% · Timeline 25%
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-serif text-2xl font-semibold leading-none text-primary tabular-nums-strict">
                        {activeTender.scorecard.overallScore}
                        <span className="ml-1 font-mono text-xs font-normal text-subtle-foreground">
                          / 100
                        </span>
                      </div>
                    </div>
                    <RecommendationBadge
                      verdict={activeTender.scorecard.verdict}
                    />
                  </div>
                </div>

                {/* 4-Axis ScoreBar Grid */}
                <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  <ScoreBar
                    label="CPV Alignment"
                    value={activeTender.scorecard.cpvFit}
                    tone={scoreToTone(activeTender.scorecard.cpvFit)}
                  />
                  <ScoreBar
                    label="Geographic Fit"
                    value={activeTender.scorecard.geographicFit}
                    tone={scoreToTone(activeTender.scorecard.geographicFit)}
                  />
                  <ScoreBar
                    label="Budget Attractiveness"
                    value={activeTender.scorecard.budgetAttractiveness}
                    tone={scoreToTone(
                      activeTender.scorecard.budgetAttractiveness,
                    )}
                  />
                  <ScoreBar
                    label="Timeline Feasibility"
                    value={activeTender.scorecard.timelineFeasibility}
                    tone={scoreToTone(
                      activeTender.scorecard.timelineFeasibility,
                    )}
                  />
                </div>

                {/* Executive Rationale */}
                <div className="mt-4 rounded-[4px] border-l-2 border-l-primary bg-background px-3.5 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
                    Executive Rationale
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-primary">
                    {activeTender.scorecard.rationale}
                  </p>
                </div>

                {/* Two-Column Advisory Callout: Risk Flags & Strategic Priorities */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[4px] border border-crimson/20 bg-crimson-soft/45 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-crimson">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Risk Flags
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground">
                      {activeTender.scorecard.riskFlags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span
                            className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-crimson"
                            aria-hidden="true"
                          />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-[4px] border border-emerald/20 bg-emerald-soft/45 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-emerald">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Strategic Priorities
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground">
                      {activeTender.scorecard.strategicPriorities.map(
                        (priority, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span
                              className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald"
                              aria-hidden="true"
                            />
                            <span>{priority}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Scope Description, Technologies & CPV Hierarchy */}
              <section className="space-y-4">
                <div>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Scope &amp; Technical Specification
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-foreground">
                    {activeTender.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-background/50 p-3.5 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
                      Required Technologies
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeTender.technologies.length > 0 ? (
                        activeTender.technologies.map((tech) => (
                          <Badge key={tech} variant="cobalt">
                            {tech}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-subtle-foreground">
                          No specific stack keywords extracted
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
                      CPV Code Hierarchy
                    </div>
                    <div className="mt-1 text-xs font-medium text-primary">
                      {activeTender.cpvSector}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {activeTender.cpvCodes.map((code) => (
                        <Badge
                          key={code}
                          variant="outline"
                          className="font-mono text-[10px] tabular-nums-strict"
                        >
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Predicted Incumbents & Winner Intelligence */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <Trophy
                      className="h-3.5 w-3.5 text-amber"
                      aria-hidden="true"
                    />
                    Predicted Incumbents &amp; Winner Intelligence
                  </h3>
                  <span className="font-mono text-[11px] text-subtle-foreground tabular-nums-strict">
                    {activeTender.winnerPredictions.length} supplier
                    {activeTender.winnerPredictions.length === 1 ? "" : "s"}{" "}
                    ranked
                  </span>
                </div>

                {activeTender.winnerPredictions.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeTender.winnerPredictions.map((prediction, idx) => (
                      <WinnerPredictionCard
                        key={`${prediction.winnerName}-${prediction.winnerCountry}`}
                        prediction={prediction}
                        rank={idx + 1}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border-strong bg-background/60 p-4 text-xs leading-relaxed text-muted-foreground">
                    No historical CPV award matches were found in the current
                    index. This signals an open competitive field without a
                    statistically entrenched incumbent.
                  </div>
                )}
              </section>

              {/* Related Active Opportunities (Hydrated from /api/tenders/[id]) */}
              <section className="space-y-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <Layers
                      className="h-3.5 w-3.5 text-accent-blue"
                      aria-hidden="true"
                    />
                    Related Active Opportunities
                  </h3>
                  {isHydrating && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-subtle-foreground">
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                      Hydrating CPV siblings…
                    </span>
                  )}
                </div>

                {fetchError?.id === tenderId && (
                  <div className="flex items-center gap-2 rounded-[4px] border border-amber/25 bg-amber-soft/60 px-3 py-2 text-xs text-amber">
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Live sibling lookup unavailable ({fetchError.message}).
                      Showing local dossier intelligence.
                    </span>
                  </div>
                )}

                {!isHydrating && similarTenders.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {similarTenders.map((sim) => (
                      <button
                        key={sim.id}
                        type="button"
                        onClick={() => onSelectTender(sim.id)}
                        className="group flex flex-col justify-between rounded-md border border-border bg-background/60 p-3 text-left transition-colors hover:border-accent-blue/40 hover:bg-card"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-2 text-xs font-medium leading-snug text-primary group-hover:text-accent-blue">
                              {sim.title}
                            </span>
                            <ArrowUpRight
                              className="h-3.5 w-3.5 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-blue"
                              aria-hidden="true"
                            />
                          </div>
                          <p className="mt-1 truncate text-[11px] text-subtle-foreground">
                            {sim.authority}
                          </p>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-[2px] border border-border bg-card px-1 py-0.5 font-mono text-[10px] font-semibold text-primary">
                              {sim.country}
                            </span>
                            <span className="font-mono text-[10px] text-subtle-foreground tabular-nums-strict">
                              {sim.sharedPrefixes.length} CPV match
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-primary tabular-nums-strict">
                            {formatCompactCurrency(sim.budget, sim.currency)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : !isHydrating ? (
                  <p className="text-xs text-subtle-foreground">
                    No active sibling tenders share overlapping CPV prefixes
                    with this notice.
                  </p>
                ) : null}
              </section>
            </div>
          )}
        </div>

        {/* Sticky Footer Actions */}
        {activeTender && (
          <footer className="sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-5 py-3 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleBookmark(activeTender.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[4px] border px-3 text-xs font-medium transition-colors",
                  isBookmarked
                    ? "border-accent-blue/35 bg-accent-blue-soft text-accent-blue"
                    : "border-border bg-card text-primary hover:border-border-strong",
                )}
              >
                <Bookmark
                  className={cn(
                    "h-3.5 w-3.5",
                    isBookmarked && "fill-accent-blue text-accent-blue",
                  )}
                  aria-hidden="true"
                />
                {isBookmarked ? "Saved to Watchlist" : "Save to Watchlist"}
              </button>

              <button
                type="button"
                onClick={handleCopyMemo}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[4px] border px-3 text-xs font-medium transition-colors",
                  copiedMemo
                    ? "border-emerald/30 bg-emerald-soft text-emerald"
                    : "border-border bg-card text-primary hover:border-border-strong",
                )}
              >
                {copiedMemo ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Memo Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy Executive Memo
                  </>
                )}
              </button>
            </div>

            <a
              href={activeTender.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-primary bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <span>Open Official Portal</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </footer>
        )}
      </aside>
    </div>
  );
}
