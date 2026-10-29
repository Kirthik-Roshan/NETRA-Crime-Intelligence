import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { KSP_ER_TABLES } = require("../functions/ai_quickml/ksp-read-model.js");
const { readKspViews } = require("../functions/ai_quickml/platform.js");
const db = new Database("data/netra.db", { readonly: true });
// Catalyst assigns ROWID metadata; the local schema fixture contains only official IDs.
const source = Object.fromEntries(KSP_ER_TABLES.map(table => [table, db.prepare(`SELECT * FROM "${table}"`).all().map((row, i) => ({ ...row, ROWID: `${table}-${i + 1}` }))]));
db.close();
const requiredTables = ["CaseMaster", "Victim", "ComplainantDetails"];
const requested = ["Victims", "Complainants", "Firs", "PoliceStations", "Relationships"];
let failedTable = "";
const app = { datastore: () => ({ table: table => ({ getPagedRows: async ({ nextToken, maxRows }) => {
  if (table === failedTable) throw new Error("Simulated source read failure");
  const rows = source[table] || [];
  const start = Number(nextToken || 0);
  return { data: rows.slice(start, start + maxRows), next_token: start + maxRows < rows.length ? String(start + maxRows) : undefined };
} }) }) };
const bundle = await readKspViews(app, requested, { requiredTables });
assert.equal(bundle.Victims.length, 564, "victim pages must not be lost");
assert.equal(bundle.Complainants.length, 662, "complainant pages must not be lost");
for (const table of requiredTables) {
  failedTable = table;
  await assert.rejects(() => readKspViews(app, requested, { requiredTables }), error => error.statusCode === 502 && error.message.includes(table));
}
failedTable = "Religion";
await assert.doesNotReject(() => readKspViews(app, requested, { requiredTables }), "optional sources retain existing tolerant behavior");

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
let refreshRequested;
const dimensionsModule = { exports: {}, require: name => {
  assert.equal(name, "./ai-client");
  return { listRecordBundle: async (tables, refresh) => {
    assert.deepEqual(Array.from(tables).sort(), [...requested].sort());
    refreshRequested = refresh;
    return bundle;
  } };
} };
vm.runInNewContext(transpile("../src/lib/cloudscale.ts"), dimensionsModule);
const dimensions = await dimensionsModule.exports.fetchIntelligenceDimensions();
assert.equal(refreshRequested, true, "demographic sources bypass cached empty bundles");
for (const key of ["victimGender", "victimAgeBands"]) {
  assert.equal(dimensions[key].reduce((total, row) => total + row.count, 0), 564, key);
}
for (const key of ["complainantGender", "complainantAgeBands", "complainantOccupations", "complainantReligions", "complainantCastes"]) {
  assert.equal(dimensions[key].reduce((total, row) => total + row.count, 0), 662, key);
}
assert.equal(dimensions.incidentSettings.reduce((total, row) => total + row.count, 0), 500);
assert.equal(dimensions.vulnerability.minors, bundle.Victims.filter(row => row.age > 0 && row.age < 18).length);

let response;
const client = { exports: {}, process: { env: {} }, URL, setTimeout, clearTimeout,
  window: { location: { hostname: "preview.catalystserverless.in", origin: "https://preview.catalystserverless.in" } },
  fetch: async () => response.clone(),
};
vm.runInNewContext(transpile("../src/lib/ai-client.ts"), client);
response = new Response(JSON.stringify({ error: "Cloud Scale could not read required source table Victim" }), { status: 502 });
await assert.rejects(() => client.exports.listRecordBundle(requested, true), /required source table Victim/);
response = new Response(JSON.stringify({ tables: { Firs: [] } }));
await assert.rejects(() => client.exports.listRecordBundle(requested, true), /incomplete response/);
response = new Response(JSON.stringify({ tables: bundle }));
assert.equal((await client.exports.listRecordBundle(requested, true)).Victims.length, 564);
console.log("Analytics sources: required-read failures, pagination, fresh reads, complete bundles and actual demographic totals verified.");
