/**
 * Sample OCDS releases used as a keyless fallback when no source API token is
 * configured. These mirror the real fixtures shown in the dashboard mock data
 * so that dev/CI runs produce visible, sensible results.
 */
import type { OcdsRelease } from "../ingestion/ocds-types.js";

export const TED_FIXTURES: OcdsRelease[] = [
  {
    ocid: "ocds-ted-2026-001",
    id: "release-001",
    date: "2026-06-15T00:00:00Z",
    tag: ["tender"],
    parties: [
      {
        id: "org-de-001",
        name: "Bundesministerium für Digitales",
        roles: ["buyer"],
        address: { country: "DE" },
      },
    ],
    tender: {
      id: "t-001",
      title: "Cloud-Native Plattform & SIEM für Bundesinfrastruktur",
      description:
        "Aufbau einer Kubernetes-basierten Containerplattform mit PostgreSQL-Migration, ElasticSearch-SIEM und Beratung zu Zero-Trust-Architektur (ISO 27001).",
      status: "active",
      value: { amount: 4250000, currency: "EUR" },
      tenderPeriod: { endDate: "2026-07-14T12:00:00Z" },
      procurementMethod: "open",
      procuringEntity: { id: "org-de-001" },
      items: [
        { classification: { scheme: "CPV", id: "48000000-8" } },
        { classification: { scheme: "CPV", id: "72267100-7" } },
      ],
    },
  },
  {
    ocid: "ocds-ted-2026-002",
    id: "release-002",
    date: "2026-06-10T00:00:00Z",
    tag: ["tender"],
    parties: [
      {
        id: "org-at-001",
        name: "BMF — Österreich",
        roles: ["buyer"],
        address: { country: "AT" },
      },
    ],
    tender: {
      id: "t-002",
      title: "Modernisierung des zentralen Rechenzentrums",
      description:
        "Komplettsanierung des Rechenzentrums inkl. VMware-Infrastruktur, SAP S/4HANA-Migration und Disaster-Recovery-Konzept.",
      status: "active",
      value: { amount: 3100000, currency: "EUR" },
      tenderPeriod: { endDate: "2026-08-02T12:00:00Z" },
      procurementMethod: "restricted",
      procuringEntity: { id: "org-at-001" },
      items: [
        { classification: { scheme: "CPV", id: "72000000-6" } },
        { classification: { scheme: "CPV", id: "72300000-4" } },
      ],
    },
  },
  {
    ocid: "ocds-ted-2026-003",
    id: "release-003",
    date: "2026-05-28T00:00:00Z",
    tag: ["award"],
    parties: [
      {
        id: "org-de-002",
        name: "Landesverwaltung Baden-Württemberg",
        roles: ["buyer"],
        address: { country: "DE" },
      },
      {
        id: "org-supplier-001",
        name: "SAP SE",
        roles: ["supplier"],
        address: { country: "DE" },
      },
    ],
    tender: {
      id: "t-003",
      title: "ERP-System Migration & Schulung",
      procuringEntity: { id: "org-de-002" },
    },
    awards: [
      {
        id: "a-003",
        title: "Vergabe SAP S/4HANA Migration",
        status: "active",
        date: "2026-05-20",
        value: { amount: 12400000, currency: "EUR" },
        suppliers: [{ id: "org-supplier-001" }],
        items: [{ classification: { scheme: "CPV", id: "72230000-2" } }],
      },
    ],
  },
];
