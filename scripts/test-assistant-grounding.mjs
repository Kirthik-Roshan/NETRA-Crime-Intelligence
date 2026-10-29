#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { KSP_ER_TABLES, buildKspReadModel } = require("../functions/ai_quickml/ksp-read-model.js");
const { __test } = require("../functions/ai_quickml/index.js");

const db = new Database("data/netra.db", { readonly: true });
const source = Object.fromEntries(KSP_ER_TABLES.map((table) => [
  table,
  db.prepare(`SELECT * FROM "${table}"`).all(),
]));
db.close();

const model = buildKspReadModel(source);
const profile = model.Criminals.find((row) => row.name === "Imran Reddy");
assert(profile, "known schema-aligned accused profile must exist");
const links = model.FirCriminals.filter((row) => row.criminal_id === profile.id);
const firIds = new Set(links.map((row) => row.fir_id));
const firs = model.Firs.filter((row) => firIds.has(row.id));
const victims = model.Victims.filter((row) => firIds.has(row.fir_id));
const complainants = model.Complainants.filter((row) => firIds.has(row.fir_id));

const history = [
  { role: "user", content: "Show the criminal history of Imran Reddy" },
  { role: "assistant", content: `Imran Reddy is linked to FIR ${firs[0].fir_number}.` },
];
const followUp = __test.contextualSearchQuery("Who were the victims in those cases?", history);
assert.match(followUp, /Imran Reddy/i, "follow-up retrieval must retain the named person");
assert.match(followUp, new RegExp(firs[0].fir_number), "follow-up retrieval must retain cited FIR anchors");

const records = [
  {
    table: "Criminals",
    row: {
      ...profile,
      linked_victim_count: victims.length,
      linked_complainant_count: complainants.length,
      linked_fir_count: firs.length,
    },
  },
  ...victims.map((row) => ({ table: "Victims", row })),
  ...complainants.map((row) => ({ table: "Complainants", row })),
  ...firs.map((row) => ({ table: "Firs", row })),
];
const victimAnswer = __test.criminalProfileAnswer(followUp, records, "en");
assert.match(victimAnswer, /linked victim record/i);
if (victims[0]?.name) assert.match(victimAnswer, new RegExp(victims[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

const grounded = __test.groundedAnswer("Summarize these cases", records, "en");
assert.match(grounded, /Cloud Scale|NETRA reviewed/i);
assert(__test.quickmlUsesGrounding(`The record cites ${firs[0].fir_number}.`, records));
assert(!__test.quickmlUsesGrounding("No useful records were found.", records));
assert(!__test.quickmlUsesGrounding(`The record cites ${firs[0].fir_number} and proves 987654321 offences.`, records), 'a real FIR reference must not validate invented statistics');

const kannadaMiss = __test.groundedAnswer("ಅಪರಿಚಿತ ದಾಖಲೆ", [], "kn");
assert.match(kannadaMiss, /ದಾಖಲೆಗಳು/);

const financialRecords = model.Firs
  .filter((row) => /fraud|cyber|counterfeit|upi|otp|investment|impersonat/i.test(`${row.crime_type} ${row.description} ${row.modus}`))
  .slice(0, 8)
  .map((row) => ({ table: "Firs", row }));
assert(__test.isTransactionAnalysisQuery("Trace the bank accounts and transaction money trail"));
assert(!__test.isTransactionAnalysisQuery("Summarize this cybercrime FIR"));
const financialBoundary = __test.financialScopeAnswer("Trace the transaction money trail", financialRecords, "en");
assert.match(financialBoundary, /official 28-table KSP schema/i);
assert.match(financialBoundary, /does not infer a money trail/i);
assert.match(financialBoundary, new RegExp(financialRecords[0].row.fir_number));

console.log("Assistant grounding and conversational follow-up verified");
console.log(`Profile: ${profile.name}; FIRs: ${firs.length}; victims: ${victims.length}; complainants: ${complainants.length}`);
