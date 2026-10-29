# NETRA Project Summary

NETRA is a conversational crime-intelligence workspace for the Karnataka State
Police, built for KSP Datathon 2026 Challenge 01. It turns the supplied FIR ER
schema into linked, searchable and explainable investigation surfaces without
replacing the organizer's data model.

## Requirement Coverage

| Requirement | NETRA implementation |
|---|---|
| English and Kannada assistant | grounded record search, QuickML narrative reasoning, translation |
| Voice interaction | Kannada/English microphone input and read-aloud through Catalyst Zia |
| Context-aware conversation | prior turns are passed into retrieval and response generation |
| PDF conversation export | SmartBrowz generation with Stratus archival |
| Criminal network | two-hop accused, co-accused, FIR, victim, complainant and station graph derived from official foreign keys |
| Trends and hotspots | district, category, temporal, seasonal and geospatial aggregation of `CaseMaster` |
| Sociological insights | aggregate victim/complainant age, gender, occupation, religion, caste, vulnerability and incident-setting views |
| Investigator support | relational case summaries, timelines, similar records, linked people, chargesheets and leads |
| Financial workflow | fraud/cyber FIR triage with a strict guardrail against inventing account-level transaction links absent from the schema |
| Predictive intelligence | explainable momentum, repeat-offence and escalation indicators |
| Explainability and audit | cited FIRs, factors, confidence metadata and immutable Stratus audit objects |
| Role-based access | Catalyst Authentication identity plus Function-side role checks |
| Evidence AI | OCR, number plate extraction, crowd/face comparison, objects, moderation, barcode |

## Runtime Data Path

```text
Officer browser
  -> static Next.js Web Client / Slate
  -> Catalyst ai_quickml Advanced I/O Function
  -> 28 official KSP Cloud Scale tables
  -> relational in-memory investigator read model
  -> dashboard, assistant, case, accused, graph, map and prediction views
```

The source tables include `CaseMaster`, `Accused`, `Victim`,
`ComplainantDetails`, `ArrestSurrender`, `ChargesheetDetails`, legal
classification, police organization, geography, court and demographic lookup
tables. The full list and field contract are in
[`SCHEMA.md`](./SCHEMA.md) and
[`data/cloudscale-import/schema.json`](./data/cloudscale-import/schema.json).

`Firs`, `Cases`, `Criminals`, `Relationships`, and similar frontend names are
derived Function responses. There are no corresponding required operational
Cloud Scale tables. Unsupported entities such as phone and vehicle registries
remain empty unless a future approved schema extension supplies them.

The supplied schema does not contain bank accounts, transactions, amounts,
education, migration, income or a public-event calendar. NETRA exposes those
coverage gaps explicitly and does not infer unsupported money trails, social
causation or event causation. Approved future sources can be joined through the
same FIR identity without replacing the organizer schema.

## Catalyst Services

- Cloud Scale Data Store: official normalized FIR records.
- Advanced I/O Function: secure gateway, joins, retrieval and service orchestration.
- Catalyst Authentication: officer identity and social sign-in.
- QuickML: LLM and knowledge-base RAG.
- Zia: OCR, face/object/image analysis, STT, TTS and translation.
- Stratus: evidence objects, generated reports and immutable audit records.
- Cache: bounded read-model and answer caching.
- Search: indexed official record lookup with a relational scan fallback.
- SmartBrowz: server-side PDF generation.

## Data Provenance

The demonstration dataset is synthetic. It is generated into the supplied
28-table KSP structure, exported with Catalyst-compatible types, imported into
Production, and verified with exact row-count, required-value, date and FK
audits. It contains 500 `CaseMaster` records and linked people, arrests,
chargesheets, stations, officers and legal classifications.

Reproducible checks:

```bash
npm run release:gate
npm run release:live
npm run evidence:test
npm run voice:test
```

## Technology

Next.js 14, TypeScript, Tailwind CSS, React Flow, Recharts, Leaflet, Zustand,
Zoho Catalyst Node SDK, Catalyst QuickML and Catalyst Zia. SQLite is retained
only as the reproducible local synthetic-data generator/audit source; it is not
read by the deployed application.

All intelligence outputs are decision support. Officers must verify source
records before operational action.
