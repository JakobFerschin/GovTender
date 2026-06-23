import { NextResponse } from "next/server";
import { TENDERS } from "@/lib/mock-data";

/**
 * GET /api/tenders
 *
 * Serves active tenders with their embedded historical matches. In production
 * this would query Supabase; for the MVP it returns the same dataset the UI
 * already renders, so the frontend can fetch() instead of importing the mock
 * module directly — leaving a clean swap point for a real DB later.
 *
 * Query params:
 *   ?country=DE        filter by ISO-3166 alpha-2
 *   ?q=kubernetes      full-text over title + authority
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const q = searchParams.get("q")?.toLowerCase().trim();

  let result = [...TENDERS];

  if (country && country !== "ALL") {
    result = result.filter((t) => t.country === country);
  }
  if (q) {
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.authority.toLowerCase().includes(q),
    );
  }

  return NextResponse.json({
    count: result.length,
    tenders: result,
  });
}
