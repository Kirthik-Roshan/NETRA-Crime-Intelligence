# NETRA — Complete Project Summary

**NETRA** (Networked Evidence, Tracking & Reasoning Assistant) — an AI-powered
Crime Investigation Intelligence Platform for the **Karnataka State Police**,
built for **Datathon 2026, Challenge 01** ("Intelligent Conversational AI for
KSP Crime Database").

> Not a chatbot. An AI Investigation Operating System — natural-language querying
> over 1,100+ police-station-scale crime data, with criminal-network graphs,
> predictive early-warnings, semantic search, and fully explainable, audited AI.

---

## 1. What it does (feature map)

| Challenge requirement | How NETRA delivers it |
|---|---|
| NL chatbot (English + **Kannada**) | 3-tier query pipeline, English + Kannada + transliteration |
| Voice interaction | Mic input + read-aloud (Web Speech locally → Catalyst Zia Speech in prod) |
| Context-aware conversations | Multi-turn memory carries district/crime/time across turns |
| PDF export of conversation | "Export PDF" button on the assistant |
| Criminal network visualization | Focused ego-network graph (React Flow), click-to-expand |
| Crime trend & hotspot detection | Dashboard charts + Karnataka heat-map + AI briefings |
| Predictive analytics & early warnings | Hotspot forecast, repeat-offense probability, escalation warnings |
| Explainable AI + audit trails | Every answer: confidence, evidence records, reasoning, audit ID |
| Role-based secure access | 5 roles, signed-cookie sessions, SQL guardrails |
| **Semantic search** (bonus) | TF-IDF embeddings, "find similar FIRs by modus operandi" |
| **Real-data importer** (bonus) | Admin CSV upload → official CaseMaster schema |
| **Branded PDF reports** (bonus) | Server-rendered KSP-branded reports (SmartBrowz in prod) |
| **Database Explorer** (v1.1) | Read-only browse of all tables & views (never exposes `users`) |
| **Full Kannada UI** (v1.1) | Whole interface re-renders in ಕನ್ನಡ from the 🌐 toggle |
| **Karnataka district/city heatmap** (v1.1) | State-bounded map, district-bubble + incident views, filters |

---

## 2. How it was built — from scratch

Development ran in clear phases (see git history on branch
`claude/new-session-u4xar5`):

1. **Foundation** — Next.js 14 (App Router) + TypeScript + Tailwind project,
   design tokens, 5 dynamic dark themes.
2. **Database** — modelled the **official KSP FIR schema** directly from the
   provided ER-diagram PDF (28 tables) + an `intel_*` AI-enrichment layer +
   read-only investigator views. Deterministic seeder generates 500 realistic
   Karnataka FIRs with the exact structured **CrimeNo** format.
3. **Auth & shell** — signed-cookie sessions, 5 roles, sidebar/topbar/status-bar
   layout.
4. **AI pipeline** — the 3-tier NL→SQL engine with explainability + audit.
5. **Feature pages** — dashboard, assistant, cases, criminal profiles, network
   graph, analytics, maps, reports, admin.
6. **Catalyst deploy config** — `catalyst.json`, AppSail `app-config.json`,
   QuickML proxy function, `DEPLOY.md`.
7. **Schema rebuild** — re-implemented the DB to match the official ER diagram
   exactly after reading the PDF.
8. **5 gap features** — voice, conversation PDF export, Predictive Intelligence
   page, multi-turn memory, Kannada.
9. **Adversarial review** — an 8-agent review workflow found 4 real bugs
   (incl. a SQL-validator security hole); all fixed & re-verified.
10. **5 next-level upgrades** — focused network graph, Kannada UI localization,
    semantic search, real-data importer, branded PDF reports.

---

## 3. Full technology stack

### Frontend
- **Next.js 14** (App Router, React Server Components)
- **TypeScript** (strict)
- **Tailwind CSS** + custom design-token system (5 themes, light/dark)
- **React Flow** — interactive criminal-network graph
- **Recharts** — trend/bar/donut charts
- **Leaflet** — Karnataka crime hot-spot maps, rendered from a **self-hosted
  GeoJSON** (no external map tiles / CDN)
- **Zustand** — client state (theme, language, sidebar) with `localStorage` persist
- **lucide-react** — icons
- **Self-hosted fonts** — woff2 files bundled in the repo (no Google Fonts)
- **Web Speech API** — optional browser-native mic dictation in dev; production
  voice goes through **Catalyst Zia** (`ziaTranscribe` / `ziaTts`)

### Backend
- **Next.js Route Handlers** (API) — REST endpoints
- **better-sqlite3** — embedded SQL database (local dev)
- **Node.js 18+** runtime

### AI layer — Zoho Catalyst only
- **Catalyst QuickML LLM** (`VL-Qwen3.6-35B-A3B`) — the single AI backend for
  NL→SQL generation & narrative reasoning
- **Catalyst QuickML RAG** — free-text answers over the crime-intel Knowledge Base
- **Catalyst Zia** — Speech-to-text, text-to-speech, translation
- **Local TF-IDF embeddings** — semantic similarity (→ QuickML embeddings in prod)
- **Deterministic rule-engine** — template SQL + intent detection + entity
  dossier lookup (no LLM needed; also the offline dev fallback)

### Production (Zoho Catalyst — deployment mandatory)
- **AppSail** — hosts the Next.js app (managed Node runtime)
- **Data Store** — relational DB (mirrors the SQLite schema)
- **QuickML** — LLM serving + embeddings + RAG
- **Zia Services** — Speech (voice), OCR, Translation
- **Authentication**, **Stratus** (object storage), **Cache**, **API Gateway**,
  **SmartBrowz** (server-side PDF), **Functions**, **Cron**

### Only Zoho Catalyst — zero other external products
**No OpenAI, no Gemini, no Anthropic, no Ollama.** The only external service the
running app talks to is **Zoho Catalyst** (QuickML + Zia). Verified by code scan:
no third-party LLM SDK in `package.json`; **map tiles are self-hosted GeoJSON**
(no CARTO/OSM CDN); **fonts are self-hosted woff2** (no Google Fonts). The app
runs fully offline on the built-in deterministic engine when no Catalyst token
is present.

---

## 4. How the AI works — Zoho Catalyst QuickML (the only AI backend)

NETRA's AI is **100% Zoho Catalyst**. There is no external LLM, no Ollama, no
OpenAI/Gemini — the deployed system depends on no third-party AI product.

### How NETRA calls it (`src/lib/catalyst.ts`)

NETRA talks to Catalyst QuickML over HTTPS with a Bearer token + `CATALYST-ORG`
header, wrapped in **timeouts** so the app never hangs. The token is read from
the environment (`CATALYST_QUICKML_TOKEN`) and **never hardcoded**:

```
LLM chat:  POST {DC}/quickml/v1/project/{PROJECT}/vlm/chat
                { prompt, model: "VL-Qwen3.6-35B-A3B", system_prompt, temperature }
RAG:       POST {DC}/quickml/v1/project/{PROJECT}/rag/answer   { query, top_k }
Zia voice: POST {DC}/quickml/api/v1/models/zia/{audio/transcribe, tts/synthesize, translate}
```

- `catalystConfigured()` — true when a QuickML token is present.
- `quickmlChat(prompt, {system, temperature})` — returns the model text (or
  `null` on any error → caller falls back gracefully to the built-in engine).
- `quickmlRag(query)` — free-text answer over the Catalyst Knowledge Base.
- `ziaTranscribe / ziaTts / ziaTranslate` — Catalyst Zia voice + translation.
- Config via env: `CATALYST_DC_BASE`, `CATALYST_ORG`, `CATALYST_PROJECT_ID`,
  `CATALYST_QUICKML_TOKEN`, `CATALYST_LLM_MODEL`, `CATALYST_LLM_PATH`.

### Where it fits in the query pipeline

NETRA does **NOT** blindly send everything to the LLM (that's slow and unsafe).
It uses a **layered pipeline** (`src/lib/nl2sql.ts`):

```
User query (English / Kannada)
        │
   ┌────┴───────────────────────────────────────────────┐
   │ Tier 0   · Entity dossier  → CrimeNo/phone/plate/name │  local, ~1ms
   │ Tier 0.5 · Semantic search → TF-IDF embeddings        │  "similar FIRs"
   │ Tier 1   · Template SQL    → rule-engine, ~4ms        │  ~70% of queries
   │ Tier 2   · Catalyst QuickML→ LLM writes SQL (+ RAG)   │  complex/novel
   │ Tier 3   · Keyword fallback→ always works             │  offline safety net
   └──────────────────────────────────────────────────────┘
        │
   Validate SQL (SELECT-only, table whitelist, no quoted identifiers)
        │
   Execute → verify evidence → explainability → audit log → answer
```

**When the LLM is used (Tier 2):** NETRA gives QuickML a schema hint + the
question, asks for **one SELECT query**, then **validates** it (`validateSql`)
before execution — rejecting anything that isn't a read-only query against
whitelisted tables. The raw rows are then summarized by QuickML into an
investigator-friendly answer. The DB rows are never blindly trusted; SQL is
always guard-railed. If SQL generation doesn't apply, Tier 2b answers via
**QuickML RAG**.

### How NETRA stays fast — and always available
NETRA answers ~70% of queries with the **template rule-engine in ~4 ms** (no LLM
at all), and resolves exact-identifier lookups (CrimeNo/phone/plate/name)
locally, reserving QuickML for genuinely novel questions. In production,
**Catalyst QuickML** serves the model on GPU for sub-5 s responses. When no
QuickML token is configured (local dev), the built-in deterministic engine keeps
every tier except Tier 2 working — the app runs fully offline.

---

## 5. The AI intelligence pipeline (detail)

`answerQuery()` in `src/lib/nl2sql.ts`:

1. **Intent + entity extraction** — pulls district, crime type, time window from
   the query. English aliases, Kannada stems, and transliterations; token-boundary
   matching (so "upi" ≠ "udupi"); dynamic recognition of imported districts.
2. **Conversation memory** — follow-up queries ("what about vehicle theft?")
   inherit district/crime/time from earlier turns.
3. **Semantic tier** — "similar FIRs / same modus operandi" → TF-IDF cosine.
4. **Template tier** — 15+ hand-tuned SQL templates (repeat offenders, hotspots,
   station workload, socio-demographics, chargesheets, trends, …). Fast + exact.
5. **LLM tier** — Catalyst QuickML writes SQL, validated, executed, summarized
   (or answers via QuickML RAG).
6. **Fallback tier** — keyword search that always returns something.
7. **Explainability** — every answer carries: confidence %, records used
   (evidence CrimeNos), reasoning, alternatives, context-carried entities,
   processing time, model name, and an **audit ID**.
8. **Audit** — every AI query is written to an immutable `audit_logs` table.

---

## 6. Database — official KSP schema

Modelled **exactly** from the provided ER-diagram PDF (`SCHEMA.md` has the full
map). Highlights:

- **28 official tables**: `CaseMaster` (FIRs), `Accused`, `Victim`,
  `ComplainantDetails`, `ArrestSurrender`, `ChargesheetDetails`, `Unit`
  (stations), `Employee`, `Court`, `CrimeHead`/`CrimeSubHead`, `Act`/`Section`,
  and lookup masters (`District`, `State`, `Religion`, `Caste`, `Occupation`, …).
- **Structured CrimeNo**: `1-digit category + 4-digit district + 4-digit unit +
  4-digit year + 5-digit serial` — e.g. `104430006202600001`.
- **`intel_*` enrichment layer** — AI-resolved criminal profiles, relationship
  graph, risk scores, phones/vehicles/addresses/weapons, organizations.
- **Compatibility views** (`firs`, `cases`, `criminals`, …) — investigator-friendly
  shapes over the official tables.

---

## 7. Security & explainability

- **Role-based access** — 5 roles (Administrator, Senior Officer, Investigation
  Officer, Analyst, Read-only).
- **SQL guardrails** — `validateSql()`: SELECT-only; blocked keywords; table
  whitelist; explicit deny-list for `users`/`audit_logs`; rejects quoted
  identifiers (closes an injection bypass); single-statement only.
- **Audit trail** — immutable logs for logins, AI queries, predictions, exports,
  imports; each with timestamp, user, role, action, model, processing time,
  request ID.
- **Human-in-the-loop** — AI assists; the officer always decides. Every
  prediction carries confidence + evidence + reasoning. No black boxes.

---

## 8. Running it & deploying it

### Run on any laptop
```bash
npm install       # Node.js 18+
npm run dev        # → http://localhost:3000  (DB auto-seeds on first run)
```
Demo logins (password `police123`): `admin`, `dcp.mysuru`, `io.bengaluru`,
`analyst.scrb`, `desk.hubli`.

### Enable the Catalyst QuickML AI (optional for local demo)
```bash
# in .env — get the token from your Catalyst Console (never commit it):
CATALYST_QUICKML_TOKEN=<your Bearer token>
CATALYST_PROJECT_ID=52939000000021001
CATALYST_ORG=60079036047
```
Without a token, NETRA still works fully on the built-in deterministic engine.

### Deploy to Zoho Catalyst (mandatory for submission)
```bash
npm install -g zcatalyst-cli
catalyst login
catalyst init        # link to your Catalyst project
catalyst deploy      # → live URL
```
See `DEPLOY.md` for the full step-by-step. Only you can run the final deploy
(needs your Zoho login); every config file is already in the repo.

---

## 9. Project structure

```
src/
├── app/
│   ├── (app)/            dashboard, assistant, cases, criminals, network,
│   │                     analytics, maps, reports, admin, predictions, settings
│   ├── api/              auth, assistant/query, network, audit, admin/import,
│   │                     reports/[type], ai/status
│   └── login/
├── components/           Sidebar, Topbar, charts, network graph, assistant,
│                         admin/DataImport, maps, ui primitives
├── lib/
│   ├── db.ts             SQLite connection + auto-seed
│   ├── schema.sql        official KSP schema + intel layer + views
│   ├── nl2sql.ts         layered NL→SQL pipeline + explainability
│   ├── catalyst.ts       Catalyst QuickML + Zia client (the only AI backend)
│   ├── lookup.ts         whole-DB entity dossier lookup (CrimeNo/phone/plate/name)
│   ├── embeddings.ts     TF-IDF semantic search
│   ├── predict.ts        predictive-intelligence models
│   ├── importer.ts       CSV → official schema
│   ├── smartbrowz.ts     branded PDF (SmartBrowz in prod)
│   ├── i18n*.ts          English/Kannada localization
│   ├── audit.ts          immutable audit logging
│   └── auth.ts           sessions + RBAC
├── store/                Zustand (theme, language)
functions/ai_quickml/     Catalyst QuickML proxy function
scripts/seed.mjs          deterministic Karnataka data seeder
catalyst.json, app-config.json, DEPLOY.md, SCHEMA.md
```

---

*NETRA · Karnataka State Police · Datathon 2026 · Challenge 01*
