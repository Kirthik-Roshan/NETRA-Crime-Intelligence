#!/usr/bin/env node

import assert from "node:assert/strict";

const origin = (process.env.NETRA_LIVE_ORIGIN || "https://ksphacks-60080085094.development.catalystserverless.in").replace(/\/$/, "");
const functionUrl = process.env.NETRA_AI_FN_URL || `${origin}/server/ai_quickml/`;
const sessionCookie = process.env.NETRA_SESSION_COOKIE || "";
const authToken = process.env.NETRA_AUTH_TOKEN || "";
const requireData = process.env.REQUIRE_LIVE_DATA !== "false";
const routes = ["", "login", "dashboard", "assistant", "cases", "cases/record", "evidence", "criminals", "criminals/record", "analytics", "maps", "network", "predictions", "database", "reports", "admin", "settings", "investigations"];
const failures = [];
const warnings = [];

function pass(label, detail = "") {
  console.log(`PASS  ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, error) {
  const detail = String(error && error.message || error);
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label}: ${detail}`);
}

async function fetchWithTimeout(url, options = {}, timeout = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function call(body, timeout = 60000) {
  const headers = { "Content-Type": "text/plain" };
  if (sessionCookie) headers.Cookie = sessionCookie;
  if (authToken) headers.Authorization = authToken;
  const response = await fetchWithTimeout(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, timeout);
  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch { /* error below includes response text */ }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.error || payload.detail || text.slice(0, 180)}`);
  return payload;
}

console.log(`NETRA live release verification\nOrigin: ${origin}\nFunction: ${functionUrl}\n`);

try {
  const ping = await call({ mode: "ping" });
  assert.equal(ping.ok, true);
  pass("Function ping", `QuickML configuration ${ping.have?.project ? "present" : "incomplete"}`);
} catch (error) { fail("Function ping", error); }

for (const route of routes) {
  const pathname = route ? `/app/${route}/index.html` : "/app/index.html";
  try {
    const response = await fetchWithTimeout(`${origin}${pathname}`, { redirect: "manual" }, 30000);
    assert([200, 301, 302, 303, 307, 308].includes(response.status), `HTTP ${response.status}`);
  } catch (error) { fail(`Route ${pathname}`, error); }
}
if (!failures.some((item) => item.startsWith("Route "))) pass("Static direct-load routes", `${routes.length}/${routes.length}`);

let bundle = null;
let hasLiveData = false;
let verifiedAnalysis = null;
try {
  bundle = await call({
    mode: "records:bundle",
    tables: ["Firs", "Cases", "Criminals", "FirCriminals", "Victims", "Complainants", "Relationships", "PoliceStations", "Chargesheets"],
    max: 5000,
    refresh: true,
  });
  assert.equal(bundle.source, "ksp-er-read-model");
  assert.equal(bundle.read_model, "ksp-er-v2");
  const counts = Object.fromEntries(Object.entries(bundle.tables || {}).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0]));
  hasLiveData = Number(counts.Firs) > 0 && Number(counts.Criminals) > 0;
  if (requireData) {
    for (const table of ["Firs", "Cases", "Criminals", "Victims", "Complainants", "Relationships", "PoliceStations", "Chargesheets"]) {
      assert(counts[table] > 0, `${table} returned no rows`);
    }
  }
  pass("Official-schema read model", Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", "));
} catch (error) { fail("Official-schema read model", error); }

try {
  const health = await call({ mode: "infra:health" });
  assert.equal(health.ok, true);
  assert.equal(health.services?.datastore, true);
  assert.equal(health.read_model, "ksp-er-v2");
  if (!health.services?.search) warnings.push("Catalyst Search did not report an active index; deterministic Cloud Scale retrieval remains available.");
  pass("Catalyst service health", `Search=${Boolean(health.services?.search)}, QuickML=${Boolean(health.services?.quickml)}, AutoML=${health.services?.automl}`);
} catch (error) { fail("Catalyst service health", error); }

if (hasLiveData) {
  try {
    const result = await call({ mode: "rag", query: "Show all crime patterns by district", language: "en", history: [] });
    verifiedAnalysis = result.analysis;
    assert.equal(verifiedAnalysis?.version, "track1-v1", "deploy the matching Track 1 Function revision");
    assert.equal(verifiedAnalysis.total, bundle.tables.Firs.length, "analysis must count the complete FIR selection");
    assert.equal(verifiedAnalysis.rows.reduce((sum, row) => sum + row.count, 0), verifiedAnalysis.total);
    assert.equal(verifiedAnalysis.sources.length, verifiedAnalysis.total);
    assert.equal(result.confidence, null, "deterministic counts must not be presented as model confidence");
    const mapped = await call({ mode: "rag", query: "Show these FIRs on a map", analysis_context: verifiedAnalysis.context });
    assert.equal(mapped.analysis?.total, verifiedAnalysis.total);
    assert.equal(mapped.analysis.context.view, "map");
    assert.deepEqual(mapped.analysis.sources, verifiedAnalysis.sources, "switching views must preserve the FIR selection");
    const warning = await call({ mode: "rag", query: "What changed in this scope over the last 30 days? Show early warnings", analysis_context: verifiedAnalysis.context });
    assert(warning.analysis?.periods, "the warning control must return explicit comparison windows");
    assert(warning.analysis.warnings.some(text => text.includes("Descriptive early-warning rule")));
    pass("Track 1 conversational analysis", `${verifiedAnalysis.total} source-backed FIRs; chart/map scope retained; dated warning windows`);
  } catch (error) { fail("Track 1 conversational analysis", error); }
  try {
    const ids = bundle.tables.Firs.slice(0, 2).map(row => Number(row.id));
    assert.equal(ids.length, 2, "at least two FIRs are needed for the workbench check");
    const comparison = await call({ mode: "investigation:analyze", case_ids: ids, question: "Could these incidents be connected?", observations: [], exclusions: [] });
    assert.equal(comparison.analysis?.cases.length, 2);
    assert(comparison.analysis.sources.length >= 2, "the comparison must retain the selected FIR sources");
    assert(comparison.analysis.findings.every(finding => finding.source_ids.every(id => comparison.analysis.sources.some(source => source.id === id))), "every finding must resolve to its source records");
    assert.equal(typeof comparison.analysis.source_fingerprint, "string");
    const saved = await call({ mode: "investigation:list" });
    assert(Array.isArray(saved.rows), "the Stratus investigation archive must be readable");
    pass("Investigation comparison and archive", `${comparison.analysis.sources.length} sources, ${saved.rows.length} saved investigations`);
  } catch (error) { fail("Investigation comparison and archive", error); }
  try {
    const search = await call({ mode: "search:records", query: "Imran Reddy", max: 12 });
    assert(Array.isArray(search.hits));
    assert(search.hits.length > 0, "person search returned no records");
    pass("Grounded record search", `${search.hits.length} hits via ${search.engine}`);
  } catch (error) { fail("Grounded record search", error); }

  try {
    const first = await call({ mode: "rag", query: "Show the criminal history of Imran Reddy", language: "en", history: [] }, 90000);
    assert.match(String(first.answer || ""), /Imran Reddy|104\d{12,15}/i);
    assert(Array.isArray(first.sources) && first.sources.length > 0, "first answer has no source records");
    const history = [
      { role: "user", content: "Show the criminal history of Imran Reddy" },
      { role: "assistant", content: first.answer },
    ];
    const followUp = await call({ mode: "rag", query: "Who were the victims in those cases?", language: "en", history }, 90000);
    assert.match(String(followUp.answer || ""), /victim|linked/i);
    assert(Array.isArray(followUp.sources) && followUp.sources.some((source) => /Victims|Firs|Criminals/.test(String(source.title))), "follow-up has no relational source");
    pass("Contextual RAG", `${first.sources.length} initial sources, ${followUp.sources.length} follow-up sources`);
  } catch (error) { fail("Contextual RAG", error); }
} else if (!requireData) {
  warnings.push("Data-grounded Search, contextual RAG and accused dossier checks were skipped because this environment has no FIR/Accused rows.");
}

try {
  const financial = await call({ mode: "rag", query: "Trace the bank accounts and transaction money trail", language: "en", history: [] }, 60000);
  assert.match(String(financial.answer || ""), /official 28-table KSP schema/i);
  assert.match(String(financial.answer || ""), /does not infer a money trail/i);
  pass("Financial-data guardrail", "unsupported account-level claims are blocked");
} catch (error) { fail("Financial-data guardrail", error); }

try {
  const greeting = await call({ mode: "rag", query: "hi", history: [] });
  assert.equal(greeting.response_kind, "conversation");
  assert.deepEqual(greeting.sources, []);
  assert.equal(greeting.confidence, null);
  pass("Conversational greeting", "no case retrieval or invented confidence");
} catch (error) { fail("Conversational greeting", error); }

try {
  const report = await call({
    mode: "report:pdf",
    title: "NETRA Release Verification",
    turns: [{ question: "What data supports this result?", answer: "Official KSP schema-aligned synthetic Cloud Scale records.", ...(verifiedAnalysis ? { analysis: verifiedAnalysis } : {}) }],
  }, 90000);
  const bytes = Buffer.from(String(report.pdf || ""), "base64");
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  pass("SmartBrowz PDF export", `${bytes.length} bytes${report.storage_ref ? ", archived in Stratus" : ""}`);
} catch (error) { fail("SmartBrowz PDF export", error); }

if (bundle?.tables?.Criminals?.[0]) {
  try {
    const detail = await call({ mode: "record:criminal", id: bundle.tables.Criminals[0].id });
    assert(detail.criminal);
    assert(Number(detail.counts?.firs) > 0, "profile has no linked FIRs");
    pass("Accused relational dossier", `${detail.counts.firs} FIRs, ${detail.counts.victims} victims, ${detail.counts.stations} stations`);
  } catch (error) { fail("Accused relational dossier", error); }
}

for (const warning of warnings) console.warn(`WARN  ${warning}`);
if (failures.length) {
  console.error(`\nLive release verification failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nNETRA live release verification passed.");
