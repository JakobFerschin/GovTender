/**
 * Supabase persistence layer for deterministically-mapped records.
 *
 * Uses upserts keyed on (source, source_id) so re-ingestion is idempotent.
 * Writes go through the service-role client; RLS is therefore bypassed by
 * design (see migration 0001, section 7).
 *
 * NOTE — schema prerequisite: run migration `0002_deterministic_matching.sql`
 * (Task 2), which adds `tenders.country` used here.
 *
 * Deliberately does NOT import from ../extraction/*: the deterministic path
 * must load and run without any LLM credentials present.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TenderRecord, HistoricalAwardRecord } from "./ocds-mapper.js";

let clientPromise: SupabaseClient | null = null;

/**
 * Build (once) a service-role Supabase client. Reads SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY directly from the environment. Throws lazily —
 * only when actually called — so importing this module never requires Supabase
 * to be configured (deterministic mapping, tests, etc. stay keyless).
 */
export function getSupabase(): SupabaseClient {
  if (clientPromise) return clientPromise;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "(deterministic parsing still works without these; only persistence needs them).",
    );
  }
  clientPromise = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return clientPromise;
}

function toDateOnly(d: Date | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Resolve or create a `companies` row for an authority/supplier, returning its id. */
async function resolveCompanyId(
  sb: SupabaseClient,
  name: string | undefined,
  country: string | undefined,
): Promise<string | null> {
  const trimmedName = name?.trim();
  if (!trimmedName) return null;
  const normalizedCountry = country?.trim().toLowerCase() || null;

  const { data, error } = await sb
    .from("companies")
    .upsert(
      { name: trimmedName, country: normalizedCountry },
      { onConflict: "name_normalized,country", ignoreDuplicates: false },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn(`[persist] company upsert failed for "${trimmedName}":`, error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/** Upsert a single active tender. Returns the row id (or null on failure). */
export async function persistTender(
  record: TenderRecord,
  sb?: SupabaseClient,
): Promise<string | null> {
  const client = sb ?? getSupabase();
  const authorityId = await resolveCompanyId(
    client,
    record.awarding_authority_name,
    record.country,
  );

  const row = {
    source: record.source,
    source_id: record.source_id,
    source_url: record.source_url ?? null,
    title: record.title,
    description: record.description ?? null,
    cpv_codes: record.cpv_codes,
    country: record.country ?? null,
    awarding_authority_id: authorityId,
    awarding_authority_name: record.awarding_authority_name ?? null,
    estimated_budget: record.estimated_budget ?? null,
    currency: record.currency,
    publication_date: record.publication_date?.toISOString() ?? null,
    submission_deadline: record.submission_deadline?.toISOString() ?? null,
    procedure: record.procedure ?? null,
    status: record.status,
    required_technologies: record.required_technologies ?? [],
    raw_payload: record.raw_payload ?? null,
  };

  const { data, error } = await client
    .from("tenders")
    .upsert(row, { onConflict: "source,source_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn(`[persist] tender upsert failed (${record.source_id}):`, error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/** Upsert a single historical award. */
export async function persistAward(
  record: HistoricalAwardRecord,
  sb?: SupabaseClient,
): Promise<string | null> {
  const client = sb ?? getSupabase();
  const winnerId = await resolveCompanyId(
    client,
    record.winner_name,
    record.winner_country,
  );

  const row = {
    source: record.source,
    source_id: record.source_id,
    source_url: record.source_url ?? null,
    title: record.title,
    description: record.description ?? null,
    cpv_codes: record.cpv_codes,
    awarding_authority_name: record.awarding_authority_name ?? null,
    winner_company_id: winnerId,
    winner_name: record.winner_name ?? null,
    winner_country: record.winner_country ?? null,
    contract_value: record.contract_value ?? null,
    currency: record.currency,
    award_date: toDateOnly(record.award_date),
    raw_payload: record.raw_payload ?? null,
  };

  const { data, error } = await client
    .from("historical_awards")
    .upsert(row, { onConflict: "source,source_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn(`[persist] award upsert failed (${record.source_id}):`, error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

export interface IngestResult {
  tendersUpserted: number;
  awardsUpserted: number;
}

/**
 * End-to-end deterministic ingest: take mapped records, persist them, and
 * return counts. Pure I/O — no LLM.
 */
export async function persistMapped(
  records: { tenders: TenderRecord[]; awards: HistoricalAwardRecord[] },
  sb?: SupabaseClient,
): Promise<IngestResult> {
  let tendersUpserted = 0;
  let awardsUpserted = 0;

  for (const t of records.tenders) {
    if (await persistTender(t, sb)) tendersUpserted++;
  }
  for (const a of records.awards) {
    if (await persistAward(a, sb)) awardsUpserted++;
  }
  return { tendersUpserted, awardsUpserted };
}

export interface IngestionRunRecord {
  source: string;
  status: "success" | "partial" | "error" | "running" | string;
  releases_fetched?: number;
  tenders_upserted?: number;
  awards_upserted?: number;
  errors?: unknown[];
  error_message?: string | null;
  duration_ms?: number | null;
  started_at?: Date | string;
  finished_at?: Date | string;
  metadata?: Record<string, unknown>;
}

/**
 * Write ingestion telemetry to `ingestion_runs`. Completely fail-safe: logs a
 * warning and returns `null` if Supabase is unconfigured or the insert fails,
 * so telemetry never breaks an ingestion pipeline.
 */
export async function recordIngestionRun(
  run: IngestionRunRecord,
  sb?: SupabaseClient,
): Promise<string | null> {
  try {
    const client = sb ?? getSupabase();
    const toIso = (v: Date | string | undefined): string =>
      v instanceof Date ? v.toISOString() : (v ?? new Date().toISOString());

    const row: Record<string, unknown> = {
      source: run.source,
      status: run.status,
      releases_fetched: run.releases_fetched ?? 0,
      tenders_upserted: run.tenders_upserted ?? 0,
      awards_upserted: run.awards_upserted ?? 0,
      errors: run.errors ?? [],
      error_message: run.error_message ?? null,
      duration_ms: run.duration_ms ?? null,
      started_at: toIso(run.started_at),
      finished_at: toIso(run.finished_at),
    };
    if (run.metadata !== undefined) {
      row.metadata = run.metadata;
    }

    const { data, error } = await client
      .from("ingestion_runs")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn(
        `[persist] ingestion_runs insert failed (${run.source}):`,
        error.message,
      );
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    console.warn(
      `[persist] ingestion_runs insert threw (${run.source}):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
