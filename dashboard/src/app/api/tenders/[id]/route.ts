import { NextResponse } from "next/server";
import { getTenderDetail } from "@/lib/server/data-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/tenders/[id]
 *
 * Returns a single enriched tender with historical award matches, winner
 * predictions, 4-axis Bid Scorecard, and CPV-similar sibling tenders.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const decodedId = decodeURIComponent(id).trim();

    if (!decodedId) {
      return NextResponse.json(
        { error: "Missing tender id" },
        { status: 400 },
      );
    }

    const detail = await getTenderDetail(decodedId);
    if (!detail) {
      return NextResponse.json(
        { error: "Tender not found", id: decodedId },
        { status: 404 },
      );
    }

    return NextResponse.json(detail, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load tender detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
