export interface Tender {
  id: string;
  authority: string;
  title: string;
  budget: number | null;
  currency: string;
  country: string;
  deadline: string;
  technologies: string[];
}

export interface HistoricalMatch {
  awardTitle: string;
  winnerName: string;
  winnerCountry: string;
  contractValue: number | null;
  currency: string;
  awardDate: string;
  score: number;
  sharedCpvPrefixes: string[];
}

export const TENDERS: Tender[] = [
  {
    id: "1",
    authority: "Bundesministerium für Digitales",
    title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
    budget: 4250000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-07-14",
    technologies: ["kubernetes", "postgresql", "elasticsearch", "iso 27001"],
  },
  {
    id: "2",
    authority: "BMF — Österreich",
    title: "Modernisierung des zentralen Rechenzentrums",
    budget: 3100000,
    currency: "EUR",
    country: "AT",
    deadline: "2026-08-02",
    technologies: ["vmware", "linux", "sap s/4hana", "disaster recovery"],
  },
  {
    id: "3",
    authority: "Bundesamt für Informatik (BFI)",
    title: "E-Government Portal Redesign & API Gateway",
    budget: 1800000,
    currency: "CHF",
    country: "CH",
    deadline: "2026-09-15",
    technologies: ["react", "node.js", "openid connect", "rest api"],
  },
  {
    id: "4",
    authority: "Landeshauptstadt München",
    title: "Intelligentes Verkehrsmanagement — Sensorik & Backend",
    budget: 2650000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-07-28",
    technologies: ["iot", "python", "timescaledb", "mqtt"],
  },
  {
    id: "5",
    authority: "Federal Chancellery — Digital Unit",
    title: "AI-gestützte Dokumentenanalyse & Automatisierung",
    budget: 980000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-10-01",
    technologies: ["nlp", "python", "llm", "document ocr"],
  },
  {
    id: "6",
    authority: "Südtiroler Informatik AG",
    title: "Breitband-Ausbau ländlicher Gebiete — Projektmanagement",
    budget: null,
    currency: "EUR",
    country: "IT",
    deadline: "2026-11-30",
    technologies: ["fiber optics", "project management"],
  },
];

export const MATCHES: HistoricalMatch[] = [
  {
    awardTitle: "Cloud-Migration Bundeswehr IT-Systeme",
    winnerName: "Accelereon IT GmbH",
    winnerCountry: "DE",
    contractValue: 3900000,
    currency: "EUR",
    awardDate: "2025-11-01",
    score: 13,
    sharedCpvPrefixes: ["48", "4800", "48000000", "7226"],
  },
  {
    awardTitle: "SIEM & Security Operations Center",
    winnerName: "SecuNova AG",
    winnerCountry: "DE",
    contractValue: 1200000,
    currency: "EUR",
    awardDate: "2025-08-15",
    score: 9,
    sharedCpvPrefixes: ["48", "4800", "48000000"],
  },
  {
    awardTitle: "Datenbankmigration Landratsamt",
    winnerName: "DataBridge Solutions",
    winnerCountry: "AT",
    contractValue: 640000,
    currency: "EUR",
    awardDate: "2025-12-03",
    score: 7,
    sharedCpvPrefixes: ["48", "4800"],
  },
  {
    awardTitle: "Rechenzentrum Modernisierung Bund",
    winnerName: "T-Systems International",
    winnerCountry: "DE",
    contractValue: 5800000,
    currency: "EUR",
    awardDate: "2025-06-20",
    score: 6,
    sharedCpvPrefixes: ["48"],
  },
];

export const TOP_TECH: string[] = [
  "kubernetes", "python", "linux", "postgresql", "react", "sap s/4hana",
];

export function formatCurrency(value: number | null, currency: string): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function totalBudget(tenders: Tender[]): string {
  const eur = tenders
    .filter((t) => t.currency === "EUR" && t.budget != null)
    .reduce((sum, t) => sum + t.budget!, 0);
  return formatCurrency(eur, "EUR");
}
