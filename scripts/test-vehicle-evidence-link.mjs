#!/usr/bin/env node

import Database from "better-sqlite3";

const expected = ["104060011202600001", "104060011202600004"];
const db = new Database("data/netra.db", { readonly: true });
const rows = db.prepare(`
  SELECT f.id, f.fir_number, f.crime_type, fc.criminal_id
  FROM firs f
  JOIN fir_criminals fc ON fc.fir_id = f.id
  WHERE f.fir_number IN (?, ?) AND fc.criminal_id = 66
  ORDER BY f.fir_number
`).all(...expected);
db.close();

if (rows.length !== 2) throw new Error(`Expected two schema-backed vehicle FIR links, found ${rows.length}`);
for (const row of rows) {
  if (row.crime_type !== "Vehicle Theft") throw new Error(`${row.fir_number} is not a Vehicle Theft FIR`);
}
console.log(`PASS: KA03AB7161 maps to ${rows.map((row) => row.fir_number).join(", ")} through accused profile 66`);
