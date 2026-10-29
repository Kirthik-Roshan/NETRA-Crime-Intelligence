# NETRA Crime Intelligence

NETRA is an investigator-facing intelligence workspace for the Karnataka State
Police and KSP Datathon 2026. It combines the organizer-specified FIR data model
with conversational search, link analysis, geospatial trends, predictive
signals, evidence analysis, voice interaction, PDF reporting, and auditability.

## Current Architecture

```text
Next.js 14 static Web Client / Catalyst Slate
                    |
                    | HTTPS + Catalyst user token
                    v
Catalyst Advanced I/O Function: ai_quickml
        |              |              |
        v              v              v
Cloud Scale       QuickML / Zia   Stratus / Cache
28 KSP tables     RAG, voice, OCR  evidence, audit
```

The browser never reads a local database. Core investigation records are read
from the 28 official KSP Cloud Scale tables. The Function joins those normalized
tables into in-memory investigator views for the UI:

- FIR and case views come from `CaseMaster` and its lookup relationships.
- accused profiles come from `Accused`, linked by `CaseMasterID`.
- arrests come from `ArrestSurrender` and
  `inv_arrestsurrenderaccused`.
- victims, complainants, legal sections, stations, officers, courts, and
  chargesheets come from their official tables.
- network edges are derived from shared-case/co-accused relationships.

Names such as `Firs`, `Cases`, and `Criminals` are API read-model names only.
They are not legacy physical Cloud Scale tables.

`Evidence`, `Notifications`, and `OcrResult` are isolated application-output
tables. They do not replace or alter the official crime schema.

## Official Data Contract

The source-of-truth schema and Catalyst import material live in
[`data/cloudscale-import`](./data/cloudscale-import):

- exactly 28 official CSV files;
- Catalyst-compatible `Date`, `DateTime`, `Boolean`, numeric, and text values;
- per-table import configurations and FK mappings;
- a generated schema manifest and table-creation runbook.

Validate the data before every import or release:

```bash
npm run schema:audit
npm run read-model:test
```

The audit checks all tables and fields, mandatory values, dates, storage types,
and every declared foreign-key relationship. The read-model test proves that
the investigator views are generated only from the official tables.

## Product Surfaces

The final refinement is scoped to Challenge 01. See
[`TRACK1-READINESS.md`](./TRACK1-READINESS.md) for requirement mappings,
conversational analysis, supported filters and the demonstration sequence.

| Workspace | Capability |
|---|---|
| Dashboard | statewide workload, district trends, hotspots, case velocity |
| Assistant | English/Kannada conversation, contextual retrieval, voice, citations, PDF |
| Cases | live case record, accused, victim, complainant, arrest and chargesheet context |
| Investigation Workbench | source-backed cross-case comparisons, conflicting evidence, source exclusions, preserved brief revisions and saved watches |
| Investigation Workbench | source-backed comparisons, conflicting evidence, exclusions, saved watches and revisioned briefs |
| Accused | resolved profile, linked FIRs, arrests and co-accused associations |
| Link Analysis | two-hop accused, FIR, victim, complainant and police-station network |
| Crime Map | geolocated FIRs and district hotspot exploration |
| Crime Analytics | offence, modus, demographic, social-context and source-coverage analysis |
| Predictions | explainable momentum, seasonality, repeat-offence and escalation signals |
| Evidence AI | OCR/number plate, face/crowd comparison, objects, safety and barcode |
| Database | live explorer for all 28 organizer-specified tables |
| Administration | Catalyst users, infrastructure posture and immutable audit records |

## Local Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Local UI requests use the deployed Catalyst
Development Function by default. Therefore the Development Cloud Scale tables
must contain data if you want live records locally. Public deployments prefer
the Production Function.

Useful checks:

```bash
npm run release:gate
npm run release:live
npm run evidence:test
npm run voice:test
```

`release:gate` validates the local schema, relationship projection,
conversational grounding, TypeScript, Catalyst build and refreshable static
routes. Run `release:live` after deployment to verify the Development Function,
live row projections, Search, contextual RAG, SmartBrowz PDF and schema
guardrails.

## Deployment

Deploy local code to Catalyst Development:

```bash
npm run release:gate
catalyst deploy --only functions:ai_quickml,client
npm run release:live
```

Catalyst requires subsequent Function/Web Client promotion to Production from
the web console. Slate can be deployed directly with `--production`. See
[`DEPLOY.md`](./DEPLOY.md) for the guarded release sequence.

## Security And Provenance

- QuickML and Zia credentials remain in Function configuration, never browser
  bundles or git.
- Catalyst Authentication supplies the officer identity; Function-side role
  checks guard privileged modes.
- assistant, search, evidence and report operations emit auditable records.
- source/result evidence objects and audit records are archived in Stratus.
- generated predictions expose factors and supporting FIR identifiers.
- operational decisions must be verified against source records by an officer.

All repository crime records are synthetic and generated against the supplied
KSP schema for Datathon demonstration use.

See [Investigation Workbench](./INVESTIGATION-WORKBENCH.md) for its review flow,
storage, watch timing and deployment checks.
