/**
 * Manual smoke test for the extraction pipeline.
 *
 *   cp .env.example .env   # then add your MISTRAL_API_KEY
 *   npm install
 *   npm run extract:demo
 *
 * Feeds a realistic (fictional) DACH tender notice through the extractor and
 * prints the validated JSON + number of model round-trips.
 */
import { extractTender } from "./extract-tender.js";

const SAMPLE_TENDER = `
Beschaffung von IT-Dienstleistungen für die Bundesanstalt für Digitale Infrastruktur

Ausschreibungsnummer: BDI-2026-IT-0417
Vergabestelle: Bundesanstalt für Digitale Infrastruktur, Referat Z-3

Die Bundesanstalt für Digitale Infrastruktur beabsichtigt die Beschaffung
umfassender IT-Dienstleistungen zur Modernisierung ihrer Cloud-Infrastruktur.

Gegenstand der Beschaffung:
- Betrieb und Weiterentwicklung einer Kubernetes-basierten Containerplattform
- Migration bestehender Workloads nach PostgreSQL (managed)
- Aufbau eines SIEM auf Basis von ElasticSearch
- Beratung zur Einführung von Zero-Trust-Architektur (Zertifizierung ISO 27001)

Geschätzter Auftragswert: 4.250.000 EUR netto.

Die Laufzeit beträgt 36 Monate mit Option auf Verlängerung um weitere 12 Monate.

Angebotseingangsfrist: 14.07.2026, 12:00 Uhr MEZ.
Teilnahme elektronisch über die Vergabeplattform EVEREBU.
`;

async function main() {
  console.log("→ Extracting tender...\n");
  const { data, attempts } = await extractTender(SAMPLE_TENDER);

  console.log(JSON.stringify(data, null, 2));
  console.log(`\n(model round-trips: ${attempts})`);
}

main().catch((err) => {
  console.error("✗ Extraction demo failed:", err);
  process.exit(1);
});
