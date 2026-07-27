# NETRA — turning on the PDF RAG assistant

The static frontend is already wired for RAG. It stays inert (shows a
"not connected" answer) until you stand up the backend below. Nothing here
touches the frontend code — it's all Catalyst console + one env var.

## The pieces

```
Assistant (static, on Slate)
   │  POST { mode:"rag", query }
   ▼
Catalyst Function  functions/ai_quickml   ← holds the token, adds CORS
   │  POST /quickml/v1/project/<id>/rag/answer
   ▼
QuickML RAG knowledge base  ← your case PDFs live here
```

## Steps

1. **Generate the case PDFs** (already committed under `./case-dossiers/`, or
   regenerate from the demo data):
   ```bash
   npm run dossiers      # writes ./case-dossiers/*.pdf + _INDEX.txt
   ```

2. **Create a QuickML RAG knowledge base** — Catalyst console → **QuickML** →
   create a RAG pipeline / knowledge base → **upload every PDF** from
   `./case-dossiers/`. (Add your own real case PDFs the same way.)

3. **Deploy the Function** `functions/ai_quickml` and set its env vars
   (Catalyst console → the function → Configuration):
   ```
   CATALYST_DC_BASE       = https://api.catalyst.zoho.in
   CATALYST_ORG           = <your org id>
   CATALYST_PROJECT_ID    = <your project id>
   CATALYST_QUICKML_TOKEN = <your QuickML bearer token>
   CATALYST_RAG_PATH      = rag/answer      # adjust if your endpoint differs
   CORS_ALLOW_ORIGIN      = https://netra-crime-intellig-tivoagho.onslate.in
   ```
   Copy the function's invoke URL (e.g.
   `https://<project>.catalystserverless.in/server/ai_quickml/`).

4. **Point the frontend at the Function** — in the **Slate** app →
   Configuration → Environment Variables, add:
   ```
   NEXT_PUBLIC_AI_FN_URL = <the function invoke URL from step 3>
   ```
   Then **Sync Now** (the env var is read at build time, so it needs a rebuild).

5. **Test** — open the Assistant and ask something answerable from the
   dossiers, e.g. *"Summarise the burglary cases in Mysuru"* or *"Which suspects
   appear in the critical cases?"*. You should get an answer tagged
   **"Catalyst QuickML · RAG"** with the source documents listed under it.

## Notes

- **CORS is required** and already handled by the Function — the browser calls
  it from a different origin (`onslate.in`) than the function host, so it sends
  `Access-Control-Allow-Origin` and answers the OPTIONS preflight. Set
  `CORS_ALLOW_ORIGIN` to your exact Slate URL (or `*` while testing).
- If RAG returns nothing, the assistant automatically falls back to a plain
  QuickML LLM answer, then to a "check the setup" message — so it never hangs.
- The PDFs are plain text dossiers; QuickML extracts and indexes their text.
  You can upload `.txt`/`.docx` too if your KB prefers them.
