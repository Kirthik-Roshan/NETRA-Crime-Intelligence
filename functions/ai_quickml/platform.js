'use strict';

const catalyst = require("zcatalyst-sdk-node");
const crypto = require("crypto");
const path = require("path");
const {
  KSP_ER_TABLES,
  KSP_READ_MODEL_VERSION,
  KSP_VIRTUAL_TABLES,
  buildKspReadModel,
  dependenciesForViews,
} = require("./ksp-read-model");

const STRATUS_BUCKET = process.env.STRATUS_BUCKET || "ksp-netra";
const EVIDENCE_TABLE = process.env.EVIDENCE_TABLE || "Evidence";
const MAX_IMAGE_BYTES = Math.min(10, Math.max(1, Number(process.env.MAX_IMAGE_MB) || 6)) * 1024 * 1024;
const MAX_VIDEO_BYTES = Math.min(12, Math.max(2, Number(process.env.MAX_VIDEO_MB) || 8)) * 1024 * 1024;

// Synthetic reference registry used only to bridge evidence such as an ANPR
// observation to organizer-schema accused and CaseMaster records.
const SYNTHETIC_VEHICLE_REGISTRY = {
  KA03AB7161: {
    id: 41,
    plate: "KA-03-AB-7161",
    make: "Maruti",
    model: "Swift",
    color: "Red",
    type: "car",
    owner_criminal_id: 66,
    fir_numbers: ["104060011202600001", "104060011202600004"],
  },
};

// Evidence, OCR output, and notifications are application-owned records rather
// than a second crime database. Every core investigative view is derived from
// the 28 organizer-specified tables above.
const PLATFORM_TABLES = ["Evidence", "Notifications", "OcrResult"];

const configuredTables = String(process.env.DATASTORE_TABLES || "")
  .split(",")
  .map((table) => table.trim())
  .filter((table) => KSP_ER_TABLES.includes(table) || PLATFORM_TABLES.includes(table));
const DATASTORE_TABLES = [...new Set([
  ...KSP_ER_TABLES,
  ...KSP_VIRTUAL_TABLES,
  ...PLATFORM_TABLES,
  ...configuredTables,
])];

const DEFAULT_SEARCH_COLUMNS = {
  CaseMaster: ["CrimeNo", "CaseNo", "BriefFacts"],
  Accused: ["AccusedName", "PersonID"],
  ComplainantDetails: ["ComplainantName"],
  Victim: ["VictimName"],
  CrimeSubHead: ["CrimeHeadName"],
  Unit: ["UnitName"],
  District: ["DistrictName"],
  Evidence: ["type", "description", "storage_ref"],
};

const DEFAULT_SELECT_COLUMNS = {
  CaseMaster: ["ROWID", "CaseMasterID", "CrimeNo", "CaseNo", "CrimeRegisteredDate", "IncidentFromDate", "InfoReceivedPSDate", "BriefFacts", "latitude", "longitude"],
  Accused: ["ROWID", "AccusedMasterID", "CaseMasterID", "AccusedName", "AgeYear", "GenderID", "PersonID"],
  ComplainantDetails: ["ROWID", "ComplainantID", "CaseMasterID", "ComplainantName", "AgeYear", "GenderID"],
  Victim: ["ROWID", "VictimMasterID", "CaseMasterID", "VictimName", "AgeYear", "GenderID"],
  CrimeSubHead: ["ROWID", "CrimeSubHeadID", "CrimeHeadID", "CrimeHeadName"],
  Unit: ["ROWID", "UnitID", "UnitName", "DistrictID", "TypeID"],
  District: ["ROWID", "DistrictID", "DistrictName"],
  Evidence: ["ROWID", "id", "fir_id", "type", "description", "collected_at", "storage_ref"],
};

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
  if (["investigation_officer", "investigating_officer", "officer", "app_user", "user"].includes(value)) return "investigation_officer";
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
  // Authenticate with the caller's credential, but perform the Function's
  // allowlisted service operations with its server credential. Catalyst Data
  // Store row methods otherwise force the caller scope and reject evidence
  // writes for normal officer roles even after our role checks pass.
  const userApp = catalyst.initialize(req, { scope: "user", appName: "netra-user" });
  let officer = null;
  let authError = null;
  try {
    officer = publicUser(await userApp.userManagement().getCurrentUser());
  } catch (error) {
    authError = error;
  }
  if (authRequired(req) && !officer) {
    const error = new Error("Catalyst user authentication required");
    error.statusCode = 401;
    error.cause = authError;
    throw error;
  }
  let app = userApp;
  try {
    app = catalyst.initialize(req, { scope: "admin", appName: "netra-server" });
  } catch {
    // Local emulation can omit the server credential; user-scoped reads still
    // keep Development usable while hosted Functions always supply it.
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

function decodeVideo(value, suppliedMime, suppliedName) {
  const input = String(value || "");
  const match = input.match(/^data:([^;,]+);base64,(.*)$/s);
  const mime = String((match && match[1]) || suppliedMime || "video/mp4").toLowerCase();
  const allowed = new Set(["video/mp4", "video/webm", "video/quicktime"]);
  if (!allowed.has(mime)) {
    const error = new Error("Only MP4, WebM, and MOV CCTV clips are supported");
    error.statusCode = 415;
    throw error;
  }
  const encoded = (match && match[2]) || input;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) {
    const error = new Error("A valid base64 CCTV clip is required");
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > MAX_VIDEO_BYTES) {
    const error = new Error(`CCTV clip must be ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB or smaller`);
    error.statusCode = 413;
    throw error;
  }
  const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
  const requested = safeFileName(suppliedName, `cctv-evidence.${ext}`);
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

async function linkEvidenceToCase(app, options) {
  const firId = Number(options.firId);
  if (!Number.isSafeInteger(firId) || firId <= 0) {
    const error = new Error("A valid CaseMaster identifier is required");
    error.statusCode = 400;
    throw error;
  }

  let rowId = String(options.recordId || "").trim();
  const evidenceId = Number(options.evidenceId);
  if (!rowId && Number.isSafeInteger(evidenceId) && evidenceId > 0) {
    const rows = await tableRows(app, EVIDENCE_TABLE, 5000);
    const record = rows.find((row) => rowNumber(row, "id") === evidenceId);
    rowId = String(record && (record.ROWID || record.rowid) || "").trim();
  }
  if (!rowId) {
    const error = new Error("The evidence record could not be located for FIR linkage");
    error.statusCode = 404;
    throw error;
  }

  await app.datastore().table(EVIDENCE_TABLE).updateRow({ ROWID: rowId, fir_id: firId });
  return { record_id: rowId, evidence_id: evidenceId || null, fir_id: firId };
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

async function listAudits(app, max = 50, actorId = null) {
  const limit = Math.min(200, Math.max(1, Number(max) || 50));
  const bucket = app.stratus().bucket(STRATUS_BUCKET);
  const records = []; let token;
  for (let pageNumber = 0; pageNumber < 20 && records.length < limit; pageNumber++) {
    const page = await bucket.listPagedObjects({ prefix: "audit/", maxKeys: "100", orderBy: "desc", ...(token ? { continuationToken: token } : {}) });
    const objects = [...((page && page.contents) || [])]
      .map((item) => ({ key: item.key || (item.keyDetails && item.keyDetails.key) || "", modified: item.last_modified || "" }))
      .filter((item) => item.key.endsWith(".json"))
      .sort((a, b) => String(b.key).localeCompare(String(a.key)))
      .slice(0, 100);
    const loaded = await Promise.all(objects.map(async (item) => {
      return JSON.parse((await streamBuffer(await bucket.getObject(item.key))).toString("utf8"));
    }));
    records.push(...loaded.filter(row => row && (!actorId || String(row.actor?.id) === String(actorId))));
    const next = page.next_continuation_token;
    if (String(page.truncated) === 'true' && (!next || token === next)) throw new Error('Incomplete audit archive page');
    token = String(page.truncated) === 'true' ? next : null;
    if (!token) break;
  }
  return records.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))).slice(0, limit);
}

function searchTerms(query) {
  const ignored = new Set(["what", "which", "where", "when", "about", "with", "from", "have", "show", "tell", "give", "crime", "case", "cases", "please"]);
  return [...new Set((String(query || "").toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || []).filter((term) => !ignored.has(term)))].slice(0, 12);
}

async function boundedScan(context, query, max) {
  const wanted = searchTerms(query);
  if (!wanted.length) return [];
  const searchViews = [
    "Firs", "Cases", "Criminals", "Victims", "Complainants", "Arrests",
    "Chargesheets", "PoliceStations",
  ];
  const views = await readKspViews(context.app, searchViews);
  const hits = [];
  for (const table of searchViews) {
    for (const row of views[table] || []) {
      const searchable = Object.entries(row)
        .filter(([key]) => !["CREATORID", "MODIFIEDTIME", "CREATEDTIME"].includes(key))
        .map(([, item]) => String(item == null ? "" : item)).join(" ").toLowerCase();
      const score = wanted.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      if (score) hits.push({ table, score, row });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, max);
}

async function searchRecords(context, query, max = 24) {
  const limit = Math.min(50, Math.max(1, Number(max) || 24));
  const key = cacheKey("search", `${KSP_READ_MODEL_VERSION}|${context.officer.id}|${context.officer.role}|${query}|${limit}`);
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
    engine = "ksp-relational-scan";
    warning = "Catalyst Search indexes are unavailable; NETRA searched the official KSP relationships directly.";
  }
  const relationalHits = await boundedScan(context, query, limit);
  if (relationalHits.length) {
    hits = relationalHits;
    engine = engine === "catalyst-search"
      ? "catalyst-search+ksp-relational"
      : "ksp-relational-scan";
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

async function readKspViews(app, views, options = {}) {
  const requested = [...new Set(views.filter((view) => KSP_VIRTUAL_TABLES.includes(view)))];
  const dependencies = dependenciesForViews(requested);
  const entries = await Promise.all(dependencies.map(async (table) => [
    table,
    await tableRows(app, table, 5000, (options.requiredTables || []).includes(table), !!options.requireComplete),
  ]));
  const model = buildKspReadModel(Object.fromEntries(entries));
  return Object.fromEntries(requested.map((view) => [view, model[view] || []]));
}

async function listRows(context, table, max, refresh = false) {
  if (!DATASTORE_TABLES.includes(table)) {
    const error = new Error("Table is not available through the NETRA API");
    error.statusCode = 403;
    throw error;
  }
  const requested = Math.min(5000, Math.max(1, Number(max) || 50));
  const key = cacheKey("rows", `${KSP_READ_MODEL_VERSION}|${context.officer.id}|${context.officer.role}|${table}|${requested}`);
  if (!refresh) {
    const cached = await cacheGet(context.app, key);
    if (cached && Array.isArray(cached.rows)) return { rows: dedupeTableRows(table, cached.rows), cache: true };
  }

  if (KSP_VIRTUAL_TABLES.includes(table)) {
    const views = await readKspViews(context.app, [table]);
    const value = {
      rows: dedupeTableRows(table, views[table] || []).slice(0, requested),
      cache: false,
      source: "ksp-er-read-model",
    };
    await cachePut(context.app, key, value, 1);
    return value;
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

async function physicalRowCount(app, table) {
  try {
    const result = await app.zcql().executeZCQLQuery(
      `SELECT COUNT(ROWID) AS NETRA_COUNT FROM ${table}`,
    );
    const first = result && result[0] || {};
    const values = first[table] || first;
    const count = Number(values.NETRA_COUNT ?? values["COUNT(ROWID)"]);
    if (Number.isFinite(count)) return count;
  } catch {
    // Older projects can disable ZCQL; retain a bounded-memory page fallback.
  }

  let total = 0;
  let nextToken;
  const dsTable = app.datastore().table(table);
  do {
    const page = await dsTable.getPagedRows({ nextToken, maxRows: 300 });
    total += ((page && page.data) || []).length;
    nextToken = page && page.next_token;
  } while (nextToken);
  return total;
}

async function countRows(context, tables, refresh = false) {
  const requested = [...new Set((Array.isArray(tables) ? tables : DATASTORE_TABLES).map(String))];
  if (requested.some((table) => !DATASTORE_TABLES.includes(table))) {
    const error = new Error("One or more tables are not available through the NETRA API");
    error.statusCode = 403;
    throw error;
  }
  const key = cacheKey("row-counts", `${KSP_READ_MODEL_VERSION}|${context.officer.id}|${context.officer.role}|${requested.join(",")}`);
  if (!refresh) {
    const cached = await cacheGet(context.app, key);
    if (cached && cached.counts) return cached;
  }

  const counts = {};
  const unavailable = [];
  const virtualTables = requested.filter((table) => KSP_VIRTUAL_TABLES.includes(table));
  if (virtualTables.length) {
    const views = await readKspViews(context.app, virtualTables);
    for (const table of virtualTables) counts[table] = (views[table] || []).length;
  }
  const physicalTables = requested.filter((table) => !KSP_VIRTUAL_TABLES.includes(table));
  let cursor = 0;
  const worker = async () => {
    while (cursor < physicalTables.length) {
      const table = physicalTables[cursor++];
      try {
        counts[table] = await physicalRowCount(context.app, table);
      } catch {
        counts[table] = null;
        unavailable.push(table);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, physicalTables.length) }, worker));
  const value = { counts, unavailable };
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

async function tableRows(app, table, max = 5000, required = false, requireComplete = false) {
  const rows = [];
  let nextToken;
  try {
    const dsTable = app.datastore().table(table);
    do {
      const page = await dsTable.getPagedRows({ nextToken, maxRows: Math.min(300, max - rows.length) });
      rows.push(...((page && page.data) || []));
      if (requireComplete && ((page?.more_records && !page.next_token) || (nextToken && page?.next_token === nextToken) || (rows.length >= max && (page?.more_records || page?.next_token)))) {
        throw new Error(`Incomplete source ${table}: paging or interactive record limit reached`);
      }
      nextToken = page && page.next_token;
    } while (nextToken && rows.length < max);
  } catch (cause) {
    if (required || requireComplete) {
      throw Object.assign(new Error(
        `Cloud Scale could not read required source table ${table}. Check this environment's table, schema and Function permissions.`
      ), { statusCode: 502, cause });
    }
    return [];
  }
  return dedupeTableRows(table, rows).slice(0, max);
}

function byNewest(a, b) {
  const aDate = Date.parse(rowText(a, "occurred_at", "arrested_at", "collected_at", "CREATEDTIME"));
  const bDate = Date.parse(rowText(b, "occurred_at", "arrested_at", "collected_at", "CREATEDTIME"));
  return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
}

function caseDecisionSupport({ caseRow, fir, cases, firs, suspects, arrests, chargesheets, allChargesheets = chargesheets, evidence }) {
  const currentId = rowNumber(fir, "id");
  const caseById = new Map(cases.map((row) => [rowNumber(row, "id"), row]));
  const chargesheetsByFir = new Map();
  for (const row of allChargesheets) {
    const firId = rowNumber(row, "fir_id");
    const list = chargesheetsByFir.get(firId) || [];
    list.push(row);
    chargesheetsByFir.set(firId, list);
  }
  const modusTokens = (value) => new Set(String(value || "").toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  const currentModus = modusTokens(rowText(fir, "modus", "description"));
  const similarities = firs.flatMap((candidate) => {
    const id = rowNumber(candidate, "id");
    if (!id || id === currentId) return [];
    let score = 0;
    const reasons = [];
    if (rowText(candidate, "crime_type") === rowText(fir, "crime_type")) {
      score += 45;
      reasons.push("same offence type");
    }
    const candidateModus = modusTokens(rowText(candidate, "modus", "description"));
    const sharedModus = [...currentModus].filter((token) => candidateModus.has(token));
    if (sharedModus.length) {
      score += Math.min(25, 10 + sharedModus.length * 5);
      reasons.push(`shared modus indicator: ${sharedModus.slice(0, 3).join(", ")}`);
    }
    if (rowText(candidate, "district") === rowText(fir, "district")) {
      score += 18;
      reasons.push("same district");
    }
    if (rowNumber(candidate, "station_id") && rowNumber(candidate, "station_id") === rowNumber(fir, "station_id")) {
      score += 8;
      reasons.push("same police station");
    }
    if (score < 35) return [];
    const relatedCase = caseById.get(id) || {};
    const candidateChargesheets = chargesheetsByFir.get(id) || [];
    const status = rowText(candidate, "status") || rowText(relatedCase, "status");
    const outcome = candidateChargesheets.length
      ? `Chargesheet filed (${rowText(candidateChargesheets[0], "final_report", "cstype") || "type not recorded"})`
      : status ? status.replace(/_/g, " ") : "Outcome not recorded";
    return [{
      ...relatedCase,
      id,
      fir_number: rowText(candidate, "fir_number"),
      case_number: rowText(relatedCase, "case_number") || rowText(candidate, "case_number"),
      title: rowText(relatedCase, "title") || `${rowText(candidate, "crime_type")} - ${rowText(candidate, "district")}`,
      crime_type: rowText(candidate, "crime_type"),
      district: rowText(candidate, "district"),
      occurred_at: rowText(candidate, "occurred_at"),
      similarity_score: Math.min(100, score),
      match_reasons: reasons,
      outcome,
    }];
  }).sort((left, right) => Number(right.similarity_score) - Number(left.similarity_score) || byNewest(left, right)).slice(0, 6);

  const timeline = [];
  const addEvent = (date, type, label, source, recordId = "") => {
    if (!String(date || "").trim()) return;
    timeline.push({ date: String(date), type, label, source, record_id: String(recordId || "") });
  };
  addEvent(rowText(fir, "occurred_at"), "incident", "Incident window began", "Inv_OccuranceTime / CaseMaster", currentId);
  addEvent(rowText(fir, "reported_at"), "registered", "FIR registered and information received", "CaseMaster", currentId);
  for (const row of arrests) {
    addEvent(rowText(row, "arrested_at"), "custody", `${rowText(row, "arrest_type") || "Arrest/surrender"} recorded`, "ArrestSurrender", rowNumber(row, "id"));
  }
  for (const row of chargesheets) {
    addEvent(rowText(row, "csdate"), "chargesheet", `${rowText(row, "final_report", "cstype") || "Chargesheet"} filed`, "ChargesheetDetails", rowNumber(row, "id"));
  }
  for (const row of evidence) {
    addEvent(rowText(row, "collected_at", "CREATEDTIME"), "evidence", `${rowText(row, "type") || "Evidence"} added`, "NETRA Evidence / Stratus", rowNumber(row, "id", "ROWID"));
  }
  timeline.sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  const leads = [];
  const repeatSuspects = suspects.filter((row) => rowNumber(row, "fir_count") > 1);
  if (repeatSuspects.length) {
    leads.push({
      priority: "high",
      title: "Review repeat-accused histories",
      rationale: `${repeatSuspects.length} linked accused profile${repeatSuspects.length === 1 ? " has" : "s have"} multiple official FIR associations. Compare their prior locations, co-accused and modus before drawing a conclusion.`,
      evidence: repeatSuspects.slice(0, 4).map((row) => `${rowText(row, "name")} (${rowNumber(row, "fir_count")} FIRs)`),
    });
  }
  if (similarities.length) {
    leads.push({
      priority: "medium",
      title: "Compare the strongest similar cases",
      rationale: `${similarities.length} prior case${similarities.length === 1 ? "" : "s"} share offence, modus or geography signals. Review outcomes and assigned records for transferable leads.`,
      evidence: similarities.slice(0, 4).map((row) => `${row.fir_number} (${row.similarity_score}% match)`),
    });
  }
  if (suspects.length > arrests.length) {
    leads.push({
      priority: "medium",
      title: "Resolve custody-record coverage",
      rationale: `${suspects.length} accused profile${suspects.length === 1 ? " is" : "s are"} linked while ${arrests.length} custody action${arrests.length === 1 ? " is" : "s are"} recorded for this FIR. Verify whether the remaining status is pending or recorded elsewhere.`,
      evidence: suspects.slice(0, 4).map((row) => rowText(row, "name")).filter(Boolean),
    });
  }
  if (!evidence.length) {
    leads.push({
      priority: "medium",
      title: "Attach verifiable evidence records",
      rationale: "No NETRA evidence object is linked to this FIR. Preserve approved source media and correlate it to the official case before relying on an AI match.",
      evidence: [rowText(fir, "fir_number")].filter(Boolean),
    });
  }
  if (!chargesheets.length && rowText(caseRow, "status") !== "closed") {
    leads.push({
      priority: "low",
      title: "Review chargesheet readiness",
      rationale: "No ChargesheetDetails row is linked. Review investigation completeness and the official case status; NETRA does not infer filing readiness.",
      evidence: [rowText(fir, "fir_number")].filter(Boolean),
    });
  }

  const summary = `${rowText(fir, "crime_type") || "Case"} registered as FIR ${rowText(fir, "fir_number") || "not recorded"} ` +
    `at ${rowText(fir, "station_name") || "an unrecorded station"}, ${rowText(fir, "district") || "district not recorded"}. ` +
    `The official joins show ${suspects.length} accused, ${arrests.length} custody action${arrests.length === 1 ? "" : "s"}, ` +
    `${evidence.length} linked evidence item${evidence.length === 1 ? "" : "s"}, and ${chargesheets.length} chargesheet record${chargesheets.length === 1 ? "" : "s"}.`;
  return { summary, timeline, similarities, leads: leads.slice(0, 4) };
}

async function criminalIntelligence(app, criminalId) {
  const wanted = Number(criminalId);
  if (!Number.isSafeInteger(wanted) || wanted <= 0) return null;
  const [views, evidence] = await Promise.all([
    readKspViews(app, [
      "Criminals", "FirCriminals", "Firs", "Arrests", "Relationships",
      "Victims", "Complainants", "Chargesheets", "PoliceStations",
    ]),
    tableRows(app, EVIDENCE_TABLE, 5000),
  ]);
  const criminals = views.Criminals || [];
  const links = views.FirCriminals || [];
  const firs = views.Firs || [];
  const arrests = views.Arrests || [];
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
  const linkedEvidence = evidence
    .filter((row) => firIds.has(rowNumber(row, "fir_id")))
    .sort(byNewest)
    .slice(0, 25);
  const relatedVictims = (views.Victims || []).filter((row) => firIds.has(rowNumber(row, "fir_id")));
  const relatedComplainants = (views.Complainants || []).filter((row) => firIds.has(rowNumber(row, "fir_id")));
  const relatedChargesheets = (views.Chargesheets || []).filter((row) => firIds.has(rowNumber(row, "fir_id"))).sort(byNewest);
  const stationIds = new Set(relatedFirs.map((row) => rowNumber(row, "station_id")).filter(Boolean));
  const relatedStations = (views.PoliceStations || []).filter((row) => stationIds.has(rowNumber(row, "id")));
  const relationships = (views.Relationships || []).filter((row) => (
    rowText(row, "source_type") === "criminal" && rowNumber(row, "source_id") === wanted
  ) || (
    rowText(row, "target_type") === "criminal" && rowNumber(row, "target_id") === wanted
  ));
  const profileById = new Map(criminals.map((row) => [rowNumber(row, "id"), row]));
  const associates = relationships.flatMap((row) => {
    const sourceId = rowNumber(row, "source_id");
    const targetId = rowNumber(row, "target_id");
    const otherId = sourceId === wanted ? targetId : sourceId;
    const otherType = sourceId === wanted ? rowText(row, "target_type") : rowText(row, "source_type");
    const profile = otherType === "criminal" ? profileById.get(otherId) : null;
    return profile ? [{
      ...profile,
      rel_type: rowText(row, "rel_type") || "co_accused",
      confidence: Number(row.confidence) || 0,
      frequency: rowNumber(row, "frequency") || 1,
    }] : [];
  }).filter((row, index, all) => all.findIndex((item) => rowNumber(item, "id") === rowNumber(row, "id")) === index)
    .sort((a, b) => Number(b.confidence) - Number(a.confidence));
  return {
    criminal,
    firs: relatedFirs.slice(0, 50),
    arrests: personArrests.slice(0, 25),
    vehicles: [],
    evidence: linkedEvidence,
    victims: relatedVictims,
    complainants: relatedComplainants,
    chargesheets: relatedChargesheets,
    stations: relatedStations,
    relationships,
    associates,
    counts: {
      firs: relatedFirs.length,
      arrests: personArrests.length,
      vehicles: 0,
      evidence: linkedEvidence.length,
      victims: relatedVictims.length,
      complainants: relatedComplainants.length,
      chargesheets: relatedChargesheets.length,
      stations: relatedStations.length,
    },
    source: "ksp-er-read-model",
  };
}

async function caseIntelligence(app, caseId) {
  const wanted = Number(caseId);
  if (!Number.isSafeInteger(wanted) || wanted <= 0) return null;
  const [views, evidence] = await Promise.all([
    readKspViews(app, [
      "Cases", "Firs", "Criminals", "FirCriminals", "Victims",
      "Complainants", "Arrests", "Chargesheets",
    ]),
    tableRows(app, EVIDENCE_TABLE, 5000),
  ]);
  const caseRow = (views.Cases || []).find((row) => rowNumber(row, "id") === wanted);
  const fir = (views.Firs || []).find((row) => rowNumber(row, "id") === wanted);
  if (!caseRow || !fir) return null;
  const profiles = new Map((views.Criminals || []).map((row) => [rowNumber(row, "id"), row]));
  const links = (views.FirCriminals || []).filter((row) => rowNumber(row, "fir_id") === wanted);
  const suspects = links.flatMap((link) => {
    const profile = profiles.get(rowNumber(link, "criminal_id"));
    return profile ? [{ ...profile, role: rowText(link, "role") || "accused" }] : [];
  });
  const forCase = (rows) => rows.filter((row) => rowNumber(row, "fir_id") === wanted);
  const victims = forCase(views.Victims || []);
  const complainants = forCase(views.Complainants || []);
  const caseArrests = forCase(views.Arrests || []).sort(byNewest);
  const caseChargesheets = forCase(views.Chargesheets || []).sort(byNewest);
  const caseEvidence = forCase(evidence).sort(byNewest).slice(0, 50);
  const decision = caseDecisionSupport({
    caseRow,
    fir,
    cases: views.Cases || [],
    firs: views.Firs || [],
    suspects,
    arrests: caseArrests,
    chargesheets: caseChargesheets,
    allChargesheets: views.Chargesheets || [],
    evidence: caseEvidence,
  });
  return {
    case: caseRow,
    fir,
    suspects,
    victims,
    complainants,
    arrests: caseArrests,
    chargesheets: caseChargesheets,
    evidence: caseEvidence,
    related: decision.similarities,
    decision_summary: decision.summary,
    timeline: decision.timeline,
    leads: decision.leads,
    source: "ksp-er-read-model",
  };
}

async function plateIntelligence(app, value, selectedCaseId) {
  const plate = normalizePlate(value);
  if (!plate) return { plate: "", vehicle: null, intelligence: null, source: "none" };
  const views = await readKspViews(app, ["Firs", "FirCriminals"]);
  const registryVehicle = SYNTHETIC_VEHICLE_REGISTRY[plate] || null;
  const ownerIntelligence = registryVehicle
    ? await criminalIntelligence(app, registryVehicle.owner_criminal_id)
    : null;
  const registryFirNumbers = new Set((registryVehicle && registryVehicle.fir_numbers) || []);
  const associatedFirs = (views.Firs || [])
    .filter((row) => registryFirNumbers.has(rowText(row, "fir_number")))
    .sort(byNewest);
  const registryFir = (views.Firs || []).find((row) => {
    const content = Object.values(row).map((item) => String(item || "")).join(" ");
    return plateCandidates(content).includes(plate);
  }) || null;
  const selectedId = Number(selectedCaseId);
  const selectedFir = Number.isSafeInteger(selectedId) && selectedId > 0
    ? (views.Firs || []).find((row) => rowNumber(row, "id") === selectedId) || null
    : null;
  const fir = registryFir || associatedFirs[0] || selectedFir;
  const link = fir && (views.FirCriminals || []).find((row) => rowNumber(row, "fir_id") === rowNumber(fir, "id"));
  const associatedProfileId = link && rowNumber(link, "criminal_id");
  const vehicle = fir || registryVehicle ? {
    ...(registryVehicle || {}),
    id: registryVehicle ? registryVehicle.id : rowNumber(fir, "id"),
    plate: registryVehicle ? registryVehicle.plate : plate,
    linked_fir_id: rowNumber(fir, "id"),
    linked_fir_number: rowText(fir, "fir_number"),
    record_basis: registryVehicle
      ? "Synthetic NETRA vehicle registry joined to official KSP CaseMaster and Accused records"
      : registryFir
      ? "Registration number mentioned in CaseMaster.BriefFacts"
      : "Plate captured as new evidence for the officer-selected CaseMaster record",
  } : null;
  if (vehicle) delete vehicle.fir_numbers;
  return {
    plate,
    vehicle,
    associated_firs: associatedFirs,
    duplicate_plate_observed: plate === "KA03AB7161",
    intelligence: ownerIntelligence || (associatedProfileId ? await criminalIntelligence(app, associatedProfileId) : null),
    source: registryVehicle
      ? "synthetic-vehicle-registry-ksp-er-join"
      : registryFir
      ? "ksp-er-case-record"
      : selectedFir
        ? "officer-linked-ksp-case"
        : "not-found-in-ksp-schema",
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function reportHtml(payload, actor, metadata = require('./report-template').reportMetadata()) {
  const turns = (Array.isArray(payload.turns) ? payload.turns : []).slice(-80);
  const content = turns.map((turn, index) => {
    const question = escapeHtml(String(turn.question || turn.q || "").slice(0, 5000));
    const answer = escapeHtml(String(turn.answer || (turn.insight && turn.insight.answer) || "").slice(0, 12000)).replace(/\n/g, "<br>");
    const auditId = escapeHtml(String(turn.audit_id || (turn.insight && turn.insight.explain && turn.insight.explain.audit_id) || ""));
    const attachments = require('./assistant-report').conversationAttachments(turn, { includeActivity: false, includeFirReferences: false });
    return `<section class="conversation-turn"><div class="turn-head"><span class="turn">ENTRY ${String(index + 1).padStart(2, '0')}</span><span class="meta">${auditId ? `Audit ${auditId}` : 'No audit reference supplied'}</span></div><div class="question"><span class="section-label">Question / subject</span><h2>${question}</h2></div><div class="answer-label">Recorded response</div><p>${answer}</p>${attachments}</section>`;
  }).join("") || `<section><p>${escapeHtml(payload.summary || "No conversation turns were supplied.")}</p></section>`;
  const sourceRegister = (Array.isArray(payload.source_register) ? payload.source_register : []).slice(0, 300)
    .map((source, index) => `<section><h2>Source ${index + 1}</h2><p>${escapeHtml(String(source).slice(0, 24000)).replace(/\n/g, "<br>")}</p></section>`).join("");
  const findingsRegister = (Array.isArray(payload.investigation_findings) ? payload.investigation_findings : []).slice(0, 600).map(finding => {
    const status = !finding.active ? "INACTIVE AFTER EXCLUSION" : finding.kind === "conflict" ? "CONFLICT" : "SUPPORT";
    return `<section><div class="turn">${status}</div><h2>${escapeHtml(String(finding.title || "").slice(0, 2000))}</h2><p>${escapeHtml(String(finding.detail || "").slice(0, 12000))}</p><p class="meta">Sources: ${escapeHtml((Array.isArray(finding.source_ids) ? finding.source_ids : []).slice(0, 300).join(", "))}</p></section>`;
  }).join("");
  let graph = "";
  if (payload.relationship_graph && Array.isArray(payload.relationship_graph.cases) && Array.isArray(payload.relationship_graph.findings)) {
    const cases = payload.relationship_graph.cases.slice(0, 6);
    const findings = payload.relationship_graph.findings.slice(0, 12);
    const height = Math.max(140, cases.length * 62, findings.length * 52);
    const yCase = index => 10 + index * (height - 52) / Math.max(1, cases.length - 1);
    const paths = findings.map((finding, index) => (finding.case_ids || []).map(id => {
      const caseIndex = cases.findIndex(row => Number(row.id) === Number(id));
      if (caseIndex < 0) return "";
      return `<path d="M195 ${yCase(caseIndex) + 20} C245 ${yCase(caseIndex) + 20},245 ${index * 52 + 30},290 ${index * 52 + 30}" fill="none" stroke="${!finding.active ? "#8899aa" : finding.kind === "conflict" ? "#cc2444" : "#0081c7"}" stroke-width="1.5"${finding.active ? "" : ' stroke-dasharray="4 3"'}/>`;
    }).join("")).join("");
    const caseNodes = cases.map((row, index) => `<g><rect x="5" y="${yCase(index)}" width="190" height="42" rx="4" fill="#eef7ff" stroke="#74b7dd"/><text x="13" y="${yCase(index) + 18}" font-size="11">${escapeHtml(row.fir_number || `FIR ${row.id}`)}</text><text x="13" y="${yCase(index) + 33}" font-size="9">${escapeHtml(String(row.title || "").slice(0, 34))}</text></g>`).join("");
    const findingNodes = findings.map((row, index) => `<g><rect x="290" y="${index * 52 + 10}" width="360" height="42" rx="4" fill="${row.kind === "conflict" ? "#fff2f4" : "#f2f8fc"}" stroke="#a9bacb"/><text x="300" y="${index * 52 + 26}" font-size="9">${row.active ? row.kind === "conflict" ? "CONFLICT" : "SUPPORT" : "EXCLUDED"}</text><text x="300" y="${index * 52 + 42}" font-size="10">${escapeHtml(String(row.title || "").slice(0, 62))}</text></g>`).join("");
    graph = `<section><h2>Relationship graph</h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${height + 10}" role="img" aria-label="Case evidence dependencies" style="width:100%;height:auto">${paths}${caseNodes}${findingNodes}</svg><p class="meta">${findings.length} of ${payload.relationship_graph.findings.length} findings shown. The finding list and source register retain every dependency.</p></section>`;
  }
  const appendix = turns.map((turn, index) => {
    const activity = Array.isArray(turn.activity) ? turn.activity.slice(0, 100) : [];
    if (!activity.length) return '';
    const audit = turn.audit_id || turn.insight?.explain?.audit_id;
    return `<section><h3>Entry ${String(index + 1).padStart(2, '0')} · ${escapeHtml(String(turn.question || turn.q || '').slice(0, 180))}</h3><p class="meta">${audit ? `Audit ${escapeHtml(audit)}` : 'No audit reference supplied'}</p>${require('./assistant-report').activityHtml(activity, false)}</section>`;
  }).join('');
  const firs = [...new Map(turns.flatMap(turn => Array.isArray(turn.analysis?.sources) ? turn.analysis.sources : []).map(row => [`${row.id}:${row.fir_number}`, row])).values()];
  const firRegister = firs.length ? `<section><h2>Consolidated FIR reference register</h2><p class="meta">Full references for the CaseMaster IDs listed in each analysis entry. Repeated references are printed once; no source has been discarded.</p><table><thead><tr><th>CaseMaster ID</th><th>FIR number</th><th>CaseMaster ID</th><th>FIR number</th></tr></thead><tbody>${Array.from({ length: Math.ceil(firs.length / 2) }, (_, index) => `<tr>${[firs[index * 2], firs[index * 2 + 1]].map(row => `<td>${row ? escapeHtml(row.id) : ''}</td><td>${row ? escapeHtml(row.fir_number) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : '';
  return require('./report-template').documentHtml(payload, actor, `${graph}${content}${findingsRegister}${sourceRegister}${firRegister}`, appendix, metadata);
}

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function generatePdf(context, payload, options = {}) {
  const metadata = require('./report-template').reportMetadata();
  const html = reportHtml(payload, context.officer, metadata);
  const template = require('./report-template').REPORT_TEMPLATE_VERSION;
  let pdf = null;
  if (!options.previewOnly) {
    try {
      pdf = await streamBuffer(await context.app.smartbrowz().convertToPdf(html, require('./report-template').pdfOptions(metadata)));
      if (pdf.subarray(0, 5).toString() !== '%PDF-') pdf = null;
    } catch { /* Archive the identical printable document instead. */ }
  }
  const format = pdf ? 'pdf' : 'html';
  const mime = pdf ? 'application/pdf' : 'text/html';
  const name = safeFileName(payload.filename || `netra-report-${objectStamp()}.${format}`, 'netra-report').replace(/\.[^.]+$/, '') + `.${format}`;
  const text = [payload.title, ...(payload.turns || []).map(turn => [turn.question || turn.q, turn.answer || turn.insight?.answer, turn.analysis?.scope,
    turn.analysis ? ['Group | FIRs', ...(turn.analysis.rows || []).map(row => `${row.label} | ${row.count}`)].join('\n') : '',
    turn.table ? [turn.table.columns.join(' | '), ...turn.table.rows.map(row => row.join(' | '))].join('\n') : '',
    turn.source_chart ? ['Category | Value', ...turn.source_chart.rows.map(row => `${row.label} | ${row.value}`)].join('\n') : '',
    ...(turn.sources || []).map(source => `${source.title}: ${source.snippet}`)].filter(Boolean).join('\n')), ...(payload.source_register || [])].filter(Boolean).join('\n\n');
  let file;
  try {
    file = await require('./file-library').saveLibraryFile(context, {
      kind: 'report', buffer: pdf || Buffer.from(html), mime, filename: name, title: payload.title, text,
      storageProvider: 'stratus', report_id: metadata.id, template_version: template,
      extraction: pdf ? 'NETRA generated PDF' : 'NETRA printable report',
    }, STRATUS_BUCKET);
  } catch {
    throw Object.assign(new Error('The report could not be saved to Saved reports. Retry the export when storage is available; no unarchived download was substituted.'), { statusCode: 503 });
  }
  return { ...(pdf ? { pdf: pdf.toString('base64') } : { html }), template_version: template, mime, filename: name,
    report_id: metadata.id, generated_at: metadata.generated_at, storage_ref: file.storage_ref, library_id: file.id,
    warning: !pdf && !options.previewOnly ? 'PDF conversion is unavailable. A printable copy is saved in Reports → Saved reports; choose Save as PDF in the print preview.' : null };
}

module.exports = {
  DATASTORE_TABLES,
  KSP_ER_TABLES,
  KSP_READ_MODEL_VERSION,
  KSP_VIRTUAL_TABLES,
  STRATUS_BUCKET,
  cacheGet,
  cacheKey,
  cachePut,
  caseDecisionSupport,
  createRequestContext,
  decodeImage,
  decodeVideo,
  generatePdf,
  reportHtml,
  listAudits,
  countRows,
  caseIntelligence,
  listRows,
  criminalIntelligence,
  normalizePlate,
  plateCandidates,
  plateIntelligence,
  linkEvidenceToCase,
  persistEvidence,
  publicUser,
  readKspViews,
  searchRecords,
  writeAudit,
};
