/**
 * Executive-grade DACH & EU OCDS procurement fixtures.
 *
 * Used as a keyless fallback for TED (when `TED_API_TOKEN` is unset) and as
 * optional sandbox feeds for Swiss SIMAP and German evergabe. All active
 * tender deadlines fall between 2026-12 and 2027-06, alongside realistic
 * historical award notices (including award-only releases with no `tender`
 * block to exercise award-only ingestion).
 */
import type { OcdsRelease } from "../ingestion/ocds-types.js";

export const TED_FIXTURES: OcdsRelease[] = [
  {
    ocid: "ocds-ted-2026-001",
    id: "release-ted-2026-001",
    date: "2026-11-10T08:00:00Z",
    tag: ["tender"],
    url: "https://ted.europa.eu/en/notice/-/detail/691420-2026",
    parties: [
      {
        id: "org-de-bmdv",
        name: "Bundesministerium für Digitales und Verkehr (BMDV)",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Berlin",
          streetAddress: "Invalidenstraße 44, 10115 Berlin",
        },
        identifier: {
          scheme: "TED_ORG_ID",
          id: "DE-BMDV-001",
          legalName: "Bundesrepublik Deutschland — BMDV",
        },
        contactPoint: {
          email: "vergabe-it@bmdv.bund.de",
          url: "https://www.evergabe-online.de",
        },
      },
    ],
    tender: {
      id: "t-ted-2026-001",
      title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
      description:
        "Aufbau, Betrieb und Weiterentwicklung einer hochverfügbaren Kubernetes-basierten Containerplattform (BSI C5 Typ 2) mit PostgreSQL-Migration, ElasticSearch-SIEM, OpenTelemetry-Observability und Beratung zu Zero-Trust-Netzwerkarchitektur gemäß ISO 27001 und BSI IT-Grundschutz.",
      status: "active",
      value: { amount: 4250000, currency: "EUR" },
      tenderPeriod: {
        startDate: "2026-11-10T08:00:00Z",
        endDate: "2026-12-18T12:00:00Z",
      },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-de-bmdv",
        name: "Bundesministerium für Digitales und Verkehr (BMDV)",
      },
      items: [
        {
          id: "1",
          description: "Cloud-Native Containerplattform & Orchestrierung",
          classification: { scheme: "CPV", id: "48000000-8" },
          additionalClassifications: [
            { scheme: "CPV", id: "72212730-5" },
          ],
        },
        {
          id: "2",
          description: "SIEM-Betrieb, Wartung und Sicherheitsberatung (ISO 27001)",
          classification: { scheme: "CPV", id: "72267100-7" },
        },
      ],
      documents: [
        {
          id: "doc-ted-001-notice",
          documentType: "tenderNotice",
          title: "EU-Bekanntmachung 691420-2026 (TED)",
          url: "https://ted.europa.eu/en/notice/-/detail/691420-2026",
        },
        {
          id: "doc-ted-001-spec",
          documentType: "technicalSpecifications",
          title: "Leistungsbeschreibung Cloud-Native Plattform & SIEM (PDF)",
          url: "https://www.evergabe-online.de/tenderdocuments.html?id=691420",
        },
      ],
    },
  },
  {
    ocid: "ocds-ted-2026-002",
    id: "release-ted-2026-002",
    date: "2026-11-14T09:30:00Z",
    tag: ["tender"],
    url: "https://ted.europa.eu/en/notice/-/detail/704118-2026",
    parties: [
      {
        id: "org-at-bmf",
        name: "Bundesministerium für Finanzen (BMF — Österreich)",
        roles: ["buyer"],
        address: {
          country: "AT",
          region: "Wien",
          streetAddress: "Johannesgasse 5, 1010 Wien",
        },
        identifier: {
          scheme: "TED_ORG_ID",
          id: "AT-BMF-001",
          legalName: "Republik Österreich — Bundesministerium für Finanzen",
        },
        contactPoint: {
          email: "beschaffung@bmf.gv.at",
          url: "https://www.bmf.gv.at",
        },
      },
    ],
    tender: {
      id: "t-ted-2026-002",
      title: "Modernisierung des zentralen Rechenzentrums & SAP S/4HANA Migration",
      description:
        "Komplettsanierung des georedundanten Rechenzentrums inkl. Migration von VMware vSphere auf Red Hat OpenShift, SAP S/4HANA Brownfield-Migration, Linux-Systembetrieb (RHEL 9) sowie hochverfügbarem Disaster-Recovery-Konzept (RPO < 15 Min.).",
      status: "active",
      value: { amount: 3100000, currency: "EUR" },
      tenderPeriod: {
        startDate: "2026-11-14T09:30:00Z",
        endDate: "2027-01-22T12:00:00Z",
      },
      procurementMethod: "restricted",
      procuringEntity: {
        id: "org-at-bmf",
        name: "Bundesministerium für Finanzen (BMF — Österreich)",
      },
      items: [
        {
          id: "1",
          description: "Rechenzentrumsinfrastruktur & Virtualisierung",
          classification: { scheme: "CPV", id: "72000000-6" },
        },
        {
          id: "2",
          description: "Datenbankbetrieb, SAP S/4HANA & Disaster Recovery",
          classification: { scheme: "CPV", id: "72300000-4" },
          additionalClassifications: [
            { scheme: "CPV", id: "72250000-2" },
          ],
        },
      ],
      documents: [
        {
          id: "doc-ted-002-notice",
          documentType: "tenderNotice",
          title: "EU-Bekanntmachung 704118-2026 (TED)",
          url: "https://ted.europa.eu/en/notice/-/detail/704118-2026",
        },
      ],
    },
  },
  {
    ocid: "ocds-ted-2026-003",
    id: "release-ted-2026-003",
    date: "2026-05-28T00:00:00Z",
    tag: ["award"],
    url: "https://ted.europa.eu/en/notice/-/detail/338912-2026",
    parties: [
      {
        id: "org-de-bw",
        name: "Landesverwaltung Baden-Württemberg (BITBW)",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Baden-Württemberg",
          streetAddress: "Krailenshaldenstraße 44, 70469 Stuttgart",
        },
        identifier: {
          scheme: "TED_ORG_ID",
          id: "DE-BITBW-002",
        },
      },
      {
        id: "org-supplier-sap",
        name: "SAP SE",
        roles: ["supplier"],
        address: {
          country: "DE",
          region: "Baden-Württemberg",
          streetAddress: "Dietmar-Hopp-Allee 16, 69190 Walldorf",
        },
        identifier: {
          scheme: "VAT",
          id: "DE143593636",
          legalName: "SAP SE",
        },
      },
    ],
    tender: {
      id: "t-ted-2026-003",
      title: "ERP-System Migration & Schulung (SAP S/4HANA)",
      description:
        "Landesweite Migration der Haushalts- und Personalwirtschaft von SAP R/3 auf SAP S/4HANA inklusive Change-Management und Schulung für 12.000 Mitarbeitende.",
      status: "complete",
      value: { amount: 12800000, currency: "EUR" },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-de-bw",
        name: "Landesverwaltung Baden-Württemberg (BITBW)",
      },
      items: [
        { classification: { scheme: "CPV", id: "72230000-6" } },
        { classification: { scheme: "CPV", id: "72300000-4" } },
      ],
    },
    awards: [
      {
        id: "a-ted-2026-003",
        title: "Vergabe SAP S/4HANA Migration Baden-Württemberg",
        description:
          "Zuschlag für Einführung, Datenmigration und Betriebsunterstützung SAP S/4HANA Public Sector.",
        status: "active",
        date: "2026-05-20",
        value: { amount: 12400000, currency: "EUR" },
        suppliers: [{ id: "org-supplier-sap", name: "SAP SE" }],
        items: [
          { classification: { scheme: "CPV", id: "72230000-6" } },
          { classification: { scheme: "CPV", id: "72300000-4" } },
        ],
        documents: [
          {
            id: "doc-ted-003-award",
            documentType: "awardNotice",
            title: "Zuschlagsbekanntmachung 338912-2026 (TED)",
            url: "https://ted.europa.eu/en/notice/-/detail/338912-2026",
          },
        ],
      },
    ],
  },
  {
    // Award-only OCDS release (intentionally NO `tender` block) to exercise award-only ingestion.
    ocid: "ocds-ted-2026-004",
    id: "release-ted-2026-004",
    date: "2026-09-21T10:15:00Z",
    tag: ["award"],
    url: "https://ted.europa.eu/en/notice/-/detail/589204-2026",
    parties: [
      {
        id: "org-de-bsi",
        name: "Bundesamt für Sicherheit in der Informationstechnik (BSI)",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Nordrhein-Westfalen",
          streetAddress: "Godesberger Allee 87, 53175 Bonn",
        },
        identifier: {
          scheme: "TED_ORG_ID",
          id: "DE-BSI-004",
        },
      },
      {
        id: "org-supplier-secunova",
        name: "SecuNova AG",
        roles: ["supplier"],
        address: {
          country: "DE",
          region: "Bayern",
          streetAddress: "Arnulfstraße 126, 80636 München",
        },
        identifier: {
          scheme: "VAT",
          id: "DE298412771",
          legalName: "SecuNova Cyber Defense AG",
        },
      },
    ],
    awards: [
      {
        id: "a-ted-2026-004",
        title: "Managed Detection & Response (MDR) und 24/7 SOC-Betrieb Bundesverwaltung",
        description:
          "Rahmenvertrag für 24/7 Security Operations Center, SIEM-Korrelation (Elastic/Splunk), Threat Hunting und Incident Response mit Sicherheitsüberprüfung Ü2.",
        status: "active",
        date: "2026-09-14",
        value: { amount: 2850000, currency: "EUR" },
        suppliers: [{ id: "org-supplier-secunova", name: "SecuNova AG" }],
        items: [
          { classification: { scheme: "CPV", id: "72212730-5" } },
          { classification: { scheme: "CPV", id: "72250000-2" } },
        ],
        documents: [
          {
            id: "doc-ted-004-award",
            documentType: "awardNotice",
            title: "Zuschlagsbekanntmachung 589204-2026 (TED)",
            url: "https://ted.europa.eu/en/notice/-/detail/589204-2026",
          },
        ],
      },
    ],
  },
  {
    ocid: "ocds-ted-2026-005",
    id: "release-ted-2026-005",
    date: "2026-11-19T11:00:00Z",
    tag: ["tender"],
    url: "https://ted.europa.eu/en/notice/-/detail/719842-2026",
    parties: [
      {
        id: "org-de-bka-digital",
        name: "Bundeskanzleramt — DigitalService des Bundes",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Berlin",
          streetAddress: "Prinzessinnenstraße 8-14, 10969 Berlin",
        },
        contactPoint: {
          email: "ausschreibungen@digitalservice.bund.de",
          url: "https://digitalservice.bund.de",
        },
      },
    ],
    tender: {
      id: "t-ted-2026-005",
      title: "KI-gestützte Dokumentenanalyse & Automatisierung von Behördenakten",
      description:
        "Entwicklung einer DSGVO- und EU-AI-Act-konformen NLP- und OCR-Pipeline (Python, Mistral/Open-Weights LLMs, pgvector) zur strukturierten Klassifikation und Zusammenfassung mehrsprachiger Verwaltungsakten im On-Premises-Betrieb.",
      status: "active",
      value: { amount: 1450000, currency: "EUR" },
      tenderPeriod: {
        startDate: "2026-11-19T11:00:00Z",
        endDate: "2027-03-15T14:00:00Z",
      },
      procurementMethod: "negotiated",
      procuringEntity: {
        id: "org-de-bka-digital",
        name: "Bundeskanzleramt — DigitalService des Bundes",
      },
      items: [
        {
          id: "1",
          description: "KI/NLP-Extraktionspipeline & Dokumenten-OCR",
          classification: { scheme: "CPV", id: "72250000-2" },
          additionalClassifications: [
            { scheme: "CPV", id: "72310000-1" },
          ],
        },
        {
          id: "2",
          description: "Softwarepaket & Integration in E-Akte Bund",
          classification: { scheme: "CPV", id: "48000000-8" },
        },
      ],
      documents: [
        {
          id: "doc-ted-005-notice",
          documentType: "tenderNotice",
          title: "EU-Bekanntmachung 719842-2026 (TED)",
          url: "https://ted.europa.eu/en/notice/-/detail/719842-2026",
        },
      ],
    },
  },
];

export const SIMAP_FIXTURES: OcdsRelease[] = [
  {
    ocid: "ocds-simap-2026-001",
    id: "release-simap-2026-001",
    date: "2026-11-12T07:30:00Z",
    tag: ["tender"],
    url: "https://www.simap.ch/de/project-detail/2026-291405",
    parties: [
      {
        id: "org-ch-bit",
        name: "Bundesamt für Informatik und Telekommunikation (BIT)",
        roles: ["buyer"],
        address: {
          country: "CH",
          region: "Bern",
          streetAddress: "Eichenweg 3, 3052 Zollikofen",
        },
        identifier: {
          scheme: "CH-UID",
          id: "CHE-115.694.801",
          legalName: "Schweizerische Eidgenossenschaft — BIT",
        },
        contactPoint: {
          email: "wto-beschaffungen@bit.admin.ch",
          url: "https://www.simap.ch",
        },
      },
    ],
    tender: {
      id: "t-simap-2026-001",
      title: "E-Government Portal Redesign & Föderiertes API-Gateway (eIAM)",
      description:
        "Neugestaltung des dreisprachigen E-Government-Portals (DE/FR/IT) mit React/TypeScript-Frontend, Node.js-BFF, föderiertem OpenID Connect / eIAM API-Gateway sowie vollständiger Compliance mit dem Schweizer Datenschutzgesetz (revDSG) und WCAG 2.1 AA.",
      status: "active",
      value: { amount: 1850000, currency: "CHF" },
      tenderPeriod: {
        startDate: "2026-11-12T07:30:00Z",
        endDate: "2027-02-12T16:00:00Z",
      },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-ch-bit",
        name: "Bundesamt für Informatik und Telekommunikation (BIT)",
      },
      items: [
        {
          id: "1",
          description: "Webportal-Entwicklung & Barrierefreiheit",
          classification: { scheme: "CPV", id: "72413000-8" },
        },
        {
          id: "2",
          description: "API-Gateway, IAM-Integration & Softwareentwicklung",
          classification: { scheme: "CPV", id: "48000000-8" },
          additionalClassifications: [
            { scheme: "CPV", id: "72200000-7" },
          ],
        },
      ],
      documents: [
        {
          id: "doc-simap-001-notice",
          documentType: "tenderNotice",
          title: "SIMAP WTO-Ausschreibung Nr. 2026-291405",
          url: "https://www.simap.ch/de/project-detail/2026-291405",
        },
      ],
    },
  },
  {
    ocid: "ocds-simap-2026-002",
    id: "release-simap-2026-002",
    date: "2026-11-18T08:00:00Z",
    tag: ["tender"],
    url: "https://www.simap.ch/de/project-detail/2026-304918",
    parties: [
      {
        id: "org-ch-zh-afi",
        name: "Kanton Zürich — Amt für Informatik (AFI)",
        roles: ["buyer"],
        address: {
          country: "CH",
          region: "Zürich",
          streetAddress: "Stampfenbachstrasse 110, 8090 Zürich",
        },
        identifier: {
          scheme: "CH-UID",
          id: "CHE-114.920.112",
        },
        contactPoint: {
          email: "einkauf@afi.zh.ch",
          url: "https://www.zh.ch/afi",
        },
      },
    ],
    tender: {
      id: "t-simap-2026-002",
      title: "Kantonale Datenplattform & Geo-Analytics Cloud",
      description:
        "Aufbau einer souveränen kantonalen Daten- und Analytics-Plattform in Schweizer Rechenzentren mit PostgreSQL/PostGIS, Apache Kafka, dbt, Python-ETL-Pipelines und Kubernetes-Workload-Steuerung für Open Government Data.",
      status: "active",
      value: { amount: 2400000, currency: "CHF" },
      tenderPeriod: {
        startDate: "2026-11-18T08:00:00Z",
        endDate: "2027-04-30T15:00:00Z",
      },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-ch-zh-afi",
        name: "Kanton Zürich — Amt für Informatik (AFI)",
      },
      items: [
        {
          id: "1",
          description: "Datenplattform & Streaming-Architektur",
          classification: { scheme: "CPV", id: "72300000-4" },
        },
        {
          id: "2",
          description: "Datenbank- & Geo-Analytics-Software",
          classification: { scheme: "CPV", id: "48610000-7" },
          additionalClassifications: [
            { scheme: "CPV", id: "72315000-6" },
          ],
        },
      ],
      documents: [
        {
          id: "doc-simap-002-notice",
          documentType: "tenderNotice",
          title: "SIMAP Ausschreibung Nr. 2026-304918 — Kanton Zürich",
          url: "https://www.simap.ch/de/project-detail/2026-304918",
        },
      ],
    },
  },
  {
    // Award-only release (NO `tender` block) for Swiss SIMAP historical award intelligence.
    ocid: "ocds-simap-2026-003",
    id: "release-simap-2026-003",
    date: "2026-10-12T09:00:00Z",
    tag: ["award"],
    url: "https://www.simap.ch/de/project-detail/2026-278510",
    parties: [
      {
        id: "org-ch-sbb",
        name: "Schweizerische Bundesbahnen (SBB CFF FFS)",
        roles: ["buyer"],
        address: {
          country: "CH",
          region: "Bern",
          streetAddress: "Hilfikerstrasse 1, 3000 Bern 65",
        },
      },
      {
        id: "org-supplier-helvetia-cloud",
        name: "Helvetia Cloud Systems AG",
        roles: ["supplier"],
        address: {
          country: "CH",
          region: "Zürich",
          streetAddress: "Technoparkstrasse 1, 8005 Zürich",
        },
        identifier: {
          scheme: "CH-UID",
          id: "CHE-392.410.558",
        },
      },
    ],
    awards: [
      {
        id: "a-simap-2026-003",
        title: "Zuschlag: Multi-Cloud Observability & FinOps Betriebsplattform",
        description:
          "Betrieb und Ausbau der konzernweiten Observability-Plattform (Prometheus, Grafana, OpenTelemetry) sowie Cloud-FinOps-Automatisierung für AWS/Azure/On-Premises.",
        status: "active",
        date: "2026-10-08",
        value: { amount: 3600000, currency: "CHF" },
        suppliers: [
          { id: "org-supplier-helvetia-cloud", name: "Helvetia Cloud Systems AG" },
        ],
        items: [
          { classification: { scheme: "CPV", id: "72500000-0" } },
          { classification: { scheme: "CPV", id: "72267100-7" } },
        ],
        documents: [
          {
            id: "doc-simap-003-award",
            documentType: "awardNotice",
            title: "SIMAP Zuschlagsverfügung Nr. 2026-278510",
            url: "https://www.simap.ch/de/project-detail/2026-278510",
          },
        ],
      },
    ],
  },
];

export const EVERGABE_FIXTURES: OcdsRelease[] = [
  {
    ocid: "ocds-evergabe-2026-001",
    id: "release-evergabe-2026-001",
    date: "2026-11-15T10:00:00Z",
    tag: ["tender"],
    url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-7381",
    parties: [
      {
        id: "org-de-muenchen",
        name: "Landeshauptstadt München — IT-Referat (RIT)",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Bayern",
          streetAddress: "Agnes-Pockels-Bogen 21, 80992 München",
        },
        contactPoint: {
          email: "vergabe.rit@muenchen.de",
          url: "https://www.evergabe-online.de",
        },
      },
    ],
    tender: {
      id: "t-evergabe-2026-001",
      title: "Intelligentes Verkehrsmanagement — IoT-Sensorik & Echtzeit-Backend",
      description:
        "Aufbau einer stadtweiten IoT-Sensorinfrastruktur zur adaptiven Verkehrsflussanalyse mit Python-Backend, TimescaleDB, MQTT-Broker-Cluster, Edge-Computing-Gateways und offenen OGC-SensorThings-APIs.",
      status: "active",
      value: { amount: 2650000, currency: "EUR" },
      tenderPeriod: {
        startDate: "2026-11-15T10:00:00Z",
        endDate: "2027-01-29T11:00:00Z",
      },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-de-muenchen",
        name: "Landeshauptstadt München — IT-Referat (RIT)",
      },
      items: [
        {
          id: "1",
          description: "Verkehrssensorik & Edge-Gateways",
          classification: { scheme: "CPV", id: "31620000-8" },
        },
        {
          id: "2",
          description: "Echtzeit-Datenplattform & MQTT/TimescaleDB-Software",
          classification: { scheme: "CPV", id: "48000000-8" },
          additionalClassifications: [
            { scheme: "CPV", id: "72316000-3" },
          ],
        },
      ],
      documents: [
        {
          id: "doc-evergabe-001-notice",
          documentType: "tenderNotice",
          title: "e-Vergabe Bekanntmachung 2026-7381 (München)",
          url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-7381",
        },
      ],
    },
  },
  {
    ocid: "ocds-evergabe-2026-002",
    id: "release-evergabe-2026-002",
    date: "2026-11-20T08:45:00Z",
    tag: ["tender"],
    url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-8419",
    parties: [
      {
        id: "org-de-itzbund",
        name: "Informationstechnikzentrum Bund (ITZBund)",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Nordrhein-Westfalen",
          streetAddress: "Bernkasteler Straße 8, 53175 Bonn",
        },
        identifier: {
          scheme: "TED_ORG_ID",
          id: "DE-ITZBUND-001",
        },
        contactPoint: {
          email: "vergabestelle@itzbund.de",
          url: "https://www.itzbund.de",
        },
      },
    ],
    tender: {
      id: "t-evergabe-2026-002",
      title: "Barrierefreies OZG-Antragsportal & BundID-Integration",
      description:
        "Entwicklung und 4-jähriger Betrieb eines barrierefreien OZG-2.0-Antragsportals nach BITV 2.0 / WCAG 2.1 AA mit Java/Spring Boot Microservices, TypeScript-Frontend, BundID-Anbindung (SAML 2.0 / eID) und FIT-Connect-Schnittstelle.",
      status: "active",
      value: { amount: 3900000, currency: "EUR" },
      tenderPeriod: {
        startDate: "2026-11-20T08:45:00Z",
        endDate: "2027-05-21T12:00:00Z",
      },
      procurementMethod: "open",
      procuringEntity: {
        id: "org-de-itzbund",
        name: "Informationstechnikzentrum Bund (ITZBund)",
      },
      items: [
        {
          id: "1",
          description: "OZG-Fachverfahren & Portalentwicklung",
          classification: { scheme: "CPV", id: "72212900-8" },
          additionalClassifications: [
            { scheme: "CPV", id: "72222300-0" },
          ],
        },
        {
          id: "2",
          description: "Web-Frontend, BITV 2.0 Barrierefreiheit & BundID",
          classification: { scheme: "CPV", id: "72413000-8" },
        },
      ],
      documents: [
        {
          id: "doc-evergabe-002-notice",
          documentType: "tenderNotice",
          title: "e-Vergabe Bekanntmachung 2026-8419 (ITZBund)",
          url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-8419",
        },
      ],
    },
  },
  {
    // Award-only release (NO `tender` block) for German evergabe historical award intelligence.
    ocid: "ocds-evergabe-2026-003",
    id: "release-evergabe-2026-003",
    date: "2026-09-02T13:00:00Z",
    tag: ["award"],
    url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-5902",
    parties: [
      {
        id: "org-de-dataport",
        name: "Freie und Hansestadt Hamburg — Dataport AöR",
        roles: ["buyer"],
        address: {
          country: "DE",
          region: "Hamburg",
          streetAddress: "Billstraße 82, 20539 Hamburg",
        },
      },
      {
        id: "org-supplier-urbantech",
        name: "UrbanTech Solutions GmbH",
        roles: ["supplier"],
        address: {
          country: "DE",
          region: "Baden-Württemberg",
          streetAddress: "Königstraße 27, 70173 Stuttgart",
        },
        identifier: {
          scheme: "VAT",
          id: "DE314009821",
        },
      },
    ],
    awards: [
      {
        id: "a-evergabe-2026-003",
        title: "Vergabe: Digitale Zwillinge & Urban Data Hub Phase II",
        description:
          "Zuschlag für Ausbau des Hamburger Urban Data Hubs inkl. 3D-Stadtmodell-API, Echtzeit-Sensorintegration und PostGIS-Datenpipeline.",
        status: "active",
        date: "2026-08-27",
        value: { amount: 1720000, currency: "EUR" },
        suppliers: [
          { id: "org-supplier-urbantech", name: "UrbanTech Solutions GmbH" },
        ],
        items: [
          { classification: { scheme: "CPV", id: "72310000-1" } },
          { classification: { scheme: "CPV", id: "48000000-8" } },
        ],
        documents: [
          {
            id: "doc-evergabe-003-award",
            documentType: "awardNotice",
            title: "e-Vergabe Zuschlagsbekanntmachung 2026-5902",
            url: "https://www.evergabe-online.de/tenderdetails.html?id=2026-5902",
          },
        ],
      },
    ],
  },
];

/** Combined DACH/EU fixture corpus across TED, Swiss SIMAP, and German evergabe. */
export const ALL_FIXTURES: OcdsRelease[] = [
  ...TED_FIXTURES,
  ...SIMAP_FIXTURES,
  ...EVERGABE_FIXTURES,
];
