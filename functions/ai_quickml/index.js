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
      const publicNetra = protocol === "https:" && hostname === "netra-crime-intelligence.kirthikroshanp-cse20.chatgpt.site";
      if (local || catalyst || publicNetra) return origin;
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

async function quickml(path, body, token, extraHeaders = {}) {
  const r = await tfetch(`${DC_BASE}/quickml/v1/project/${PROJECT}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${SCHEME} ${token}`,
      "CATALYST-ORG": ORG,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }, 18000, `quickml:${path}`);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: r.ok, status: r.status, json, text };
}

function quickmlText(payload) {
  const body = payload && payload.data && typeof payload.data === "object" ? payload.data : payload || {};
  const choice = Array.isArray(body.choices) ? body.choices[0] : null;
  const content = choice && choice.message && choice.message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part && part.text).filter(Boolean).join("\n").trim();
  }
  const direct = body.response ?? body.answer ?? body.output ?? body.text ?? body.generated_text;
  return typeof direct === "string" ? direct.trim() : "";
}

async function quickmlLlm(prompt, system, options, token) {
  const temperature = options && options.temperature != null ? options.temperature : 0.2;
  const maxTokens = Math.min(1200, Math.max(64, Number(options && options.max_tokens) || 700));
  const messages = [
    ...(system ? [{ role: "system", content: String(system).slice(0, 5000) }] : []),
    { role: "user", content: String(prompt).slice(0, 30000) },
  ];
  const modernBody = {
    model: process.env.QML_LLM_MODEL || "glm-4.7-flash",
    messages,
    temperature,
    top_p: 0.9,
    max_tokens: maxTokens,
  };

  const attempts = [];
  const endpointKey = process.env.QML_LLM_ENDPOINT_KEY;
  if (endpointKey) {
    attempts.push(() => quickml(
      process.env.QML_LLM_ENDPOINT_PATH || "endpoints/predict",
      { data: modernBody },
      token,
      { "X-QUICKML-ENDPOINT-KEY": endpointKey },
    ));
  }
  // `llm/chat` was the pre-endpoint API. Keep both payloads during migration:
  // current deployments use OpenAI-style messages; older ones accept prompt.
  attempts.push(() => quickml(LLM_PATH, modernBody, token));
  attempts.push(() => quickml(LLM_PATH, {
    prompt: String(prompt).slice(0, 12000),
    guided_prompt: String(system || "").slice(0, 3000),
    temperature,
    max_tokens: maxTokens,
  }, token));

  let last = { ok: false, status: 502, json: null, text: "QuickML did not return a response" };
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      const answer = quickmlText(result.json);
      if (result.ok && answer) return { ...result, answer };
      last = result;
      // Authentication and quota errors will be identical for every schema.
      if ([401, 403, 429].includes(result.status)) break;
    } catch (error) {
      last = { ok: false, status: 502, json: null, text: String(error && error.message || error) };
      break;
    }
  }
  return { ...last, answer: "" };
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

function ttsRequest(payload) {
  const requestedLanguage = String(payload.language || "en-IN").trim().toLowerCase();
  const isKannada = requestedLanguage === "kn" || requestedLanguage.startsWith("kn-");
  const configuredSpeaker = isKannada
    ? process.env.ZIA_KANNADA_TTS_SPEAKER
    : process.env.ZIA_TTS_SPEAKER;
  const speaker = String(payload.speaker || configuredSpeaker || "").trim();
  const body = {
    text: String(payload.text || ""),
    // The deployed Zia voice model accepts the multilingual `en` selector,
    // not `kn`. It still synthesizes Kannada correctly from Kannada Unicode
    // text; sending `kn` makes the upstream service reject the request.
    language: isKannada ? "en" : requestedLanguage.split("-")[0],
    pitch: payload.pitch || "moderate",
    speed: payload.speed || "moderate",
    emotion: payload.emotion || "neutral",
  };

  // This model's multilingual default voice handles Kannada script as well as
  // English. Keep the default stable unless a project-specific voice is set.
  if (speaker) body.speaker = speaker;
  else body.speaker = "Mary";
  return { body, isKannada };
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

function recordValue(row, ...keys) {
  for (const key of keys) {
    const value = row && row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function groundedSources(records) {
  return records.slice(0, 8).map((hit, index) => {
    const row = hit.row || {};
    const identity = recordValue(row, "fir_number", "case_number", "name", "full_name", "vehicle_number", "plate", "id", "ROWID") || `record ${index + 1}`;
    return {
      title: `${hit.table} · ${identity}`,
      snippet: JSON.stringify(row).slice(0, 320),
      score: hit.score ?? null,
    };
  });
}

function groundedAnswer(query, records, language) {
  if (!records.length) {
    return language === "kn"
      ? `"${query}" ಗೆ ಹೊಂದುವ ದಾಖಲೆಗಳು Catalyst Cloud Scale ನಲ್ಲಿ ಸಿಗಲಿಲ್ಲ. FIR ಸಂಖ್ಯೆ, ಜಿಲ್ಲೆ, ಅಪರಾಧದ ಪ್ರಕಾರ, ಶಂಕಿತ ವ್ಯಕ್ತಿ, ವಾಹನ ಅಥವಾ ಸಾಕ್ಷ್ಯದ ಪದವನ್ನು ಬಳಸಿ ಮತ್ತೆ ಹುಡುಕಿ.`
      : `No Catalyst Cloud Scale records matched "${query}". Try an FIR number, district, offence type, suspect, vehicle, or evidence term.`;
  }
  const rows = records.slice(0, 6).map((hit, index) => {
    const row = hit.row || {};
    const identity = recordValue(row, "fir_number", "case_number", "name", "full_name", "vehicle_number", "plate", "id", "ROWID") || "record";
    const details = [
      recordValue(row, "crime_type", "offence_type", "type", "status"),
      recordValue(row, "district", "station_name", "location"),
      recordValue(row, "occurred_at", "registered_at", "arrested_at", "collected_at"),
      recordValue(row, "description", "summary", "modus_operandi", "notes").slice(0, 130),
    ].filter(Boolean).join(" · ");
    return `${index + 1}. ${hit.table} — ${identity}${details ? ` — ${details}` : ""}`;
  });
  const tableCounts = records.reduce((counts, hit) => {
    counts[hit.table] = (counts[hit.table] || 0) + 1;
    return counts;
  }, {});
  const coverage = Object.entries(tableCounts).map(([table, count]) => `${table}: ${count}`).join(", ");
  const topValues = (keys) => {
    const counts = new Map();
    for (const hit of records) {
      const value = recordValue(hit.row || {}, ...keys);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([value, count]) => `${value} (${count})`).join(", ");
  };
  const offences = topValues(["crime_type", "offence_type", "type"]);
  const districts = topValues(["district", "station_name", "location"]);
  const intro = language === "kn"
    ? `Catalyst Cloud Scale ನಲ್ಲಿ ${records.length} ಸಂಬಂಧಿತ ದಾಖಲೆಗಳು ಕಂಡುಬಂದಿವೆ (${coverage}).`
    : `I found ${records.length} relevant Catalyst Cloud Scale record${records.length === 1 ? "" : "s"} (${coverage}).`;
  const patterns = [offences && `offences: ${offences}`, districts && `locations: ${districts}`].filter(Boolean).join("; ");
  const snapshot = patterns ? `\n\nPattern snapshot — ${patterns}.` : "";
  const note = language === "kn"
    ? "\n\nಕಾರ್ಯಾಚರಣೆಯ ಮೊದಲು ಮೂಲ FIR ಮತ್ತು ಸಾಕ್ಷ್ಯ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ."
    : "\n\nVerify the cited FIR and evidence records before operational action.";
  return `${intro}${snapshot}\n\n${rows.join("\n")}${note}`;
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function listFieldValues(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch { /* legacy CSV values can be plain comma-separated text */ }
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function namedCriminalScore(query, row) {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return 0;
  const names = [recordValue(row, "name", "full_name"), ...listFieldValues(row && row.aliases)]
    .map(normalizeLookupText)
    .filter(Boolean);
  let best = 0;
  for (const name of names) {
    const exactPhrase = ` ${normalizedQuery} `.includes(` ${name} `);
    if (exactPhrase) best = Math.max(best, 100 + name.length);
    const tokens = name.split(" ").filter((token) => token.length > 1);
    if (tokens.length >= 2 && tokens.every((token) => normalizedQuery.split(" ").includes(token))) {
      best = Math.max(best, 50 + tokens.length);
    }
  }
  return best;
}

function hitIdentity(hit) {
  const row = hit && hit.row || {};
  const id = recordValue(row, "id", "ROWID", "fir_number", "case_number", "plate", "name");
  return `${hit && hit.table}:${id}:${recordValue(row, "role", "type")}`;
}

/**
 * Resolve a named criminal through the normalized Cloud Scale relationship
 * tables. This gives QuickML the profile and its linked FIRs instead of a
 * coincidental text sample from whichever table the generic query selected.
 */
async function enrichNamedCriminal(context, query, search, max = 20) {
  try {
    const result = await listRows(context, "Criminals", 500, false);
    const candidates = result.rows
      .map((row) => ({ row, score: namedCriminalScore(query, row) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return search;

    const profile = candidates[0].row;
    const criminalId = Number(recordValue(profile, "id", "ROWID"));
    if (!Number.isSafeInteger(criminalId) || criminalId <= 0) return search;
    const intelligence = await criminalIntelligence(context.app, criminalId);
    if (!intelligence || !intelligence.criminal) return search;

    const profileRow = {
      ...intelligence.criminal,
      linked_fir_count: intelligence.counts.firs,
      linked_arrest_count: intelligence.counts.arrests,
      linked_vehicle_count: intelligence.counts.vehicles,
      linked_evidence_count: intelligence.counts.evidence,
    };
    const enriched = [
      { table: "Criminals", score: 120, row: profileRow },
      ...intelligence.firs.map((row, index) => ({ table: "Firs", score: 110 - index / 10, row })),
      ...intelligence.arrests.map((row, index) => ({ table: "Arrests", score: 90 - index / 10, row })),
      ...intelligence.vehicles.map((row, index) => ({ table: "Vehicles", score: 80 - index / 10, row })),
      ...intelligence.evidence.map((row, index) => ({ table: "Evidence", score: 70 - index / 10, row })),
      ...search.hits,
    ];
    const seen = new Set();
    const hits = enriched.filter((hit) => {
      const key = hitIdentity(hit);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, max);
    return {
      ...search,
      hits,
      engine: `${search.engine}+criminal-intelligence-join`,
    };
  } catch {
    return search;
  }
}

function quickmlMissedGrounding(value) {
  const head = normalizeLookupText(String(value || "").slice(0, 500));
  if (!head) return false;
  return [
    /^(i )?(cannot|can t|could not|couldn t|was unable|am unable).*(find|locate|retrieve|access)/,
    /^(there (is|are) )?no (matching |relevant |associated |available )?(data|records?|information)/,
    /^(the )?(provided |available )?(data|records?|information).*(does not|do not|doesn t|don t).*(contain|include|mention)/,
    /^(i )?(do not|don t) have (enough |any )?(data|records?|information)/,
    /^(no results?|nothing) (was |were )?(found|available|returned)/,
  ].some((pattern) => pattern.test(head)) || /ಮಾಹಿತಿ.{0,30}ಲಭ್ಯವಿಲ್ಲ|ದಾಖಲೆಗಳು?.{0,30}ಸಿಗಲಿಲ್ಲ/.test(head);
}

function criminalProfileAnswer(query, records, language) {
  const profileHit = records.find((hit) => hit.table === "Criminals" && namedCriminalScore(query, hit.row) > 0);
  if (!profileHit) return "";
  const profile = profileHit.row || {};
  const name = recordValue(profile, "name", "full_name") || "Matched criminal profile";
  const aliases = listFieldValues(profile.aliases);
  const knownLocations = listFieldValues(profile.known_locations);
  const status = recordValue(profile, "status").replace(/_/g, " ");
  const risk = recordValue(profile, "risk_score");
  const category = recordValue(profile, "crime_category");
  const district = recordValue(profile, "home_district");
  const age = recordValue(profile, "age");
  const linkedFirs = records.filter((hit) => hit.table === "Firs");
  const firCount = Number(recordValue(profile, "linked_fir_count", "fir_count")) || linkedFirs.length;
  const arrestCount = Number(recordValue(profile, "linked_arrest_count", "arrest_count")) || records.filter((hit) => hit.table === "Arrests").length;
  const evidenceCount = Number(recordValue(profile, "linked_evidence_count")) || records.filter((hit) => hit.table === "Evidence").length;

  const identity = [
    age && `${age} years old`,
    aliases.length && `alias ${aliases.join(", ")}`,
    status && `status: ${status}`,
    risk && `risk score: ${risk}/100`,
  ].filter(Boolean).join("; ");
  const profileFacts = [
    category && `Primary category: ${category}`,
    district && `home district: ${district}`,
    knownLocations.length && `known locations: ${knownLocations.join(", ")}`,
  ].filter(Boolean).join("; ");
  const firLines = linkedFirs.slice(0, 8).map((hit) => {
    const row = hit.row || {};
    const fir = recordValue(row, "fir_number", "id") || "Unnumbered FIR";
    const details = [
      recordValue(row, "crime_type"),
      recordValue(row, "district"),
      recordValue(row, "status").replace(/_/g, " "),
      recordValue(row, "link_role").replace(/_/g, " "),
    ].filter(Boolean).join(" | ");
    return `- ${fir}${details ? ` | ${details}` : ""}`;
  });
  const remaining = Math.max(0, firCount - firLines.length);
  const coverage = `Cloud Scale linkage: ${firCount} FIR${firCount === 1 ? "" : "s"}, ${arrestCount} arrest record${arrestCount === 1 ? "" : "s"}, and ${evidenceCount} linked evidence record${evidenceCount === 1 ? "" : "s"}.`;
  const verification = "Verify the cited FIR and evidence records before operational action.";

  if (language === "kn") {
    return `${name} ಅವರ Cloud Scale ಪ್ರೊಫೈಲ್ ಕಂಡುಬಂದಿದೆ. ${identity}. ${profileFacts}.\n\n${coverage}\n\n${firLines.join("\n")}${remaining ? `\n- ಇನ್ನೂ ${remaining} ಸಂಬಂಧಿತ FIR ದಾಖಲೆಗಳು ಇವೆ.` : ""}\n\n${verification}`;
  }
  return `${name} is a matched Catalyst Cloud Scale criminal profile${identity ? ` (${identity})` : ""}. ${profileFacts}.\n\n${coverage}` +
    `${firLines.length ? `\n\nLinked FIRs:\n${firLines.join("\n")}${remaining ? `\n- ${remaining} additional linked FIR record${remaining === 1 ? "" : "s"}.` : ""}` : ""}` +
    `\n\n${verification}`;
}

async function ensureGrounding(context, query, search, max = 8) {
  const text = String(query || "").toLowerCase();
  const table = /evidence|proof|ಸಾಕ್ಷ/.test(text) ? "Evidence"
    : /criminal|suspect|accused|offender|ಆರೋಪ|ಶಂಕಿತ/.test(text) ? "Criminals"
      : /arrest|ಬಂಧನ/.test(text) ? "Arrests"
        : /vehicle|theft|plate|car|bike|ವಾಹನ/.test(text) ? "Firs"
          : /case|investigation|ಪ್ರಕರಣ/.test(text) ? "Cases"
            : "Firs";
  try {
    const result = await listRows(context, table, 300, false);
    const ignored = new Set([
      "what", "which", "where", "when", "about", "with", "from", "have", "show", "tell", "give", "please",
      "summarise", "summarize", "record", "records", "case", "cases", "crime", "crimes", "file", "files", "one", "sentence",
      "evidence", "collected", "investigation", "related", "find", "list", "all", "these", "those",
    ]);
    const terms = [...new Set((text.match(/[\p{L}\p{N}-]{3,}/gu) || []).filter((term) => !ignored.has(term)))].slice(0, 10);
    const scored = result.rows.map((row) => {
      const haystack = Object.values(row).map((value) => String(value == null ? "" : value)).join(" ").toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { table, score: Math.max(0.1, score), row };
    }).filter((hit) => !terms.length || hit.score > 0.1).sort((a, b) => b.score - a.score);
    const preferredSearchHits = search.hits.filter((hit) => hit.table === table);
    const chosen = scored.length ? scored : preferredSearchHits.length ? preferredSearchHits : !terms.length ? result.rows.map((row) => ({ table, score: 0.1, row })) : search.hits;
    return {
      ...search,
      hits: chosen.slice(0, max),
      engine: `${search.engine}+cloudscale-sample`,
    };
  } catch {
    return search;
  }
}

function conversationContext(history) {
  if (!Array.isArray(history)) return "";
  return history.slice(-12).map((message) => {
    const role = message && message.role === "assistant" ? "NETRA" : "Officer";
    const content = String((message && message.content) || "").trim().slice(0, 1200);
    return content ? `${role}: ${content}` : "";
  }).filter(Boolean).join("\n");
}

function contextualSearchQuery(query, history) {
  const current = String(query || "").trim();
  if (!Array.isArray(history) || !/(\bthere\b|\bthose\b|\bthem\b|\bthese\b|\bsame\b|what about|how about|\balso\b|\band\b|ಅಲ್ಲಿ|ಅದೇ|ಮತ್ತು)/i.test(current)) {
    return current;
  }
  const previous = [...history].reverse().find((message) => message && message.role === "user" && String(message.content || "").trim());
  const priorQuery = String((previous && previous.content) || "").trim().slice(0, 500);
  return priorQuery ? `${current}\nPrevious officer request: ${priorQuery}` : current;
}

function aiCacheIdentity(context, mode, payload) {
  return cacheKey("ai", JSON.stringify({
    retrieval: "named-criminal-v3",
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

async function handler(req, res) {
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
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer", "analyst"]);
      const limit = Math.min(200, Math.max(1, Number(payload.max) || 100));
      let archived = [];
      let stored = [];
      try { archived = await listAudits(platformContext.app, limit); } catch { /* Stratus can be empty in a new environment. */ }
      try {
        const result = await listRows(platformContext, "AuditLogs", limit, false);
        stored = result.rows.map((row) => ({
          id: row.request_id || `AUDIT-${row.id || row.ROWID}`,
          occurred_at: row.ts || row.CREATEDTIME || "",
          actor: { username: row.username || "Officer", role: row.role || "" },
          action: row.action || "ACTIVITY",
          entity: row.entity || "",
          entity_id: row.entity_id || "",
          model: row.ai_model || "",
          processing_ms: Number(row.processing_ms || 0),
          detail: row.detail || "",
          source: "Cloud Scale",
        }));
      } catch { /* AuditLogs is optional when only core tables were imported. */ }
      const rows = [...archived, ...stored]
        .filter((row, index, all) => all.findIndex((item) => String(item.id) === String(row.id)) === index)
        .sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")))
        .slice(0, limit);
      reply(200, { rows });
      return;
    }

    if (mode === "infra:health") {
      requireRole(platformContext, ["administrator", "senior_officer", "investigation_officer", "analyst"]);
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
      // Zia TTS returns binary WAV, which zia() hands back as base64. The
      // request helper maps Kannada script to Zia's supported voice selector.
      const request = ttsRequest(payload);
      let up = await zia("tts/synthesize", request.body, token);
      // An explicitly configured Kannada speaker might be retired or renamed.
      // Retry once without it and let Zia select a compatible default.
      if (!up.ok && request.isKannada && request.body.speaker) {
        const fallback = { ...request.body };
        delete fallback.speaker;
        up = await zia("tts/synthesize", fallback, token);
      }
      if (!up.ok) { reply(502, { error: "Zia TTS error", status: up.status, detail: (up.text || "").slice(0, 300) }); return; }
      reply(200, { audio: up.audio_b64 || null, mime: "audio/wav", language: request.isKannada ? "kn-IN" : "en-IN" });
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
      const searchQuery = contextualSearchQuery(query, payload.history);
      const initialSearch = await searchRecords(platformContext, searchQuery, 24);
      const sampledSearch = await ensureGrounding(platformContext, searchQuery, initialSearch, 8);
      const search = await enrichNamedCriminal(platformContext, searchQuery, sampledSearch, 20);
      const records = search.hits;
      const recordContext = records.length
        ? `\n\nMatching live Cloud Scale records (use as factual evidence):\n${records.map((hit, i) =>
            `[${i + 1}] ${hit.table}: ${JSON.stringify(hit.row).slice(0, 700)}`
          ).join("\n")}`
        : "";
      const contextualQuery = `${conversation ? `Use this conversation context to resolve follow-up references.\n${conversation}\n\n` : ""}` +
        `Current question: ${query}${recordContext}`;
      const up = await quickml(process.env.QML_RAG_PATH || "rag/answer", { query: contextualQuery }, token);
      const d = up.json || {};
      let answer = up.ok ? quickmlText(d) : "";
      const ragMissedGrounding = !!answer && records.length > 0 && quickmlMissedGrounding(answer);
      if (ragMissedGrounding) answer = "";
      let model = "QuickML RAG + Catalyst Search";
      let quickmlWarning = null;
      if (!answer) {
        const llm = await quickmlLlm(
          contextualQuery,
          "You are NETRA for Karnataka State Police. Answer only from the supplied Cloud Scale records. State clearly when evidence is insufficient.",
          { temperature: 0.2, max_tokens: 700 },
          token,
        );
        const llmMissedGrounding = !!llm.answer && records.length > 0 && quickmlMissedGrounding(llm.answer);
        answer = llmMissedGrounding ? "" : llm.answer;
        model = answer ? "QuickML LLM + Catalyst Cloud Scale" : "Catalyst Cloud Scale Retrieval";
        if (!answer) {
          answer = criminalProfileAnswer(String(searchQuery), records, payload.language) || groundedAnswer(String(query), records, payload.language);
          quickmlWarning = ragMissedGrounding || llmMissedGrounding
            ? "QuickML did not use the retrieved Cloud Scale records; NETRA returned a deterministic record-grounded answer."
            : `QuickML endpoint unavailable (${llm.status || up.status || 502}); returned a record-grounded answer.`;
        }
      }
      // Live relational records are the primary evidence. Knowledge-base
      // passages remain available after them, but cannot displace the profile
      // or linked FIRs from the assistant's visible source panel.
      const sources = groundedSources(records);
      for (const [index, node] of (Array.isArray(d.retrieved_nodes) ? d.retrieved_nodes : []).slice(0, 4).entries()) {
        sources.push({
          title: node.title || node.document_name || `Case dossier ${index + 1}`,
          snippet: String(node.content || node.text || "").slice(0, 240),
          score: node.score ?? null,
        });
      }
      const processing_ms = Date.now() - started;
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: "AI_QUERY", entity: "rag", processing_ms, model,
        detail: {
          prompt: String(query).slice(0, 2000), answer: String(answer || "").slice(0, 5000),
          via_voice: !!payload.via_voice, language: payload.language || "en",
          source_count: sources.length, search_engine: search.engine,
          quickml_fallback: !!quickmlWarning,
        },
      });
      const response = {
        answer,
        sources: sources.length ? sources : groundedSources(records),
        model,
        search_engine: search.engine,
        search_warning: search.warning,
        quickml_warning: quickmlWarning,
      };
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
      const up = await quickmlLlm(spec.prompt, spec.sys, { temperature: 0.1, max_tokens: 700 }, token);
      const out = up.answer;
      const result = parseJsonLoose(out);
      const audit = await writeAudit(platformContext.app, platformContext.officer, {
        action: `AI_NLP_${String(op).toUpperCase()}`, entity: "CrimeRecord", model: "QuickML LLM",
        detail: { input_length: text.length, result_available: !!result },
      });
      reply(200, {
        op,
        result,
        audit_id: audit.id,
        model: "QuickML LLM",
        warning: result ? null : "QuickML endpoint did not return structured output.",
      });
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
    const searchQuery = `${conversation}\n${prompt}`.trim();
    const initialSearch = await searchRecords(platformContext, searchQuery, 24);
    const sampledSearch = await ensureGrounding(platformContext, prompt, initialSearch, 8);
    const search = await enrichNamedCriminal(platformContext, searchQuery, sampledSearch, 20);
    const records = search.hits;
    const recordContext = records.length
      ? `\n\nRelevant live Cloud Scale records:\n${records.slice(0, 8).map((hit, i) =>
          `[${i + 1}] ${hit.table}: ${JSON.stringify(hit.row).slice(0, 700)}`
        ).join("\n")}`
      : "";
    const languageRule = payload.language === "kn"
      ? "Reply in natural Kannada, preserving official names, FIR numbers, and legal sections exactly."
      : "Reply in clear English.";
    const fullPrompt = `${conversation ? `Conversation so far:\n${conversation}\n\n` : ""}Current officer question: ${prompt}${recordContext}`;
    const up = await quickmlLlm(
      fullPrompt,
      `${guided_prompt || system || ""}\n${languageRule}`.trim(),
      { temperature: temperature ?? 0.2, max_tokens: 700, images },
      token,
    );
    const llmMissedGrounding = !!up.answer && records.length > 0 && quickmlMissedGrounding(up.answer);
    const quickmlAnswer = llmMissedGrounding ? "" : up.answer;
    const answer = quickmlAnswer || criminalProfileAnswer(String(searchQuery), records, payload.language) || groundedAnswer(String(prompt), records, payload.language);
    const processing_ms = Date.now() - started;
    const model = quickmlAnswer ? "QuickML LLM + Catalyst Search" : "Catalyst Cloud Scale Retrieval";
    const audit = await writeAudit(platformContext.app, platformContext.officer, {
      action: "AI_QUERY", entity: "chat", processing_ms, model,
      detail: {
        prompt: String(prompt).slice(0, 2000), answer: String(answer || "").slice(0, 5000),
        via_voice: !!payload.via_voice, language: payload.language || "en",
        source_count: records.length, search_engine: search.engine, quickml_fallback: !quickmlAnswer,
      },
    });
    const response = {
      response: answer,
      model,
      source_count: records.length,
      sources: groundedSources(records),
      search_engine: search.engine,
      search_warning: search.warning,
      quickml_warning: quickmlAnswer
        ? null
        : llmMissedGrounding
          ? "QuickML did not use the retrieved Cloud Scale records; NETRA returned a deterministic record-grounded answer."
          : `QuickML endpoint unavailable (${up.status || 502}); returned a record-grounded answer.`,
    };
    await cachePut(platformContext.app, responseCacheKey, response, 1);
    reply(200, { ...response, audit_id: audit.id, processing_ms, cache: false });
  } catch (e) {
    try { reply(Number(e && e.statusCode) || 500, { error: String(e && e.message || e) }); } catch { /* res already gone */ }
  }
}

module.exports = handler;
module.exports.__test = {
  criminalProfileAnswer,
  namedCriminalScore,
  quickmlMissedGrounding,
};
