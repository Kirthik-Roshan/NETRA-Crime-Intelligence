#!/usr/bin/env node
/**
 * Export the prototype-facing SQLite views from data/netra.db into CSV files
 * that can be imported into Zoho Catalyst Cloud Scale Data Store.
 *
 * The generated schema uses only Catalyst-supported field types:
 * Text, Var Char, Date, DateTime, Int, Double, Boolean, BigInt, Foreign Key,
 * Encrypted Text.
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DB = join(ROOT, "data", "netra.db");
const OUT = join(ROOT, "data", "cloudscale-import");
const CSV_OUT = join(OUT, "csv");

const CATALYST_TYPES = new Set([
  "Text", "Var Char", "Date", "DateTime", "Int", "Double", "Boolean",
  "BigInt", "Foreign Key", "Encrypted Text",
]);

const OFFICIAL_ER_TABLES = [
  "State", "District", "UnitType", "Unit", "Rank", "Designation", "Employee",
  "CaseCategory", "GravityOffence", "CaseStatusMaster", "CasteMaster",
  "ReligionMaster", "OccupationMaster", "Court", "Act", "Section", "CrimeHead",
  "CrimeSubHead", "CrimeHeadActSection", "CaseMaster", "ComplainantDetails",
  "Victim", "Accused", "ActSectionAssociation", "Inv_OccuranceTime",
  "ArrestSurrender", "inv_arrestsurrenderaccused", "ChargesheetDetails",
];

const ER_DATE_FIELDS = new Set([
  "CaseMaster.CrimeRegisteredDate",
  "ArrestSurrender.ArrestSurrenderDate",
  "Employee.EmployeeDOB",
  "Employee.AppointmentDate",
  "ChargesheetDetails.csdate",
]);

const ER_DATETIME_FIELDS = new Set([
  "CaseMaster.IncidentFromDate",
  "CaseMaster.IncidentToDate",
  "CaseMaster.InfoReceivedPSDate",
]);

const ER_BOOLEAN_FIELDS = new Set([
  "ArrestSurrender.IsAccused",
  "ArrestSurrender.IsComplainantAccused",
  "Employee.PhysicallyChallenged",
]);

function officialCatalystType(table, column, declaredType) {
  const field = `${table}.${column}`;
  if (ER_DATE_FIELDS.has(field)) return "Date";
  if (ER_DATETIME_FIELDS.has(field)) return "DateTime";
  if (ER_BOOLEAN_FIELDS.has(field) || column === "Active") return "Boolean";
  if (field === "CaseMaster.BriefFacts") return "Text";
  if (declaredType === "REAL") return "Double";
  if (declaredType === "INTEGER") return "Int";
  return "Var Char";
}

function officialTableDefinitions(db) {
  return OFFICIAL_ER_TABLES.map((name) => {
    const fields = db.prepare(`PRAGMA table_info("${name}")`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${name}")`).all();
    return {
      name,
      source: name,
      tier: "ksp_er",
      purpose: "Official normalized KSP FIR schema table.",
      columns: fields.map((field) => {
        const foreignKey = foreignKeys.find((candidate) => candidate.from === field.name);
        const keys = [];
        if (field.pk) keys.push("PK");
        if (foreignKey) keys.push("FK");
        return [
          field.name,
          officialCatalystType(name, field.name, String(field.type || "").toUpperCase()),
          keys.join(" + ") || null,
          foreignKey ? `${foreignKey.table}.${foreignKey.to}` : null,
        ];
      }),
    };
  });
}

const tables = [
  {
    name: "Firs",
    source: "firs",
    tier: "must_import",
    purpose: "Dashboard, maps, assistant search, predictions, FIR detail context.",
    columns: [
      ["id", "Int"],
      ["fir_number", "Var Char"],
      ["station_id", "Int"],
      ["crime_type", "Var Char"],
      ["ipc_sections", "Text"],
      ["district", "Var Char"],
      ["taluk", "Var Char"],
      ["lat", "Double"],
      ["lng", "Double"],
      ["occurred_at", "DateTime"],
      ["reported_at", "DateTime"],
      ["status", "Var Char"],
      ["severity", "Var Char"],
      ["modus", "Var Char"],
      ["description", "Text"],
    ],
  },
  {
    name: "Cases",
    source: "cases",
    tier: "must_import",
    purpose: "Cases list, analytics, reports, case workspaces.",
    columns: [
      ["id", "Int"],
      ["case_number", "Var Char"],
      ["title", "Text"],
      ["fir_id", "Int"],
      ["status", "Var Char"],
      ["case_priority", "Var Char"],
      ["assigned_officer", "Int"],
      ["officer", "Var Char"],
      ["district", "Var Char"],
      ["opened_at", "DateTime"],
      ["updated_at", "DateTime"],
      ["summary", "Text"],
      ["crime_type", "Var Char"],
    ],
    sql: `
      SELECT
        c.id, c.case_number, c.title, c.fir_id, c.status, c.priority AS case_priority,
        c.assigned_officer, c.officer, c.district, c.opened_at, c.updated_at,
        c.summary, f.crime_type
      FROM cases c
      LEFT JOIN firs f ON f.id = c.fir_id
    `,
  },
  {
    name: "Criminals",
    source: "criminals",
    tier: "must_import",
    purpose: "Criminal list, high-risk people, prediction and network seeds.",
    columns: [
      ["id", "Int"],
      ["name", "Var Char"],
      ["aliases", "Text"],
      ["gender", "Var Char"],
      ["age", "Int"],
      ["status", "Var Char"],
      ["risk_score", "Int"],
      ["crime_category", "Var Char"],
      ["known_locations", "Text"],
      ["home_district", "Var Char"],
      ["first_seen", "DateTime"],
      ["photo_seed", "Var Char"],
      ["notes", "Text"],
      ["fir_count", "Int"],
      ["arrest_count", "Int"],
    ],
    sql: `
      SELECT
        c.*,
        (SELECT COUNT(*) FROM fir_criminals fc WHERE fc.criminal_id = c.id) AS fir_count,
        (SELECT COUNT(*) FROM arrests a WHERE a.criminal_id = c.id) AS arrest_count
      FROM criminals c
    `,
  },
  {
    name: "FirCriminals",
    source: "fir_criminals",
    tier: "must_import",
    purpose: "Links FIRs to resolved criminal profiles.",
    columns: [["fir_id", "Int"], ["criminal_id", "Int"], ["role", "Var Char"]],
  },
  {
    name: "Arrests",
    source: "arrests",
    tier: "important",
    purpose: "Arrest timelines, dashboard arrest counts, criminal profiles.",
    columns: [
      ["id", "Int"],
      ["criminal_id", "Int"],
      ["fir_id", "Int"],
      ["arrested_at", "DateTime"],
      ["arresting_officer", "Var Char"],
      ["district", "Var Char"],
      ["arrest_type", "Var Char"],
    ],
  },
  {
    name: "Victims",
    source: "victims",
    tier: "important",
    purpose: "Case detail and demographic analytics.",
    columns: [["id", "Int"], ["fir_id", "Int"], ["name", "Var Char"], ["gender", "Var Char"], ["age", "Int"]],
  },
  {
    name: "Complainants",
    source: "complainants",
    tier: "important",
    purpose: "Case detail and complainant occupation analytics.",
    columns: [
      ["id", "Int"],
      ["fir_id", "Int"],
      ["name", "Var Char"],
      ["age", "Int"],
      ["gender", "Var Char"],
      ["occupation", "Var Char"],
      ["religion", "Var Char"],
    ],
  },
  {
    name: "Evidence",
    source: "evidence",
    tier: "important",
    purpose: "Case timeline, evidence list, OCR/storage references.",
    columns: [
      ["id", "Int"],
      ["fir_id", "Int"],
      ["type", "Var Char"],
      ["description", "Text"],
      ["collected_at", "DateTime"],
      ["storage_ref", "Text"],
    ],
  },
  {
    name: "Relationships",
    source: "relationships",
    tier: "network",
    purpose: "Knowledge graph edges for the network explorer.",
    columns: [
      ["id", "Int"],
      ["source_type", "Var Char"],
      ["source_id", "Int"],
      ["target_type", "Var Char"],
      ["target_id", "Int"],
      ["rel_type", "Var Char"],
      ["confidence", "Double"],
      ["frequency", "Int"],
      ["note", "Text"],
    ],
  },
  {
    name: "Phones",
    source: "phones",
    tier: "network",
    purpose: "Phone nodes and criminal profile contact data.",
    columns: [["id", "Int"], ["number", "Var Char"], ["carrier", "Var Char"], ["owner_criminal_id", "Int"]],
  },
  {
    name: "Vehicles",
    source: "vehicles",
    tier: "network",
    purpose: "Vehicle nodes and criminal profile vehicle data.",
    columns: [
      ["id", "Int"],
      ["plate", "Var Char"],
      ["make", "Var Char"],
      ["model", "Var Char"],
      ["color", "Var Char"],
      ["type", "Var Char"],
      ["owner_criminal_id", "Int"],
    ],
  },
  {
    name: "Addresses",
    source: "addresses",
    tier: "network",
    purpose: "Address nodes, map enrichment, criminal profile locations.",
    columns: [
      ["id", "Int"],
      ["criminal_id", "Int"],
      ["type", "Var Char"],
      ["line", "Text"],
      ["district", "Var Char"],
      ["lat", "Double"],
      ["lng", "Double"],
    ],
  },
  {
    name: "Organizations",
    source: "organizations",
    tier: "network",
    purpose: "Gang/syndicate nodes.",
    columns: [["id", "Int"], ["name", "Var Char"], ["type", "Var Char"], ["district", "Var Char"], ["notes", "Text"]],
  },
  {
    name: "OrgMembers",
    source: "org_members",
    tier: "network",
    purpose: "Links organizations to criminal profiles.",
    columns: [["org_id", "Int"], ["criminal_id", "Int"], ["role", "Var Char"]],
  },
  {
    name: "Weapons",
    source: "weapons",
    tier: "detail",
    purpose: "Criminal profile weapon associations.",
    columns: [["id", "Int"], ["criminal_id", "Int"], ["fir_id", "Int"], ["type", "Var Char"], ["description", "Text"]],
  },
  {
    name: "Chargesheets",
    source: "ChargesheetDetails",
    tier: "detail",
    purpose: "Case detail final-report/court panel.",
    columns: [
      ["id", "Int"],
      ["fir_id", "Int"],
      ["csdate", "DateTime"],
      ["cstype", "Var Char"],
      ["final_report", "Var Char"],
      ["police_person_id", "Int"],
      ["court", "Var Char"],
    ],
    sql: `
      SELECT
        cs.CSID AS id,
        cs.CaseMasterID AS fir_id,
        cs.csdate,
        cs.cstype,
        CASE cs.cstype
          WHEN 'A' THEN 'Chargesheet'
          WHEN 'B' THEN 'False Case'
          WHEN 'C' THEN 'Undetected'
          ELSE cs.cstype
        END AS final_report,
        cs.PolicePersonID AS police_person_id,
        co.CourtName AS court
      FROM ChargesheetDetails cs
      LEFT JOIN CaseMaster cm ON cm.CaseMasterID = cs.CaseMasterID
      LEFT JOIN Court co ON co.CourtID = cm.CourtID
    `,
  },
  {
    name: "PoliceStations",
    source: "police_stations",
    tier: "support",
    purpose: "Station names/codes for filters and display.",
    columns: [["id", "Int"], ["station_code", "Var Char"], ["name", "Var Char"], ["district", "Var Char"]],
  },
  {
    name: "AuditLogs",
    source: "audit_logs",
    tier: "optional",
    purpose: "Admin demo audit trail. Skip for public demo if you do not want seeded user activity.",
    columns: [
      ["id", "Int"],
      ["ts", "DateTime"],
      ["user_id", "Int"],
      ["username", "Var Char"],
      ["role", "Var Char"],
      ["action", "Var Char"],
      ["entity", "Var Char"],
      ["entity_id", "Var Char"],
      ["request_id", "Var Char"],
      ["ai_model", "Var Char"],
      ["processing_ms", "Int"],
      ["detail", "Text"],
    ],
  },
  {
    name: "Notifications",
    source: null,
    tier: "runtime",
    purpose: "Runtime notification read/archive state used by the bell menu.",
    columns: [
      ["ts", "DateTime"],
      ["kind", "Var Char"],
      ["severity", "Var Char"],
      ["title", "Var Char"],
      ["detail", "Text"],
      ["entity", "Var Char"],
      ["entity_id", "Var Char"],
      ["status", "Var Char"],
    ],
  },
  {
    name: "OcrResult",
    source: null,
    tier: "runtime",
    purpose: "Runtime Zia OCR persistence table used by Scan document.",
    columns: [
      ["ocr_text", "Text"],
      ["language", "Var Char"],
      ["source_key", "Text"],
      ["source_name", "Var Char"],
    ],
  },
];

function assertTypes(exportTables) {
  const bad = [];
  for (const table of exportTables) {
    for (const [name, type] of table.columns) {
      if (!CATALYST_TYPES.has(type)) bad.push(`${table.name}.${name}: ${type}`);
    }
  }
  if (bad.length) throw new Error(`Unsupported Catalyst field types:\n${bad.join("\n")}`);
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatValue(value, type) {
  if (value == null || value === "") return "";
  if (type === "DateTime") {
    const s = String(value);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : s;
  }
  if (type === "Date") {
    return String(value).slice(0, 10);
  }
  return value;
}

function writeCsv(path, rows, columns) {
  const names = columns.map(([name]) => name);
  const lines = [names.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([name, type]) => csvEscape(formatValue(row[name], type))).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function tableSql(table) {
  if (table.sql) return table.sql;
  const cols = table.columns.map(([name]) => `"${name}"`).join(", ");
  return `SELECT ${cols} FROM "${table.source}"`;
}

function markdown(schema) {
  const allowlist = schema.tables.map((table) => table.name).join(",");
  const importRows = schema.tables
    .filter((table) => table.source)
    .map((table) => `| \`${table.name}\` | \`${table.csv}\` | ${table.row_count} | ${table.tier} | ${table.purpose} |`)
    .join("\n");

  const runtimeRows = schema.tables
    .filter((table) => !table.source)
    .map((table) => `| \`${table.name}\` | ${table.tier} | ${table.purpose} | ${table.fields.map((f) => `\`${f.name}\` ${f.type}`).join(", ")} |`)
    .join("\n");

  const fieldSections = schema.tables
    .map((table) => {
      const fields = table.fields.map((f) => `| \`${f.name}\` | ${f.type} |`).join("\n");
      return `### ${table.name}\n\n| Column | Catalyst type |\n|---|---|\n${fields}`;
    })
    .join("\n\n");

  return `# NETRA Cloud Scale CSV Import

Generated from \`data/netra.db\` by \`npm run cloudscale:export\`.

This package now contains both the prototype-facing operational tables and all
28 normalized tables from \`Police_FIR_ER_Diagram.pdf\`. Every generated field
uses a Catalyst Cloud Scale-supported type.

## Schema Contract

Run the repeatable fidelity check before an export or deployment:

\`\`\`bash
npm run schema:audit
\`\`\`

The audit verifies all 28 official tables and columns, required values, date
values, storage types, and every declared foreign-key relationship. Optional
unknown values remain empty and are shown in NETRA as \`Not recorded\`.

## Import Order

1. Operational application tables: \`Firs\`, \`Cases\`, \`Criminals\`, then their detail/link tables.
2. ER lookup tables: \`State\` through \`CrimeSubHead\` in the generated CSV table below.
3. ER transactional tables: \`CaseMaster\`, then complainant/victim/accused/arrest/chargesheet tables.

The generated CSVs keep relationship columns as \`Int\` so Catalyst can import
them before foreign-key wiring. The schema manifest records every PK/FK target.

## Function Allowlist

After importing beyond the first three tables, set the \`ai_quickml\` Function
environment variable:

\`\`\`
DATASTORE_TABLES=${allowlist}
\`\`\`

## CSV Files

| Cloud Scale table | CSV | Rows | Tier | Why it matters |
|---|---:|---:|---|---|
${importRows}

## Runtime-Only Tables

These have no seed CSV because the app writes them at runtime.

| Cloud Scale table | Tier | Why it matters | Fields |
|---|---|---|---|
${runtimeRows}

## Field Types

${fieldSections}
`;
}

function main() {
  mkdirSync(CSV_OUT, { recursive: true });

  const db = new Database(DB, { readonly: true });
  const exportTables = [...tables, ...officialTableDefinitions(db)];
  assertTypes(exportTables);
  const schema = {
    generated_from: "data/netra.db",
    catalyst_supported_types: [...CATALYST_TYPES],
    note: "All fields use Catalyst-supported types. Logical id/link fields stay Int for CSV import.",
    tables: [],
  };

  for (const table of exportTables) {
    const fields = table.columns.map(([name, type, key, reference]) => ({
      name,
      type,
      ...(key ? { key } : {}),
      ...(reference ? { reference } : {}),
    }));
    const entry = {
      name: table.name,
      source: table.source,
      tier: table.tier,
      purpose: table.purpose,
      fields,
    };
    if (table.source) {
      const rows = db.prepare(tableSql(table)).all();
      const csv = `csv/${table.name}.csv`;
      writeCsv(join(OUT, csv), rows, table.columns);
      entry.csv = csv;
      entry.row_count = rows.length;
    }
    schema.tables.push(entry);
  }
  db.close();

  // The source DB uses WAL mode. A read pass may create -wal/-shm sidecars;
  // checkpoint after export so git status stays clean.
  const checkpoint = new Database(DB);
  checkpoint.pragma("wal_checkpoint(TRUNCATE)");
  checkpoint.close();

  writeFileSync(join(OUT, "schema.json"), `${JSON.stringify(schema, null, 2)}\n`);
  writeFileSync(join(OUT, "README.md"), markdown(schema));
  console.log(`[cloudscale-export] ${schema.tables.filter((t) => t.source).length} CSVs -> ${CSV_OUT}`);
  console.log("[cloudscale-export] schema -> data/cloudscale-import/schema.json");
}

main();
