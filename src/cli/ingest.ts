/**
 * GovTender AI — Multi-Platform Procurement Ingestion CLI.
 *
 * Usage:
 *   npx tsx src/cli/ingest.ts --dry-run
 *   npx tsx src/cli/ingest.ts --dry-run --sandbox
 *   npx tsx src/cli/ingest.ts --live
 *   npx tsx src/cli/ingest.ts --live --source ted,simap --limit 25
 *   npx tsx src/cli/ingest.ts --dry-run --json
 */
import "dotenv/config";
import {
  defaultSources,
  runIngestion,
  type AggregateReport,
  type SourceReport,
} from "../lib/sources/index.js";

interface CliArgs {
  dryRun: boolean;
  explicitMode: "dry-run" | "live" | "auto";
  sandbox: boolean;
  allowLlm: boolean;
  json: boolean;
  help: boolean;
  limit?: number;
  timeoutMs?: number;
  retries: number;
  sourcesFilter: string[];
}

function printHelp(): void {
  console.log(`GovTender AI — Multi-Platform Procurement Ingestion CLI

Usage:
  npx tsx src/cli/ingest.ts [options]

Options:
  --dry-run             Fetch and deterministically map without writing to Supabase
  --live                Persist tenders, awards, and run telemetry to Supabase
  --sandbox             Enable bundled DACH sandbox fixtures for unconfigured SIMAP/evergabe feeds
  --source <list>       Filter sources (comma-separated, e.g. --source ted,simap)
  --limit <n>           Max releases per source
  --timeout <ms>        HTTP request timeout per source in ms (default: 15000)
  --retries <n>         Retry count for transient 5xx/network errors (default: 1)
  --allow-llm           Enable Mistral LLM technology extraction fallback (live mode)
  --no-llm              Disable Mistral LLM technology extraction fallback
  --json                Output machine-readable AggregateReport JSON to stdout
  -h, --help            Show this help message
`);
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`Invalid integer value for ${flag}: "${value ?? ""}"`);
  }
  return Number.parseInt(value, 10);
}

function parseArgs(argv: string[]): CliArgs {
  let explicitMode: CliArgs["explicitMode"] = "auto";
  let sandbox =
    process.env.GOVTENDER_SANDBOX_FIXTURES === "true" ||
    process.env.GOVTENDER_SANDBOX_FIXTURES === "1";
  let allowLlm = Boolean(process.env.MISTRAL_API_KEY?.trim());
  let json = false;
  let help = false;
  let limit: number | undefined;
  let timeoutMs: number | undefined;
  let retries = 1;
  const sourcesFilter: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--dry-run") {
      explicitMode = "dry-run";
    } else if (arg === "--live") {
      explicitMode = "live";
    } else if (arg === "--sandbox") {
      sandbox = true;
    } else if (arg === "--allow-llm") {
      allowLlm = true;
    } else if (arg === "--no-llm") {
      allowLlm = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--limit") {
      limit = parsePositiveInt("--limit", argv[++i]);
    } else if (arg.startsWith("--limit=")) {
      limit = parsePositiveInt("--limit", arg.slice("--limit=".length));
    } else if (arg === "--timeout") {
      timeoutMs = parsePositiveInt("--timeout", argv[++i]);
    } else if (arg.startsWith("--timeout=")) {
      timeoutMs = parsePositiveInt("--timeout", arg.slice("--timeout=".length));
    } else if (arg === "--retries") {
      retries = parsePositiveInt("--retries", argv[++i]);
    } else if (arg.startsWith("--retries=")) {
      retries = parsePositiveInt("--retries", arg.slice("--retries=".length));
    } else if (arg === "--source") {
      const val = argv[++i];
      if (!val) throw new Error("Missing value for --source");
      sourcesFilter.push(
        ...val
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
    } else if (arg.startsWith("--source=")) {
      const val = arg.slice("--source=".length);
      sourcesFilter.push(
        ...val
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const hasSupabase = Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const dryRun =
    explicitMode === "dry-run"
      ? true
      : explicitMode === "live"
        ? false
        : !hasSupabase;

  return {
    dryRun,
    explicitMode,
    sandbox,
    allowLlm,
    json,
    help,
    limit,
    timeoutMs,
    retries,
    sourcesFilter,
  };
}

function padRight(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padStart(width);
}

function formatTable(report: AggregateReport, args: CliArgs): string {
  const lines: string[] = [];
  const modeBanner = args.dryRun
    ? args.explicitMode === "auto"
      ? "DRY-RUN (auto — Supabase env unset)"
      : "DRY-RUN"
    : "LIVE (Supabase persistence enabled)";

  const rule = "=".repeat(96);
  const subRule = "-".repeat(96);

  lines.push(rule);
  lines.push("  GovTender AI — Multi-Platform Procurement Ingestion Summary");
  lines.push(rule);
  lines.push(`  Timestamp : ${new Date().toISOString()}`);
  lines.push(`  Mode      : ${modeBanner}`);
  lines.push(
    `  Options   : sandbox=${args.sandbox ? "on" : "off"}  llm=${args.allowLlm && !args.dryRun ? "on" : "off"}  retries=${args.retries}${args.limit !== undefined ? `  limit=${args.limit}` : ""}`,
  );
  lines.push(subRule);

  const header = [
    padRight("SOURCE", 10),
    padRight("PLATFORM", 34),
    padRight("MODE", 10),
    padLeft("FETCHED", 7),
    padLeft("TENDERS", 7),
    padLeft("AWARDS", 6),
    padLeft("SKIPPED", 7),
    padLeft("LATENCY", 9),
  ].join(" ");
  lines.push(`  ${header}`);
  lines.push(`  ${"-".repeat(header.length)}`);

  let totalSkipped = 0;
  for (const sr of report.sourceReports) {
    totalSkipped += sr.skipped;
    const row = [
      padRight(sr.source, 10),
      padRight(sr.label, 34),
      padRight(sr.mode.toUpperCase(), 10),
      padLeft(String(sr.releasesFetched), 7),
      padLeft(String(sr.tendersIngested), 7),
      padLeft(String(sr.awardsIngested), 6),
      padLeft(String(sr.skipped), 7),
      padLeft(`${sr.latencyMs}ms`, 9),
    ].join(" ");
    lines.push(`  ${row}`);
  }

  lines.push(`  ${"-".repeat(header.length)}`);
  const totalsRow = [
    padRight(`TOTAL (${report.sourcesRun})`, 10),
    padRight("All configured connectors", 34),
    padRight(args.dryRun ? "DRY-RUN" : "LIVE", 10),
    padLeft(String(report.releasesFetched), 7),
    padLeft(String(report.tendersIngested), 7),
    padLeft(String(report.awardsIngested), 6),
    padLeft(String(totalSkipped), 7),
    padLeft(`${report.durationMs}ms`, 9),
  ].join(" ");
  lines.push(`  ${totalsRow}`);
  lines.push(rule);

  if (report.sourceReports.some((sr) => sr.error)) {
    lines.push("");
    lines.push("  Source Notices & Diagnostics:");
    for (const sr of report.sourceReports) {
      if (!sr.error) continue;
      const severity = isHardSourceError(sr) ? "ERROR" : "INFO ";
      lines.push(`    [${severity}] ${padRight(sr.source, 10)} ${sr.error}`);
    }
  }

  return lines.join("\n");
}

function isHardSourceError(sr: SourceReport): boolean {
  if (!sr.error) return false;
  if (sr.mode === "disabled" || sr.mode === "fixtures") return false;
  return true;
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(
      `[ERROR] ${err instanceof Error ? err.message : String(err)}\nRun with --help for usage.`,
    );
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (
    !args.dryRun &&
    !(
      process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    )
  ) {
    console.error(
      "[ERROR] --live requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.",
    );
    process.exit(1);
  }

  let sources = defaultSources({ includeSandboxFixtures: args.sandbox });
  if (args.sourcesFilter.length > 0) {
    const allowed = new Set(args.sourcesFilter);
    sources = sources.filter((s) => allowed.has(s.source.toLowerCase()));
    if (sources.length === 0) {
      console.error(
        `[ERROR] No matching sources found for --source=${args.sourcesFilter.join(",")}`,
      );
      process.exit(1);
    }
  }

  const report = await runIngestion(sources, {
    dryRun: args.dryRun,
    allowLlm: args.allowLlm,
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    retries: args.retries,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTable(report, args));
  }

  const hardErrors = report.sourceReports.filter(isHardSourceError);
  if (hardErrors.length > 0 && report.releasesFetched === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(
    `[ERROR] Fatal CLI failure: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
