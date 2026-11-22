import { NextResponse } from "next/server";
import { triggerIngestionRun } from "@/lib/server/data-service";

export const dynamic = "force-dynamic";

interface IngestRequestBody {
  sources?: unknown;
  dryRun?: unknown;
}

/**
 * POST /api/ingest
 *
 * Triggers a deterministic OCDS ingestion & CPV re-indexing run across the
 * configured procurement platforms and returns step-by-step telemetry logs.
 */
export async function POST(request: Request) {
  try {
    let sources: string[] | undefined;
    let dryRun: boolean | undefined;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const text = await request.text();
      if (text.trim().length > 0) {
        const parsed = JSON.parse(text) as IngestRequestBody;
        if (Array.isArray(parsed.sources)) {
          sources = parsed.sources.filter(
            (s): s is string => typeof s === "string" && s.trim().length > 0,
          );
        }
        if (typeof parsed.dryRun === "boolean") {
          dryRun = parsed.dryRun;
        }
      }
    }

    const result = await triggerIngestionRun({ sources, dryRun });
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to trigger ingestion run";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
