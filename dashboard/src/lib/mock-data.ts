import {
  COUNTRY_LABELS,
  daysUntil,
  enrichTender,
  formatCurrency,
  getCpvSectorLabel,
  toEur,
} from "./intelligence-engine";
import type {
  HistoricalAwardRecord,
  HistoricalMatch,
  Tender,
  TenderWithIntelligence,
} from "./types";

export type { HistoricalMatch, Tender, TenderWithIntelligence };
export type TenderWithMatches = Tender & { matches: HistoricalMatch[] };

export const COUNTRIES = [
  { code: "ALL", label: COUNTRY_LABELS.ALL },
  { code: "DE", label: COUNTRY_LABELS.DE },
  { code: "AT", label: COUNTRY_LABELS.AT },
  { code: "CH", label: COUNTRY_LABELS.CH },
  { code: "FR", label: COUNTRY_LABELS.FR },
  { code: "IT", label: COUNTRY_LABELS.IT },
  { code: "NL", label: COUNTRY_LABELS.NL },
] as const;

/* ── Curated OCDS-Equivalent Tender Notices (14 Active + 1 Expired) ────── */

const BASE_TENDERS: Omit<Tender, "cpvSector">[] = [
  // ── Germany (5 active) ──────────────────────────────────────────────────
  {
    id: "de-bmdv-cloud-siem-2026",
    source: "ted",
    sourceId: "TED-2026-484837",
    authority: "Bundesministerium für Digitales und Verkehr (BMDV)",
    title: "Sovereign Cloud-Native Platform & SIEM for Federal Infrastructure",
    budget: 4250000,
    currency: "EUR",
    country: "DE",
    deadline: "2027-01-18",
    publicationDate: "2026-10-28",
    procedure: "open",
    status: "active",
    cpvCodes: ["48000000", "72267100"],
    technologies: ["kubernetes", "postgresql", "elasticsearch", "iso 27001", "terraform"],
    description:
      "Design and operation of a BSI C5-compliant Kubernetes container platform with managed PostgreSQL migration, ElasticSearch SIEM telemetry, and Zero-Trust architecture advisory across federal agencies.",
    sourceUrl: "https://ted.europa.eu/en/notice/-/detail/484837-2026",
  },
  {
    id: "de-bw-sap-s4hana-2026",
    source: "evergabe",
    sourceId: "EVG-2026-884205",
    authority: "Landesverwaltung Baden-Württemberg",
    title: "ERP Core Migration to SAP S/4HANA & Change Program (12,000 Users)",
    budget: 8700000,
    currency: "EUR",
    country: "DE",
    deadline: "2027-02-26",
    publicationDate: "2026-11-04",
    procedure: "restricted",
    status: "active",
    cpvCodes: ["72230000", "72300000"],
    technologies: ["sap s/4hana", "linux", "kubernetes", "change management"],
    description:
      "Full brownfield-to-clean-core migration from SAP R/3 to S/4HANA covering budget accounting, procurement workflows, and enablement for 12,000 civil servants across 47 state offices.",
    sourceUrl: "https://www.evergabe-online.de/tenderdetails.html?id=884205",
  },
  {
    id: "de-muc-smart-traffic-2026",
    source: "evergabe",
    sourceId: "EVG-2026-738102",
    authority: "Landeshauptstadt München — Mobilitätsreferat",
    title: "Intelligent Urban Traffic Management — Edge Sensors & Streaming Core",
    budget: 2650000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-12-19",
    publicationDate: "2026-10-14",
    procedure: "open",
    status: "active",
    cpvCodes: ["31620000", "48000000"],
    technologies: ["iot", "python", "timescaledb", "mqtt", "edge computing"],
    description:
      "Deployment of multimodal traffic-flow IoT sensors paired with a Python event-streaming backend, TimescaleDB time-series storage, and MQTT telemetry brokers for adaptive signal control.",
    sourceUrl: "https://www.evergabe-online.de/tenderdetails.html?id=738102",
  },
  {
    id: "de-bka-ai-docs-2026",
    source: "ted",
    sourceId: "TED-2026-384921",
    authority: "Bundeskanzleramt — Digital Unit",
    title: "Sovereign AI Document Intelligence & Automated Case Triage",
    budget: 1420000,
    currency: "EUR",
    country: "DE",
    deadline: "2027-03-15",
    publicationDate: "2026-11-12",
    procedure: "competitive_dialogue",
    status: "active",
    cpvCodes: ["72250000", "72310000"],
    technologies: ["llm", "nlp", "python", "document ocr", "postgresql"],
    description:
      "On-premise NLP and EU-hosted LLM pipeline for structured classification, redaction, and OCR indexing of multilingual regulatory dossiers under strict GDPR and EU AI Act controls.",
    sourceUrl: "https://ted.europa.eu/en/notice/-/detail/384921-2026",
  },
  {
    id: "de-itzbund-zero-trust-2026",
    source: "ted",
    sourceId: "TED-2026-592104",
    authority: "Informationstechnikzentrum Bund (ITZBund)",
    title: "Federal Zero-Trust Identity Federation & PKI Modernization",
    budget: 5400000,
    currency: "EUR",
    country: "DE",
    deadline: "2027-04-09",
    publicationDate: "2026-11-15",
    procedure: "open",
    status: "active",
    cpvCodes: ["48730000", "72212730"],
    technologies: ["zero trust", "openid connect", "kubernetes", "iso 27001"],
    description:
      "Modernization of federal identity federation, hardware-backed PKI certificate lifecycle management, and OpenID Connect SSO gateway serving 180+ federal authorities.",
    sourceUrl: "https://ted.europa.eu/en/notice/-/detail/592104-2026",
  },

  // ── Austria (3 active) ──────────────────────────────────────────────────
  {
    id: "at-bmf-dc-modernization-2026",
    source: "ted",
    sourceId: "TED-2026-723182",
    authority: "Bundesministerium für Finanzen (BMF Österreich)",
    title: "Central Data Center Modernization & Hybrid Cloud Resilience",
    budget: 3350000,
    currency: "EUR",
    country: "AT",
    deadline: "2027-01-29",
    publicationDate: "2026-10-30",
    procedure: "open",
    status: "active",
    cpvCodes: ["72000000", "72300000"],
    technologies: ["vmware", "linux", "sap s/4hana", "disaster recovery"],
    description:
      "Consolidation of national tax and customs compute clusters including VMware-to-Linux modernization, active-active geo-redundant disaster recovery, and SAP S/4HANA hosting readiness.",
    sourceUrl: "https://ted.europa.eu/en/notice/-/detail/723182-2026",
  },
  {
    id: "at-post-autonomous-2026",
    source: "auftragsportal",
    sourceId: "AT-2026-58204",
    authority: "Österreichische Post AG",
    title: "Autonomous Urban Delivery Fleet Telemetry & Edge AI Pilot (Vienna)",
    budget: 1450000,
    currency: "EUR",
    country: "AT",
    deadline: "2026-12-08",
    publicationDate: "2026-10-18",
    procedure: "negotiated",
    status: "active",
    cpvCodes: ["31680000", "71300000"],
    technologies: ["robotics", "iot", "python", "edge computing"],
    description:
      "Six-month operational pilot for autonomous last-mile parcel robots in central Vienna with fleet telemetry backend, LiDAR safety validation, and regulatory evaluation report.",
    sourceUrl: "https://www.auftragsportal.at/tender/2026-58204",
  },
  {
    id: "at-brz-ehealth-interoperability-2026",
    source: "auftragsportal",
    sourceId: "AT-2026-61940",
    authority: "Bundesrechenzentrum (BRZ) GmbH",
    title: "National e-Health FHIR Interoperability Gateway & Analytics",
    budget: 2900000,
    currency: "EUR",
    country: "AT",
    deadline: "2027-03-28",
    publicationDate: "2026-11-10",
    procedure: "open",
    status: "active",
    cpvCodes: ["72212180", "48814000"],
    technologies: ["rest api", "postgresql", "kubernetes", "openid connect"],
    description:
      "Implementation of an HL7 FHIR R4 interoperability hub connecting regional hospitals and ELGA registries with audit-grade consent enforcement and operational analytics.",
    sourceUrl: "https://www.auftragsportal.at/tender/2026-61940",
  },

  // ── Switzerland (2 active) ──────────────────────────────────────────────
  {
    id: "ch-bfi-egov-portal-2026",
    source: "simap",
    sourceId: "SIMAP-2026-291405",
    authority: "Bundesamt für Informatik und Telekommunikation (BIT)",
    title: "Federal E-Government Citizen Portal Redesign & API Gateway",
    budget: 2150000,
    currency: "CHF",
    country: "CH",
    deadline: "2027-02-12",
    publicationDate: "2026-11-01",
    procedure: "open",
    status: "active",
    cpvCodes: ["48000000", "72200000"],
    technologies: ["react", "node.js", "openid connect", "rest api", "typescript"],
    description:
      "Accessible WCAG 2.2 AA redesign of the Swiss federal citizen services portal with TypeScript/React frontend, Node.js BFF layer, and AGOV OpenID Connect API gateway.",
    sourceUrl: "https://www.simap.ch/de/project-detail/2026-291405",
  },
  {
    id: "ch-sbb-cyber-soc-2026",
    source: "simap",
    sourceId: "SIMAP-2026-304812",
    authority: "SBB CFF FFS — Konzerninformatik",
    title: "Rail Critical Infrastructure OT/IT SOC & Threat Detection Platform",
    budget: 3800000,
    currency: "CHF",
    country: "CH",
    deadline: "2027-05-14",
    publicationDate: "2026-11-17",
    procedure: "restricted",
    status: "active",
    cpvCodes: ["48732000", "72267100"],
    technologies: ["elasticsearch", "zero trust", "iso 27001", "python"],
    description:
      "Unified 24/7 cyber defense platform bridging railway operational technology (OT) signaling telemetry with enterprise SIEM correlation and automated incident playbooks.",
    sourceUrl: "https://www.simap.ch/de/project-detail/2026-304812",
  },

  // ── Italy (1 active) ────────────────────────────────────────────────────
  {
    id: "it-siag-broadband-pm-2026",
    source: "appalti",
    sourceId: "APP-BZ-2026-18402",
    authority: "Südtiroler Informatik AG (SIAG)",
    title: "Alpine Rural Fiber Broadband Rollout — GIS & Technical PMO",
    budget: null,
    currency: "EUR",
    country: "IT",
    deadline: "2027-04-22",
    publicationDate: "2026-11-08",
    procedure: "open",
    status: "active",
    cpvCodes: ["32410000", "71311200"],
    technologies: ["fiber optics", "gis", "project management"],
    description:
      "Technical project management, GIS fiber-routing inventory, and EU cohesion-fund compliance oversight for ultra-broadband rollout across underserved South Tyrolean municipalities.",
    sourceUrl: "https://www.bandi-altoadige.it/notice/2026-18402",
  },

  // ── France (2 active) ───────────────────────────────────────────────────
  {
    id: "fr-dinum-sovereign-cloud-2026",
    source: "boamp",
    sourceId: "BOAMP-26-114982",
    authority: "DINUM — Direction Interministérielle du Numérique",
    title: "SecNumCloud Sovereign Kubernetes & Interministerial DevSecOps",
    budget: 6200000,
    currency: "EUR",
    country: "FR",
    deadline: "2027-02-05",
    publicationDate: "2026-10-25",
    procedure: "open",
    status: "active",
    cpvCodes: ["48820000", "72514300"],
    technologies: ["kubernetes", "terraform", "linux", "iso 27001", "zero trust"],
    description:
      "Build and run a SecNumCloud-qualified multi-tenant Kubernetes and CI/CD DevSecOps foundation hosting mission-critical French ministerial digital public services.",
    sourceUrl: "https://www.boamp.fr/avis/detail/26-114982",
  },
  {
    id: "fr-dgfip-tax-analytics-2026",
    source: "boamp",
    sourceId: "BOAMP-26-120341",
    authority: "Direction Générale des Finances Publiques (DGFiP)",
    title: "Predictive Fiscal Fraud Analytics & Sovereign Data Lakehouse",
    budget: 4850000,
    currency: "EUR",
    country: "FR",
    deadline: "2027-05-30",
    publicationDate: "2026-11-19",
    procedure: "restricted",
    status: "active",
    cpvCodes: ["72310000", "48611000"],
    technologies: ["python", "postgresql", "llm", "nlp"],
    description:
      "Modernization of national fiscal anomaly detection using graph analytics, explainable ML pipelines, and high-throughput sovereign PostgreSQL/columnar lakehouse infrastructure.",
    sourceUrl: "https://www.boamp.fr/avis/detail/26-120341",
  },

  // ── Netherlands (1 active) ──────────────────────────────────────────────
  {
    id: "nl-rijks-digital-id-2026",
    source: "ted",
    sourceId: "TED-2026-640219",
    authority: "Logius — Ministry of the Interior (BZK)",
    title: "EU eIDAS 2.0 National Digital Identity Wallet & Trust Core",
    budget: 3600000,
    currency: "EUR",
    country: "NL",
    deadline: "2027-03-04",
    publicationDate: "2026-11-06",
    procedure: "competitive_dialogue",
    status: "active",
    cpvCodes: ["48730000", "72222300"],
    technologies: ["openid connect", "zero trust", "typescript", "rest api"],
    description:
      "Architecture, cryptographic attestation issuers, and relying-party SDKs for the Dutch eIDAS 2.0 EDI Wallet aligned with the European Architecture Reference Framework.",
    sourceUrl: "https://ted.europa.eu/en/notice/-/detail/640219-2026",
  },

  // ── Recently Expired Notice (1 closed — validates Show Expired toggle) ─
  {
    id: "de-berlin-archive-legacy-2026",
    source: "evergabe",
    sourceId: "EVG-2026-662910",
    authority: "Senatsverwaltung für Finanzen Berlin",
    title: "Legacy Municipal Registry Decommissioning & Archive Migration",
    budget: 1180000,
    currency: "EUR",
    country: "DE",
    deadline: "2026-11-10",
    publicationDate: "2026-09-12",
    procedure: "open",
    status: "closed",
    cpvCodes: ["72262000", "48610000"],
    technologies: ["postgresql", "linux", "document ocr"],
    description:
      "Structured extraction, checksum verification, and archival migration of 14 legacy municipal tax and property registries into an audit-proof PostgreSQL archive.",
    sourceUrl: "https://www.evergabe-online.de/tenderdetails.html?id=662910",
  },
];

export const RAW_TENDERS: Tender[] = BASE_TENDERS.map((t) => ({
  ...t,
  cpvSector: getCpvSectorLabel(t.cpvCodes),
}));

/* ── 24 Curated Historical Awards (2024–2026) ──────────────────────────── */

export const HISTORICAL_AWARDS: HistoricalAwardRecord[] = [
  // T-Systems International (3 wins)
  {
    id: "aw-01",
    source: "ted",
    sourceId: "TED-AW-2025-1102",
    awardTitle: "Rechenzentrum Modernisierung & Sovereign Cloud Bund",
    authority: "ITZBund",
    winnerName: "T-Systems International",
    winnerCountry: "DE",
    contractValue: 5800000,
    currency: "EUR",
    awardDate: "2025-06-20",
    cpvCodes: ["72000000", "72300000", "48000000"],
    technologies: ["vmware", "kubernetes", "linux", "disaster recovery"],
  },
  {
    id: "aw-02",
    source: "ted",
    sourceId: "TED-AW-2026-0148",
    awardTitle: "Federal PKI & Zero-Trust Identity Backbone Lot 1",
    authority: "Bundesamt für Sicherheit in der Informationstechnik (BSI)",
    winnerName: "T-Systems International",
    winnerCountry: "DE",
    contractValue: 4950000,
    currency: "EUR",
    awardDate: "2026-02-14",
    cpvCodes: ["48730000", "72212730"],
    technologies: ["zero trust", "openid connect", "iso 27001"],
  },
  {
    id: "aw-03",
    source: "ted",
    sourceId: "TED-AW-2025-0891",
    awardTitle: "Hybrid Cloud Compute & Disaster Recovery Framework",
    authority: "Bundesrechenzentrum (BRZ) GmbH",
    winnerName: "T-Systems International",
    winnerCountry: "AT",
    contractValue: 3150000,
    currency: "EUR",
    awardDate: "2025-11-18",
    cpvCodes: ["72000000", "72300000"],
    technologies: ["vmware", "linux", "disaster recovery"],
  },

  // SAP SE (2 wins)
  {
    id: "aw-04",
    source: "ted",
    sourceId: "TED-AW-2025-0510",
    awardTitle: "SAP S/4HANA Core Transformation Bundesfinanzverwaltung",
    authority: "Bundesministerium der Finanzen",
    winnerName: "SAP SE",
    winnerCountry: "DE",
    contractValue: 12400000,
    currency: "EUR",
    awardDate: "2025-05-10",
    cpvCodes: ["72230000", "72300000"],
    technologies: ["sap s/4hana", "linux", "change management"],
  },
  {
    id: "aw-05",
    source: "ted",
    sourceId: "TED-AW-2026-0412",
    awardTitle: "State Treasury ERP Modernization & S/4HANA Licensing",
    authority: "BMF — Österreich",
    winnerName: "SAP SE",
    winnerCountry: "AT",
    contractValue: 6100000,
    currency: "EUR",
    awardDate: "2026-04-12",
    cpvCodes: ["72230000", "72000000"],
    technologies: ["sap s/4hana", "change management"],
  },

  // Capgemini Public (2 wins)
  {
    id: "aw-06",
    source: "boamp",
    sourceId: "BOAMP-AW-2025-9421",
    awardTitle: "Plateforme Cloud Souveraine SecNumCloud & DevSecOps",
    authority: "Ministère de l'Intérieur — DTNUM",
    winnerName: "Capgemini Public",
    winnerCountry: "FR",
    contractValue: 7400000,
    currency: "EUR",
    awardDate: "2025-12-09",
    cpvCodes: ["48820000", "72514300", "48000000"],
    technologies: ["kubernetes", "terraform", "linux", "zero trust"],
  },
  {
    id: "aw-07",
    source: "ted",
    sourceId: "TED-AW-2026-0305",
    awardTitle: "National Digital Identity Federation & Trust Services",
    authority: "Logius — Rijksoverheid",
    winnerName: "Capgemini Public",
    winnerCountry: "NL",
    contractValue: 4100000,
    currency: "EUR",
    awardDate: "2026-03-05",
    cpvCodes: ["48730000", "72222300"],
    technologies: ["openid connect", "zero trust", "rest api"],
  },

  // Bechtle AG (2 wins)
  {
    id: "aw-08",
    source: "evergabe",
    sourceId: "EVG-AW-2026-2209",
    awardTitle: "Managed Kubernetes & Enterprise Infrastructure Operations",
    authority: "Freistaat Bayern — Landesamt für Digitalisierung",
    winnerName: "Bechtle AG",
    winnerCountry: "DE",
    contractValue: 3750000,
    currency: "EUR",
    awardDate: "2026-01-22",
    cpvCodes: ["48000000", "72267100", "48820000"],
    technologies: ["kubernetes", "terraform", "linux", "iso 27001"],
  },
  {
    id: "aw-09",
    source: "evergabe",
    sourceId: "EVG-AW-2025-1780",
    awardTitle: "Regional Broadband Core Switching & Fiber PMO Bavaria",
    authority: "Bayerisches Staatsministerium der Finanzen",
    winnerName: "Bechtle AG",
    winnerCountry: "DE",
    contractValue: 1850000,
    currency: "EUR",
    awardDate: "2025-09-14",
    cpvCodes: ["32410000", "71311200"],
    technologies: ["fiber optics", "gis", "project management"],
  },

  // Atos / Eviden (2 wins)
  {
    id: "aw-10",
    source: "boamp",
    sourceId: "BOAMP-AW-2026-3105",
    awardTitle: "Plateforme Analytique Fiscale & Lakehouse Souverain",
    authority: "DGFiP — Ministère de l'Économie",
    winnerName: "Atos / Eviden",
    winnerCountry: "FR",
    contractValue: 5300000,
    currency: "EUR",
    awardDate: "2026-05-08",
    cpvCodes: ["72310000", "48611000"],
    technologies: ["python", "postgresql", "nlp"],
  },
  {
    id: "aw-11",
    source: "ted",
    sourceId: "TED-AW-2024-8820",
    awardTitle: "High-Availability Security & Sovereign Compute Operations",
    authority: "Bundesagentur für Arbeit",
    winnerName: "Atos / Eviden",
    winnerCountry: "DE",
    contractValue: 4600000,
    currency: "EUR",
    awardDate: "2024-11-28",
    cpvCodes: ["72514300", "72267100", "48730000"],
    technologies: ["linux", "zero trust", "iso 27001"],
  },

  // SecuNova AG (2 wins)
  {
    id: "aw-12",
    source: "evergabe",
    sourceId: "EVG-AW-2025-4410",
    awardTitle: "SIEM & 24/7 Security Operations Center Bundesbehörden",
    authority: "Bundesministerium des Innern (BMI)",
    winnerName: "SecuNova AG",
    winnerCountry: "DE",
    contractValue: 2450000,
    currency: "EUR",
    awardDate: "2025-08-15",
    cpvCodes: ["48732000", "72267100", "48000000"],
    technologies: ["elasticsearch", "iso 27001", "zero trust"],
  },
  {
    id: "aw-13",
    source: "simap",
    sourceId: "SIMAP-AW-2026-1190",
    awardTitle: "Critical Energy & Rail OT/IT Cyber Defense Platform",
    authority: "Swissgrid / Federal Cyber Security Center (NCSC)",
    winnerName: "SecuNova AG",
    winnerCountry: "CH",
    contractValue: 3200000,
    currency: "CHF",
    awardDate: "2026-06-11",
    cpvCodes: ["48732000", "72267100"],
    technologies: ["elasticsearch", "zero trust", "python", "iso 27001"],
  },

  // Swisscom Digital (2 wins)
  {
    id: "aw-14",
    source: "simap",
    sourceId: "SIMAP-AW-2026-0842",
    awardTitle: "E-Government Citizen Identity Portal & API Gateway",
    authority: "Kanton Zürich — Staatskanzlei",
    winnerName: "Swisscom Digital",
    winnerCountry: "CH",
    contractValue: 2600000,
    currency: "CHF",
    awardDate: "2026-03-19",
    cpvCodes: ["48000000", "72200000"],
    technologies: ["react", "node.js", "openid connect", "rest api", "typescript"],
  },
  {
    id: "aw-15",
    source: "simap",
    sourceId: "SIMAP-AW-2025-0519",
    awardTitle: "Alpine Fiber Network Telemetry & Carrier Infrastructure",
    authority: "Kanton Graubünden — Tiefbauamt",
    winnerName: "Swisscom Digital",
    winnerCountry: "CH",
    contractValue: 1920000,
    currency: "CHF",
    awardDate: "2025-07-22",
    cpvCodes: ["32410000", "48732000"],
    technologies: ["fiber optics", "gis", "zero trust"],
  },

  // msg systems AG (2 wins)
  {
    id: "aw-16",
    source: "auftragsportal",
    sourceId: "AT-AW-2026-1044",
    awardTitle: "ELGA e-Health FHIR Gateway & Clinical Data Exchange",
    authority: "ELGA GmbH / Sozialministerium",
    winnerName: "msg systems AG",
    winnerCountry: "AT",
    contractValue: 2780000,
    currency: "EUR",
    awardDate: "2026-07-03",
    cpvCodes: ["72212180", "48814000"],
    technologies: ["rest api", "postgresql", "kubernetes", "openid connect"],
  },
  {
    id: "aw-17",
    source: "evergabe",
    sourceId: "EVG-AW-2025-7721",
    awardTitle: "Public Sector ERP Integration & Legacy Registry Migration",
    authority: "Freie und Hansestadt Hamburg — Finanzbehörde",
    winnerName: "msg systems AG",
    winnerCountry: "DE",
    contractValue: 3420000,
    currency: "EUR",
    awardDate: "2025-10-08",
    cpvCodes: ["72230000", "72262000", "48610000"],
    technologies: ["sap s/4hana", "postgresql", "rest api"],
  },

  // Sopra Steria (2 wins)
  {
    id: "aw-18",
    source: "boamp",
    sourceId: "BOAMP-AW-2026-5501",
    awardTitle: "Usine Logicielle DevSecOps & Conteneurisation Interministérielle",
    authority: "DINUM — Services du Premier Ministre",
    winnerName: "Sopra Steria",
    winnerCountry: "FR",
    contractValue: 5100000,
    currency: "EUR",
    awardDate: "2026-04-27",
    cpvCodes: ["48820000", "72514300"],
    technologies: ["kubernetes", "terraform", "linux", "iso 27001"],
  },
  {
    id: "aw-19",
    source: "boamp",
    sourceId: "BOAMP-AW-2025-3318",
    awardTitle: "Système d'Analyse Automatisée des Dossiers Administratifs",
    authority: "Caisse Nationale des Allocations Familiales (CNAF)",
    winnerName: "Sopra Steria",
    winnerCountry: "FR",
    contractValue: 2280000,
    currency: "EUR",
    awardDate: "2025-04-16",
    cpvCodes: ["72250000", "72310000"],
    technologies: ["python", "nlp", "document ocr", "postgresql"],
  },

  // Accelereon IT GmbH (1 win)
  {
    id: "aw-20",
    source: "ted",
    sourceId: "TED-AW-2025-9940",
    awardTitle: "Cloud-Migration Bundeswehr IT-Systeme & Container-Plattform",
    authority: "BWI GmbH",
    winnerName: "Accelereon IT GmbH",
    winnerCountry: "DE",
    contractValue: 3900000,
    currency: "EUR",
    awardDate: "2025-11-01",
    cpvCodes: ["48000000", "72267100", "72200000"],
    technologies: ["kubernetes", "postgresql", "terraform", "iso 27001"],
  },

  // BearingPoint (1 win)
  {
    id: "aw-21",
    source: "ted",
    sourceId: "TED-AW-2025-6012",
    awardTitle: "EU Digital Identity Architecture & Interoperability Advisory",
    authority: "Ministerie van Binnenlandse Zaken (BZK)",
    winnerName: "BearingPoint",
    winnerCountry: "NL",
    contractValue: 1680000,
    currency: "EUR",
    awardDate: "2025-10-24",
    cpvCodes: ["72222300", "48730000"],
    technologies: ["openid connect", "zero trust", "rest api"],
  },

  // DataBridge Solutions (1 win)
  {
    id: "aw-22",
    source: "auftragsportal",
    sourceId: "AT-AW-2025-7741",
    awardTitle: "Datenbankmigration & Register-Archivierung Landesverwaltung",
    authority: "Amt der Niederösterreichischen Landesregierung",
    winnerName: "DataBridge Solutions",
    winnerCountry: "AT",
    contractValue: 940000,
    currency: "EUR",
    awardDate: "2025-12-03",
    cpvCodes: ["72262000", "48610000", "72300000"],
    technologies: ["postgresql", "linux", "document ocr"],
  },

  // UrbanTech Solutions GmbH (1 win)
  {
    id: "aw-23",
    source: "evergabe",
    sourceId: "EVG-AW-2025-8824",
    awardTitle: "Smart City Pilot Stuttgart — Traffic Sensorik & Autonomous Mobility",
    authority: "Landeshauptstadt Stuttgart",
    winnerName: "UrbanTech Solutions GmbH",
    winnerCountry: "DE",
    contractValue: 1580000,
    currency: "EUR",
    awardDate: "2025-10-12",
    cpvCodes: ["31620000", "31680000", "71300000", "48000000"],
    technologies: ["iot", "robotics", "python", "timescaledb", "mqtt", "edge computing"],
  },

  // CogniGov Analytics (1 win)
  {
    id: "aw-24",
    source: "evergabe",
    sourceId: "EVG-AW-2026-0912",
    awardTitle: "KI-gestützte Dokumentenprüfung & Steuer-Triage Hessen",
    authority: "Hessisches Ministerium der Finanzen",
    winnerName: "CogniGov Analytics",
    winnerCountry: "DE",
    contractValue: 1290000,
    currency: "EUR",
    awardDate: "2026-05-28",
    cpvCodes: ["72250000", "72310000", "48611000"],
    technologies: ["llm", "nlp", "python", "document ocr"],
  },
];

/* ── Dynamically Computed Sandbox Intelligence ──────────────────────────── */

/**
 * Enriched sandbox tenders with zero hardcoded match scores — every match,
 * winner prediction, and 4-axis Bid Scorecard is deterministically derived
 * from `RAW_TENDERS` + `HISTORICAL_AWARDS` via `intelligence-engine.ts`.
 */
export const ENRICHED_TENDERS: TenderWithIntelligence[] = RAW_TENDERS.map(
  (tender) => enrichTender(tender, HISTORICAL_AWARDS),
);

/** Legacy-compatible export backed by `ENRICHED_TENDERS`. */
export const TENDERS: TenderWithMatches[] = ENRICHED_TENDERS;

/* ── Legacy-Compatible Convenience Helpers ──────────────────────────────── */

export { daysUntil, formatCurrency };

/** Collect every distinct technology across all sandbox tenders, sorted. */
export function allTechnologies(): string[] {
  const set = new Set<string>();
  for (const t of RAW_TENDERS) {
    for (const tech of t.technologies) set.add(tech);
  }
  return [...set].sort();
}

export function totalBudget(tenders: Tender[]): string {
  const eur = tenders.reduce(
    (sum, t) => sum + toEur(t.budget, t.currency),
    0,
  );
  return formatCurrency(Math.round(eur), "EUR");
}

export function topTechFor(tenders: Tender[]): string {
  const freq = new Map<string, number>();
  for (const t of tenders) {
    for (const tech of t.technologies) {
      freq.set(tech, (freq.get(tech) ?? 0) + 1);
    }
  }
  let top = "";
  let max = 0;
  for (const [tech, count] of freq) {
    if (count > max) {
      max = count;
      top = tech;
    }
  }
  return top;
}
