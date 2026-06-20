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
  if (!name) return null;
  const { data, error } = await sb
    .from("companies")
    .upsert(
      { name, country },
      { onConflict: "name_normalized,country", ignoreDuplicates: false },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn(`[persist] company upsert failed for "${name}":`, error.message);
    return null;
  }
  return data?.id ?? null;
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
    status: record.status,
    required_technologies: record.required_technologies ?? [],
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
  return data?.id ?? null;
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
  return data?.id ?? null;
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
): Promise<IngestResult> {
  let tendersUpserted = 0;
  let awardsUpserted = 0;

  for (const t of records.tenders) {
    if (await persistTender(t)) tendersUpserted++;
  }
  for (const a of records.awards) {
    if (await persistAward(a)) awardsUpserted++;
  }
  return { tendersUpserted, awardsUpserted };
}
