import { NextResponse } from "next/server";
import { getTenders, parseBidVerdict } from "@/lib/server/data-service";
import type { SortDirection, TenderQueryFilters, TenderSortField } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseSortBy(raw: string | null): TenderSortField | undefined {
  if (raw === "deadline" || raw === "budget" || raw === "score") return raw;
  return undefined;
}

function parseSortDir(raw: string | null): SortDirection | undefined {
  if (raw === "asc" || raw === "desc") return raw;
  return undefined;
}

function parseMinBudget(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * GET /api/tenders
 *
 * Returns procurement notices enriched with deterministic CPV matching,
 * incumbent winner predictions, 4-axis Bid Scorecards, and live facet counts.
 * Connects to Supabase PostgREST when configured, cleanly falling back to the
 * deterministic sandbox engine otherwise.
 *
 * Query params:
 *   ?country=DE
 *   ?q=kubernetes
 *   ?tech=postgresql
 *   ?source=ted
 *   ?sector=72
 *   ?verdict=STRONG%20BID|EVALUATE|PASS
 *   ?showExpired=true|false
 *   ?minBudget=1000000
 *   ?sortBy=deadline|budget|score
 *   ?sortDir=asc|desc
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: TenderQueryFilters = {
      country: searchParams.get("country") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      tech: searchParams.get("tech") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      sector: searchParams.get("sector") ?? undefined,
      verdict: parseBidVerdict(searchParams.get("verdict")),
      showExpired: searchParams.get("showExpired") === "true",
      minBudget: parseMinBudget(searchParams.get("minBudget")),
      sortBy: parseSortBy(searchParams.get("sortBy")),
      sortDir: parseSortDir(searchParams.get("sortDir")),
    };

    const payload = await getTenders(filters);

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load tenders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
