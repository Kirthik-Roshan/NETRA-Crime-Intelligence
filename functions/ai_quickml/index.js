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
 *   Optional: QML_ACCOUNTS_BASE, QML_DC_BASE, QML_LLM_PATH (llm/chat),
 *             QML_RAG_PATH (rag/answer), QML_AUTH_SCHEME (Zoho-oauthtoken),
 *             CORS_ALLOW_ORIGIN.
 *
 * Body `mode`: "rag" → {answer,sources} · "chat" (default) → {response} · "ping".
 */

const catalyst = require("zcatalyst-sdk-node");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Blob } = require("buffer");

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
// NETRA's assistant sends text prompts. `vlm/chat` expects an image stream,
// while `llm/chat` accepts the text-only request bodies used below. Older
// deployments set `vlm/chat`; normalize that stale setting during rollout.
const configuredLlmPath = process.env.QML_LLM_PATH || "llm/chat";
const LLM_PATH = configuredLlmPath === "vlm/chat" ? "llm/chat" : configuredLlmPath;

// Allow the NETRA browser environments and keep unrelated sites blocked.
// `Vary: Origin` prevents a CDN from reusing another origin's CORS response.
function allowedOrigin(origin) {
  if (origin) {
    try {
      const { protocol, hostname } = new URL(origin);
      const local = (hostname === "localhost" || hostname === "127.0.0.1") && (protocol === "http:" || protocol === "https:");
      const catalyst = protocol === "https:" && (hostname.endsWith(".onslate.in") || hostname.endsWith(".catalystserverless.in"));
      if (local || catalyst) return origin;
    } catch { /* invalid Origin; use the configured fallback */ }
  }
  return process.env.CORS_ALLOW_ORIGIN || "https://netra-crime-intellig-tivoagho.onslate.in";
}

function send(res, code, obj, origin) {
  const bytes = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(origin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
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
// TTS returns a binary audio stream (audio/wav); translate/transcribe return
// JSON. Read as bytes and branch on content-type so binary audio survives.
async function zia(path, body, token) {
  const r = await tfetch(`${DC_BASE}/quickml/api/v1/models/zia/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `${SCHEME} ${token}`, "CATALYST-ORG": ORG },
    body: JSON.stringify(body),
  }, 18000, `zia:${path}`);
  const ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
  const buf = Buffer.from(await r.arrayBuffer());
  if (ct.includes("audio") || (!ct.includes("json") && !ct.includes("text"))) {
    // Binary (e.g. TTS wav) — hand back base64 for the browser to play.
    return { ok: r.ok, status: r.status, json: null, text: buf.toString("utf8").slice(0, 300), audio_b64: buf.toString("base64") };
  }
  const text = buf.toString("utf8");
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: r.ok, status: r.status, json, text };
}

// Zia speech-to-text accepts multipart/form-data, with the recording in the
// `file` field and a two-letter language code. JSON/base64 requests reach the
// model but are rejected before inference.
async function ziaTranscribe(audio, mime, filename, language, token) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime || "audio/wav" }), filename || "voice.wav");
  form.append("language", language);
  const r = await tfetch(`${DC_BASE}/quickml/api/v1/models/zia/${process.env.ZIA_TRANSCRIBE_PATH || "audio/transcribe"}`, {
    method: "POST",
    headers: { Authorization: `${SCHEME} ${token}`, "CATALYST-ORG": ORG },
    body: form,
  }, 30000, "zia:audio/transcribe");
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

// Parse a JSON object out of an LLM reply that may wrap it in ```json fences
// or prose. Returns null if no valid JSON object is found.
function parseJsonLoose(raw) {
  if (raw == null) return null;
  const body = String(raw).replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = body.indexOf("{"), e = body.lastIndexOf("}");
  const slice = s >= 0 && e > s ? body.slice(s, e + 1) : body;
  try { return JSON.parse(slice); } catch { return null; }
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

    // Cloud Scale reads use Catalyst's server-side SDK credentials, not
    // QuickML. Keep these available even while QuickML is being configured.
    if (mode === "records" || mode === "records:list") {
      const app = catalyst.initialize(req, { scope: "admin" });
      const allow = (process.env.DATASTORE_TABLES || `${OCR_TABLE},Cases,Criminals,Firs`).split(",").map((s) => s.trim()).filter(Boolean);
      const table = mode === "records:list" ? OCR_TABLE : (payload.table || OCR_TABLE);
      if (!allow.includes(table)) { reply(403, { error: "table not allowed", allowed: allow }); return; }
      try {
        const requested = Math.min(1000, Math.max(1, Number(payload.max) || 50));
        const dsTable = app.datastore().table(table);
        const rows = [];
        let nextToken;
        do {
          const page = await dsTable.getPagedRows({ nextToken, maxRows: Math.min(200, requested - rows.length) });
          rows.push(...((page && page.data) || []));
          nextToken = page && page.next_token;
        } while (nextToken && rows.length < requested);
        reply(200, { rows });
      } catch (e) { reply(200, { rows: [] }); }
      return;
    }

    if (mode === "notif:list" || mode === "notif:update") {
      const app = catalyst.initialize(req, { scope: "admin" });
      const ds = app.datastore().table(process.env.NOTIF_TABLE || "Notifications");
      if (mode === "notif:list") {
        try {
          const page = await ds.getPagedRows({ maxRows: Math.min(100, Number(payload.max) || 50) });
          reply(200, { rows: (page && page.data) || [] });
        } catch (e) { reply(200, { rows: [] }); }
        return;
      }
      const rowid = payload.rowid || payload.id;
      const status = payload.status;
      const allowed = ["unread", "read", "archived", "action_required"];
      if (!rowid || !allowed.includes(status)) { reply(400, { error: "rowid and valid status required", allowed }); return; }
      try {
        await ds.updateRow({ ROWID: rowid, status });
        reply(200, { ok: true, rowid, status });
      } catch (e) { reply(200, { ok: false, error: String((e && e.message) || e) }); }
      return;
    }

    // Catalyst Zia speech-to-text produces the command; this second Zia model
    // extracts its language, entities, key phrases, and intent metadata before
    // QuickML/RAG answers it.
    if (mode === "voice:nlp") {
      const text = String(payload.text || "").trim().slice(0, 1500);
      if (!text) { reply(400, { error: "text required" }); return; }
      try {
        const app = catalyst.initialize(req, { scope: "admin" });
        const analytics = await app.zia().getTextAnalytics([text]);
        reply(200, { text, analytics });
      } catch (e) {
        reply(502, { error: "Zia Text Analytics error", detail: String((e && e.message) || e).slice(0, 300) });
      }
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

    if (mode === "tts") {
      if (!payload.text) { reply(400, { error: "text required" }); return; }
      // Zia TTS model body: text + short language code + speaker/prosody.
      // Returns binary wav (zia() base64-encodes it as audio_b64).
      const up = await zia("tts/synthesize", {
        text: payload.text,
        language: String(payload.language || "en").split("-")[0],
        speaker: payload.speaker || "Mary",
        pitch: payload.pitch || "moderate",
        speed: payload.speed || "moderate",
        emotion: payload.emotion || "neutral",
      }, token);
      if (!up.ok) { reply(502, { error: "Zia TTS error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      reply(200, { audio: up.audio_b64 || null, mime: "audio/wav" });
      return;
    }

    if (mode === "translate") {
      if (!payload.text) { reply(400, { error: "text required" }); return; }
      // Zia translate model body: { text, src_lang, tgt_lang } (short codes);
      // response: { translated_text }.
      const up = await zia("translate", {
        text: payload.text,
        src_lang: String(payload.source || "en").split("-")[0],
        tgt_lang: String(payload.target || "kn").split("-")[0],
      }, token);
      if (!up.ok) { reply(502, { error: "Zia translate error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      reply(200, { translation: d.translated_text ?? d.translation ?? d.text ?? null });
      return;
    }

    if (mode === "transcribe") {
      if (!payload.audio) { reply(400, { error: "audio required" }); return; }
      const clean = String(payload.audio).replace(/^data:[^;]+;base64,/, "");
      const audio = Buffer.from(clean, "base64");
      if (!audio.length) { reply(400, { error: "valid base64 audio required" }); return; }
      if (audio.length > 6 * 1024 * 1024) { reply(413, { error: "audio must be 6 MB or smaller" }); return; }
      const language = String(payload.language || "en").split("-")[0].slice(0, 2).toLowerCase();
      const filename = path.basename(String(payload.name || "voice.wav")).replace(/[^a-zA-Z0-9._-]/g, "-");
      const up = await ziaTranscribe(audio, payload.mime || "audio/wav", filename, language, token);
      if (!up.ok) { reply(502, { error: "Zia transcribe error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      reply(200, {
        text: d.transcribed_text ?? d.text ?? d.transcript ?? d.output ?? null,
        language: d.language ?? language,
        processing_ms: d.processing_time_ms ?? null,
      });
      return;
    }

    // RAG endpoint uses the QuickML Knowledge Base containing the case dossiers.
    // Its input schema is exactly `{ query }`; adding inference-only keys such
    // as `top_k` makes the endpoint reject the request.
    if (mode === "rag") {
      const query = payload.query || payload.prompt;
      if (!query) { reply(400, { error: "query required" }); return; }
      const up = await quickml(process.env.QML_RAG_PATH || "rag/answer", { query }, token);
      if (!up.ok) { reply(502, { error: "QuickML RAG error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      const answer = d.response ?? d.answer ?? d.output ?? d.text ?? null;
      const sources = (Array.isArray(d.retrieved_nodes) ? d.retrieved_nodes : []).slice(0, 6).map((node, i) => ({
        title: node.title || node.document_name || `Case dossier ${i + 1}`,
        snippet: String(node.content || node.text || "").slice(0, 240),
        score: node.score ?? null,
      }));
      reply(200, { answer, sources });
      return;
    }

    // ── NLP over supplied case text — entity extraction / summarization /
    // entity linking. Pure LLM over the text the caller passes (which the app
    // pulls from the Cloud Scale Data Store); no DB access here. Strict JSON. ──
    if (mode === "nlp") {
      const op = payload.op || "extract";
      const text = String(payload.text || "").slice(0, 8000);
      if (!text) { reply(400, { error: "text required" }); return; }
      const SPECS = {
        extract: {
          sys: "You are an intelligence-extraction engine for the Karnataka State Police. Output strict JSON only.",
          prompt: `Extract structured intelligence entities from this crime record text. Return ONLY JSON with keys ` +
            `names, locations, dates, organizations, vehicles, phones, financial (each an array of strings) and ` +
            `confidence (0-1). Do not invent entities not present in the text.\n\nTEXT:\n${text}`,
        },
        summarize: {
          sys: "You are NETRA, a crime-intelligence assistant. Summarise only from supplied records. JSON only.",
          prompt: `Summarise this FIR for an investigating officer in 2-3 sentences, factual and concrete. ` +
            `Return ONLY JSON: {"summary": string, "confidence": 0-1}.\n\nTEXT:\n${text}`,
        },
        entities: {
          sys: "You are an intelligence link-analysis engine. Output strict JSON only.",
          prompt: `Identify relationships between entities mentioned in this crime record. Relationship types must be one of: ` +
            `"Associated With","Called","Visited","Owns","Related To","Investigated In","Mentioned In","Connected Through". ` +
            `Return ONLY JSON: {"links":[{"from":string,"type":string,"to":string,"confidence":0-1}],"confidence":0-1}. ` +
            `Only include relationships supported by the text.\n\nTEXT:\n${text}`,
        },
      };
      const spec = SPECS[op];
      if (!spec) { reply(400, { error: "unknown op", allowed: Object.keys(SPECS) }); return; }
      const up = await quickml(LLM_PATH, { prompt: spec.prompt, guided_prompt: spec.sys, temperature: 0.1, max_tokens: 700 }, token);
      if (!up.ok) { reply(502, { error: "QuickML NLP error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      const out = d.response ?? d.answer ?? d.output ?? d.text ?? d.generated_text ?? "";
      reply(200, { op, result: parseJsonLoose(out) });
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
