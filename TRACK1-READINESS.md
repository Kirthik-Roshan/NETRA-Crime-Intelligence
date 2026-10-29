# Track 1: Conversational Crime Intelligence

Scope: Challenge 01, **Intelligent Conversational AI for KSP Crime Database**.
The public challenge was inspected on 24 October 2026:
https://hack2skill.com/event/datathon2026?sectionid=69db67700b7a4eb89917472a

The Assistant is the entry point. Charts, maps, comparisons and evidence
dependencies support an officer's question and its follow-ups. The release
does not depend on adding department-wide operations modules.

Document uploads and scoped document questions extend this workflow. See
[DOCUMENT-LIBRARY.md](./DOCUMENT-LIBRARY.md) for Zia OCR, passage citations,
saved PDF access and optional Catalyst FileStore configuration.

## Requirement Mapping

| Track 1 requirement | Implementation |
| --- | --- |
| English/Kannada, voice and contextual conversations | Existing record retrieval and voice controls; shared intent routing separates greetings, definitions, record questions and structured analysis. |
| Pattern, trend and hotspot exploration | Server-calculated FIR counts by district, offence and incident month; interactive OpenStreetMap incident locations; contextual filter refinement. |
| Criminal network analysis | Existing accused network plus two-to-six-FIR comparisons with inspectable source dependencies. |
| Investigator decision support | Recorded similarities, associations, conflicting source details, missing information and next checks. Source exclusion recalculates support without altering source records or earlier answers. |
| Early warning | Explicit current/preceding equal-length incident-date windows and a disclosed descriptive increase rule. |
| Explainability and audit | Source identifiers, retrieval stages, coverage warnings, source/snapshot hashes and existing audit events. |
| PDF conversation history | SmartBrowz export includes answers, source references, analysis tables/charts, comparison graph, exclusions and activity. Map exports include recorded coordinates. |
| Secure access | Existing verified-session and server-role checks apply before record analysis. |
| Sociological and behavioral insights | Existing demographic analytics, recorded methods, histories and repeat-accused associations; missing source dimensions remain disclosed. |

Financial transaction analysis in the detailed brief needs an approved
transaction source, which the supplied crime schema does not contain. Existing
guardrails disclose this limitation instead of synthesizing money trails.

## Demonstration

1. Ask `Show all crime patterns by district`. Counts use the complete source
   read, not a sample of search hits.
2. Choose **Map**, then ask `Now only Mysuru`. The map and counts retain the
   current filters and disclose missing coordinates.
3. Ask `What are the crime trends in Mysuru?` to show incident-month counts.
4. Ask `Show vehicle theft patterns by district`. Expand **Matching FIRs**,
   select two FIRs and compare their documented connections.
5. Inspect a finding and its sources. Exclude a source with a reason, then
   inspect the recalculated findings and inactive graph connections.
6. Choose **Warnings**. Set a window ending date appropriate to the dataset.
   Recent empty windows trigger freshness disclosures; the system does not
   move the window to historical data automatically.
7. Export the conversation and inspect both the earlier and recalculated
   snapshots, their sources and the analysis activity.

## Supported Analysis Boundaries

- Group FIRs by district, offence or incident month; optionally restrict to
  a recorded district, offence, case status, severity or named accused profile.
- Date filters support a full year (`in 2026`) or trailing day/week/month
  windows, optionally `ending YYYY-MM-DD`. Month windows use 30 days.
- Period comparisons use trailing windows between 1 and 366 days. A calendar
  year request prompts clarification instead of silently substituting 30 days.
- Early-warning flags require at least five current FIRs, at least three more
  than the preceding window, and at least 50% growth or a zero baseline. They
  describe recorded changes and are not calibrated future-crime predictions.
- Unknown districts, offences and unsupported filters prompt clarification.
- Interactive comparison accepts two to six FIRs. Charts display a maximum
  of 200 selectable records; maps display up to 1,000 coordinates. Totals and
  exported FIR references cover the full matching selection.
- Required source reads fail visibly if pagination is incomplete or their
  5,000-row per-table limit is exceeded. Such results are not presented as
  complete population counts.
- Source exclusion is an analysis selection, not deletion or amendment of
  an original FIR or evidence object.

## Verification

```bash
npm run assistant-analysis:test
npm run release:gate
```

With a running local server, Chromium and Playwright:

```bash
NETRA_PLAYWRIGHT_MODULE=/path/to/playwright npm run assistant-analysis:ui
```

The browser test uses the real Function handler with local synthetic crime
records and in-memory Catalyst service substitutes. It checks chart/map
consistency, actual OpenStreetMap tile rendering, contextual filters, source
exclusion, warning windows, conversation PDF generation and responsive layouts.
It does not authenticate against Production or verify live QuickML, Zia,
Stratus or SmartBrowz availability.

Deploy matching Function and Web Client revisions and run the signed-in live
checks in `FINAL-RELEASE-CHECKLIST.md` before calling the release Production
verified. Do not replace or promote the Production crime tables.
