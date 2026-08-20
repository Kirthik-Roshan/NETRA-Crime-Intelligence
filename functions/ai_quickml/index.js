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

const ACCOUNTS = process.env.QML_ACCOUNTS_BASE || "https://accounts.zoho.in";
const DC_BASE = process.env.QML_DC_BASE || "https://api.catalyst.zoho.in";
const ORG = process.env.QML_ORG;
const PROJECT = process.env.QML_PROJECT_ID;
const SCHEME = process.env.QML_AUTH_SCHEME || "Zoho-oauthtoken";
const RAG_PATH = process.env.QML_RAG_PATH || "rag/answer";
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

    if (mode === "rag") {
      const query = payload.query || payload.prompt;
      if (!query) { reply(400, { error: "query required" }); return; }
      const up = await quickml(RAG_PATH, { query }, token);
      if (!up.ok) { reply(502, { error: "QuickML RAG error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      const d = up.json || {};
      const answer = d.answer ?? d.response ?? d.output ?? null;
      // QuickML RAG returns the citations under `retrieved_nodes`.
      const rawSrc = d.retrieved_nodes || d.sources || d.citations || d.documents || [];
      const sources = (Array.isArray(rawSrc) ? rawSrc : []).map((s) => {
        if (typeof s === "string") return { title: "Case document", snippet: s.slice(0, 240), score: null };
        const meta = s.metadata || s.node || {};
        return {
          title: s.file_name || s.document || s.file || s.source || s.title || s.name ||
                 meta.file_name || meta.source || meta.document || "Case document",
          snippet: (s.text || s.content || s.chunk || s.node_text || meta.text || "").toString().slice(0, 240),
          score: s.score ?? s.relevance ?? s.similarity ?? null,
        };
      });
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
