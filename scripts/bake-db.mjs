#!/usr/bin/env node
/**
 * Bake the read-only database browser into static JSON for the Slate static
 * build. The old /api/database route can't exist in a static export, so at
 * build time we dump each whitelisted table to public/data/db/<table>.json and
 * a catalogue. The client DatabaseExplorer fetches these static files (which
 * Slate serves from its CDN) and does search + pagination in the browser.
 *
 * Pure SQL — no TypeScript imports needed. `users` is never exposed.
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DB = join(ROOT, "data", "netra.db");
const OUT = join(ROOT, "public", "data", "db");
const ROW_CAP = 1000; // every table in the demo DB is well under this

const GROUPS = [
  {
    group: "official",
    tables: [
      "CaseMaster", "ComplainantDetails", "Victim", "Accused", "ArrestSurrender",
      "ChargesheetDetails", "ActSectionAssociation", "Inv_OccuranceTime",
      "Act", "Section", "CrimeHead", "CrimeSubHead", "CrimeHeadActSection",
      "Court", "District", "State", "Unit", "UnitType", "Rank", "Designation",
      "Employee", "CaseCategory", "GravityOffence", "CaseStatusMaster",
      "CasteMaster", "ReligionMaster", "OccupationMaster",
    ],
  },
  {
    group: "intel",
    tables: [
      "intel_criminals", "intel_relationships", "intel_phones", "intel_vehicles",
      "intel_addresses", "intel_weapons", "intel_organizations", "intel_org_members",
      "intel_evidence", "intel_case_enrichment", "intel_accused_link",
    ],
  },
  {
    group: "views",
    tables: [
      "firs", "cases", "criminals", "arrests", "victims", "complainants",
      "police_stations", "evidence", "phones", "vehicles", "addresses",
      "weapons", "organizations", "org_members", "relationships",
    ],
  },
  { group: "audit", tables: ["audit_logs"] },
];

const db = new Database(DB, { readonly: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalogue = [];
for (const g of GROUPS) {
  const tables = [];
  for (const name of g.tables) {
    let count = 0;
    try {
      count = db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get().n;
      const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ${ROW_CAP}`).all();
      const columns = rows.length ? Object.keys(rows[0]) : [];
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ table: name, columns, rows, total: count }));
    } catch (e) {
      console.warn(`[bake-db] skip ${name}: ${e.message}`);
      continue;
    }
    tables.push({ name, count });
  }
  catalogue.push({ group: g.group, tables });
}
writeFileSync(join(OUT, "_catalogue.json"), JSON.stringify({ groups: catalogue }));
console.log(`[bake-db] ✓ wrote ${catalogue.reduce((a, g) => a + g.tables.length, 0)} tables to public/data/db`);
