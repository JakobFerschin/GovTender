import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/server/data-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics
 *
 * Returns executive pipeline KPIs, country/sector/month/technology breakdowns,
 * incumbent supplier intelligence, and procurement platform health telemetry.
 */
export async function GET() {
  try {
    const payload = await getAnalytics();
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to compute analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
