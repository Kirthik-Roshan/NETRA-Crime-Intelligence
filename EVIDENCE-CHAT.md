# Evidence and photo conversations

The Assistant attachment selector offers **Document OCR** (the existing PDF / image
text workflow) and **Photo**. Photo calls Catalyst Zia face detection, archives the
original privately, and records only the face count and lookup provenance.

The 70 fictional demonstration portraits can be resolved by an exact SHA-256
match against the labelled PNG originals or public WebP derivatives. This is an
asset lookup, not biometric identification. Renamed copies work; transformed,
unrecognised and real-person photos remain unidentified. Names in filenames and
client-supplied profile IDs are never accepted as identity evidence. Linked
profile/FIR context is fetched from Cloud Scale on each question.

After a successful Evidence Analysis scan, **Ask about this evidence** supports
follow-ups, expandable sources, clearing the conversation and PDF export. The
server retrieves the selected Evidence row and its archived Stratus result,
checks the scan creator against the authenticated officer, and resolves the
row's current FIR link. The browser cannot supply a replacement analysis or an
arbitrary storage key. Replacing the input or changing the analysis clears the
previous conversation.

Both flows keep observations separate from database facts. QuickML receives
bounded source passages; quoted citations are checked against those passages.
If no validated synthesis is returned, the response shows readable source
excerpts. Unsupported questions get an explicit insufficient-data response.
Scan and query operations retain their audit identifiers.

Deploy **both** `functions:ai_quickml` and the Web Client from the same build. The
Function needs its existing private Stratus bucket and Evidence table. No new
Cloud Scale table is required. Configure a published text LLM Serving endpoint
for fluent synthesis as described in [RAG-SETUP.md](RAG-SETUP.md); basic onboarding
and source excerpts also work during model outages.

Validation:

```sh
node scripts/test-conversation-routing.mjs
node scripts/test-evidence-chat.mjs
node scripts/test-document-library.mjs
NETRA_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-evidence-chat-ui.cjs
npm run release:gate
```

Browser checks use the running app at `http://127.0.0.1:3002` with in-memory Catalyst
fixtures. They validate integration and layout, not live Zia model quality or
Production configuration.
