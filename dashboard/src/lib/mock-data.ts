export interface Tender {
  id: string;
  authority: string;
  title: string;
  budget: number | null;
  currency: string;
  country: string;
  deadline: string;
  technologies: string[];
  cpvCodes: string[];
  description: string;
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

export interface TenderWithMatches extends Tender {
  matches: HistoricalMatch[];
}

export const COUNTRIES = [
  { code: "ALL", label: "All Regions" },
  { code: "DE", label: "Germany" },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
] as const;

export const TENDERS: TenderWithMatches[] = [
  {
    id: "1",
    authority: "Bundesministerium für Digitales",
    title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
    budget: 4250000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-07-14",
    cpvCodes: ["48000000", "72267100"],
    description:
      "Aufbau einer Kubernetes-basierten Containerplattform mit PostgreSQL-Migration, ElasticSearch-SIEM und Beratung zu Zero-Trust-Architektur (ISO 27001).",
    technologies: ["kubernetes", "postgresql", "elasticsearch", "iso 27001"],
    matches: [
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
    ],
  },
  {
    id: "2",
    authority: "BMF — Österreich",
    title: "Modernisierung des zentralen Rechenzentrums",
    budget: 3100000,
    currency: "EUR",
    country: "AT",
    deadline: "2026-08-02",
    cpvCodes: ["72000000", "72300000"],
    description:
      "Komplettsanierung des Rechenzentrums inkl. VMware-Infrastruktur, SAP S/4HANA-Migration und Disaster-Recovery-Konzept.",
    technologies: ["vmware", "linux", "sap s/4hana", "disaster recovery"],
    matches: [
      {
        awardTitle: "Rechenzentrum Modernisierung Bund",
        winnerName: "T-Systems International",
        winnerCountry: "DE",
        contractValue: 5800000,
        currency: "EUR",
        awardDate: "2025-06-20",
        score: 11,
        sharedCpvPrefixes: ["72", "7200", "72000000", "7230", "72300000"],
      },
      {
        awardTitle: "Datenbankmigration Landratsamt",
        winnerName: "DataBridge Solutions",
        winnerCountry: "AT",
        contractValue: 640000,
        currency: "EUR",
        awardDate: "2025-12-03",
        score: 7,
        sharedCpvPrefixes: ["72", "7200"],
      },
    ],
  },
  {
    id: "3",
    authority: "Bundesamt für Informatik (BFI)",
    title: "E-Government Portal Redesign & API Gateway",
    budget: 1800000,
    currency: "CHF",
    country: "CH",
    deadline: "2026-09-15",
    cpvCodes: ["48000000", "72200000"],
    description:
      "Neugestaltung des E-Government-Portals mit React-Frontend, Node.js-Backend und OpenID Connect API-Gateway.",
    technologies: ["react", "node.js", "openid connect", "rest api"],
    matches: [
      {
        awardTitle: "Cloud-Migration Bundeswehr IT-Systeme",
        winnerName: "Accelereon IT GmbH",
        winnerCountry: "DE",
        contractValue: 3900000,
        currency: "EUR",
        awardDate: "2025-11-01",
        score: 9,
        sharedCpvPrefixes: ["48", "4800", "48000000", "7220", "72200000"],
      },
    ],
  },
  {
    id: "4",
    authority: "Landeshauptstadt München",
    title: "Intelligentes Verkehrsmanagement — Sensorik & Backend",
    budget: 2650000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-07-28",
    cpvCodes: ["31620000", "48000000"],
    description:
      "IoT-Sensorinfrastruktur für Verkehrsflussanalyse mit Python-Backend, TimescaleDB und MQTT-Protokoll.",
    technologies: ["iot", "python", "timescaledb", "mqtt"],
    matches: [
      {
        awardTitle: "Smart City Pilot Stuttgart",
        winnerName: "UrbanTech Solutions GmbH",
        winnerCountry: "DE",
        contractValue: 890000,
        currency: "EUR",
        awardDate: "2025-10-12",
        score: 8,
        sharedCpvPrefixes: ["48", "4800", "48000000"],
      },
    ],
  },
  {
    id: "5",
    authority: "Federal Chancellery — Digital Unit",
    title: "AI-gestützte Dokumentenanalyse & Automatisierung",
    budget: 980000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-10-01",
    cpvCodes: ["72250000", "72310000"],
    description:
      "NLP-basierte Automatisierung der Dokumentenanalyse mit LLM-Integration und OCR-Pipeline für Behördenakten.",
    technologies: ["nlp", "python", "llm", "document ocr"],
    matches: [
      {
        awardTitle: "KI-gestützte Steuerprüfung Hessen",
        winnerName: "CogniGov Analytics",
        winnerCountry: "DE",
        contractValue: 750000,
        currency: "EUR",
        awardDate: "2025-09-28",
        score: 12,
        sharedCpvPrefixes: ["72", "7225", "72250000", "7231", "72310000"],
      },
      {
        awardTitle: "Dokumentenmanagement Bund",
        winnerName: "DocuSense AG",
        winnerCountry: "CH",
        contractValue: 1100000,
        currency: "CHF",
        awardDate: "2025-07-15",
        score: 6,
        sharedCpvPrefixes: ["72", "7225"],
      },
    ],
  },
  {
    id: "6",
    authority: "Südtiroler Informatik AG",
    title: "Breitband-Ausbau ländlicher Gebiete — Projektmanagement",
    budget: null,
    currency: "EUR",
    country: "IT",
    deadline: "2026-11-30",
    cpvCodes: ["32410000"],
    description:
      "Projektmanagement und technischer Support beim Breitband-Ausbau in unterversorgten Gebieten Südtirols.",
    technologies: ["fiber optics", "project management"],
    matches: [
      {
        awardTitle: "Glasfaser-Ausbau Bayern",
        winnerName: "NetzKom Consult",
        winnerCountry: "DE",
        contractValue: 420000,
        currency: "EUR",
        awardDate: "2025-11-20",
        score: 5,
        sharedCpvPrefixes: ["32"],
      },
    ],
  },
  {
    id: "7",
    authority: "Landesverwaltung Baden-Württemberg",
    title: "ERP-System Migration & Schulung für 12.000 Mitarbeitende",
    budget: 8700000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-08-20",
    cpvCodes: ["72230000", "72300000"],
    description:
      "Migration von SAP R/3 auf S/4HANA inkl. Change-Management und Schulung von 12.000 Mitarbeitenden in 47 Behörden.",
    technologies: ["sap s/4hana", "change management", "linux"],
    matches: [
      {
        awardTitle: "SAP-Migration Bundesfinanzverwaltung",
        winnerName: "SAP SE",
        winnerCountry: "DE",
        contractValue: 12400000,
        currency: "EUR",
        awardDate: "2025-05-10",
        score: 14,
        sharedCpvPrefixes: ["72", "7223", "72230000", "7230", "72300000"],
      },
      {
        awardTitle: "Rechenzentrum Modernisierung Bund",
        winnerName: "T-Systems International",
        winnerCountry: "DE",
        contractValue: 5800000,
        currency: "EUR",
        awardDate: "2025-06-20",
        score: 9,
        sharedCpvPrefixes: ["72", "7223", "7230"],
      },
      {
        awardTitle: "Datenbankmigration Landratsamt",
        winnerName: "DataBridge Solutions",
        winnerCountry: "AT",
        contractValue: 640000,
        currency: "EUR",
        awardDate: "2025-12-03",
        score: 5,
        sharedCpvPrefixes: ["72"],
      },
    ],
  },
  {
    id: "8",
    authority: "Oesterreichische Post AG",
    title: "Autonome Zustellroboter — Pilotbetrieb in Wien",
    budget: 1450000,
    currency: "EUR",
    country: "AT",
    deadline: "2026-12-01",
    cpvCodes: ["31680000", "71300000"],
    description:
      "Pilotprojekt für autonome Lastenroboter im innerstädtischen Zustellbetrieb Wien. 6 Monate Testphase mit Evaluationsbericht.",
    technologies: ["robotics", "iot", "python", "edge computing"],
    matches: [
      {
        awardTitle: "Smart City Pilot Stuttgart",
        winnerName: "UrbanTech Solutions GmbH",
        winnerCountry: "DE",
        contractValue: 890000,
        currency: "EUR",
        awardDate: "2025-10-12",
        score: 6,
        sharedCpvPrefixes: ["31", "3168"],
      },
    ],
  },
];

/** Collect every distinct tech across all tenders, sorted. */
export function allTechnologies(): string[] {
  const set = new Set<string>();
  for (const t of TENDERS) for (const tech of t.technologies) set.add(tech);
  return [...set].sort();
}

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

/** Days until deadline. Negative = expired. */
export function daysUntil(deadline: string): number {
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function topTechFor(tenders: Tender[]): string {
  const freq = new Map<string, number>();
  for (const t of tenders) for (const tech of t.technologies) freq.set(tech, (freq.get(tech) ?? 0) + 1);
  let top = "";
  let max = 0;
  for (const [tech, count] of freq) if (count > max) { max = count; top = tech; }
  return top;
}
