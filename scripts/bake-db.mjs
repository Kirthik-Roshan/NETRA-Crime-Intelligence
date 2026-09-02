#!/usr/bin/env node
/**
 * Bake the read-only database browser into ONE bundled JSON module for the
 * Slate static build: src/data/db-baked.json.
 *
 * Why a bundled module and not public/data/db/*.json: Slate serves the HTML
 * routes and /_next/static/* (via CDN) but does NOT serve arbitrary public/
 * files — even a committed public asset 404s through its OpenNext function. A
 * file imported from src/ is bundled into the route's /_next/static chunk,
 * which Slate does serve. The generated file is committed to the repo, so the
 * build never depends on this script running on Slate.
 *
 * Regenerate after changing data/netra.db:  npm run bake
 * Pure SQL — `users` is never exposed.
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DB = join(ROOT, "data", "netra.db");
const OUT_DIR = join(ROOT, "src", "data");
const OUT = join(OUT_DIR, "db-baked.json");
// Cap rows per table so the bundled chunk stays reasonable; the true row count
// is still shown. The demo tables are small, so this rarely bites.
const ROW_CAP = 500;

const GROUPS = [
  {
    group: "official",
    tables: [
      "CaseMaster", "ComplainantDetails", "Victim", "Accused", "ArrestSurrender",
      "ChargesheetDetails", "ActSectionAssociation", "Inv_OccuranceTime", "inv_arrestsurrenderaccused",
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
      "firs", "cases", "criminals", "fir_criminals", "arrests", "victims", "complainants",
      "police_stations", "evidence", "phones", "vehicles", "addresses",
      "weapons", "organizations", "org_members", "relationships",
    ],
  },
  { group: "audit", tables: ["audit_logs"] },
];

const db = new Database(DB, { readonly: true });
mkdirSync(OUT_DIR, { recursive: true });

const groups = [];
const tables = {};
for (const g of GROUPS) {
  const list = [];
  for (const name of g.tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get().n;
      const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ${ROW_CAP}`).all();
      const columns = rows.length ? Object.keys(rows[0]) : [];
      tables[name] = { table: name, columns, rows, total: count };
      list.push({ name, count });
    } catch (e) {
      console.warn(`[bake-db] skip ${name}: ${e.message}`);
    }
  }
  groups.push({ group: g.group, tables: list });
}

const payload = JSON.stringify({ groups, tables });
writeFileSync(OUT, payload);
const n = groups.reduce((a, g) => a + g.tables.length, 0);
console.log(`[bake-db] ✓ ${n} tables → src/data/db-baked.json (${(payload.length / 1024) | 0} KB)`);
