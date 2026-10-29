const path = require('path');
const fs = require('fs');

const CLI_ROOT =
  '/home/kirthik-roshan/.nvm/versions/node/v20.20.2/lib/node_modules/zcatalyst-cli';
const { Catalyst } = require(CLI_ROOT);
const {
  bulkDSAPI,
  datastoreAPI,
  zcqlAPI,
} = require(path.join(CLI_ROOT, 'lib/endpoints'));

const projectRoot = process.cwd();
const projectId = '56798000000013049';
const bootstrapJobId = process.argv[2] || '61006000000078001';
const requestedTable = process.argv
  .slice(3)
  .find((arg) => !arg.startsWith('--'));
const auditMode = process.argv.includes('--audit');
const blockingOnly = process.argv.includes('--blocking');
const jobStatusMode = process.argv.includes('--job-status');
const downloadJobMode = process.argv.includes('--download-job');
const countMode = process.argv.includes('--counts');
const readModelMode = process.argv.includes('--read-model');
const environment = process.argv.includes('--development')
  ? 'Development'
  : 'Production';

const OPTIONAL_FIELDS = new Set([
  'Unit.ParentUnit',
  'CaseMaster.CourtID',
  'ArrestSurrender.CourtID',
]);
const ADDITIONAL_UNIQUE_FIELDS = new Set([
  'Employee.KGID',
  'CaseMaster.CrimeNo',
]);
const TYPE_MAP = {
  'Var Char': 'varchar',
  Text: 'text',
  Date: 'date',
  DateTime: 'datetime',
  Int: 'int',
  Double: 'double',
  Boolean: 'boolean',
  BigInt: 'bigint',
  'Encrypted Text': 'encrypted text',
};

(async () => {
  process.env.CATALYST_SUB_PROCESS = '1';

  const result = await Catalyst.exec('ds:status', projectRoot, projectRoot, {
    args: ['import', bootstrapJobId],
    options: { production: true },
    inputs: { download: false },
  });

  if (result.error) {
    throw result.error;
  }

  if (jobStatusMode || downloadJobMode) {
    const bulk = await bulkDSAPI({ env: environment });
    const report = await bulk.getReport('write', bootstrapJobId);
    const status = await bulk.getStatus('write', bootstrapJobId, true);
    if (downloadJobMode) {
      const downloadUrl = report.results?.download_url;
      if (!downloadUrl) {
        throw new Error('Catalyst job report has no download URL');
      }
      const output = path.join(
        '/tmp',
        `netra-import-${bootstrapJobId}.zip`,
      );
      const contents = await bulk.downloadReport(
        downloadUrl,
        path.basename(output),
      );
      fs.writeFileSync(output, contents);
      console.log(`NETRA_JOB_REPORT=${output}`);
      return;
    }
    console.log(
      `NETRA_JOB_STATUS=${JSON.stringify({ report, status })}`,
    );
    return;
  }

  if (countMode) {
    const expectedTables = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'data/cloudscale-import/schema.json'),
        'utf8',
      ),
    ).tables.filter((table) => table.tier === 'ksp_er');
    const zcql = await zcqlAPI({ projectId, env: environment });
    const counts = [];

    for (const table of expectedTables) {
      const rows = await zcql.query(
        `SELECT COUNT(ROWID) AS NETRA_COUNT FROM ${table.name}`,
      );
      const value =
        rows?.[0]?.[table.name]?.NETRA_COUNT ??
        rows?.[0]?.[table.name]?.['COUNT(ROWID)'];
      counts.push({
        table: table.name,
        expected: Number(table.row_count),
        actual: value === undefined ? null : Number(value),
        raw: value === undefined ? rows : undefined,
      });
    }

    console.log(`NETRA_TABLE_COUNTS=${JSON.stringify(counts)}`);
    return;
  }

  if (readModelMode) {
    const { KSP_ER_TABLES, buildKspReadModel } = require(
      path.join(projectRoot, 'functions/ai_quickml/ksp-read-model'),
    );
    const zcql = await zcqlAPI({ projectId, env: environment });
    const source = {};

    for (const table of KSP_ER_TABLES) {
      const rows = [];
      let offset = 0;
      while (true) {
        const page = await zcql.query(
          `SELECT * FROM ${table} LIMIT ${offset},300`,
        );
        const normalized = (page || []).map((entry) => entry[table] || entry);
        rows.push(...normalized);
        if (normalized.length < 300) break;
        offset += normalized.length;
      }
      source[table] = [...new Map(rows.map((row, index) => [
        String(row.ROWID || row.rowid || `${table}:${index}`),
        row,
      ])).values()];
    }

    const views = buildKspReadModel(source);
    const names = [
      'Firs', 'Cases', 'Criminals', 'FirCriminals', 'Arrests', 'Victims',
      'Complainants', 'Relationships', 'PoliceStations', 'Chargesheets',
    ];
    const counts = Object.fromEntries(
      names.map((name) => [name, (views[name] || []).length]),
    );
    const imran = (views.Criminals || []).find(
      (row) => String(row.name || '').toLowerCase() === 'imran reddy',
    );
    console.log(
      `NETRA_READ_MODEL=${JSON.stringify({
        environment,
        source_rows: Object.values(source).reduce(
          (total, rows) => total + rows.length,
          0,
        ),
        counts,
        imran: imran
          ? {
              id: imran.id,
              firs: imran.fir_count,
              arrests: imran.arrest_count,
            }
          : null,
      })}`,
    );
    return;
  }

  const datastore = await datastoreAPI({
    projectId,
    env: environment,
  });
  const tables = await datastore.getAllTables();
  const schema = [];

  for (const table of tables) {
    const tableName = table.table_name || table.tableName || table.name;
    if (requestedTable && tableName !== requestedTable) {
      continue;
    }
    const tableId = table.table_id || table.tableId || table.id;
    const columns = await datastore.getColumnDetails(tableId);
    schema.push({ table, columns });
  }

  if (!auditMode) {
    process.stdout.write(`NETRA_SCHEMA_JSON=${JSON.stringify(schema)}\n`);
    return;
  }

  const expectedSchema = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, 'data/cloudscale-import/schema.json'),
      'utf8',
    ),
  ).tables.filter((table) => table.tier === 'ksp_er');
  const actualByName = new Map(
    schema.map((entry) => [entry.table.table_name, entry]),
  );
  const tableNameById = new Map(
    schema.map((entry) => [
      String(entry.table.table_id),
      entry.table.table_name,
    ]),
  );
  const columnNameById = new Map();
  for (const entry of schema) {
    for (const column of entry.columns) {
      columnNameById.set(String(column.column_id), column.column_name);
    }
  }

  const issues = [];
  for (const expectedTable of expectedSchema) {
    const actualTable = actualByName.get(expectedTable.name);
    if (!actualTable) {
      issues.push(`${expectedTable.name}: table missing`);
      continue;
    }

    const customColumns = actualTable.columns.filter(
      (column) => Number(column.category) === 2,
    );
    const actualColumns = new Map(
      customColumns.map((column) => [column.column_name, column]),
    );
    const expectedNames = new Set(
      expectedTable.fields.map((field) => field.name),
    );

    for (const field of expectedTable.fields) {
      const id = `${expectedTable.name}.${field.name}`;
      const actual = actualColumns.get(field.name);
      if (!actual) {
        issues.push(`${id}: column missing`);
        continue;
      }

      const expectedType = field.reference
        ? 'foreign key'
        : TYPE_MAP[field.type];
      if (String(actual.data_type).toLowerCase() !== expectedType) {
        issues.push(
          `${id}: type ${actual.data_type}, expected ${expectedType}`,
        );
      }

      if (field.reference) {
        const expectedParentTable = field.reference.split('.')[0];
        const actualParentTable = tableNameById.get(
          String(actual.parent_table),
        );
        if (actualParentTable !== expectedParentTable) {
          issues.push(
            `${id}: parent table ${actualParentTable}, expected ${expectedParentTable}`,
          );
        }
      }

      const expectedMandatory = !OPTIONAL_FIELDS.has(id);
      if (
        !blockingOnly &&
        Boolean(actual.is_mandatory) !== expectedMandatory
      ) {
        issues.push(
          `${id}: mandatory=${Boolean(actual.is_mandatory)}, expected ${expectedMandatory}`,
        );
      }

      const expectedUnique =
        Boolean(field.key?.includes('PK')) ||
        ADDITIONAL_UNIQUE_FIELDS.has(id);
      if (expectedUnique && !actual.is_unique) {
        const configPath = path.join(
          projectRoot,
          'data/cloudscale-import/import-config',
          `${expectedTable.name}.json`,
        );
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!blockingOnly || config.find_by === field.name) {
          issues.push(`${id}: unique=false, expected true`);
        }
      }
    }

    for (const column of customColumns) {
      if (!expectedNames.has(column.column_name)) {
        issues.push(
          `${expectedTable.name}.${column.column_name}: unexpected column`,
        );
      }
    }
  }

  console.log(
    `NETRA_SCHEMA_AUDIT env=${environment} tables=${expectedSchema.length - issues.filter((issue) => issue.endsWith('table missing')).length}/${expectedSchema.length} issues=${issues.length}`,
  );
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  if (issues.length) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(`NETRA_SCHEMA_ERROR: ${error.message || error}`);
  process.exitCode = 1;
});
