"use client";

import { useState } from "react";
import {
  Activity,
  TrendingUp,
  Layers,
  ChevronRight,
  Trophy,
  MapPin,
  Calendar,
  Building2,
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
  MATCHES,
  TOP_TECH,
  totalBudget,
  formatCurrency,
  type Tender,
  type HistoricalMatch,
} from "@/lib/mock-data";

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

/* ── Tender Row ─────────────────────────────────────────────────────────── */

function TenderRow({ t }: { t: Tender }) {
  return (
    <TableRow className="group">
      <TableCell className="font-medium min-w-[200px]">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className="truncate">{t.authority}</span>
        </div>
      </TableCell>
      <TableCell className="min-w-[280px]">
        <span className="line-clamp-1">{t.title}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatCurrency(t.budget, t.currency)}
      </TableCell>
      <TableCell className="min-w-[180px]">
        <div className="flex flex-wrap gap-1">
          {t.technologies.length > 0
            ? t.technologies.map((tech) => (
                <Badge key={tech}>{tech}</Badge>
              ))
            : <Badge variant="muted">n/a</Badge>}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Predictive Match Panel ────────────────────────────────────────────── */

function PredictivePanel({
  matches,
  isOpen,
  onToggle,
}: {
  matches: HistoricalMatch[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Trophy className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-wide">
            PREDICTIVE INTELLIGENCE
          </span>
          <span className="text-xs opacity-60">
            — Likely winners based on historical CPV matching
          </span>
        </div>
        <ChevronRight
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </button>

      {/* Panel body */}
      {isOpen && (
        <div className="mt-1 rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {matches.map((m, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 hover:bg-muted/40 transition-colors"
              >
                {/* Rank */}
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/5 text-primary text-xs font-bold shrink-0">
                  {i + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{m.winnerName}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {m.winnerCountry}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {m.awardTitle}
                  </p>
                </div>

                {/* Meta */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">
                    {formatCurrency(m.contractValue, m.currency)}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {m.awardDate}
                  </div>
                </div>

                {/* Score bar */}
                <div className="flex flex-col items-end gap-1 shrink-0 w-16">
                  <span className="text-xs font-semibold tabular-nums">
                    {m.score}
                  </span>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${Math.min((m.score / 15) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-[11px] text-muted-foreground">
              Score = shared CPV prefixes + same-country bonus. Higher score indicates stronger
              historical precedent. Not a probability — a relevance ranking.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [panelOpen, setPanelOpen] = useState(true);

  const activeCount = TENDERS.filter(
    (t) => new Date(t.deadline) > new Date(),
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-serif)]">
          GovTender Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          EU &amp; DACH Procurement Analytics — Real-time tender intelligence
          with predictive winner matching
        </p>
        <div className="mt-4 h-px bg-border" />
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Active Tenders (DACH)"
          value={String(activeCount)}
          sub={`of ${TENDERS.length} total tracked`}
          icon={Activity}
        />
        <KpiCard
          label="Total Budget Volume"
          value={totalBudget(TENDERS)}
          sub="EUR-denominated active tenders only"
          icon={TrendingUp}
        />
        <KpiCard
          label="Top Tech Requirement"
          value={TOP_TECH[0]}
          sub={`followed by ${TOP_TECH.slice(1, 3).join(", ")}`}
          icon={Layers}
        />
      </section>

      {/* Intelligence Table */}
      <section className="mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Active Procurement Notices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/30 hover:bg-muted/30">
                  <TableHead>Awarding Authority</TableHead>
                  <TableHead>Project Title</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Required Technologies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TENDERS.map((t) => (
                  <TenderRow key={t.id} t={t} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Predictive Match Panel */}
      <section className="mb-10">
        <PredictivePanel
          matches={MATCHES}
          isOpen={panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
        />
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground pb-6">
        GovTender AI — Intelligence Dashboard &middot; Data refreshes daily
        &middot; Predictions based on deterministic CPV matching
      </footer>
    </div>
  );
}
