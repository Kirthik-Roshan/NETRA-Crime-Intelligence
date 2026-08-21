# RAG over Cloud Scale Search (replaces QuickML RAG)

The assistant's `rag` mode now retrieves **only from Cloud Scale** — Cloud Scale
Search over your Data Store tables — and the QuickML LLM merely phrases the
answer from the retrieved rows. Nothing reads the old QuickML RAG knowledge base.

## Setup (console + Function env)

1. **Load your data into Data Store** (you own this) — e.g. tables `Firs`,
   `Cases`, `Criminals`.

2. **Enable Cloud Scale → Search** and index the columns you want searchable
   (console → Cloud Scale → Search → add the tables/columns).

3. **Tell the Function which tables/columns to search** — set on the
   `ai_quickml` Function config:
   ```
   SEARCH_TABLE_COLUMNS = {"Firs":["BriefFacts","CrimeNo","crime_type"],"Cases":["title","summary"]}
   SEARCH_SELECT_COLUMNS = {"Firs":["CrimeNo","BriefFacts","district"],"Cases":["title","summary"]}   # optional
   ```
   `SEARCH_TABLE_COLUMNS` = where to search; `SEARCH_SELECT_COLUMNS` (optional) =
   which columns to return. JSON, table → column array.

4. **Deploy** the Function.

## Behaviour
- No `SEARCH_TABLE_COLUMNS` set, or Search not indexed yet → the assistant
  answers "No matching records were found in Cloud Scale" (graceful, honest).
- Matches found → the LLM answers strictly from those rows; the UI shows each
  source row under its table name.

## Frontend
Unchanged — `askRag()` in `src/lib/ai-client.ts` still posts `{mode:"rag"}` and
receives `{answer, sources}`. Only the Function's retrieval backend changed
(QuickML RAG → Cloud Scale Search).
