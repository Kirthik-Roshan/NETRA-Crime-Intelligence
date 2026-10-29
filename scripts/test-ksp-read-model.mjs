#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const {
  KSP_ER_TABLES,
  buildKspReadModel,
} = require("../functions/ai_quickml/ksp-read-model.js");
const { caseDecisionSupport } = require("../functions/ai_quickml/platform.js");

const db = new Database("data/netra.db", { readonly: true });
const source = Object.fromEntries(KSP_ER_TABLES.map((table) => [
  table,
  db.prepare(`SELECT * FROM "${table}"`).all(),
]));
db.close();

const model = buildKspReadModel(source);
const expected = {
  Firs: 500,
  Cases: 500,
  Criminals: 70,
  FirCriminals: 703,
  Arrests: 251,
  Victims: 564,
  Complainants: 662,
  Relationships: 2790,
  PoliceStations: 24,
  Chargesheets: 191,
};

for (const [view, count] of Object.entries(expected)) {
  assert.equal(model[view].length, count, `${view} row count`);
}

const caseIds = new Set(model.Firs.map((row) => row.id));
const profileIds = new Set(model.Criminals.map((row) => row.id));
assert(model.Firs.every((row) => row.source_table === "CaseMaster"));
assert(model.FirCriminals.every((row) => caseIds.has(row.fir_id) && profileIds.has(row.criminal_id)));
assert(model.Arrests.every((row) => caseIds.has(row.fir_id) && profileIds.has(row.criminal_id)));
assert(model.Relationships.every((row) => KSP_ER_TABLES.includes(row.source_table)));
assert(model.Complainants.some((row) => row.caste && row.caste !== "Not stated"), "CasteMaster references must resolve");

const relationshipTypes = new Set(model.Relationships.map((row) => row.rel_type));
for (const type of ["prime_accused_in", "involved_in", "co_accused", "victim_in", "complainant_of", "registered_at"]) {
  assert(relationshipTypes.has(type), `${type} relationship must exist`);
}
const stationLinks = model.Relationships.filter((row) => row.rel_type === "registered_at");
assert.equal(stationLinks.length, model.Firs.filter((row) => row.station_id).length, "every station-backed FIR must have a station edge");
const idsByType = {
  criminal: profileIds,
  fir: caseIds,
  victim: new Set(model.Victims.map((row) => row.id)),
  complainant: new Set(model.Complainants.map((row) => row.id)),
  station: new Set(model.PoliceStations.map((row) => row.id)),
};
for (const relationship of model.Relationships) {
  assert(idsByType[relationship.source_type]?.has(relationship.source_id), `valid ${relationship.source_type} source ${relationship.source_id}`);
  assert(idsByType[relationship.target_type]?.has(relationship.target_id), `valid ${relationship.target_type} target ${relationship.target_id}`);
}
assert.equal(model.Relationships.filter((row) => row.rel_type === "victim_in").length, model.Victims.length);
assert.equal(model.Relationships.filter((row) => row.rel_type === "complainant_of").length, model.Complainants.length);

const imran = model.Criminals.find((row) => row.name === "Imran Reddy");
assert(imran, "Imran Reddy must resolve from official Accused records");
assert(imran.fir_count > 0, "Imran Reddy must have linked official FIRs");

const decisionFir = model.Firs.find((row) => model.FirCriminals.some((link) => link.fir_id === row.id));
const decisionCase = model.Cases.find((row) => row.id === decisionFir.id);
const decisionProfiles = new Map(model.Criminals.map((row) => [row.id, row]));
const decisionSuspects = model.FirCriminals
  .filter((row) => row.fir_id === decisionFir.id)
  .map((row) => ({ ...decisionProfiles.get(row.criminal_id), role: row.role }));
const support = caseDecisionSupport({
  caseRow: decisionCase,
  fir: decisionFir,
  cases: model.Cases,
  firs: model.Firs,
  suspects: decisionSuspects,
  arrests: model.Arrests.filter((row) => row.fir_id === decisionFir.id),
  chargesheets: model.Chargesheets.filter((row) => row.fir_id === decisionFir.id),
  allChargesheets: model.Chargesheets,
  evidence: [],
});
assert.match(support.summary, new RegExp(decisionFir.fir_number));
assert(support.timeline.length >= 2, "case timeline must include incident and registration");
assert(support.similarities.length > 0, "case must receive schema-grounded similarity matches");
assert(support.similarities.every((row) => row.id !== decisionFir.id && row.similarity_score >= 35));
assert(support.leads.length > 0, "case must receive evidence-backed decision-support leads");

console.log("KSP read model verified from official tables only");
console.log(Object.entries(expected).map(([view, count]) => `${view}: ${count}`).join("\n"));
console.log(`Imran Reddy: ${imran.fir_count} FIRs, ${imran.arrest_count} arrests`);
