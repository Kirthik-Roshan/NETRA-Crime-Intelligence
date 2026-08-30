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

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Blob } = require("buffer");
const {
  DATASTORE_TABLES,
  STRATUS_BUCKET,
  cacheGet,
  cacheKey,
  cachePut,
  createRequestContext,
  countRows,
  decodeImage,
  generatePdf,
  listAudits,
  listRows,
  criminalIntelligence,
  normalizePlate,
  plateCandidates,
  plateIntelligence,
  persistEvidence,
  publicUser,
  searchRecords,
  writeAudit,
} = require("./platform");

function tmpFromImage(image) {
  const p = path.join(os.tmpdir(), `netra-${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext || "jpg"}`);
  fs.writeFileSync(p, image.buffer);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
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

function readBody(req, maxBytes = 18 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let b = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      b += chunk;
      if (Buffer.byteLength(b) > maxBytes) {
        tooLarge = true;
        b = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
      } else {
        resolve(b);
      }
    });
    req.on("error", reject);
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

function conversationContext(history) {
  if (!Array.isArray(history)) return "";
  return history.slice(-12).map((message) => {
    const role = message && message.role === "assistant" ? "NETRA" : "Officer";
    const content = String((message && message.content) || "").trim().slice(0, 1200);
    return content ? `${role}: ${content}` : "";
  }).filter(Boolean).join("\n");
}

function aiCacheIdentity(context, mode, payload) {
  return cacheKey("ai", JSON.stringify({
    actor: context.officer.id,
    role: context.officer.role,
    mode,
    prompt: payload.query || payload.prompt || "",
    history: Array.isArray(payload.history) ? payload.history.slice(-12) : [],
    language: payload.language || "en",
  }));
}

function requireRole(context, roles) {
  if (!roles.includes(context.officer.role)) {
    const error = new Error("Your Catalyst role is not permitted to perform this operation");
    error.statusCode = 403;
    throw error;
  }
}

function faceMatch(result) {
  const body = result && typeof result === "object" && result.data && typeof result.data === "object"
    ? result.data
    : result || {};
  const rawMatched = body.matched ?? body.match ?? body.is_matched;
  const matched = rawMatched === true || String(rawMatched).toLowerCase() === "true";
  const confidence = Number(body.confidence ?? body.score ?? 0);
  return { matched, confidence: Number.isFinite(confidence) ? confidence : 0 };
}

function resolvedFirId(payload, intelligence) {
  const supplied = Number(payload.fir_id);
  if (Number.isSafeInteger(supplied) && supplied > 0) return supplied;
  const first = intelligence && Array.isArray(intelligence.firs) && intelligence.firs[0];
  const linked = Number(first && first.id);
  return Number.isSafeInteger(linked) && linked > 0 ? linked : null;
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

    const platformContext = await createRequestContext(req);

    if (mode === "auth:me") {
      reply(200, {
        user: platformContext.officer,
        authenticated: platformContext.authenticated,
        auth_required: platformContext.auth_required,
      });
      return;
    }

    if (mode === "auth:users") {
      requireRole(platformContext, ["administrator", "senior_officer"]);
      const users = await platformContext.app.userManagement().getAllUsers();
      reply(200, { users: (users || []).map(publicUser) });
      return;
    }

    if (mode === "audit:list") {
      requireRole(platformContext, ["administrator", "senior_officer"]);
      reply(200, { rows: await listAudits(platformContext.app, payload.max) });
      return;
    }

    if (mode === "infra:health") {
      requireRole(platformContext, ["administrator", "senior_officer"]);
      const searchHealth = await searchRecords(platformContext, "netra-health-probe", 1);
      reply(200, {
        ok: true,
        environment: platformContext.auth_required ? "production" : "development",
        services: {
          authentication: platformContext.authenticated,
          datastore: true,
          stratus: { bucket: STRATUS_BUCKET },
          cache: true,
          search: searchHealth.engine === "catalyst-search",
          smartbrowz: true,
          zia: true,
          quickml: !!(ORG && PROJECT && process.env.QML_REFRESH_TOKEN),
          automl: DC_BASE.includes(".zoho.in")
            ? "unavailable-in-india-dc"
            : !!(process.env.AUTOML_MODEL_ID || process.env.AUTOML_ENDPOINT_KEY),
        },
        tables: DATASTORE_TABLES,
      });
      return;
    }

    // Cloud Scale reads, Search, Cache, and auth do not depend on an LLM token.
    if (mode === "records:counts") {
      const result = await countRows(platformContext, payload.tables, !!payload.refresh);
      reply(200, result);
      return;
    }

    if (mode === "records" || mode === "records:list") {
      const table = mode === "records:list" ? "Evidence" : String(payload.table || "");
      const result = await listRows(platformContext, table, mode === "records:list" ? Math.max(200, Number(payload.max) || 200) : payload.max, !!payload.refresh);
      const rows = mode === "records:list"
        ? result.rows.filter((row) => String(row.type || "").toUpperCase().startsWith("ZIA_OCR"))
        : result.rows;
      reply(200, { rows, cache: result.cache, table });
      return;
    }

    if (mode === "search:records") {
      const query = String(payload.query || payload.search || "").trim();
      if (!query) { reply(400, { error: "query required" }); return; }
      const started = Date.now();
      const result = await searchRecords(platformContext, query, payload.max);
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "SEARCH_RECORDS",
        entity: "CloudScale",
        processing_ms: Date.now() - started,
        detail: { query: query.slice(0, 1000), engine: result.engine, result_count: result.hits.length },
      });
      reply(200, { ...result, audit_id: audit.id });
      return;
    }

    if (mode === "report:pdf") {
      const started = Date.now();
      const result = await generatePdf(platformContext, payload);
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "EXPORT_PDF",
        entity: "InvestigationReport",
        processing_ms: Date.now() - started,
        detail: { filename: result.filename, turn_count: Array.isArray(payload.turns) ? payload.turns.length : 0, storage_ref: result.storage_ref },
      });
      reply(200, { ...result, audit_id: audit.id });
      return;
    }

    if (mode === "automl:predict") {
      requireRole(platformContext, ["administrator", "senior_officer", "analyst"]);
      if (DC_BASE.includes(".zoho.in")) { reply(503, { error: "Catalyst Zia AutoML is not available in the India data center", unavailable_in_dc: true }); return; }
      const modelId = process.env.AUTOML_MODEL_ID || process.env.AUTOML_ENDPOINT_KEY;
      if (!modelId) { reply(503, { error: "AutoML model ID is not configured", setup_required: true }); return; }
      if (!payload.input || typeof payload.input !== "object" || Array.isArray(payload.input)) { reply(400, { error: "input object required" }); return; }
      const input = Object.fromEntries(Object.entries(payload.input).map(([key, value]) => [key, String(value == null ? "" : value)]));
      const started = Date.now();
      const result = await platformContext.app.zia().automl(modelId, input);
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "AUTOML_PREDICT",
        entity: "CrimeRisk",
        processing_ms: Date.now() - started,
        model: "Catalyst Zia AutoML",
        detail: { input_fields: Object.keys(input), status: result && result.status },
      });
      reply(200, { result, audit_id: audit.id, model: "Catalyst Zia AutoML" });
      return;
    }

    if (mode === "notif:list" || mode === "notif:update") {
      const ds = platformContext.app.datastore().table(process.env.NOTIF_TABLE || "Notifications");
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
        const analytics = await platformContext.app.zia().getTextAnalytics([text]);
        reply(200, { text, analytics });
      } catch (e) {
        reply(502, { error: "Zia Text Analytics error", detail: String((e && e.message) || e).slice(0, 300) });
      }
      return;
    }

    // Field workflow: read a Karnataka number plate, resolve the vehicle and
    // owner, then retrieve the owner's linked FIRs from Cloud Scale.
    if (mode === "plate") {
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer"]);
      if (!payload.image) { reply(400, { error: "image required" }); return; }
      const image = decodeImage(payload.image, payload.mime, payload.name);
      const tmp = tmpFromImage(image);
      try {
        const started = Date.now();
        const rawResult = await platformContext.app.zia().extractOpticalCharacters(fs.createReadStream(tmp), {
          modelType: "OCR",
          language: payload.language || "eng",
        });
        const text = ocrText(rawResult);
        const candidates = plateCandidates(text);
        const hint = normalizePlate(payload.plate_hint);
        const plate = hint || candidates[0] || "";
        const correlation = plate ? await plateIntelligence(platformContext.app, plate) : null;
        const intelligence = correlation && correlation.intelligence;
        const firId = resolvedFirId(payload, intelligence);
        const persisted = await persistEvidence(platformContext.app, {
          kind: "plate", image, actor: platformContext.officer, firId,
          description: payload.description,
          result: {
            text,
            candidates,
            selected_plate: plate || null,
            correlation_source: correlation && correlation.source,
            vehicle: correlation && correlation.vehicle,
            criminal_id: intelligence && intelligence.criminal && intelligence.criminal.id,
          },
        });
        const warnings = [...persisted.warnings];
        if (!plate) warnings.push("No Karnataka registration number was recognized. Enter a manual plate correction and retry.");
        else if (!correlation || !correlation.vehicle) warnings.push("The plate was read but is not present in the NETRA vehicle registry.");
        const audit = await writeAudit(platformContext.app, platformContext.officer, {
          action: "EVIDENCE_PLATE_LOOKUP", entity: "Vehicle", entity_id: plate || null,
          processing_ms: Date.now() - started, model: "Catalyst Zia OCR",
          detail: {
            source_name: image.name, recognized_plate: plate || null, fir_id: firId,
            matched: !!(correlation && correlation.vehicle), correlation_source: correlation && correlation.source,
            storage_ref: persisted.storage_ref,
          },
        });
        reply(200, {
          workflow: "vehicle-stop", text, candidates, plate, correlation,
          intelligence, resolved_fir_id: firId, ...persisted, warnings,
          audit_id: audit.id, model: "Catalyst Zia OCR + Cloud Scale correlation",
        });
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* temp cleanup */ }
      }
      return;
    }

    // Field workflow: detect all visible faces, compare the prominent face to
    // a selected watchlist reference, and disclose the case file only on match.
    if (mode === "crowd") {
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer"]);
      if (!payload.image || !payload.image2) { reply(400, { error: "crowd image and watchlist reference image required" }); return; }
      const criminalId = Number(payload.criminal_id);
      if (!Number.isSafeInteger(criminalId) || criminalId <= 0) { reply(400, { error: "valid criminal_id required" }); return; }
      const crowd = decodeImage(payload.image, payload.mime, payload.name);
      const reference = decodeImage(payload.image2, payload.mime2, payload.name2 || "watchlist-reference.jpg");
      const crowdTmp = tmpFromImage(crowd);
      const referenceTmp = tmpFromImage(reference);
      try {
        const started = Date.now();
        const zia = platformContext.app.zia();
        const detection = await zia.analyseFace(fs.createReadStream(crowdTmp), {
          mode: payload.faceMode || "moderate", age: true, emotion: true, gender: true,
        });
        const comparison = await zia.compareFace(fs.createReadStream(referenceTmp), fs.createReadStream(crowdTmp));
        const match = faceMatch(comparison);
        const intelligence = match.matched ? await criminalIntelligence(platformContext.app, criminalId) : null;
        const firId = resolvedFirId(payload, intelligence);
        const persisted = await persistEvidence(platformContext.app, {
          kind: "crowd-match", image: crowd, additionalImages: [reference], actor: platformContext.officer,
          firId, description: payload.description,
          result: { detection, comparison, match, criminal_id: criminalId },
        });
        const warnings = [...persisted.warnings];
        if (!match.matched) warnings.push("No watchlist identity was confirmed. Do not treat face attributes alone as identification.");
        const audit = await writeAudit(platformContext.app, platformContext.officer, {
          action: "EVIDENCE_CROWD_WATCH", entity: "Criminal", entity_id: criminalId,
          processing_ms: Date.now() - started, model: "Catalyst Zia Face Analytics + Facial Comparison",
          detail: {
            fir_id: firId, matched: match.matched, confidence: match.confidence,
            faces_count: Number(detection && (detection.faces_count || (detection.data && detection.data.faces_count))) || 0,
            storage_ref: persisted.storage_ref,
          },
        });
        reply(200, {
          workflow: "crowd-watch", result: { detection, comparison }, match,
          intelligence, resolved_fir_id: firId, ...persisted, warnings,
          audit_id: audit.id, model: "Catalyst Zia Face Analytics + Facial Comparison",
        });
      } finally {
        try { fs.unlinkSync(crowdTmp); fs.unlinkSync(referenceTmp); } catch { /* temp cleanup */ }
      }
      return;
    }

    // Zia OCR stores both the source and machine result in Stratus and creates
    // a corresponding row in the existing Evidence table.
    if (mode === "ocr") {
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer"]);
      if (!payload.image) { reply(400, { error: "image required" }); return; }
      const image = decodeImage(payload.image, payload.mime, payload.name);
      const tmp = tmpFromImage(image);
      try {
        const started = Date.now();
        const rawResult = await platformContext.app.zia().extractOpticalCharacters(fs.createReadStream(tmp), {
          modelType: "OCR",
          language: payload.language || "eng",
        });
        const text = ocrText(rawResult);
        const persisted = await persistEvidence(platformContext.app, {
          kind: "ocr", image, result: { text, raw: rawResult }, actor: platformContext.officer,
          firId: payload.fir_id, description: payload.description,
        });
        const audit = await writeAudit(platformContext.app, platformContext.officer, {
          action: "ZIA_OCR",
          entity: "Evidence",
          entity_id: persisted.record_id || persisted.evidence_id,
          processing_ms: Date.now() - started,
          model: "Catalyst Zia OCR",
          detail: { source_name: image.name, fir_id: payload.fir_id || null, character_count: text.length, storage_ref: persisted.storage_ref },
        });
        reply(200, { text, ...persisted, audit_id: audit.id, model: "Catalyst Zia OCR" });
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* temp cleanup */ }
      }
      return;
    }

    // Catalyst Zia image services with durable Evidence and Stratus storage.
    if (mode === "face" || mode === "object" || mode === "moderate" || mode === "barcode" || mode === "compareFace") {
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer"]);
      const zia = platformContext.app.zia();
      const started = Date.now();
      if (mode === "compareFace") {
        if (!payload.image || !payload.image2) { reply(400, { error: "image and image2 required" }); return; }
        const first = decodeImage(payload.image, payload.mime, payload.name);
        const second = decodeImage(payload.image2, payload.mime2, payload.name2 || "reference.jpg");
        const a = tmpFromImage(first);
        const b = tmpFromImage(second);
        try {
          const result = await zia.compareFace(fs.createReadStream(a), fs.createReadStream(b));
          const match = faceMatch(result);
          const criminalId = Number(payload.criminal_id);
          const intelligence = match.matched && Number.isSafeInteger(criminalId) && criminalId > 0
            ? await criminalIntelligence(platformContext.app, criminalId)
            : null;
          const firId = resolvedFirId(payload, intelligence);
          const persisted = await persistEvidence(platformContext.app, {
            kind: "compare-face", image: first, additionalImages: [second], result: { comparison: result, match, criminal_id: criminalId || null },
            actor: platformContext.officer, firId, description: payload.description,
          });
          const audit = await writeAudit(platformContext.app, platformContext.officer, {
            action: "ZIA_COMPARE_FACE", entity: "Evidence", entity_id: persisted.record_id || persisted.evidence_id,
            processing_ms: Date.now() - started, model: "Catalyst Zia Face Comparison",
            detail: { fir_id: firId, criminal_id: criminalId || null, matched: match.matched, confidence: match.confidence, storage_ref: persisted.storage_ref },
          });
          reply(200, { result, match, intelligence, resolved_fir_id: firId, ...persisted, audit_id: audit.id, model: "Catalyst Zia Face Comparison" });
        } finally { try { fs.unlinkSync(a); fs.unlinkSync(b); } catch { /* cleanup */ } }
        return;
      }
      if (!payload.image) { reply(400, { error: "image required" }); return; }
      const image = decodeImage(payload.image, payload.mime, payload.name);
      const tmp = tmpFromImage(image);
      try {
        const stream = fs.createReadStream(tmp);
        let result;
        if (mode === "face") result = await zia.analyseFace(stream, { mode: payload.faceMode || "moderate", gender: String(payload.gender ?? "true") });
        else if (mode === "object") result = await zia.detectObject(stream);
        else if (mode === "moderate") result = await zia.moderateImage(stream, { mode: payload.modMode || "advanced" });
        else if (mode === "barcode") result = await zia.scanBarcode(stream, { format: payload.format || "all" });
        const persisted = await persistEvidence(platformContext.app, {
          kind: mode, image, result, actor: platformContext.officer,
          firId: payload.fir_id, description: payload.description,
        });
        const audit = await writeAudit(platformContext.app, platformContext.officer, {
          action: `ZIA_${mode.toUpperCase()}`, entity: "Evidence", entity_id: persisted.record_id || persisted.evidence_id,
          processing_ms: Date.now() - started, model: `Catalyst Zia ${mode}`,
          detail: { fir_id: payload.fir_id || null, source_name: image.name, storage_ref: persisted.storage_ref },
        });
        reply(200, { result, ...persisted, audit_id: audit.id, model: `Catalyst Zia ${mode}` });
      } finally { try { fs.unlinkSync(tmp); } catch { /* cleanup */ } }
      return;
    }

    requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer", "analyst"]);
    if (!ORG || !PROJECT) { reply(503, { error: "Function not configured (ORG/PROJECT)" }); return; }
    const token = await accessToken();
    if (!token) { reply(503, { error: "No credentials: set QML_CLIENT_ID/SECRET/REFRESH_TOKEN" }); return; }

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
      const started = Date.now();
      const responseCacheKey = aiCacheIdentity(platformContext, "rag", payload);
      const cached = await cacheGet(platformContext.app, responseCacheKey);
      if (cached && cached.answer) {
        const audit = await writeAudit(platformContext.app, platformContext.officer, {
          action: "AI_QUERY_CACHE", entity: "rag", model: cached.model,
          detail: { prompt: String(query).slice(0, 2000), source_count: (cached.sources || []).length },
        });
        reply(200, { ...cached, audit_id: audit.id, processing_ms: Date.now() - started, cache: true });
        return;
      }
      const conversation = conversationContext(payload.history);
      const search = await searchRecords(platformContext, `${conversation}\n${query}`, 24);
      const records = search.hits;
      const recordContext = records.length
        ? `\n\nMatching live Cloud Scale records (use as factual evidence):\n${records.map((hit, i) =>
            `[${i + 1}] ${hit.table}: ${JSON.stringify(hit.row).slice(0, 1800)}`
          ).join("\n")}`
        : "";
      const contextualQuery = `${conversation ? `Use this conversation context to resolve follow-up references.\n${conversation}\n\n` : ""}` +
        `Current question: ${query}${recordContext}`;
      const up = await quickml(process.env.QML_RAG_PATH || "rag/answer", { query: contextualQuery }, token);
      if (!up.ok) { reply(502, { error: "QuickML RAG error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      const answer = d.response ?? d.answer ?? d.output ?? d.text ?? null;
      const sources = (Array.isArray(d.retrieved_nodes) ? d.retrieved_nodes : []).slice(0, 6).map((node, i) => ({
        title: node.title || node.document_name || `Case dossier ${i + 1}`,
        snippet: String(node.content || node.text || "").slice(0, 240),
        score: node.score ?? null,
      }));
      for (const hit of records.slice(0, 6)) {
        sources.push({
          title: `${hit.table} · Cloud Scale record`,
          snippet: JSON.stringify(hit.row).slice(0, 240),
          score: hit.score,
        });
      }
      const processing_ms = Date.now() - started;
      const model = "QuickML RAG + Catalyst Search";
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "AI_QUERY", entity: "rag", processing_ms, model,
        detail: {
          prompt: String(query).slice(0, 2000), answer: String(answer || "").slice(0, 5000),
          via_voice: !!payload.via_voice, language: payload.language || "en",
          source_count: sources.length, search_engine: search.engine,
        },
      });
      const response = { answer, sources, model, search_engine: search.engine, search_warning: search.warning };
      await cachePut(platformContext.app, responseCacheKey, response, 1);
      reply(200, { ...response, audit_id: audit.id, processing_ms, cache: false });
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
      const result = parseJsonLoose(out);
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: `AI_NLP_${String(op).toUpperCase()}`, entity: "CrimeRecord", model: "QuickML LLM",
        detail: { input_length: text.length, result_available: !!result },
      });
      reply(200, { op, result, audit_id: audit.id, model: "QuickML LLM" });
      return;
    }

    // Qwen LLM chat.
    const { prompt, system, temperature, images, guided_prompt } = payload;
    if (!prompt) { reply(400, { error: "prompt required" }); return; }
    const started = Date.now();
    const responseCacheKey = aiCacheIdentity(platformContext, "chat", payload);
    const cached = await cacheGet(platformContext.app, responseCacheKey);
    if (cached && cached.response) {
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "AI_QUERY_CACHE", entity: "chat", model: cached.model,
        detail: { prompt: String(prompt).slice(0, 2000), source_count: cached.source_count || 0 },
      });
      reply(200, { ...cached, audit_id: audit.id, processing_ms: Date.now() - started, cache: true });
      return;
    }
    const conversation = conversationContext(payload.history);
    const search = await searchRecords(platformContext, `${conversation}\n${prompt}`, 24);
    const records = search.hits;
    const recordContext = records.length
      ? `\n\nRelevant live Cloud Scale records:\n${records.slice(0, 10).map((hit, i) =>
          `[${i + 1}] ${hit.table}: ${JSON.stringify(hit.row).slice(0, 1800)}`
        ).join("\n")}`
      : "";
    const languageRule = payload.language === "kn"
      ? "Reply in natural Kannada, preserving official names, FIR numbers, and legal sections exactly."
      : "Reply in clear English.";
    const reqBody = {
      prompt: `${conversation ? `Conversation so far:\n${conversation}\n\n` : ""}Current officer question: ${prompt}${recordContext}`,
      images: Array.isArray(images) ? images : [],
      guided_prompt: `${guided_prompt || system || ""}\n${languageRule}`.trim(),
      temperature: temperature ?? 0.2,
      max_tokens: 700,
    };
    const up = await quickml(LLM_PATH, reqBody, token);
    if (!up.ok) { reply(502, { error: "QuickML LLM error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
    const d = up.json || {};
    const answer = d.response ?? d.answer ?? d.output ?? d.text ?? d.generated_text ?? null;
    const processing_ms = Date.now() - started;
    const model = "QuickML LLM + Catalyst Search";
    const audit = await writeAudit(platformContext.app, platformContext.officer, {
      action: "AI_QUERY", entity: "chat", processing_ms, model,
      detail: {
        prompt: String(prompt).slice(0, 2000), answer: String(answer || "").slice(0, 5000),
        via_voice: !!payload.via_voice, language: payload.language || "en",
        source_count: records.length, search_engine: search.engine,
      },
    });
    const response = { response: answer, model, source_count: records.length, search_engine: search.engine, search_warning: search.warning };
    await cachePut(platformContext.app, responseCacheKey, response, 1);
    reply(200, { ...response, audit_id: audit.id, processing_ms, cache: false });
  } catch (e) {
    try { reply(Number(e && e.statusCode) || 500, { error: String(e && e.message || e) }); } catch { /* res already gone */ }
  }
};
