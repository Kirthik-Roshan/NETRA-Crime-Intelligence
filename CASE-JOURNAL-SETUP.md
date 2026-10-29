# Case Journal Release Setup

This patch does not alter the 28-table KSP schema or overwrite imported FIRs.
Database > Case journal & updates appends supplemental case information,
investigation entries and evidence references against an existing CaseMasterID.
Physical evidence files continue through EvidenceAI's existing upload workflow.
These entries do not replace CaseMaster fields. The Assistant consults current
journal entries for cases found by relational retrieval; journal-only keywords
are not independently indexed. Replaced revisions remain in history but are
excluded from the current-answer context. New Assistant requests bypass the
answer cache to pick up journal additions.

## Required Catalyst table

Create `NetraCaseJournal` in Development Data Store before testing. Use these columns:

| Column | Type | Constraint |
| --- | --- | --- |
| CaseMasterID | BIGINT | Required; validated against CaseMaster by Function |
| Kind | VARCHAR(40) | Required |
| Content | TEXT | Required; API limit 12000 characters |
| Reason | VARCHAR(500) | Required |
| PreviousRevisionID | VARCHAR(40) | Optional |
| RequestID | VARCHAR(80) | Required, UNIQUE (retry idempotency) |
| ActorID | VARCHAR(80) | Required |
| IntegrityHash | VARCHAR(64) | Required |

ROWID, CREATEDTIME and MODIFIEDTIME are Catalyst-managed. End-user table scopes
must not allow direct insert, update or delete. Only the authenticated Function
may append rows after checking the actual Catalyst role. No delete or overwrite
endpoint is exposed. The content hash detects accidental changes; it is not a
digital signature or a substitute for storage-level immutability.

Revisions point to a prior entry and preserve all history. Concurrent amendments
can branch; this is an append-only journal, not an exclusive-lock case editor.
The current API allows investigator/supervisor/admin roles project-wide; station
or case-assignment ownership restrictions are not yet implemented.

Deploy Function and Web Client together. Promote the table schema and components
to Production only after testing with authorized and readonly Catalyst users.
No automatic Production data writes or table creation are performed by this patch.

## Voice and analysis

Voice conversation uses browser speech recognition (Chrome recommended) with
English/Kannada locale and silence-triggered submission. Replies use Catalyst Zia
TTS, falling back to browser speech. Recognition pauses while playing to prevent
echo; Interrupt stops playback and resumes listening. Actual microphone accuracy
requires a physical-device test with site microphone permission.

Assistant activity is NDJSON emitted by the Function when stages execute, not
generated model chain-of-thought. Some hosting proxies may buffer events until
completion. Legacy Functions return normal JSON without a stage trace. Verify
incremental delivery on the deployed Catalyst path before describing it as live.
