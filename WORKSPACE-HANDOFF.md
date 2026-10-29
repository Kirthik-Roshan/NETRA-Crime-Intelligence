# NETRA workspace handoff

Reviewed 27 October 2026. This is a code/documentation snapshot, not proof of
current Production behavior. Read current files before editing; much of this
workspace is modified or untracked and must not be reverted.

## Scope and architecture

- Track 1: conversational crime intelligence for KSP. Preserve source grounding,
  English/Kannada, explainability, audit, investigator review and Catalyst hosting.
- Next.js 14 static export, React 18, Recharts, Leaflet/OpenStreetMap, ReactFlow.
- Backend: Catalyst advanced I/O Function `functions/ai_quickml`.
- Official 28-table schema; FIR/case/criminal read models are projections rather
  than replacement physical tables. Local synthetic dataset: 500 FIRs, 70
  consolidated profiles, 703 accused links, 251 arrests, 564 victims, 662
  complainants. Do not describe these as real KSP operational records.
- Preserve Production data. Deploy code components without importing or replacing
  crime tables. Financial transactions and several social indicators lack sources.

## Current capabilities and principal files

- Assistant intent routing separates greetings/general chat from record retrieval.
  Named-person follow-ups join FIRs, arrests, victims, complainants and stations.
  `conversation.js`, `assistant-analysis.js`, `AssistantClient.tsx`, `AnalysisPanel.tsx`.
- Source-backed charts/maps, 2–6 FIR comparison, source exclusions, explicit
  warning date windows and coverage/freshness disclosures. Warnings are descriptive
  rules, not calibrated future-crime predictions.
- Investigation Workbench: source dependencies/conflicts, officer observations,
  saved draft/reviewed revisions, integrity hashes, exports and saved watches.
  Watches run while NETRA is active, not as an unattended scheduled service.
  See `INVESTIGATION-WORKBENCH.md`.
- Supplemental append-only case journal needs `NetraCaseJournal` provisioning.
  Does not overwrite CaseMaster; see `CASE-JOURNAL-SETUP.md` for permissions/limits.
- Evidence AI: Zia OCR, plate correlation, officer-selected face comparison,
  runtime CCTV frame sampling and private archived results. Evidence chat loads
  saved server-side results and current FIR links; verifies owner and citations.
  See `EVIDENCE-CHAT.md`, `EVIDENCE-AI.md` and `EvidenceLab.tsx`.
- Assistant Photo mode detects faces and resolves only exact registered synthetic
  asset SHA-256 hashes. Renamed originals work; crops/screenshots/re-encoded copies
  may not. This is not biometric identification. Registered demo portrait picker
  attaches the known source asset; client profile IDs are never identity evidence.
- Document OCR/chat: up to three private files, sourced passages and validated
  citations. Reports has builder, saved PDFs and documents; library supports
  preview/download/chat. Stratus required; optional FileStore originals.
  See `DOCUMENT-LIBRARY.md` and `file-library.js`.
- Portal presence uses verified identities and private Stratus snapshots, with
  heartbeat/expiry, role-scoped listing and separate immutable audit events.
  It is not an inventory of all provider sessions. `REPORTS-AND-SESSIONS.md`.
- Shared exclusive speech playback, proper audio MIME, cancellation and locale
  fallback. Actual laptop audio/microphone and live Zia quality need device checks.

## UI and localization

- Navy sidebar with strong blue hover, blue workspace, animated network backdrop,
  blended Vidhana Soudha watermark, responsive cards and record workspaces.
- Database avoids stretched blank space and uses opaque sticky table headers.
  Graph refits on data/dimension changes, prevents node overlaps and leaves mouse
  wheel available for document scrolling. Mobile Assistant uses page scrolling.
- Kannada: `src/lib/ui-kannada.ts`, `components/UiText.tsx`, existing i18n dictionaries.
  Local interface translations include counts, status labels, controls and dates;
  unknown/source text remains unchanged. Document language tracks persisted prefs.
  Map tile lettering is supplied by OpenStreetMap. Model answers/source narratives
  are distinct from static interface localization.
- SmartBrowz PDFs use `report-template.js` with bundled emblem and A4 metadata.
  Browser Reports print path separately fixed in `ReportView.tsx`, `globals.css`
  and `workspace.css`: Karnataka emblem, blue masthead, colored KPIs, striped
  tables, repeatable headings and light/dark-theme-independent print colors.
  Printing waits for fonts and images. Existing downloaded PDFs do not change.

## Validation and deployment

- `npm run release:gate`: schema/read model, grounding, analysis, evidence/chat,
  documents, session presence, voice, Kannada, syntax, TypeScript, build and routes.
- Browser tests use local synthetic records and simulated Catalyst boundaries;
  they do not establish live provider permissions, model quality or Production health.
- `scripts/test-kannada-workspace-ui.cjs`: 16 routes, desktop/mobile, persistence,
  English restoration and source-name preservation. Passed in this conversation.
- `scripts/test-browser-report-print.cjs`: logo, colors, real counts, stable
  classification values and light/dark printing. Passed in this conversation.
- PDF previews: `test-assets/reports/netra-browser-print-preview.pdf` and
  `netra-report-layout-preview.pdf` (test data, not operational exports).
- Latest local artifact at this review: `1.0.1793040559` in `out/client-package.json`.
  Web Client deployment to Development succeeded for that print fix. Earlier
  matching Function deployment included evidence/photo chat.
- CLI project: KspHacks, project `56798000000013049`, Development.
  `https://ksphacks-60080085094.development.catalystserverless.in/app/index.html`
- Production promotion is console-managed under Settings → Environments.
  Do not claim it happened without evidence. The last confirmed actions in this
  conversation were Development deployments only; current Production is unverified.
- `.openai/hosting.json` is not evidence that the Catalyst target changed.
- Latest Git commit observed: `cf0b95d` (“last commit for round2”); many later
  changes remain uncommitted. Do not infer authorship or deployment from timestamps.

## Reference notes

### 29 October: microphone STT upstream failure and local-only recovery

- User screenshot confirms recording reaches the backend, which returns HTTP
  502 with upstream speech-service 500. This is distinct from the earlier
  microphone permission/device error; do not claim changing mic volume fixes it.
- User explicitly confirmed transcription must also remain **Catalyst/on-device
  only**. Standard Chrome/Web Speech recognition may use a remote service and
  must not be silently selected. Both query dictation and hands-free conversation
  now require `processLocally = true` for the browser recognition recovery path.
- `src/lib/microphone.ts` checks native `available()` capability for the selected
  language. English can use an installed en-US pack if en-IN is unavailable;
  Kannada never substitutes another language. Pack installation requires the
  explicit Install button. Unsupported API/language states are displayed rather
  than starting remote recognition. Local packs are browser-managed, not Piper
  TTS models; availability on the user's physical Chrome remains unverified.
- Main flow stays Catalyst recording/transcription first. After an outage,
  “Retry with on-device microphone” checks support and asks the officer to repeat
  their question, preserving a reviewable draft before Run. It does not pretend
  to recover the old recording. No portable local ASR model was added; where
  Chrome has no compatible local pack, STT still requires Catalyst to recover.
- Capture errors now distinguish denied access, missing device, busy device,
  constraints and interruptions. Server errors remain service errors.
- `test-local-speech.mjs`, transcription error tests, TypeScript/build and 18
  route checks passed. `test-microphone-ui.cjs` used actual browser recording/WAV
  conversion with a fake mic, a simulated provider 500 and simulated native
  recognition results: explicit pack install, local-only start, composer review,
  unsupported hands-free and busy-device handling passed. No actual native STT
  accuracy or restored Catalyst service is claimed.
- Web Client artifact `1.0.1793221830` deployed successfully to Development;
  hosted metadata verified. No Function changes. Production verified at
  `1.0.1793218250`, so this recovery still needs console-managed promotion.

### 29 October: neural Kannada voice after basic-fallback quality complaint

- Production was verified to serve `1.0.1793215558`, matching Development;
  the user's “0 changes” screenshot shows Serverless changes, while the prior
  fix was Web Client only. Deployment was not the cause of the robotic voice.
- Rechecked Zia: TTS and synthetic-audio transcription still returned HTTP 500
  after successful OAuth refresh. No claim that Catalyst speech is repaired.
- User explicitly chose **Keep Catalyst/on-device only**. No alternative cloud
  speech provider may be added without further authorization.
- Added a local neural Kannada fallback in `neural-kannada-speech.ts` and
  `public/vendor/piper/worker.js`. Uses pinned Piper Kannada SYSPIN model
  `micahchoo/piper-kn` revision `c73546cb70012e28f6093a61c71162924398fee1`,
  ONNX Runtime Web 1.17.3 and piper-wasm 1.0.0. All runtime/model assets are
  hosted with NETRA. Speech text stays in the worker. Public model bytes alone
  are cached; SHA-256 and size checked before cache insertion.
- Voice order: Catalyst → matching native voice → local Kannada neural voice →
  basic formant fallback. Mobile's working native voice remains ahead of both
  local engines. Assistant displays actual voice source and loading progress.
  Stop cancels queued neural jobs and prevents late audio playback. ReadAloud
  can now stop while loading as well as while speaking.
- First use requires ~93 MB runtime/model download; model cache reused across
  page reloads. Browser worker uses single-thread WASM and needs no COOP/COEP
  header changes. The selected model is non-commercial/research-demo only:
  retain `public/vendor/piper/README.md`, licenses and original model card.
  This is a synthetic-data hackathon prototype voice, not cleared for operational
  departmental/commercial deployment. Do not claim perfect pronunciation.
- Generated `test-assets/voice/netra-neural-kannada-preview.wav`. This environment
  cannot listen to user audio; no perceptual review is claimed. Real model
  execution, 22050-Hz playable speech, cancellation, persistent cache, same-origin
  requests and actual Assistant speaker-button path passed Chromium tests.
  Unit voice/transcription/Kannada checks, TypeScript, build and 18 routes passed.
- Web Client artifact `1.0.1793218250` deployed successfully to Development.
  Hosted Chromium test also passed actual synthesis, cancellation, persistent
  cache after navigation, and same-origin-only requests with one model download.
  Production still verified at `1.0.1793215558`; promotion remains a console action.
  No Function change for this fix.

### 29 October: Kannada speaker playback on laptop Chrome

- Reproduced real upstream Zia TTS failures with the stored project credential:
  OAuth refresh succeeded, but complete English and Kannada synthesis requests
  returned HTTP 500. Dropping required fields returned 400. Do not claim the
  upstream cloud voice itself has been repaired.
- Shared `speech-playback.ts` now uses Catalyst first, then an available native
  matching voice, then a bundled on-device Kannada voice if neither works.
  Existing working mobile/native Kannada routing is preserved. Kannada cloud
  requests have a 10-second playback wait budget; late audio cannot overlap
  fallback playback. Stop/cancellation suppresses pending local playback.
- `offline-kannada-speech.ts` lazily loads unmodified meSpeak 2.0.7 and its `kn`
  voice from same-origin `public/vendor/mespeak`, generating WAV locally. No
  third-party cloud endpoint receives text. This is a basic, more robotic
  fallback, not a neural Catalyst voice. License and original readable sources
  accompany the runtime files.
- `test-speech-playback.mjs` passed cloud/native/offline routing, mobile voice
  preference and cancellation. `test-offline-kannada-ui.cjs` generated and played
  real non-silent Kannada audio in Chromium without a native Kannada voice.
  `test-chat-language-ui.cjs` also clicked the actual Assistant speaker after
  switching to Kannada with a simulated Catalyst outage: audio played, no
  missing-voice message or page errors. Build/type checks and 18 routes passed.
- Web Client revision `1.0.1793215558` rebuilt and deployed successfully to Development.
  Deployed version and JS/voice assets verified HTTP 200 with correct MIME types.
  Real Chromium synthesis/playback also passed using the hosted `/app/vendor`
  assets, without a system Kannada voice. Production needs Web Client promotion.
  The backend did not change for this fix.

### 27 October: automatic EvidenceAI reference linkage

- Crowd watch, CCTV and Face verify no longer require a name/profile dropdown.
  The uploaded reference is authoritative, resolved server-side by SHA-256
  against the 70 fictional original PNGs / served WebPs. Submitted
  `criminal_id` is ignored. No 1:N biometric recognition was added.
- `synthetic-reference.js` checks current DB name/ID only after Zia reports a
  comparison match; no-match returns no inferred person/FIR details. Unknown
  references can be compared but never inherit a submitted profile ID.
- `evidence:reference` returns registry metadata for intake feedback, subject to
  the same investigator role checks. Replacing a portrait clears prior results.
  Controls are locked during scans; pending lookup responses cannot overwrite
  a newer reference. Original registered files required for automatic linkage.
- The older standalone Ganesh demo portrait differs from profile 15. Demo
  loading now uses the actual registered profile 15; no match is forced.
- Full release gate passed, including `test-evidence-reference.mjs` (all 140
  registered source/served files, ID spoofing, no-match, unknown, stale DB,
  role/audit/Zia failure). `test-evidence-reference-ui.cjs` passed Crowd watch,
  actual browser CCTV frame extraction, replacement/no-match/unknown states,
  and 1672/768/390 layouts with mocked Catalyst Zia responses.
- Artifact `1.0.1793113809`: Function `ai_quickml` and Web Client deployed
  successfully to Development. Production promotion remains console-managed;
  promote both together. Deployed metadata matches this revision; the Evidence
  page and Function ping both returned HTTP 200. Actual live Zia match quality
  remains unverified.

`TRACK1-READINESS.md`, `FINAL-RELEASE-CHECKLIST.md`, `DEPLOY.md`, `RAG-SETUP.md`,
`REPORTS-AND-SESSIONS.md`, `EVIDENCE-CHAT.md`, `DOCUMENT-LIBRARY.md`,
`INVESTIGATION-WORKBENCH.md`, `CASE-JOURNAL-SETUP.md`.

Other-account chat history is unavailable. This note records inspected workspace
state and previously observed tests/deployments, not inaccessible conversations.
