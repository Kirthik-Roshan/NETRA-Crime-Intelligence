#!/usr/bin/env node
import Database from "better-sqlite3";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), "data", "netra.db");

// Column contract transcribed from Police_FIR_ER_Diagram.pdf. A trailing !
// marks identifiers/labels that must never be null in the demo dataset.
const EXPECTED = {
  CaseMaster: ["CaseMasterID!", "CrimeNo!", "CaseNo!", "CrimeRegisteredDate!", "PolicePersonID!", "PoliceStationID!", "CaseCategoryID!", "GravityOffenceID!", "CrimeMajorHeadID!", "CrimeMinorHeadID!", "CaseStatusID!", "CourtID", "IncidentFromDate!", "IncidentToDate!", "InfoReceivedPSDate!", "latitude!", "longitude!", "BriefFacts!"],
  ComplainantDetails: ["ComplainantID!", "CaseMasterID!", "ComplainantName!", "AgeYear!", "OccupationID!", "ReligionID!", "CasteID!", "GenderID!"],
  ActSectionAssociation: ["CaseMasterID!", "ActID!", "SectionID!", "ActOrderID!", "SectionOrderID!"],
  Victim: ["VictimMasterID!", "CaseMasterID!", "VictimName!", "AgeYear!", "GenderID!", "VictimPolice!"],
  Accused: ["AccusedMasterID!", "CaseMasterID!", "AccusedName!", "AgeYear!", "GenderID!", "PersonID!"],
  ArrestSurrender: ["ArrestSurrenderID!", "CaseMasterID!", "ArrestSurrenderTypeID!", "ArrestSurrenderDate!", "ArrestSurrenderStateId!", "ArrestSurrenderDistrictId!", "PoliceStationID!", "IOID!", "CourtID", "AccusedMasterID!", "IsAccused!", "IsComplainantAccused!"],
  Act: ["ActCode!", "ActDescription!", "ShortName!", "Active!"],
  Section: ["ActCode!", "SectionCode!", "SectionDescription!", "Active!"],
  CrimeHeadActSection: ["CrimeHeadID!", "ActCode!", "SectionCode!"],
  CrimeHead: ["CrimeHeadID!", "CrimeGroupName!", "Active!"],
  CrimeSubHead: ["CrimeSubHeadID!", "CrimeHeadID!", "CrimeHeadName!", "SeqID!"],
  CasteMaster: ["caste_master_id!", "caste_master_name!"],
  ReligionMaster: ["ReligionID!", "ReligionName!"],
  OccupationMaster: ["OccupationID!", "OccupationName!"],
  CaseStatusMaster: ["CaseStatusID!", "CaseStatusName!"],
  Court: ["CourtID!", "CourtName!", "DistrictID!", "StateID!", "Active!"],
  District: ["DistrictID!", "DistrictName!", "StateID!", "Active!"],
  State: ["StateID!", "StateName!", "NationalityID!", "Active!"],
  Unit: ["UnitID!", "UnitName!", "TypeID!", "ParentUnit", "NationalityID!", "StateID!", "DistrictID!", "Active!"],
  UnitType: ["UnitTypeID!", "UnitTypeName!", "CityDistState!", "Hierarchy!", "Active!"],
  Rank: ["RankID!", "RankName!", "Hierarchy!", "Active!"],
  Designation: ["DesignationID!", "DesignationName!", "Active!", "SortOrder!"],
  Employee: ["EmployeeID!", "DistrictID!", "UnitID!", "RankID!", "DesignationID!", "KGID!", "FirstName!", "EmployeeDOB!", "GenderID!", "BloodGroupID!", "PhysicallyChallenged!", "AppointmentDate!"],
  CaseCategory: ["CaseCategoryID!", "LookupValue!"],
  GravityOffence: ["GravityOffenceID!", "LookupValue!"],
  ChargesheetDetails: ["CSID!", "CaseMasterID!", "csdate!", "cstype!", "PolicePersonID!"],
  // These two tables are named in the relationship matrix. The PDF only
  // enumerates their relationship fields, so NETRA permits extra columns.
  Inv_OccuranceTime: ["CaseMasterID!"],
  inv_arrestsurrenderaccused: ["ArrestSurrenderID!", "AccusedMasterID!"],
};

const ALLOW_EXTRA = new Set(["Inv_OccuranceTime"]);

// SQLite storage affinities equivalent to the document's Catalyst-facing
// types: INT/BIT -> INTEGER, VARCHAR/NVARCHAR/DATE/DATETIME -> TEXT, and
// DECIMAL -> REAL. ActSectionAssociation uses text codes because the PDF's
// relationship matrix points those fields to the VARCHAR Act/Section keys.
const TEXT_COLUMNS = new Set([
  "CaseMaster.CrimeNo", "CaseMaster.CaseNo", "CaseMaster.CrimeRegisteredDate",
  "CaseMaster.IncidentFromDate", "CaseMaster.IncidentToDate", "CaseMaster.InfoReceivedPSDate",
  "CaseMaster.BriefFacts", "ComplainantDetails.ComplainantName",
  "ActSectionAssociation.ActID", "ActSectionAssociation.SectionID",
  "Victim.VictimName", "Victim.VictimPolice", "Accused.AccusedName", "Accused.PersonID",
  "ArrestSurrender.ArrestSurrenderDate", "Act.ActCode", "Act.ActDescription", "Act.ShortName",
  "Section.ActCode", "Section.SectionCode", "Section.SectionDescription",
  "CrimeHeadActSection.ActCode", "CrimeHeadActSection.SectionCode", "CrimeHead.CrimeGroupName",
  "CrimeSubHead.CrimeHeadName", "CasteMaster.caste_master_name", "ReligionMaster.ReligionName",
  "OccupationMaster.OccupationName", "CaseStatusMaster.CaseStatusName", "Court.CourtName",
  "District.DistrictName", "State.StateName", "Unit.UnitName", "UnitType.UnitTypeName",
  "UnitType.CityDistState", "Rank.RankName", "Designation.DesignationName", "Employee.KGID",
  "Employee.FirstName", "Employee.EmployeeDOB", "Employee.AppointmentDate",
  "CaseCategory.LookupValue", "GravityOffence.LookupValue", "ChargesheetDetails.csdate",
  "ChargesheetDetails.cstype",
]);
const REAL_COLUMNS = new Set(["CaseMaster.latitude", "CaseMaster.longitude"]);
const DATE_COLUMNS = new Set([
  "CaseMaster.CrimeRegisteredDate", "CaseMaster.IncidentFromDate", "CaseMaster.IncidentToDate",
  "CaseMaster.InfoReceivedPSDate", "ArrestSurrender.ArrestSurrenderDate", "Employee.EmployeeDOB",
  "Employee.AppointmentDate", "ChargesheetDetails.csdate",
]);

function expectedStorageType(table, column) {
  const field = `${table}.${column}`;
  if (REAL_COLUMNS.has(field)) return "REAL";
  if (TEXT_COLUMNS.has(field)) return "TEXT";
  return "INTEGER";
}

function qid(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${qid(table)})`).all().map((row) => String(row.name));
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${qid(table)})`).all();
}

function rebuildLegacyActTables(db) {
  const act = tableColumns(db, "Act");
  const section = tableColumns(db, "Section");
  const legacyAct = act.includes("ActName") && !act.includes("ActDescription");
  const legacySection = section.includes("SectionName") && !section.includes("SectionDescription");
  if (!legacyAct && !legacySection) return false;

  db.pragma("foreign_keys = OFF");
  const migrate = db.transaction(() => {
    if (legacySection) {
      db.exec(`
        CREATE TABLE Section_er (
          ActCode TEXT REFERENCES Act(ActCode),
          SectionCode TEXT PRIMARY KEY,
          SectionDescription TEXT,
          Active INTEGER DEFAULT 1
        );
        INSERT INTO Section_er (ActCode, SectionCode, SectionDescription, Active)
          SELECT ActCode, SectionCode, SectionName, 1 FROM Section;
        DROP TABLE Section;
        ALTER TABLE Section_er RENAME TO Section;
      `);
    }
    if (legacyAct) {
      db.exec(`
        CREATE TABLE Act_er (
          ActCode TEXT PRIMARY KEY,
          ActDescription TEXT,
          ShortName TEXT,
          Active INTEGER DEFAULT 1
        );
        INSERT INTO Act_er (ActCode, ActDescription, ShortName, Active)
          SELECT ActCode, ActName, ActCode, COALESCE(Active, 1) FROM Act;
        DROP TABLE Act;
        ALTER TABLE Act_er RENAME TO Act;
      `);
    }
  });
  migrate();
  db.pragma("foreign_keys = ON");
  return true;
}

const fix = process.argv.includes("--fix");
const db = new Database(DB_PATH);
if (fix && rebuildLegacyActTables(db)) console.log("Fixed legacy Act/Section field names while preserving all rows.");

const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)));
const failures = [];
const typeFailures = [];
const nullWarnings = [];
const dateWarnings = [];

for (const [table, contract] of Object.entries(EXPECTED)) {
  if (!existing.has(table)) {
    failures.push(`${table}: table missing`);
    continue;
  }
  const info = tableInfo(db, table);
  const actual = info.map((column) => String(column.name));
  const expected = contract.map((column) => column.replace(/!$/, ""));
  const missing = expected.filter((column) => !actual.includes(column));
  const extra = ALLOW_EXTRA.has(table) ? [] : actual.filter((column) => !expected.includes(column));
  if (missing.length) failures.push(`${table}: missing ${missing.join(", ")}`);
  if (extra.length) failures.push(`${table}: unexpected ${extra.join(", ")}`);

  for (const column of expected.filter((name) => actual.includes(name))) {
    const declared = String(info.find((item) => String(item.name) === column)?.type || "").toUpperCase();
    const wanted = expectedStorageType(table, column);
    if (declared !== wanted) typeFailures.push(`${table}.${column}: ${declared || "UNTYPED"}, expected ${wanted}`);
  }

  const rows = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${qid(table)}`).get().count);
  for (const marker of contract.filter((column) => column.endsWith("!"))) {
    const column = marker.slice(0, -1);
    if (!actual.includes(column) || rows === 0) continue;
    const result = db.prepare(`SELECT COUNT(*) AS count FROM ${qid(table)} WHERE ${qid(column)} IS NULL OR (typeof(${qid(column)}) = 'text' AND trim(${qid(column)}) = '')`).get();
    if (result.count) nullWarnings.push(`${table}.${column}: ${result.count}/${rows} missing`);
  }

  for (const column of expected.filter((name) => DATE_COLUMNS.has(`${table}.${name}`) && actual.includes(name))) {
    const values = db.prepare(`SELECT ${qid(column)} AS value FROM ${qid(table)} WHERE ${qid(column)} IS NOT NULL AND trim(CAST(${qid(column)} AS TEXT)) != ''`).all();
    const invalid = values.filter((row) => Number.isNaN(Date.parse(String(row.value)))).length;
    if (invalid) dateWarnings.push(`${table}.${column}: ${invalid}/${values.length} invalid date value(s)`);
  }
}

const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
if (fkViolations.length) failures.push(`${fkViolations.length} foreign-key violation(s)`);

console.log(`ER tables: ${Object.keys(EXPECTED).length - failures.filter((item) => item.endsWith("table missing")).length}/${Object.keys(EXPECTED).length} present`);
console.log(`Storage-type issues: ${typeFailures.length}`);
console.log(`Required-value issues: ${nullWarnings.length}`);
console.log(`Invalid date values: ${dateWarnings.length}`);
console.log(`Foreign-key violations: ${fkViolations.length}`);
if (failures.length) console.log(`Schema issues:\n- ${failures.join("\n- ")}`);
if (typeFailures.length) console.log(`Storage-type issues:\n- ${typeFailures.join("\n- ")}`);
if (nullWarnings.length) console.log(`Required null/blank issues:\n- ${nullWarnings.join("\n- ")}`);
if (dateWarnings.length) console.log(`Date-value issues:\n- ${dateWarnings.join("\n- ")}`);

db.close();
if (failures.length || typeFailures.length || nullWarnings.length || dateWarnings.length) process.exitCode = 1;
