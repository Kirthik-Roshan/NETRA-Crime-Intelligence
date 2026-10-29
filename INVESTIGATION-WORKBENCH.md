# Investigation Workbench

Open `/investigations`, or select **Investigate connections** on a case record.
Select two to six FIRs, compare the recorded facts, and inspect the supporting
sources. Every finding identifies its source records and whether it remains
supported after an exclusion.

## Review Workflow

1. Compare FIRs. Offence, district and recorded method are contextual signals.
   Shared accused profiles and registration observations remain explicitly
   qualified associations, not determinations of identity or guilt.
2. Add officer observations with a FIR, media reference and review note. A car
   and a motorcycle described with the same registration produce a conflict.
   Vehicle type is entered by the reviewing officer; NETRA does not infer it
   from an unrelated vehicle somewhere else in the image.
3. Inspect a finding's sources. Exclude an unreliable source with a reason.
   Recalculation deactivates unsupported findings and preserves any independent
   remaining support. Original evidence records are retained.
4. Save a draft or an officer-reviewed brief. Reviewed status requires an
   investigation officer, supervisor or administrator and a review note.
5. Export a saved revision through SmartBrowz. Its PDF includes the dependency
   graph, findings, excluded evidence, annotations, source hashes and revision
   metadata. Reopening an old revision uses its saved records.

## Storage And Access

- The official 28-table KSP contract remains the source of crime records.
- Saved comparisons, watch alerts and alert review events use the existing
  Catalyst Stratus bucket, `STRATUS_BUCKET` (default `ksp-netra`).
- No new Data Store tables are required for the workbench itself.
- Revisions are stored below an officer-specific hashed prefix. Every operation
  requires a verified Catalyst session and an allowed role. Other officers
  cannot retrieve a saved brief merely by guessing its ID.
- Revision and alert object writes disable overwrite. A fixed next-revision
  object key prevents two tabs from silently forking the same saved revision.
- SHA-256 hashes detect changes to saved snapshots; these are integrity hashes,
  not digital signatures or a claim of regulatory certification.
- Analysis, saves, exports and alert review events use the existing audit path.
  A failed separate audit archive is reported with the result.
- Comparison reads require CaseMaster and Accused. Missing Evidence or journal
  access produces a visible coverage warning rather than a claim of complete
  evidence coverage.

## Saved Watches

Choose an offence, district and/or recorded phrase when saving a revision.
Existing matching FIRs become its baseline. Checks identify newly matching FIRs,
updated matching FIRs and changes to the selected cases' FIR, accused, evidence
or journal sources. Stable alert IDs suppress duplicate alerts across checks.
Alerts can be reviewed or dismissed without altering the underlying records.

Checks run on application load, when relevant updates are saved, and every
minute while the workspace is visible. This is application-driven monitoring;
it does not claim background execution when all NETRA sessions are closed or
delivery through email/push. On reopening NETRA, changes since the saved
baseline are checked. At most 30 watches may be active per officer.

Supplemental journal writes require the existing `NetraCaseJournal` table:
see [CASE-JOURNAL-SETUP.md](./CASE-JOURNAL-SETUP.md). Case record pages now expose
the same journal editor with the current CaseMasterID preselected.

## Verification And Deployment

```bash
node scripts/test-investigations.mjs
npm run investigations:test
npm run investigations:ui
npm run release:gate
```

Deploy matching Function and Web Client artifacts to Development, then verify
the workflow with a signed-in Catalyst officer before Production promotion.
Do not promote or replace the Production crime tables.

The browser check requires a running local server (default port 3002), Chromium,
and Playwright. Set `NETRA_UI_ORIGIN` and `NETRA_PLAYWRIGHT_MODULE` when needed.
It uses the real Function handler with in-memory Catalyst services and renders
the PDF locally; it does not write to the deployed database or verify live
Stratus/SmartBrowz availability.

Finals demonstration: compare two synthetic FIRs; add the two vehicle
observations; inspect their shared registration and conflicting vehicle types;
save a reviewed revision; exclude the disputed observation; save a second
revision; reopen the first; export it; add a permitted journal update to a
watched case; refresh its updates and inspect the source-change alert.
