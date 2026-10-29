#!/usr/bin/env node
/**
 * Export the 28 official KSP ER tables from data/netra.db into CSV files that
 * can be imported into Zoho Catalyst Cloud Scale Data Store.
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
const CONFIG_OUT = join(OUT, "import-config");

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
  "Inv_OccuranceTime.OccuranceFrom",
  "Inv_OccuranceTime.OccuranceTo",
]);

const ER_BOOLEAN_FIELDS = new Set([
  "ArrestSurrender.IsAccused",
  "ArrestSurrender.IsComplainantAccused",
  "Employee.PhysicallyChallenged",
]);

const ER_OPTIONAL_FIELDS = new Set([
  "Unit.ParentUnit",
  "CaseMaster.CourtID",
  "ArrestSurrender.CourtID",
]);

const ER_SEARCH_FIELDS = new Set([
  "State.StateName",
  "District.DistrictName",
  "Unit.UnitName",
  "Employee.KGID",
  "Employee.FirstName",
  "Court.CourtName",
  "Act.ActCode",
  "Act.ShortName",
  "Section.SectionCode",
  "CrimeHead.CrimeGroupName",
  "CrimeSubHead.CrimeHeadName",
  "CaseMaster.CrimeNo",
  "CaseMaster.CaseNo",
  "ComplainantDetails.ComplainantName",
  "Victim.VictimName",
  "Accused.AccusedName",
]);

const ER_ADDITIONAL_UNIQUE_FIELDS = new Set([
  "Employee.KGID",
  "CaseMaster.CrimeNo",
]);

const ER_PII_FIELDS = new Set([
  "Employee.KGID",
  "Employee.FirstName",
  "Employee.EmployeeDOB",
  "ComplainantDetails.ComplainantName",
  "ComplainantDetails.AgeYear",
  "ComplainantDetails.OccupationID",
  "ComplainantDetails.ReligionID",
  "ComplainantDetails.CasteID",
  "ComplainantDetails.GenderID",
  "Victim.VictimName",
  "Victim.AgeYear",
  "Victim.GenderID",
  "Accused.AccusedName",
  "Accused.AgeYear",
  "Accused.GenderID",
  "Accused.PersonID",
  "CaseMaster.latitude",
  "CaseMaster.longitude",
  "CaseMaster.BriefFacts",
]);

const ER_DEFAULTS = new Map([
  ["State.Active", "true"],
  ["District.Active", "true"],
  ["UnitType.Active", "true"],
  ["Unit.Active", "true"],
  ["Rank.Active", "true"],
  ["Designation.Active", "true"],
  ["Employee.PhysicallyChallenged", "false"],
  ["Court.Active", "true"],
  ["Act.Active", "true"],
  ["Section.Active", "true"],
  ["CrimeHead.Active", "true"],
  ["Victim.VictimPolice", "0"],
  ["ArrestSurrender.IsAccused", "true"],
  ["ArrestSurrender.IsComplainantAccused", "false"],
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

const PLATFORM_TABLE_DEFINITIONS = [
  {
    name: "Evidence",
    source: null,
    tier: "runtime",
    purpose: "Runtime evidence chain-of-custody metadata linked to official CaseMaster records.",
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

function catalystDate(value, dateTime, field) {
  const raw = String(value).trim();
  const direct = dateTime
    ? raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
    : raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const formatted = direct
    ? (dateTime ? `${direct[1]} ${direct[2]}` : direct[1])
    : (() => {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return "";
        return dateTime
          ? parsed.toISOString().replace("T", " ").slice(0, 19)
          : parsed.toISOString().slice(0, 10);
      })();
  if (!formatted) throw new Error(`${field}: invalid Catalyst ${dateTime ? "DateTime" : "Date"} value ${raw}`);
  return formatted;
}

function formatValue(value, type, field) {
  if (value == null || value === "") return "";
  if (type === "DateTime") return catalystDate(value, true, field);
  if (type === "Date") return catalystDate(value, false, field);
  if (type === "Boolean") {
    if (value === true || value === 1 || String(value).toLowerCase() === "true" || String(value) === "1") return "true";
    if (value === false || value === 0 || String(value).toLowerCase() === "false" || String(value) === "0") return "false";
    throw new Error(`${field}: invalid Catalyst Boolean value ${String(value)}`);
  }
  if (type === "Int") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) {
      throw new Error(`${field}: invalid Catalyst Int value ${String(value)}`);
    }
  }
  if (type === "Double" && !Number.isFinite(Number(value))) {
    throw new Error(`${field}: invalid Catalyst Double value ${String(value)}`);
  }
  const string = String(value);
  if (type === "Var Char" && string.length > 255) throw new Error(`${field}: Var Char exceeds 255 characters`);
  if ((type === "Text" || type === "Encrypted Text") && string.length > 10000) {
    throw new Error(`${field}: ${type} exceeds 10000 characters`);
  }
  return value;
}

function writeCsv(path, rows, columns) {
  const names = columns.map(([name]) => name);
  const lines = [names.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([name, type]) => csvEscape(formatValue(row[name], type, `${path}:${name}`))).join(","));
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

  return `# NETRA Official KSP Cloud Scale Import

Generated from the 28 normalized KSP tables in \`data/netra.db\` by
\`npm run cloudscale:export\`. The legacy prototype-facing operational views
are deliberately excluded. Every generated field uses a Catalyst-supported
Cloud Scale type.

## Schema Contract

Run the repeatable fidelity check before an export or deployment:

\`\`\`bash
npm run schema:audit
\`\`\`

The audit verifies all 28 official tables and columns, required values, date
values, storage types, and every declared foreign-key relationship. Optional
unknown values remain empty and are shown in NETRA as \`Not recorded\`.

## Import Order

1. KSP lookup tables: \`State\` through \`CrimeSubHead\` in the generated CSV table below.
2. KSP transactional tables: \`CaseMaster\`, then complainant, victim, accused,
   arrest, occurrence and chargesheet tables.

The generated CSVs keep relationship columns as \`Int\` so Catalyst can import
them before foreign-key wiring. The schema manifest records every PK/FK target.

## Function Allowlist

Set the \`ai_quickml\` Function environment variable to the generated official
allowlist. \`Evidence\`, \`Notifications\`, and \`OcrResult\` are isolated
platform-output tables; they are not substituted crime-source tables.

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

function yesNo(value) {
  return value ? "Yes" : "No";
}

function creationGuide(schema) {
  const officialTables = schema.tables.filter((table) => table.tier === "ksp_er");
  const sections = officialTables.map((table, index) => {
    const rows = table.fields.map((field) => {
      const id = `${table.name}.${field.name}`;
      const isForeignKey = Boolean(field.reference);
      const catalystType = isForeignKey ? "Foreign Key" : field.type;
      const key = field.key || "-";
      const parent = field.reference ? `\`${field.reference}\`` : "-";
      const required = !ER_OPTIONAL_FIELDS.has(id);
      const unique =
        (Boolean(field.key?.includes("PK")) && !isForeignKey) ||
        ER_ADDITIONAL_UNIQUE_FIELDS.has(id);
      const search = ER_SEARCH_FIELDS.has(id) && field.type !== "Text" && !isForeignKey;
      const pii = ER_PII_FIELDS.has(id);
      const defaultValue = ER_DEFAULTS.get(id) || "-";
      const onDelete = isForeignKey ? "Null" : "-";
      const maxLength = field.type === "Var Char" ? "255" : "-";
      return `| \`${field.name}\` | ${catalystType} | ${maxLength} | ${key} | ${parent} | ${yesNo(required)} | ${yesNo(unique)} | ${yesNo(search)} | ${yesNo(pii)} | ${defaultValue} | ${onDelete} |`;
    }).join("\n");

    const fkMappings = table.fields
      .filter((field) => field.reference)
      .map((field) => {
        const referenceColumn = field.reference.split(".")[1];
        return `    { "local_column": "${field.name}", "reference_column": "${referenceColumn}" }`;
      });
    const primaryField = table.fields.find((field) => field.key?.includes("PK"));
    const mappingJson = fkMappings.length
      ? `,\n  "fk_mapping": [\n${fkMappings.join(",\n")}\n  ]`
      : "";
    const operationJson = primaryField && !primaryField.reference
      ? `"operation": "upsert",\n  "find_by": "${primaryField.name}"`
      : `"operation": "insert"`;

    return `## ${index + 1}. ${table.name}

CSV: \`${table.csv}\` (${table.row_count} rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
${rows}

Import configuration skeleton:

\`\`\`json
{
  "table_identifier": "${table.name}",
  ${operationJson}${mappingJson}
}
\`\`\``;
  }).join("\n\n");

  return `# KSP Cloud Scale Table Creation Runbook

Generated from the 28 official KSP ER tables in \`data/netra.db\`.

## Important Catalyst Rules

- Do not create one Stratus bucket per table. Create one bucket, such as
  \`netra-ksp-import\`, and keep all CSV objects in it. The tables themselves
  are created under **Cloud Scale > Data Store**.
- Catalyst automatically creates \`ROWID\`, \`CREATORID\`, \`CREATEDTIME\`, and
  \`MODIFIEDTIME\`. Do not add those columns manually.
- \`ROWID\` is the physical Catalyst primary key. A non-FK column marked
  \`PK\` below is the KSP logical/business key: create it with
  **IsUnique = Yes** and **IsMandatory = Yes**. A field marked \`PK + FK\`
  is imported once with \`insert\` because Catalyst's FK control does not
  expose \`IsUnique\`.
- A column marked \`FK\` must be created with data type **Foreign Key** and the
  listed parent table. Catalyst stores the parent record's \`ROWID\`; the import
  \`fk_mapping\` resolves the CSV business-key value to that \`ROWID\`.
- Choose **On Delete = Null** for every FK. In production, deny deletion of
  referenced police records through roles/application logic; do not use Cascade
  for evidentiary data.
- Date CSV values use \`YYYY-MM-DD\`. DateTime values use
  \`YYYY-MM-DD HH:mm:ss\`. Boolean values use \`true\` or \`false\`.
- Catalyst cannot enforce composite keys. The three junction tables without a
  single PK are deduplicated and validated by \`npm run schema:audit\`.

## Console Steps

1. Select the correct environment: **Development** while testing, or
   **Production** only when you are ready to load production.
2. Open **Cloud Scale > Data Store > Create a new Table**.
3. Create the table using the exact case-sensitive name below.
4. Open **Schema View > + New Column** for each row in that table's section.
5. Set the data type and every flag exactly as listed. For \`Var Char\`, set max
   length to 255. For an FK, select the parent table and **On Delete = Null**.
6. Create all tables in the numbered order below. Parent tables must exist
   before child FK columns can be configured.
7. Before import, run \`npm run schema:audit\`. We will then import in the same
   numbered order using the generated CSVs and the shown FK mappings.

## Null Policy

Only \`Unit.ParentUnit\`, \`CaseMaster.CourtID\`, and
\`ArrestSurrender.CourtID\` are optional in the generated dataset. Every other
listed field is populated and should be mandatory. The optional court fields
represent cases that have not yet reached court; they are not fabricated.

## Schema Notes

- \`Unit.ParentUnit\` remains an optional \`Int\` because the supplied ER schema
  does not formally declare its FK relationship.
- \`CrimeHeadActSection.SectionCode\` remains \`Var Char\` for the same reason.
- \`Inv_OccuranceTime.PlaceOfOccurance\`, \`OccuranceFrom\`, and \`OccuranceTo\`
  are NETRA compatibility fields inferred around the matrix-listed
  \`CaseMasterID\`; they are explicitly documented here rather than presented
  as verbatim organizer fields.
- \`ActSectionAssociation.ActID\` and \`SectionID\` are \`Var Char\`, matching
  the actual \`ActCode\` and \`SectionCode\` parent key types.

${sections}
`;
}

function importConfigForTable(table) {
  const primaryField = table.fields.find((field) => field.key?.includes("PK"));
  const canUpsert = primaryField && !primaryField.reference;
  const config = {
    table_identifier: table.name,
    operation: canUpsert ? "upsert" : "insert",
  };

  if (canUpsert) {
    config.find_by = primaryField.name;
  }

  const fkMapping = table.fields
    .filter((field) => field.reference)
    .map((field) => ({
      local_column: field.name,
      reference_column: field.reference.split(".")[1],
    }));

  if (fkMapping.length) {
    config.fk_mapping = fkMapping;
  }

  return config;
}

function main() {
  mkdirSync(CSV_OUT, { recursive: true });
  mkdirSync(CONFIG_OUT, { recursive: true });

  const db = new Database(DB, { readonly: true });
  const exportTables = [
    ...officialTableDefinitions(db),
    ...PLATFORM_TABLE_DEFINITIONS,
  ];
  assertTypes(exportTables);
  const schema = {
    generated_from: "data/netra.db",
    catalyst_supported_types: [...CATALYST_TYPES],
    note: "Only the 28 official KSP ER tables plus isolated platform-output tables are included. Investigator views are derived at runtime.",
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
  writeFileSync(join(OUT, "KSP-CLOUDSCALE-CREATION.md"), creationGuide(schema));
  for (const table of schema.tables.filter((entry) => entry.tier === "ksp_er")) {
    writeFileSync(
      join(CONFIG_OUT, `${table.name}.json`),
      `${JSON.stringify(importConfigForTable(table), null, 2)}\n`,
    );
  }
  console.log(`[cloudscale-export] ${schema.tables.filter((t) => t.source).length} CSVs -> ${CSV_OUT}`);
  console.log("[cloudscale-export] schema -> data/cloudscale-import/schema.json");
  console.log("[cloudscale-export] runbook -> data/cloudscale-import/KSP-CLOUDSCALE-CREATION.md");
  console.log("[cloudscale-export] import configs -> data/cloudscale-import/import-config");
}

main();
