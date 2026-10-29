# Reports and portal session presence

All newly generated Assistant, Report Builder, Evidence Chat and Investigation Brief exports use the shared `netra-report-v4` contract. Both binary PDF downloads and HTML fallback previews reject a mismatched Function template. Ctrl/Cmd+P within these workspaces uses the export flow; use the application's Export PDF control for the branded report rather than the browser menu's screenshot of the portal. Existing files in Downloads or Saved reports keep their original contents; generate a new report after promoting the matching Function and Web Client.

Every successful export now requires a Saved reports archive entry before delivery. Generated PDFs are saved as PDFs; explicit print previews and conversion fallbacks retain the identical branded HTML document, labelled Printable report. These generated reports use Catalyst Stratus regardless of the document-upload FileStore setting. An archive failure returns an error rather than an untracked download. Listings refresh after every export, on tab focus, across same-origin tabs and every 30 seconds while visible. Archives remain private to the authenticated officer; earlier files that were only printed or downloaded cannot be retroactively recovered from the browser.

Assistant charts accept actual FIR selections, attached labelled numeric tables, or labelled figures pasted into the query field (Shift+Enter adds a line). For example: `Draw a bar chart` followed by `Mysuru: 42` and `Udupi: 48` on separate lines. Supplied figures are explicitly marked unverified and retain their source quotes. Follow up with `Show these as a pie chart`. Multiple numeric columns require an unambiguous measure, and unsupported or missing data produces clarification. General explanations and greetings bypass case retrieval even with a file attached. Model answers containing numbers absent from their supporting sources fall back to source excerpts; these checks reduce specific failure modes and do not constitute a guarantee of error-free AI.

PDF exports share `functions/ai_quickml/report-template.js`. The function bundles the same Karnataka emblem used in the portal, so SmartBrowz does not fetch a protected frontend image. Exports use A4, repeated confidential headers, page numbering, report reference, officer metadata, source field tables and an activity appendix. They preserve unavailable answers and missing citations. The preview at `test-assets/reports/netra-report-layout-preview.pdf` uses local synthetic records and explicit test events; it is not a live investigation export.

The Administration page separates registered Catalyst accounts from recent portal presence. A verified browser sends `auth:presence` each minute while visible. Stratus stores application-owned mutable presence snapshots under `sessions/v1/<UTC day>/<hashed officer>/<browser reference>.json`; official KSP tables are unchanged. These references are random non-credential identifiers. Auth identity and role always come from Catalyst, never from submitted user fields. Only a normalized page path and coarse browser/OS label are recorded; no query strings, cookies, tokens or IP addresses are stored.

Administration refreshes every 30 seconds while visible. A heartbeat within 3 minutes is recently active; older sessions are idle/unconfirmed and disappear after 30 minutes without a heartbeat. Explicit logout ends that browser reference. A closed tab, connectivity loss, expired auth, or an old frontend without heartbeat support ages out; presence is not a provider-wide login inventory. Daily partitions bound current reads, and yesterday's partition covers midnight. Historical authentication and action events remain in the separate immutable audit archive. Apply the department's storage retention policy to old presence partitions.

Administrators, senior officers, investigators and analysts see department portal presence. Read-only accounts see their own sessions. Department audit events remain limited to administrators and senior officers; investigators and analysts can only retrieve their own audit events. Shared presence does not grant user-management or audit privileges. UI errors disclose unavailable/stale snapshots rather than representing failures as zero signed-in users. Audit viewing is limited to the most recent 200 matching events within a bounded archive read.

Deploy the Function **and** rebuilt Web Client together to Development, verify with at least two authenticated accounts, then promote those application components to Production. The existing Stratus bucket needs list/get/put permissions for the Function's server credential. No Data Store import or schema change is required. Existing signed-in browsers start appearing after loading the updated client. Older downloaded PDFs are unchanged; export again to get the new layout.

Checks:

```sh
node scripts/test-session-presence.mjs
NETRA_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-report-layout.cjs
NETRA_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-admin-sessions-ui.cjs
```

Browser checks use local Chromium and simulated Catalyst service boundaries, not live SmartBrowz or real cross-device logins.
