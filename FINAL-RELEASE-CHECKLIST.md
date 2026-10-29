# NETRA Final Release Checklist

## Automated Release Gate

Run before every deployment:

```bash
npm run release:gate
```

This checks the 28-table organizer contract, mandatory values, Catalyst date
formats, foreign keys, the `ksp-er-v2` projections, two-hop graph integrity,
named-person follow-ups, Kannada fallback behavior, structured conversational
analysis, transaction-data guardrails, TypeScript, the Catalyst export and all
direct-refresh routes. See [TRACK1-READINESS.md](./TRACK1-READINESS.md) for the
scope mapping, supported analysis filters and Assistant demo path.

## Development Candidate

```bash
catalyst deploy --only functions:ai_quickml,client
npm run release:live
npm run evidence:test
npm run voice:test
```

The live check fails on an empty official-schema read model and verifies Search,
contextual RAG, source citations, a relational accused dossier, SmartBrowz PDF
output and every hosted route. Evidence and voice checks exercise real Zia
services separately because they upload media and synthesize audio.

Production requires a signed-in Catalyst token:

```bash
NETRA_LIVE_ORIGIN=https://ksphacks-60080085094.catalystserverless.in \
NETRA_AUTH_TOKEN='<Catalyst generated auth token>' npm run release:live
```

## Manual Production Matrix

- Promote only the `ai_quickml` Function and `netra-crime-intelligence` Web
  Client revision through Catalyst Settings -> Environments. Do not select
  Data Store: Development is empty and Production contains the imported KSP
  schema-aligned records.
- Confirm 28 official tables and non-zero Production row counts.
- Test Zoho, Google, Microsoft and Facebook login, logout and expired-session recovery.
- Refresh every sidebar page directly, including record pages with query parameters.
- Speak one Kannada query for longer than five seconds in Chrome and play its Kannada reply.
- OCR a supplied demo image, choose a real FIR, correlate it and confirm evidence plus audit IDs.
- Export one Assistant conversation and one report as PDF.
- Ask for district counts, switch to the map, refine the district, compare
  selected FIRs and exclude a source inside the Assistant. Confirm the warning
  controls retain the selection filters and the exported conversation contains
  the sources and both analysis snapshots.
- Compare two FIRs in the Investigation Workbench; inspect source references,
  exclude one source with a reason, and confirm the findings and graph update.
- Save two investigation revisions and reopen the first to verify its original
  findings; export the preserved revision as a PDF.
- Enable a saved watch, add a permitted case-journal entry, and confirm one
  source-change alert appears and can be reviewed or dismissed.
- Confirm Administration displays auth, AI, Search, evidence and export audit events.
- Confirm a second officer cannot open the first officer's saved investigation.

## Claim Boundaries

- Data is schema-aligned synthetic KSP data hosted in Catalyst Cloud Scale.
- Forecasts are transparent baseline decision-support signals, not trained Zia AutoML; AutoML is unavailable for this India data-centre project.
- The organizer schema has no account-level transaction, education, migration, income or event-calendar source. NETRA labels those gaps and does not fabricate them.
- AI and evidence matches are investigative leads; officers must verify cited source records before operational action.

## Dependency Security

- The nonbreaking September 2026 fixes for `nanoid` and the top-level `postcss`
  package are locked in `package-lock.json`.
- `npm audit --omit=dev` still reports advisories through Next.js 14's bundled
  server runtime and nested `postcss`; npm's only automatic resolution is a
  breaking upgrade to Next.js 16.
- NETRA deploys `output: "export"` to Catalyst Web Client Hosting. It does not
  deploy a Next.js server, Image Optimizer, middleware, rewrites, Server
  Actions or dynamic React Server Components, so the reported server attack
  paths are not present in the hosted application.
- Keep the Next.js 16 migration as a post-finals hardening task. Do not run
  `npm audit fix --force` on the release candidate without completing a full
  framework-migration regression pass.
