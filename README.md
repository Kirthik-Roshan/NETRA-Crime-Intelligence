# 👁️ NETRA — AI Crime Investigation Intelligence Platform

> **Network-Enabled Tactical Reasoning & Analytics**
> An AI Investigation *Operating System* for the Karnataka State Police (SCRB).
> Built for **Datathon 2026**.

NETRA lets investigators reason over FIRs, criminal networks, evidence and
geography using **natural language** — and every answer is **explainable and
audited**. It is *not* "ChatGPT with crime data": the assistant is one module
inside a full investigative workspace (dashboards, case workspaces, criminal
network graphs, hotspot maps, predictive briefings).

---

## ✨ What's inside

| Module | What it does |
|--------|--------------|
| **Investigation Dashboard** | Intelligence briefings, crime trends, live Karnataka hotspot map, AI alerts, audit feed |
| **AI Assistant** | Natural-language + Kannada queries → validated SQL → explainable answers (confidence, evidence, reasoning, audit ID) · **voice input & read-aloud** · **multi-turn conversation memory** · **conversation → PDF export** |
| **Predictive Intel** | Hotspot forecasts, repeat-offense probability, escalation warnings, crime-type momentum — every prediction with confidence + factors + evidence records |
| **Cases** | Three-panel investigation workspace: case info · timeline + evidence + chargesheet/court · AI intelligence panel |
| **Criminal Intelligence** | Dynamic profiles: risk score, aliases, associates, phones, vehicles, addresses, arrest history |
| **Network Graph** | Interactive criminal network — expand people, phones, vehicles, FIRs, organizations |
| **Analytics** | BI charts: trend, type, district, time-of-day, severity, status, **socio-demographic insights** (official complainant/victim lookups) |
| **Crime Maps** | Full interactive Karnataka heatmap with district ranking |
| **Reports** | District / trend / network reports with **PDF export** |
| **Administration** | Users & RBAC, immutable audit trail, AI configuration |
| **Dynamic theming** | 5 live-swappable themes (Midnight · Nocturne · Carbon · Slate · Daylight) |

> 🗄️ **The database is the official KSP FIR schema.** Every table, column, key
> and relationship from the provided *Police FIR System — ER Diagram* PDF is
> implemented verbatim (structured CrimeNo format included), plus a namespaced
> `intel_*` AI layer. See **[SCHEMA.md](./SCHEMA.md)**.

---

## 🚀 Run it on any laptop (one command)

**Prerequisites:** [Node.js 18+](https://nodejs.org) (that's it — the database
seeds itself on first run).

```bash
# 1. install dependencies
npm install

# 2. start the app  (the crime database auto-seeds on first boot)
npm run dev
```

Open **<http://localhost:3000>** and sign in with any demo account:

| Officer ID | Role | Password |
|------------|------|----------|
| `admin` | Administrator | `police123` |
| `dcp.mysuru` | Senior Officer | `police123` |
| `io.bengaluru` | Investigation Officer | `police123` |
| `analyst.scrb` | Analyst | `police123` |
| `desk.hubli` | Read-only Officer | `police123` |

> First boot seeds a realistic Karnataka dataset in the **official KSP FIR
> schema** — **500 CaseMaster records, 700+ Accused, 70 resolved criminal
> profiles, 24 police stations, 72 employees, 6 gangs, 1100+ relationship
> links** across 12 districts. To rebuild it from scratch: `npm run db:reset`.

### Production build

```bash
npm run build && npm run start
```

---

## 🧠 The AI — Zoho Catalyst only (no ChatGPT / Gemini / Ollama)

NETRA uses **exactly one AI product: Zoho Catalyst** (QuickML for the LLM + RAG,
Zia for voice & translation). No external AI service is contacted — ever. The
pipeline runs in layered tiers, automatically, so it stays fast and always
answers:

```
User query
   │
   ▼
0. Entity dossier ── CrimeNo / phone / plate / name → full linked record  (≈1 ms)
   ▼
0.5 Semantic     ── "similar cases / same modus operandi"  (vector search)
   ▼
1. Template SQL  ── fast, verified, no LLM needed  (≈1 ms)   ← ~70% of queries
   │  (repeat offenders, hotspots, trends, crime+district, gangs, arrests…)
   ▼
2. Catalyst QuickML ── generates SQL (VALIDATED: SELECT-only, table whitelist)
   │                   then executes + phrases the answer;  + RAG over the KB
   ▼
3. Built-in engine ── deterministic keyword fallback so it ALWAYS answers offline
```

**You don't need a GPU — or even a network — to demo this.** With no Catalyst
token set, tiers 0, 0.5, 1 & 3 keep the whole app working on any laptop using
the built-in deterministic engine. To enable full free-text / Kannada reasoning,
set your Catalyst QuickML credentials in `.env` (see `.env.example`):

```bash
CATALYST_QUICKML_TOKEN=<your Bearer token>   # from the Catalyst Console
CATALYST_PROJECT_ID=52939000000021001
CATALYST_ORG=60079036047
CATALYST_LLM_MODEL=VL-Qwen3.6-35B-A3B
```

Once the token is set, the AI-status dot in the top bar turns green and every
free-text query is answered by **Catalyst QuickML**. The token is read from the
environment only — **never hardcoded and never sent to the browser**.

> In **production on Zoho Catalyst**, QuickML serves the model on GPU, so
> responses stay under the 5 s target. See [`DEPLOY.md`](./DEPLOY.md).

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 14 App Router (TypeScript · Tailwind · React Flow)   │  ← AppSail
│  Dashboard · Assistant · Cases · Criminals · Network · Maps   │
└───────────────┬──────────────────────────────────────────────┘
                │  server components + /api routes
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Intelligence pipeline (src/lib)                              │
│  intent → RBAC → template/LLM SQL → validate → execute →      │
│  explainability → audit log                                   │
└───────────────┬──────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Data layer — SQLite (dev)  →  Catalyst Data Store (prod)     │
└──────────────────────────────────────────────────────────────┘
```

**Stack:** Next.js 14 · TypeScript · Tailwind (CSS-variable theming) ·
better-sqlite3 · React Flow · Recharts · Leaflet (self-hosted GeoJSON, no map
tiles) · Zustand · Zoho Catalyst QuickML + Zia.

### Project layout
```
src/
├── app/
│   ├── (app)/          # authenticated shell: dashboard, assistant, cases, …
│   ├── api/            # auth, assistant/query, network, ai/status
│   ├── login/          # sign-in
│   ├── fonts/          # self-hosted woff2 (no Google Fonts)
│   └── layout.tsx      # fonts + flash-free theme init
├── components/         # ui, charts, network graph, maps, sidebar/topbar
├── lib/                # db, schema.sql, auth, audit, catalyst, nl2sql, queries
└── store/              # Zustand (theme, language)
scripts/seed.mjs        # deterministic Karnataka data generator
functions/ai_quickml/   # Catalyst serverless LLM proxy (production)
catalyst.json           # Catalyst project manifest
app-config.json         # Catalyst AppSail (Next.js) config
DEPLOY.md               # Zoho Catalyst deployment guide
```

---

## 🔐 Security & explainability (built in, not bolted on)

- **RBAC** — 5 roles with a capability matrix; every AI request checks the
  officer's session before touching records.
- **SQL guard** — generated SQL is `SELECT`-only, table-whitelisted, and
  auto-`LIMIT`ed. No writes ever reach the model path.
- **Explainable AI** — every answer ships confidence, reasoning, the exact
  records used, alternative follow-ups, and a traceable **audit ID**.
- **Immutable audit trail** — logins, AI queries, case views, network views —
  all recorded (see *Administration*).
- **Human-in-the-loop** — the AI assists; the officer decides.

---

## 📦 npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (auto-seeds DB) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run seed` | Seed the DB (no-op if already seeded) |
| `npm run db:reset` | Wipe & rebuild the seed data |

---

## ☁️ Deploying to Zoho Catalyst

Deployment is **mandatory** for Datathon submission. NETRA maps cleanly onto
Catalyst services — full step-by-step in **[`DEPLOY.md`](./DEPLOY.md)**.

---

*NETRA · Karnataka State Police · Datathon 2026. For authorized
law-enforcement / educational use. All crime data is synthetic seed data.*
