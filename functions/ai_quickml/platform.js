'use strict';

const catalyst = require("zcatalyst-sdk-node");
const crypto = require("crypto");
const path = require("path");

const STRATUS_BUCKET = process.env.STRATUS_BUCKET || "ksp-netra";
const EVIDENCE_TABLE = process.env.EVIDENCE_TABLE || "Evidence";
const MAX_IMAGE_BYTES = Math.min(10, Math.max(1, Number(process.env.MAX_IMAGE_MB) || 6)) * 1024 * 1024;

const DATASTORE_TABLES = [
  "Firs", "Cases", "Criminals", "FirCriminals", "Arrests", "Victims",
  "Complainants", "Evidence", "Relationships", "Phones", "Vehicles",
  "Addresses", "Organizations", "OrgMembers", "Weapons", "Chargesheets",
  "PoliceStations", "AuditLogs", "Notifications", "OcrResult",
];

const DEFAULT_SEARCH_COLUMNS = {
  Firs: ["fir_number", "crime_type", "ipc_sections", "district", "taluk", "status", "severity", "modus", "description"],
  Cases: ["case_number", "title", "status", "priority", "district", "summary"],
  Criminals: ["name", "aliases", "status", "crime_category", "known_locations", "home_district", "notes"],
  Evidence: ["type", "description", "storage_ref"],
  Vehicles: ["plate", "make", "model", "color", "type"],
};

const DEFAULT_SELECT_COLUMNS = {
  Firs: ["ROWID", "id", "fir_number", "crime_type", "ipc_sections", "district", "taluk", "occurred_at", "reported_at", "status", "severity", "modus", "description"],
  Cases: ["ROWID", "id", "case_number", "title", "fir_id", "status", "priority", "district", "opened_at", "updated_at", "summary"],
  Criminals: ["ROWID", "id", "name", "aliases", "gender", "age", "status", "risk_score", "crime_category", "known_locations", "home_district", "notes"],
  Evidence: ["ROWID", "id", "fir_id", "type", "description", "collected_at", "storage_ref"],
  Vehicles: ["ROWID", "id", "plate", "make", "model", "color", "type", "owner_criminal_id"],
};

// The generated demonstration vehicle is registered to this synthetic profile.
// A real Vehicles table always takes precedence; this one-record fallback keeps
// the bundled demo coherent in projects where only the eight core tables were
// imported during round one.
const DEMO_VEHICLE_REGISTRY = [{
  id: 41,
  plate: "KA-03-AB-7161",
  make: "Maruti",
  model: "Swift",
  color: "Red",
  type: "car",
  owner_criminal_id: 66,
  demo: true,
}];

function envJson(name, fallback) {
  try {
    const value = process.env[name];
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const SEARCH_COLUMNS = envJson("SEARCH_TABLE_COLUMNS", DEFAULT_SEARCH_COLUMNS);
const SELECT_COLUMNS = envJson("SEARCH_SELECT_COLUMNS", DEFAULT_SELECT_COLUMNS);

function normalizeRole(name) {
  const value = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (["administrator", "app_administrator", "admin", "system_administrator"].includes(value)) return "administrator";
  if (["senior_officer", "seniorofficer", "supervisor"].includes(value)) return "senior_officer";
  if (["investigation_officer", "investigating_officer", "officer"].includes(value)) return "investigation_officer";
  if (["analyst", "scrb_analyst"].includes(value)) return "analyst";
  return "readonly";
}

function publicUser(user) {
  if (!user) return null;
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email_id || "Catalyst User";
  return {
    id: String(user.user_id || user.zuid || ""),
    username: String(user.email_id || user.user_id || ""),
    full_name: fullName,
    role: normalizeRole(user.role_details && user.role_details.role_name),
    role_name: String((user.role_details && user.role_details.role_name) || ""),
    status: String(user.status || ""),
  };
}

function authRequired(req) {
  const configured = String(process.env.REQUIRE_CATALYST_AUTH || "").trim().toLowerCase();
  if (["1", "true", "yes", "required"].includes(configured)) return true;
  if (["0", "false", "no", "optional"].includes(configured)) return false;
  const headers = (req && req.headers) || {};
  const environment = String(headers["x-zc-project-environment"] || headers["x-zc-environment"] || process.env.X_ZOHO_CATALYST_IS_PRODUCTION || "").toLowerCase();
  return environment === "production" || environment === "true";
}

async function createRequestContext(req) {
  const app = catalyst.initialize(req);
  let officer = null;
  let authError = null;
  try {
    officer = publicUser(await app.userManagement().getCurrentUser());
  } catch (error) {
    authError = error;
  }
  if (authRequired(req) && !officer) {
    const error = new Error("Catalyst user authentication required");
    error.statusCode = 401;
    error.cause = authError;
    throw error;
  }
  return {
    app,
    officer: officer || {
      id: "development",
      username: "local-development",
      full_name: "Local Development",
      role: "administrator",
      role_name: "Development fallback",
      status: "development",
    },
    authenticated: !!officer,
    auth_required: authRequired(req),
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cacheKey(namespace, value) {
  return `netra:${namespace}:${hash(value).slice(0, 40)}`;
}

async function cacheGet(app, key) {
  try {
    const row = await app.cache().segment().get(key);
    const raw = row && (row.cache_value ?? row.value);
    return typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cachePut(app, key, value, expiryHours = 1) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 180000) return false;
  const segment = app.cache().segment();
  try {
    await segment.put(key, serialized, expiryHours);
    return true;
  } catch {
    try {
      await segment.update(key, serialized, expiryHours);
      return true;
    } catch {
      return false;
    }
  }
}

function safeFileName(value, fallback = "evidence.jpg") {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || fallback).slice(-120);
}

function decodeImage(value, suppliedMime, suppliedName) {
  const input = String(value || "");
  const match = input.match(/^data:([^;,]+);base64,(.*)$/s);
  const mime = String((match && match[1]) || suppliedMime || "image/jpeg").toLowerCase();
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(mime)) {
    const error = new Error("Only JPEG, PNG, and WebP evidence images are supported");
    error.statusCode = 415;
    throw error;
  }
  const encoded = (match && match[2]) || input;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) {
    const error = new Error("A valid base64 evidence image is required");
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error(`Evidence image must be ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB or smaller`);
    error.statusCode = 413;
    throw error;
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const requested = safeFileName(suppliedName, `evidence.${ext}`);
  const name = requested.includes(".") ? requested : `${requested}.${ext}`;
  return { buffer, mime, name, ext };
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function objectStamp() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
}

async function putObject(app, key, body, contentType, metaData) {
  await app.stratus().bucket(STRATUS_BUCKET).putObject(key, body, {
    contentType,
    overwrite: false,
    metaData,
  });
  return `stratus://${STRATUS_BUCKET}/${key}`;
}

async function persistEvidence(app, options) {
  const stamp = objectStamp();
  const date = new Date().toISOString().slice(0, 10);
  const kind = String(options.kind || "analysis").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const sourceKey = `evidence/${date}/${stamp}/${safeFileName(options.image.name)}`;
  const resultKey = `evidence/${date}/${stamp}/${kind}-result.json`;
  const warnings = [];
  let sourceRef = null;
  let resultRef = null;
  let rowId = null;
  const additionalSourceKeys = [];

  try {
    sourceRef = await putObject(app, sourceKey, options.image.buffer, options.image.mime, {
      analysis: kind,
      actor: String(options.actor && options.actor.id || "unknown").slice(0, 80),
    });
    for (const [index, image] of (options.additionalImages || []).entries()) {
      const extraKey = `evidence/${date}/${stamp}/reference-${index + 1}-${safeFileName(image.name)}`;
      await putObject(app, extraKey, image.buffer, image.mime, {
        analysis: kind,
        actor: String(options.actor && options.actor.id || "unknown").slice(0, 80),
      });
      additionalSourceKeys.push(extraKey);
    }
    resultRef = await putObject(app, resultKey, JSON.stringify({
      version: 1,
      analysis: kind,
      created_at: new Date().toISOString(),
      actor: options.actor,
      fir_id: options.firId || null,
      source: sourceRef,
      additional_sources: additionalSourceKeys.map((key) => `stratus://${STRATUS_BUCKET}/${key}`),
      result: options.result,
    }), "application/json", { analysis: kind });
  } catch (error) {
    warnings.push(`Stratus persistence failed: ${String(error && error.message || error).slice(0, 180)}`);
  }

  const storage = {
    bucket: STRATUS_BUCKET,
    source_key: sourceRef ? sourceKey : null,
    additional_source_keys: additionalSourceKeys,
    result_key: resultRef ? resultKey : null,
    analysis: kind,
  };
  const resultText = kind === "ocr"
    ? String(options.result && options.result.text || "")
    : JSON.stringify(options.result || {});
  const description = [
    String(options.description || "").trim(),
    `Catalyst Zia ${kind} analysis of ${options.image.name}.`,
    resultText.slice(0, 50000),
  ].filter(Boolean).join("\n\n").slice(0, 60000);
  const evidenceId = Math.floor((Date.now() + crypto.randomInt(0, 100000)) % 2000000000);
  const row = {
    id: evidenceId,
    type: `ZIA_${kind.toUpperCase()}`.slice(0, 100),
    description,
    collected_at: timestamp(),
    storage_ref: JSON.stringify(storage),
  };
  const firId = Number(options.firId);
  if (Number.isSafeInteger(firId) && firId > 0) row.fir_id = firId;
  try {
    const inserted = await app.datastore().table(EVIDENCE_TABLE).insertRow(row);
    rowId = String(inserted && (inserted.ROWID || inserted.rowid) || "") || null;
  } catch (error) {
    warnings.push(`Evidence row persistence failed: ${String(error && error.message || error).slice(0, 180)}`);
  }

  return {
    evidence_id: evidenceId,
    record_id: rowId,
    storage_ref: storage,
    warnings,
  };
}

async function writeAudit(app, actor, event) {
  const id = event.id || `A-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now = new Date();
  const key = `audit/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${id}.json`;
  const record = {
    version: 1,
    id,
    occurred_at: now.toISOString(),
    actor,
    action: event.action || "UNKNOWN",
    entity: event.entity || null,
    entity_id: event.entity_id || null,
    processing_ms: event.processing_ms || 0,
    model: event.model || null,
    detail: event.detail || {},
  };
  try {
    const ref = await putObject(app, key, JSON.stringify(record), "application/json", {
      action: String(record.action).slice(0, 80),
      actor: String(actor && actor.id || "unknown").slice(0, 80),
    });
    return { id, ref };
  } catch {
    return { id, ref: null };
  }
}

async function listAudits(app, max = 50) {
  const limit = Math.min(100, Math.max(1, Number(max) || 50));
  const bucket = app.stratus().bucket(STRATUS_BUCKET);
  const page = await bucket.listPagedObjects({ prefix: "audit/", maxKeys: "100", orderBy: "desc" });
  const objects = [...((page && page.contents) || [])]
    .map((item) => ({ key: item.key || (item.keyDetails && item.keyDetails.key) || "", modified: item.last_modified || "" }))
    .filter((item) => item.key.endsWith(".json"))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)))
    .slice(0, limit);
  const records = await Promise.all(objects.map(async (item) => {
    try {
      return JSON.parse((await streamBuffer(await bucket.getObject(item.key))).toString("utf8"));
    } catch {
      return null;
    }
  }));
  return records.filter(Boolean);
}

function searchTerms(query) {
  const ignored = new Set(["what", "which", "where", "when", "about", "with", "from", "have", "show", "tell", "give", "crime", "case", "cases", "please"]);
  return [...new Set((String(query || "").toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || []).filter((term) => !ignored.has(term)))].slice(0, 12);
}

async function boundedScan(app, query, max) {
  const wanted = searchTerms(query);
  if (!wanted.length) return [];
  const hits = [];
  await Promise.all(Object.keys(DEFAULT_SEARCH_COLUMNS).map(async (table) => {
    try {
      const page = await app.datastore().table(table).getPagedRows({ maxRows: 300 });
      for (const row of (page && page.data) || []) {
        const searchable = Object.entries(row)
          .filter(([key]) => !["CREATORID", "MODIFIEDTIME", "CREATEDTIME"].includes(key))
          .map(([, value]) => String(value == null ? "" : value)).join(" ").toLowerCase();
        const score = wanted.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
        if (score) hits.push({ table, score, row });
      }
    } catch {
      // A role can legitimately have no permission for one table.
    }
  }));
  return hits.sort((a, b) => b.score - a.score).slice(0, max);
}

async function searchRecords(context, query, max = 24) {
  const limit = Math.min(50, Math.max(1, Number(max) || 24));
  const key = cacheKey("search", `${context.officer.id}|${context.officer.role}|${query}|${limit}`);
  const cached = await cacheGet(context.app, key);
  if (cached && Array.isArray(cached.hits)) return { ...cached, cache: true };

  let hits = [];
  let engine = "catalyst-search";
  let warning = null;
  try {
    const result = await context.app.search().executeSearchQuery({
      search: String(query).trim().slice(0, 500),
      search_table_columns: SEARCH_COLUMNS,
      select_table_columns: SELECT_COLUMNS,
      start: 0,
      end: limit,
    });
    for (const [table, rows] of Object.entries(result || {})) {
      for (const row of Array.isArray(rows) ? rows : []) {
        hits.push({ table, score: Number(row._score || row.score) || 1, row });
      }
    }
    hits = hits.slice(0, limit);
  } catch (error) {
    engine = "bounded-datastore-fallback";
    warning = "Catalyst Search indexes are not enabled for NETRA's content columns yet.";
    hits = await boundedScan(context.app, query, limit);
  }
  const value = { hits, engine, warning, cache: false };
  await cachePut(context.app, key, value, 1);
  return value;
}

function rowIdentity(table, row) {
  const id = row && row.id != null ? String(row.id) : "";
  if (id) return `id:${id}`;
  if (table === "FirCriminals") {
    return `link:${row && row.fir_id}:${row && row.criminal_id}:${row && row.role}`;
  }
  if (table === "OrgMembers") {
    return `member:${row && row.org_id}:${row && row.criminal_id}:${row && row.role}`;
  }
  return `row:${row && (row.ROWID || row.rowid)}`;
}

function dedupeTableRows(table, rows) {
  const unique = new Map();
  for (const row of rows) {
    const key = rowIdentity(table, row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

async function listRows(context, table, max, refresh = false) {
  if (!DATASTORE_TABLES.includes(table)) {
    const error = new Error("Table is not available through the NETRA API");
    error.statusCode = 403;
    throw error;
  }
  const requested = Math.min(5000, Math.max(1, Number(max) || 50));
  const key = cacheKey("rows", `${context.officer.id}|${context.officer.role}|${table}|${requested}`);
  if (!refresh) {
    const cached = await cacheGet(context.app, key);
    if (cached && Array.isArray(cached.rows)) return { rows: dedupeTableRows(table, cached.rows), cache: true };
  }
  const rows = [];
  let nextToken;
  const dsTable = context.app.datastore().table(table);
  do {
    const page = await dsTable.getPagedRows({ nextToken, maxRows: Math.min(300, requested - rows.length) });
    rows.push(...((page && page.data) || []));
    nextToken = page && page.next_token;
  } while (nextToken && rows.length < requested);
  const value = { rows: dedupeTableRows(table, rows).slice(0, requested), cache: false };
  await cachePut(context.app, key, value, 1);
  return value;
}

function rowNumber(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] != null) {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

function rowText(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] != null) return String(row[key]);
  }
  return "";
}

function normalizePlate(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^(KA)(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (!match) return compact;
  return `${match[1]}${match[2].padStart(2, "0")}${match[3]}${match[4].padStart(4, "0")}`;
}

function plateCandidates(value) {
  const text = String(value || "").toUpperCase();
  const found = new Set();
  const patterns = [
    /\bKA\s*[-.:]?\s*\d{1,2}\s*[-.:]?\s*[A-Z]{1,3}\s*[-.:]?\s*\d{1,4}\b/g,
    /\bKA\d{1,2}[A-Z]{1,3}\d{1,4}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const plate = normalizePlate(match[0]);
      if (plate.length >= 8) found.add(plate);
    }
  }
  return [...found];
}

async function tableRows(app, table, max = 5000) {
  const rows = [];
  let nextToken;
  try {
    const dsTable = app.datastore().table(table);
    do {
      const page = await dsTable.getPagedRows({ nextToken, maxRows: Math.min(300, max - rows.length) });
      rows.push(...((page && page.data) || []));
      nextToken = page && page.next_token;
    } while (nextToken && rows.length < max);
  } catch {
    return [];
  }
  return dedupeTableRows(table, rows).slice(0, max);
}

function byNewest(a, b) {
  const aDate = Date.parse(rowText(a, "occurred_at", "arrested_at", "collected_at", "CREATEDTIME"));
  const bDate = Date.parse(rowText(b, "occurred_at", "arrested_at", "collected_at", "CREATEDTIME"));
  return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
}

async function criminalIntelligence(app, criminalId) {
  const wanted = Number(criminalId);
  if (!Number.isSafeInteger(wanted) || wanted <= 0) return null;
  const [criminals, links, firs, arrests, vehicles, evidence] = await Promise.all([
    tableRows(app, "Criminals", 5000),
    tableRows(app, "FirCriminals", 5000),
    tableRows(app, "Firs", 5000),
    tableRows(app, "Arrests", 5000),
    tableRows(app, "Vehicles", 5000),
    tableRows(app, "Evidence", 5000),
  ]);
  const criminal = criminals.find((row) => rowNumber(row, "id") === wanted);
  if (!criminal) return null;
  const personLinks = links.filter((row) => rowNumber(row, "criminal_id") === wanted);
  const firRoles = new Map(personLinks.map((row) => [rowNumber(row, "fir_id"), rowText(row, "role") || "linked"]));
  const relatedFirs = firs
    .filter((row) => firRoles.has(rowNumber(row, "id")))
    .map((row) => ({ ...row, link_role: firRoles.get(rowNumber(row, "id")) }))
    .sort(byNewest);
  const firIds = new Set(relatedFirs.map((row) => rowNumber(row, "id")));
  const personArrests = arrests
    .filter((row) => rowNumber(row, "criminal_id") === wanted)
    .sort(byNewest);
  const personVehicles = vehicles.filter((row) => rowNumber(row, "owner_criminal_id") === wanted);
  const linkedEvidence = evidence
    .filter((row) => firIds.has(rowNumber(row, "fir_id")))
    .sort(byNewest)
    .slice(0, 25);
  return {
    criminal,
    firs: relatedFirs.slice(0, 50),
    arrests: personArrests.slice(0, 25),
    vehicles: personVehicles,
    evidence: linkedEvidence,
    counts: {
      firs: relatedFirs.length,
      arrests: personArrests.length,
      vehicles: personVehicles.length,
      evidence: linkedEvidence.length,
    },
    source: "catalyst-cloud-scale",
  };
}

async function plateIntelligence(app, value) {
  const plate = normalizePlate(value);
  if (!plate) return { plate: "", vehicle: null, intelligence: null, source: "none" };
  const cloudVehicles = await tableRows(app, "Vehicles", 5000);
  const registry = cloudVehicles.length ? cloudVehicles : DEMO_VEHICLE_REGISTRY;
  const vehicle = registry.find((row) => normalizePlate(rowText(row, "plate")) === plate) || null;
  const ownerId = vehicle && rowNumber(vehicle, "owner_criminal_id");
  return {
    plate,
    vehicle,
    intelligence: ownerId ? await criminalIntelligence(app, ownerId) : null,
    source: cloudVehicles.length ? "catalyst-cloud-scale" : "bundled-synthetic-demo-registry",
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function reportHtml(payload, actor) {
  const title = escapeHtml(String(payload.title || "NETRA Investigation Report").slice(0, 160));
  const turns = (Array.isArray(payload.turns) ? payload.turns : []).slice(-80);
  const content = turns.map((turn, index) => {
    const question = escapeHtml(String(turn.question || turn.q || "").slice(0, 5000));
    const answer = escapeHtml(String(turn.answer || (turn.insight && turn.insight.answer) || "").slice(0, 12000)).replace(/\n/g, "<br>");
    const auditId = escapeHtml(String(turn.audit_id || (turn.insight && turn.insight.explain && turn.insight.explain.audit_id) || ""));
    return `<section><div class="turn">Turn ${index + 1}${auditId ? ` | Audit ${auditId}` : ""}</div><h2>${question}</h2><p>${answer}</p></section>`;
  }).join("") || `<section><p>${escapeHtml(payload.summary || "No conversation turns were supplied.")}</p></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17202a;margin:0;padding:34px 42px;font-size:12px;line-height:1.55}
    header{border-bottom:3px solid #00695c;padding-bottom:14px;margin-bottom:24px}h1{font-size:22px;margin:0 0 5px}h2{font-size:14px;margin:5px 0 8px;color:#153f3b}
    .org{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#52606d}.meta,.turn{font-size:10px;color:#66788a}.conf{float:right;color:#a61b1b;border:1px solid #a61b1b;padding:4px 8px;font-weight:bold}
    section{border-bottom:1px solid #d9e1e8;padding:0 0 18px;margin:0 0 18px;page-break-inside:avoid}p{margin:0;white-space:normal}footer{font-size:9px;color:#687782;margin-top:24px;border-top:1px solid #d9e1e8;padding-top:10px}
  </style></head><body><header><span class="conf">CONFIDENTIAL</span><div class="org">NETRA | Karnataka State Police | State Crime Records Bureau</div><h1>${title}</h1><div class="meta">Generated ${escapeHtml(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} for ${escapeHtml(actor.full_name)} (${escapeHtml(actor.role_name || actor.role)})</div></header>${content}<footer>Generated through Catalyst SmartBrowz. AI output must be verified against cited source records before operational use.</footer></body></html>`;
}

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function generatePdf(context, payload) {
  const pdf = await streamBuffer(await context.app.smartbrowz().convertToPdf(reportHtml(payload, context.officer)));
  if (!pdf.length) throw new Error("SmartBrowz returned an empty PDF");
  const stamp = objectStamp();
  const name = safeFileName(payload.filename || `netra-report-${stamp}.pdf`, `netra-report-${stamp}.pdf`).replace(/\.[^.]+$/, "") + ".pdf";
  const key = `reports/${new Date().toISOString().slice(0, 10)}/${stamp}-${name}`;
  let storageRef = null;
  try {
    storageRef = await putObject(context.app, key, pdf, "application/pdf", {
      actor: String(context.officer.id).slice(0, 80),
      classification: "confidential",
    });
  } catch {
    // PDF download still succeeds if report archival is temporarily unavailable.
  }
  return { pdf: pdf.toString("base64"), mime: "application/pdf", filename: name, storage_ref: storageRef };
}

module.exports = {
  DATASTORE_TABLES,
  STRATUS_BUCKET,
  cacheGet,
  cacheKey,
  cachePut,
  createRequestContext,
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
};
