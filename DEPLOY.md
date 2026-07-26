# ☁️ Deploying NETRA to Zoho Catalyst

Deployment on Catalyst is **mandatory** for the Datathon 2026 submission. This
guide takes you from a clean laptop to a live NETRA URL.

> **The golden rule:** you build the files (they're in this repo); **you** run
> `catalyst login` + `catalyst deploy` because those need *your* Zoho account.

---

## 0. How NETRA maps onto Catalyst services

| NETRA capability | Catalyst service |
|------------------|------------------|
| Next.js web app (SSR) | **AppSail** (managed Node runtime) — see `app-config.json` |
| REST / AI proxy functions | **Serverless Functions** — see `functions/ai_quickml/` |
| Crime database (relational) | **Data Store** (schema = `src/lib/schema.sql`) |
| LLM serving + RAG + embeddings | **QuickML** (`VL-Qwen3.6-35B-A3B` — **no ChatGPT/Gemini/Ollama**) |
| OCR · Speech-to-Text · Kannada translation | **Zia Services** |
| Officer login / RBAC | **Authentication** |
| Object storage (evidence, exported PDFs) | **Stratus** |
| Query / semantic cache | **Cache** |
| Routing · throttling · auth in front of functions | **API Gateway** |
| Scheduled precompute (embeddings, hotspots) | **Cron / Job Scheduling** |

`catalyst.json` in the repo root declares these components.

---

## 1. Install the Catalyst CLI (one time)

```bash
npm install -g zcatalyst-cli
catalyst --version
```

## 2. Create a project + log in

1. Go to <https://catalyst.zoho.com> → **Create Project** → name it `netra`.
   (Claim your Datathon credits first: the Catalyst credits link in the brief.)
2. Authenticate the CLI:

```bash
catalyst login          # opens the browser
```

## 3. Bind this repo to your project

From the repo root:

```bash
catalyst init
```

- Select your `netra` project when prompted.
- Choose the components: **AppSail**, **Functions** (and enable Data Store,
  Authentication, QuickML, Stratus, Cache from the console).
- `catalyst init` writes your real `projectId` / environment into the config —
  the `catalyst.json` / `app-config.json` here are templates it will reconcile.

---

## 4. Provision the backing services (console)

In the Catalyst console for your project:

1. **Data Store** → create a table group and import the schema. The canonical
   DDL is [`src/lib/schema.sql`](./src/lib/schema.sql). Seed it with the same
   data by adapting [`scripts/seed.mjs`](./scripts/seed.mjs) (it uses plain
   `INSERT`s you can port to the Data Store SDK/bulk import).
2. **Authentication** → enable email/password (or SSO) for officer login.
3. **QuickML** → deploy the open LLM (**`VL-Qwen3.6-35B-A3B`**) as an
   **LLM-serving** endpoint, and (optionally) a **RAG** pipeline over your
   crime-intel Knowledge Base. Copy your project's Bearer token + org ID.
4. **Stratus** → create a bucket `netra-evidence`.
5. **Cache** → enable a cache segment `netra`.
6. **Zia Services** → enable OCR, Speech-to-Text, and Translation (for Kannada).

---

## 5. Configure environment variables

Set these in the Catalyst console (AppSail → Environment, and Functions →
Environment). Never commit real secrets.

```
NETRA_SESSION_SECRET   = <long random string>
CATALYST_DC_BASE       = https://api.catalyst.zoho.in
CATALYST_ORG           = 60079036047
CATALYST_PROJECT_ID    = 52939000000021001
CATALYST_QUICKML_TOKEN = <your Bearer token>
CATALYST_LLM_MODEL     = VL-Qwen3.6-35B-A3B
CATALYST_LLM_PATH      = vlm/chat
```

The app already reads these (see `.env.example`, `src/lib/catalyst.ts`,
`functions/ai_quickml/index.js`). Locally, leave `CATALYST_QUICKML_TOKEN` unset
— NETRA falls back to the built-in deterministic engine automatically.
**Never commit the token**; set it only in the Catalyst console or your `.env`.

---

## 5b. Validate the backend (optional but recommended)

Before deploying, confirm your token + model paths work end-to-end:

```bash
npm run catalyst:check
```

It hits all five endpoints (QuickML LLM, QuickML RAG, Zia STT/TTS/Translate)
and prints ✅/❌ per endpoint. `401/403` = token issue; `404` = wrong model/path.
Set the values in `.env` (or the environment) first.

---

## 6. Deploy

```bash
# optional: run everything locally against Catalyst emulators first
catalyst serve

# ship it — builds AppSail (npm install && npm run build) and pushes functions
catalyst deploy
```

`catalyst deploy` prints your live URL (e.g. `https://netra-<id>.catalystserverless.com`).

### Custom domain + SSL (optional)
Catalyst console → **Domain Mappings** → add your domain; SSL is provisioned
automatically.

---

## 7. Verify

- Open the live URL → sign in (`io.bengaluru` / `police123` if you seeded the
  demo users, or your Authentication users).
- Ask the assistant *"Which districts are crime hotspots?"* → you should get an
  answer with a confidence score + audit ID.
- Check **Administration → Audit Trail** to confirm actions are logged.
- The top-bar AI dot is green when QuickML is reachable.

---

## The AI backend (the "only Zoho Catalyst" bit)

NETRA uses **exactly one AI product: Zoho Catalyst** — QuickML for the LLM + RAG,
Zia for voice/translation. There is no Ollama, no OpenAI, no Gemini. There are
also no other external services at runtime: **map tiles are self-hosted GeoJSON**
and **fonts are self-hosted woff2**.

The single integration point is `src/lib/catalyst.ts`. Set
`CATALYST_QUICKML_TOKEN` and NETRA calls QuickML directly; you can alternatively
route through the deployed `ai_quickml` Function for a Gateway boundary. The rest
of the pipeline (`src/lib/nl2sql.ts`) is identical across dev and prod — when no
token is set it runs on the built-in deterministic engine (offline).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `catalyst: command not found` | Re-run `npm install -g zcatalyst-cli`; ensure global npm bin is on `PATH`. |
| AppSail build fails | Confirm Node 18 stack; check `buildCommand` in `app-config.json`. |
| AI answers but dot is amber | QuickML endpoint/key not set → NETRA is using the template + fallback tiers (still works). |
| Empty data | Import `src/lib/schema.sql` into Data Store and seed it. |

---

*Once deployed, keep your Catalyst credentials in the console — not in the repo.*
