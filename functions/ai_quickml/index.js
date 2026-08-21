'use strict';
/**
 * NETRA — Catalyst Serverless (Advanced I/O) function: AI backend for the
 * static NETRA frontend (Slate). The browser calls this directly; it holds
 * credentials server-side and reaches Zoho Catalyst QuickML (Qwen LLM + RAG).
 *
 * Advanced I/O gives a raw http (req, res) — respond with writeHead/write/end,
 * NOT Express res.status().json().
 *
 * DURABLE AUTH: holds a self-client refresh token (lives until revoked) and
 * mints a fresh access token on demand, cached until just before expiry — so
 * nothing expires. Env (function Configuration), non-reserved QML_ prefix:
 *   QML_CLIENT_ID, QML_CLIENT_SECRET, QML_REFRESH_TOKEN, QML_ORG, QML_PROJECT_ID
 *   Optional: QML_ACCOUNTS_BASE, QML_DC_BASE, QML_LLM_PATH (vlm/chat),
 *             QML_RAG_PATH (rag/answer), QML_AUTH_SCHEME (Zoho-oauthtoken),
 *             CORS_ALLOW_ORIGIN.
 *
 * Body `mode`: "rag" → {answer,sources} · "chat" (default) → {response} · "ping".
 */

const catalyst = require("zcatalyst-sdk-node");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OCR_TABLE = process.env.OCR_TABLE || "OcrResult";
// File Store folder ID (numeric) for scanned evidence — create the folder in
// the console and set FILESTORE_FOLDER_ID. Empty → file storage is skipped.
const FILESTORE_FOLDER_ID = process.env.FILESTORE_FOLDER_ID || "";

// base64 (with or without data: prefix) → temp file path.
function tmpFromBase64(b64, ext) {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, "");
  const p = path.join(os.tmpdir(), `netra-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || "jpg"}`);
  fs.writeFileSync(p, Buffer.from(clean, "base64"));
  return p;
}

// Zia OCR result shape varies by model — pull the text out defensively.
function ocrText(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (r.text) return r.text;
  if (Array.isArray(r.lines)) return r.lines.map((l) => l.text || l).join("\n");
  if (r.data && (r.data.text || Array.isArray(r.data.lines))) return r.data.text || r.data.lines.map((l) => l.text || l).join("\n");
  return "";
}

const ACCOUNTS = process.env.QML_ACCOUNTS_BASE || "https://accounts.zoho.in";
const DC_BASE = process.env.QML_DC_BASE || "https://api.catalyst.zoho.in";
const ORG = process.env.QML_ORG;
const PROJECT = process.env.QML_PROJECT_ID;
const SCHEME = process.env.QML_AUTH_SCHEME || "Zoho-oauthtoken";
const LLM_PATH = process.env.QML_LLM_PATH || "vlm/chat";

// Allow any *.onslate.in origin (the app may live on different Slate URLs), or a
// specific CORS_ALLOW_ORIGIN, else "*". Reflecting the request origin keeps the
// AI working whichever onslate deployment calls it.
function allowedOrigin(origin) {
  if (origin && /\.onslate\.in$/i.test(origin)) return origin;
  return process.env.CORS_ALLOW_ORIGIN || "*";
}

function send(res, code, obj, origin) {
  const bytes = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(origin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Length": bytes.length,
  });
  res.end(bytes);
}

async function tfetch(url, opts, ms, label) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const t0 = Date.now();
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } catch (e) {
    throw new Error(`${label} failed after ${Date.now() - t0}ms: ${e.name === "AbortError" ? "timeout" : e.message}`);
  } finally {
    clearTimeout(t);
  }
}

let _token = null;
let _tokenExp = 0;

async function accessToken() {
  const now = Date.now();
  if (_token && now < _tokenExp) return _token;
  const cid = process.env.QML_CLIENT_ID, secret = process.env.QML_CLIENT_SECRET, refresh = process.env.QML_REFRESH_TOKEN;
  if (!cid || !secret || !refresh) return null;
  const params = new URLSearchParams({ grant_type: "refresh_token", client_id: cid, client_secret: secret, refresh_token: refresh });
  const r = await tfetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(),
  }, 8000, "token-refresh");
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) return null;
  _token = j.access_token;
  _tokenExp = now + Math.max(60, (Number(j.expires_in) || 3600) - 300) * 1000;
  return _token;
}

async function quickml(path, body, token) {
  const r = await tfetch(`${DC_BASE}/quickml/v1/project/${PROJECT}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `${SCHEME} ${token}`, "CATALYST-ORG": ORG },
    body: JSON.stringify(body),
  }, 18000, `quickml:${path}`);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: r.ok, status: r.status, json, text };
}

// Zia model endpoints (TTS / translate / transcribe) — same token + org.
async function zia(path, body, token) {
  const r = await tfetch(`${DC_BASE}/quickml/api/v1/models/zia/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `${SCHEME} ${token}`, "CATALYST-ORG": ORG },
    body: JSON.stringify(body),
  }, 18000, `zia:${path}`);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: r.ok, status: r.status, json, text };
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
    req.on("error", () => resolve(b));
  });
}

module.exports = async (req, res) => {
  const origin = (req.headers && req.headers.origin) || "";
  const reply = (code, obj) => send(res, code, obj, origin);
  try {
    if (req.method === "OPTIONS") { reply(204, {}); return; }
    if (req.method !== "POST") { reply(405, { error: "Method not allowed" }); return; }

    const raw = await readBody(req);
    const payload = JSON.parse(raw || "{}");
    const mode = payload.mode || "chat";

    if (mode === "ping") {
      reply(200, { ok: true, have: {
        org: !!ORG, project: !!PROJECT,
        client: !!process.env.QML_CLIENT_ID, secret: !!process.env.QML_CLIENT_SECRET, refresh: !!process.env.QML_REFRESH_TOKEN,
      }});
      return;
    }

    if (!ORG || !PROJECT) { reply(503, { error: "Function not configured (ORG/PROJECT)" }); return; }
    const token = await accessToken();
    if (!token) { reply(503, { error: "No credentials: set QML_CLIENT_ID/SECRET/REFRESH_TOKEN" }); return; }

    // ── Zia OCR (SDK) — extract text from an FIR scan, store the original in
    // Stratus + the result in Data Store. Storage is best-effort so OCR still
    // returns text before the bucket/table are provisioned. ────────────────
    if (mode === "ocr") {
      if (!payload.image) { reply(400, { error: "image required" }); return; }
      const app = catalyst.initialize(req, { scope: "admin" });
      const tmp = tmpFromBase64(payload.image, payload.ext || "jpg");
      try {
        const result = await app.zia().extractOpticalCharacters(fs.createReadStream(tmp), {
          modelType: "OCR",
          language: payload.language || "eng",
        });
        const text = ocrText(result);

        let file_id = null;
        try {
          if (FILESTORE_FOLDER_ID) {
            const up = await app.filestore().folder(FILESTORE_FOLDER_ID).uploadFile({
              code: fs.createReadStream(tmp),
              name: `ocr-${path.basename(tmp)}`,
            });
            file_id = String((up && (up.id || up.file_id)) || "");
          }
        } catch (e) { /* folder not provisioned yet — skip file storage */ }

        let record_id = null;
        try {
          const row = await app.datastore().table(OCR_TABLE).insertRow({
            ocr_text: text.slice(0, 60000),
            language: payload.language || "eng",
            source_key: file_id || "",
            source_name: payload.name || "",
          });
          record_id = (row && (row.ROWID || row.rowid)) || null;
        } catch (e) { /* table not provisioned yet — skip persistence */ }

        reply(200, { text, file_id, record_id });
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* temp cleanup */ }
      }
      return;
    }

    // ── Zia image services (SDK) — analysis only, result returned as-is.
    // face · object · moderate · barcode · compareFace. ────────────────────
    if (mode === "face" || mode === "object" || mode === "moderate" || mode === "barcode" || mode === "compareFace") {
      const app = catalyst.initialize(req, { scope: "admin" });
      const zia = app.zia();
      if (mode === "compareFace") {
        if (!payload.image || !payload.image2) { reply(400, { error: "image and image2 required" }); return; }
        const a = tmpFromBase64(payload.image, "jpg");
        const b = tmpFromBase64(payload.image2, "jpg");
        try {
          const result = await zia.compareFace(fs.createReadStream(a), fs.createReadStream(b));
          reply(200, { result });
        } finally { try { fs.unlinkSync(a); fs.unlinkSync(b); } catch { /* cleanup */ } }
        return;
      }
      if (!payload.image) { reply(400, { error: "image required" }); return; }
      const tmp = tmpFromBase64(payload.image, "jpg");
      try {
        const stream = fs.createReadStream(tmp);
        let result;
        if (mode === "face") result = await zia.analyseFace(stream, { mode: payload.faceMode || "moderate", gender: String(payload.gender ?? "true") });
        else if (mode === "object") result = await zia.detectObject(stream);
        else if (mode === "moderate") result = await zia.moderateImage(stream, { mode: payload.modMode || "advanced" });
        else if (mode === "barcode") result = await zia.scanBarcode(stream, { format: payload.format || "all" });
        reply(200, { result });
      } finally { try { fs.unlinkSync(tmp); } catch { /* cleanup */ } }
      return;
    }

    // Generic Cloud Scale Data Store READ — allowlisted tables only, read-only,
    // row-capped. Anonymous callers can list records but not run arbitrary ZCQL.
    // Set DATASTORE_TABLES="OcrResult,Cases,Firs" to expose more tables.
    if (mode === "records" || mode === "records:list") {
      const app = catalyst.initialize(req, { scope: "admin" });
      const allow = (process.env.DATASTORE_TABLES || `${OCR_TABLE},Cases,Criminals,Firs`).split(",").map((s) => s.trim()).filter(Boolean);
      const table = mode === "records:list" ? OCR_TABLE : (payload.table || OCR_TABLE);
      if (!allow.includes(table)) { reply(403, { error: "table not allowed", allowed: allow }); return; }
      try {
        const page = await app.datastore().table(table).getPagedRows({ maxRows: Math.min(200, Number(payload.max) || 50) });
        reply(200, { rows: (page && page.data) || [] });
      } catch (e) { reply(200, { rows: [] }); }
      return;
    }

    if (mode === "tts") {
      if (!payload.text) { reply(400, { error: "text required" }); return; }
      const up = await zia("tts/synthesize", { text: payload.text, language: payload.language || "en-IN" }, token);
      if (!up.ok) { reply(502, { error: "Zia TTS error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      reply(200, { audio: (up.json || {}).audio ?? null });
      return;
    }

    if (mode === "translate") {
      if (!payload.text) { reply(400, { error: "text required" }); return; }
      const up = await zia("translate", { text: payload.text, target_language: payload.target || "kn", source_language: payload.source || "en" }, token);
      if (!up.ok) { reply(502, { error: "Zia translate error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      reply(200, { translation: d.translation ?? d.text ?? d.output ?? null });
      return;
    }

    if (mode === "transcribe") {
      if (!payload.audio) { reply(400, { error: "audio required" }); return; }
      const up = await zia("audio/transcribe", { audio: payload.audio, language: payload.language || "en-IN" }, token);
      if (!up.ok) { reply(502, { error: "Zia transcribe error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      reply(200, { text: d.text ?? d.transcript ?? null });
      return;
    }

    // RAG, Cloud Scale edition: retrieval comes from Cloud Scale Search over the
    // Data Store (the ONLY data source); QuickML LLM only phrases the answer from
    // the retrieved rows. Which tables/columns to search is env-driven so the
    // schema stays owned by the app, not hardcoded here:
    //   SEARCH_TABLE_COLUMNS = {"Firs":["BriefFacts","CrimeNo"],"Cases":["title"]}
    //   SEARCH_SELECT_COLUMNS (optional) = same shape — columns to return
    if (mode === "rag") {
      const query = payload.query || payload.prompt;
      if (!query) { reply(400, { error: "query required" }); return; }
      const app = catalyst.initialize(req, { scope: "admin" });

      // 1. Retrieve from Cloud Scale Search.
      const hits = [];
      try {
        const cfg = JSON.parse(process.env.SEARCH_TABLE_COLUMNS || "{}");
        if (Object.keys(cfg).length) {
          const s = app.search();
          const exec = (s.executeSearch || s.searchDocuments).bind(s);
          const req2 = { search_string: query, search_table_columns: cfg };
          if (process.env.SEARCH_SELECT_COLUMNS) req2.select_table_columns = JSON.parse(process.env.SEARCH_SELECT_COLUMNS);
          const found = await exec(req2);
          for (const [tbl, rows] of Object.entries(found || {})) {
            for (const r of (Array.isArray(rows) ? rows : []).slice(0, 6)) hits.push({ table: tbl, row: r });
          }
        }
      } catch (e) { /* Search not configured/indexed yet — graceful empty */ }

      if (!hits.length) {
        reply(200, { answer: "No matching records were found in Cloud Scale for that query. (Configure Cloud Scale Search + SEARCH_TABLE_COLUMNS.)", sources: [] });
        return;
      }

      // 2. Ground the LLM answer strictly in the retrieved Cloud Scale rows.
      const context = hits.map((h) => `[${h.table}] ${JSON.stringify(h.row)}`).join("\n").slice(0, 4000);
      const up = await quickml(LLM_PATH, {
        prompt: `Records retrieved from Cloud Scale:\n${context}\n\nOfficer's question: ${query}`,
        guided_prompt: "You are NETRA, a Karnataka State Police assistant. Answer ONLY from the supplied Cloud Scale records. Be factual and brief. If they don't answer it, say so.",
        temperature: 0.2, max_tokens: 700,
      }, token);
      const d = up.json || {};
      const answer = d.response ?? d.answer ?? d.output ?? d.text ?? null;
      const sources = hits.map((h) => ({ title: h.table, snippet: JSON.stringify(h.row).slice(0, 240), score: null }));
      reply(200, { answer, sources });
      return;
    }

    // Qwen LLM chat.
    const { prompt, system, temperature, images, guided_prompt } = payload;
    if (!prompt) { reply(400, { error: "prompt required" }); return; }
    const reqBody = {
      prompt,
      images: Array.isArray(images) ? images : [],
      guided_prompt: guided_prompt || system || "",
      temperature: temperature ?? 0.2,
      max_tokens: 700,
    };
    const up = await quickml(LLM_PATH, reqBody, token);
    if (!up.ok) { reply(502, { error: "QuickML LLM error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
    const d = up.json || {};
    reply(200, { response: d.response ?? d.answer ?? d.output ?? d.text ?? d.generated_text ?? null });
  } catch (e) {
    try { reply(500, { error: String(e && e.message || e) }); } catch { /* res already gone */ }
  }
};
