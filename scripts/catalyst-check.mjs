/**
 * NETRA — Catalyst backend smoke-test.
 *
 *   npm run catalyst:check
 *
 * Hits all five Zoho Catalyst endpoints the app uses (QuickML LLM, QuickML RAG,
 * Zia STT / TTS / Translate) and prints a ✅/❌ per endpoint so you can confirm
 * your token + model paths BEFORE deploying. Reads config from the environment
 * or a local .env file. No secret is printed or committed.
 *
 * Classification:
 *   ✅ 2xx            — working
 *   ✅ 400/422        — authenticated & reached the model (payload rejected; fine
 *                       for the probe endpoints that need real audio/data)
 *   ❌ 401/403        — auth failed  → token expired / wrong scope
 *   ❌ 404            — path or model name differs → fix CATALYST_LLM_PATH / model
 *   ❌ network error  — DC base unreachable / blocked
 */
import { readFileSync } from "node:fs";

// ── tiny .env loader (only for keys not already in process.env) ──
try {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env — rely on real env */ }

const ACCOUNTS = process.env.QML_ACCOUNTS_BASE || "https://accounts.zoho.in";
const BASE = process.env.QML_DC_BASE || process.env.CATALYST_DC_BASE || "https://api.catalyst.zoho.in";
const ORG = process.env.QML_ORG || process.env.CATALYST_ORG || "";
const PROJECT = process.env.QML_PROJECT_ID || process.env.CATALYST_PROJECT_ID || "";
const DIRECT_TOKEN = process.env.CATALYST_QUICKML_TOKEN || "";
const CLIENT_ID = process.env.QML_CLIENT_ID || "";
const CLIENT_SECRET = process.env.QML_CLIENT_SECRET || "";
const REFRESH_TOKEN = process.env.QML_REFRESH_TOKEN || "";
const SCHEME = process.env.QML_AUTH_SCHEME || "Zoho-oauthtoken";
const MODEL = process.env.QML_LLM_MODEL || process.env.CATALYST_LLM_MODEL || "glm-4.7-flash";
const configuredPath = process.env.QML_LLM_PATH || process.env.CATALYST_LLM_PATH || "llm/chat";
const LLM_PATH = configuredPath === "vlm/chat" ? "llm/chat" : configuredPath;

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };

async function accessToken() {
  if (DIRECT_TOKEN) return DIRECT_TOKEN;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
  });
  const response = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(`refresh-token exchange failed (HTTP ${response.status}, ${result.error || "no access token"})`);
  }
  return result.access_token;
}

function headers(token) {
  return { "Content-Type": "application/json", Authorization: `${SCHEME} ${token}`, "CATALYST-ORG": ORG };
}

async function hit(label, path, body, token) {
  const url = `${BASE}/${path}`;
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 30000);
  try {
    const res = await fetch(url, { method: "POST", headers: headers(token), body: JSON.stringify(body), signal: c.signal });
    clearTimeout(timer);
    const status = res.status;
    let snippet = "";
    try { snippet = (await res.text()).slice(0, 140).replace(/\s+/g, " "); } catch { /* ignore */ }
    let icon, note;
    if (status >= 200 && status < 300) { icon = `${C.g}✅${C.x}`; note = "working"; }
    else if (status === 400 || status === 422) { icon = `${C.g}✅${C.x}`; note = "authenticated (payload rejected — expected for probe)"; }
    else if (status === 401 || status === 403) { icon = `${C.r}❌${C.x}`; note = "AUTH FAILED — token expired / wrong scope"; }
    else if (status === 404) { icon = `${C.r}❌${C.x}`; note = "NOT FOUND — check path / model name"; }
    else { icon = `${C.y}⚠️${C.x}`; note = `unexpected status ${status}`; }
    console.log(`${icon}  ${label.padEnd(22)} ${C.d}HTTP ${status}${C.x}  ${note}`);
    if (snippet) console.log(`      ${C.d}${snippet}${C.x}`);
    return icon.includes("✅");
  } catch (e) {
    clearTimeout(timer);
    console.log(`${C.r}❌${C.x}  ${label.padEnd(22)} ${C.d}network error${C.x}  ${String(e.message || e)}`);
    return false;
  }
}

async function main() {
  console.log(`\n${C.d}NETRA · Catalyst backend smoke-test${C.x}`);
  console.log(`${C.d}DC   ${BASE}${C.x}`);
  console.log(`${C.d}org  ${ORG || "(unset)"}   project ${PROJECT || "(unset)"}   model ${MODEL}${C.x}\n`);

  const missing = [];
  if (!ORG) missing.push("CATALYST_ORG");
  if (!PROJECT) missing.push("CATALYST_PROJECT_ID");
  if (!DIRECT_TOKEN && (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN)) {
    missing.push("QML_CLIENT_ID/QML_CLIENT_SECRET/QML_REFRESH_TOKEN");
  }
  if (missing.length) {
    console.log(`${C.y}⚠️  Not configured — set: ${missing.join(", ")}${C.x}`);
    console.log(`${C.d}   (in .env or the Function configuration).${C.x}\n`);
    process.exit(2);
  }

  let token;
  try {
    token = await accessToken();
    console.log(`${C.g}✅${C.x}  OAuth refresh token    ${C.d}access token issued${C.x}`);
  } catch (error) {
    console.log(`${C.r}❌${C.x}  OAuth refresh token    ${String(error.message || error)}`);
    process.exit(1);
  }

  const results = [];
  results.push(await hit("QuickML LLM", `quickml/v1/project/${PROJECT}/${LLM_PATH}`, {
    model: MODEL,
    messages: [{ role: "user", content: "Reply with OK." }],
    max_tokens: 20,
  }, token));
  results.push(await hit("QuickML RAG", `quickml/v1/project/${PROJECT}/rag/answer`, { query: "test" }, token));
  results.push(await hit("Zia transcribe", "quickml/api/v1/models/zia/audio/transcribe", { audio: "", language: "en" }, token));
  results.push(await hit("Zia TTS", "quickml/api/v1/models/zia/tts/synthesize", { text: "OK", language: "en", speaker: "Mary" }, token));
  results.push(await hit("Zia translate", "quickml/api/v1/models/zia/translate", { text: "hello", src_lang: "en", tgt_lang: "kn" }, token));

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok === results.length ? C.g : C.y}${ok}/${results.length} endpoints reachable & authenticated${C.x}\n`);
  process.exit(ok === results.length ? 0 : 1);
}

main();
