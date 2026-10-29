# NETRA — turning on the PDF RAG assistant

The static frontend is wired for RAG through the same Catalyst Function that
retrieves the official Cloud Scale records. QuickML knowledge-base passages
supplement those structured records; they never replace them.

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

1. **Generate synthetic case PDFs** for the Datathon knowledge base:
   ```bash
   npm run dossiers      # writes ./case-dossiers/*.pdf + _INDEX.txt
   ```

2. **Create a QuickML RAG knowledge base** — Catalyst console → **QuickML** →
   create a RAG pipeline / knowledge base → **upload every PDF** from
   `./case-dossiers/`. (Add your own real case PDFs the same way.)

3. **Deploy the Function** `functions/ai_quickml` and set its env vars
   (Catalyst console → the function → Configuration):
   ```
   QML_CLIENT_ID          = <OAuth client ID>
   QML_CLIENT_SECRET      = <OAuth client secret>
   QML_REFRESH_TOKEN      = <OAuth refresh token>
   QML_ORG                = <your org id>
   QML_PROJECT_ID         = <your project id>
   QML_LLM_PATH           = llm/chat
   QML_LLM_ENDPOINT_KEY   = <published text LLM Serving endpoint key>
   QML_LLM_ENDPOINT_PATH  = endpoints/predict
   CORS_ALLOW_ORIGIN      = https://netra-crime-intellig-tivoagho.onslate.in
   ```
   Copy the function's invoke URL (e.g.
   `https://<project>.catalystserverless.in/server/ai_quickml/`).

   General conversation and evidence/document answer synthesis need a text LLM
   endpoint as well as the RAG knowledge base. Create a single-shot **LLM Serving**
   endpoint in QuickML, copy its key into `QML_LLM_ENDPOINT_KEY`, and grant the
   OAuth scope `QuickML.deployment.READ`. The Function sends a prompt in `data`
   and supports the current `result[].content` response alongside legacy chat
   responses. Model parameters are configured in the published endpoint.
   See [Catalyst LLM Serving](https://docs.catalyst.zoho.com/en/quickml/help/endpoints/llm-serving-endpoint/)
   and [the LLM SDK response contract](https://docs.catalyst.zoho.com/en/sdk/python/v1/quickml/execute-llm-endpoint/).
   Greetings and NETRA onboarding work without a model; if the LLM is unavailable,
   source-scoped questions return stored excerpts rather than invented answers.

4. **Point the frontend at Production only when overriding automatic routing**
   — in the **Slate** app → Configuration → Environment Variables, add:
   ```
   NEXT_PUBLIC_AI_FN_URL = <the function invoke URL from step 3>
   ```
   Then **Sync Now**. A configured URL is read at build time.

5. **Test** — open the Assistant and ask something answerable from the
   dossiers, e.g. *"Summarise the burglary cases in Mysuru"* or *"Which suspects
   appear in the critical cases?"*. You should get an answer tagged
   **"Catalyst QuickML · RAG"** with the source documents listed under it.

## Notes

- **CORS is required** and already handled by the Function — the browser calls
  it from a different origin (`onslate.in`) than the function host, so it sends
  `Access-Control-Allow-Origin` and answers the OPTIONS preflight. Set
  `CORS_ALLOW_ORIGIN` to your exact Slate URL (or `*` while testing).
- If RAG returns nothing, the assistant falls back to relational retrieval over
  the official KSP records, then uses QuickML to phrase the grounded result.
- The PDFs are plain text dossiers; QuickML extracts and indexes their text.
  You can upload `.txt`/`.docx` too if your KB prefers them.
