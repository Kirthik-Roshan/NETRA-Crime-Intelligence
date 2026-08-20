# Zia OCR + Stratus + Data Store — provisioning

The `ai_quickml` Function gained `ocr` and `records:list` modes (Zia OCR via the
Catalyst Node SDK, storing the scan in Stratus and the result in Data Store).
OCR returns text even before the bucket/table exist (storage is best-effort),
but to persist results you must provision these in the Catalyst console **once**:

## 1. Data Store table — `OcrResult`
Columns (all Text unless noted):
| Column        | Type        | Notes                          |
|---------------|-------------|--------------------------------|
| `ocr_text`    | Text (max)  | extracted text                 |
| `language`    | Text        | `eng` / `kan`                  |
| `source_key`  | Text        | Stratus object key             |
| `source_name` | Text        | original filename              |

(`ROWID`, `CREATEDTIME` are added by Catalyst automatically.)
Override the table name with the `OCR_TABLE` env var on the Function.

## 2. Stratus bucket — `netra-evidence`
Create a Stratus bucket named `netra-evidence` (or set `STRATUS_BUCKET`).
Objects are written under the `ocr/` prefix.

## 3. Function env (Configuration)
Already set for the LLM/RAG path (`QML_CLIENT_ID/SECRET/REFRESH_TOKEN/ORG/PROJECT`).
The SDK (`catalyst.initialize(req, {scope:'admin'})`) reuses the Function's own
project credentials for Zia / Stratus / Data Store — no extra token needed.
Optional overrides: `OCR_TABLE`, `STRATUS_BUCKET`.

## 4. Deploy
From a `catalyst init` + `slate:link` bound checkout:
```
catalyst deploy
```
This redeploys the Function (with `zcatalyst-sdk-node`) and the static site.

## Frontend
The AI Assistant has a **Scan document** button (next to the mic): pick an FIR
image → Zia OCR → extracted text lands in the ask box. Client calls
`extractText()` in `src/lib/ai-client.ts` (mode `ocr`).
