const fs = require('fs');
const path = require('path');

const CLI_ROOT =
  '/home/kirthik-roshan/.nvm/versions/node/v20.20.2/lib/node_modules/zcatalyst-cli';
const { Catalyst } = require(CLI_ROOT);
const { bulkDSAPI } = require(path.join(CLI_ROOT, 'lib/endpoints'));

const table = process.argv[2];
if (!table) {
  console.error(
    'Usage: node scripts/_catalyst-import-one.cjs <table> [--only-non-null-fk|--omit-null-fk <column>]',
  );
  process.exit(2);
}

const projectRoot = process.cwd();
const sourceCsv = path.join(
  projectRoot,
  'data/cloudscale-import/csv',
  `${table}.csv`,
);
const sourceConfig = path.join(
  projectRoot,
  'data/cloudscale-import/import-config',
  `${table}.json`,
);
const variant = process.argv[3];
const optionalFk = process.argv[4];
const staged = path.join(
  '/tmp',
  `netra-ksp-${Date.now()}-${process.pid}-${table}.csv`,
);
const stagedConfig = path.join(
  '/tmp',
  `netra-ksp-${Date.now()}-${process.pid}-${table}.json`,
);

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function csvValue(value, isBoolean = false) {
  if (value === null || value === undefined) return '';
  if (isBoolean) {
    return value === true || value === 1 || value === '1' ? 'true' : 'false';
  }
  const text = String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function stageInput() {
  if (!variant) {
    fs.copyFileSync(sourceCsv, staged);
    return sourceConfig;
  }

  if (
    !['--only-non-null-fk', '--omit-null-fk'].includes(variant) ||
    !optionalFk
  ) {
    throw new Error('Invalid optional-FK import arguments');
  }

  const Database = require('better-sqlite3');
  const db = new Database(path.join(projectRoot, 'data/netra.db'), {
    readonly: true,
  });
  const header = fs
    .readFileSync(sourceCsv, 'utf8')
    .split(/\r?\n/, 1)[0]
    .split(',')
    .map((column) => column.replace(/^"|"$/g, ''));
  const columns =
    variant === '--omit-null-fk'
      ? header.filter((column) => column !== optionalFk)
      : header;
  const predicate =
    variant === '--omit-null-fk' ? 'IS NULL' : 'IS NOT NULL';
  const rows = db
    .prepare(
      `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(optionalFk)} ${predicate}`,
    )
    .all();
  db.close();

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, 'data/cloudscale-import/schema.json'),
      'utf8',
    ),
  );
  const tableSchema = schema.tables.find((entry) => entry.name === table);
  const booleanColumns = new Set(
    (tableSchema?.fields || [])
      .filter((field) => field.type.toLowerCase() === 'boolean')
      .map((field) => field.name),
  );

  const csv = [
    columns.map((column) => csvValue(column)).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => csvValue(row[column], booleanColumns.has(column)))
        .join(','),
    ),
  ].join('\n');
  fs.writeFileSync(staged, `${csv}\n`);

  const config = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
  if (variant === '--omit-null-fk') {
    config.fk_mapping = (config.fk_mapping || []).filter(
      (mapping) => mapping.local_column !== optionalFk,
    );
  }
  fs.writeFileSync(stagedConfig, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `NETRA_IMPORT_VARIANT table=${table} mode=${variant} column=${optionalFk} rows=${rows.length}`,
  );
  return stagedConfig;
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retry(operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(attempt * 1000);
      }
    }
  }
  throw lastError;
}

(async () => {
  const config = stageInput();
  process.env.CATALYST_SUB_PROCESS = '1';

  let output = '';
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...args) => {
    output += String(chunk);
    return stdoutWrite(chunk, ...args);
  };
  process.stderr.write = (chunk, ...args) => {
    output += String(chunk);
    return stderrWrite(chunk, ...args);
  };

  const result = await Catalyst.exec('ds:import', projectRoot, projectRoot, {
    args: [staged],
    options: { config, production: true },
    inputs: { bucket: 'ksp-netra' },
  });

  process.stdout.write = stdoutWrite;
  process.stderr.write = stderrWrite;

  if (result.error) {
    throw result.error;
  }

  const jobMatch = output.match(/jobid\s+"(\d+)"/i);
  if (!jobMatch) {
    throw new Error(`Catalyst did not return an import job ID for ${table}`);
  }

  const jobId = jobMatch[1];
  const bulk = await bulkDSAPI({ env: 'Production' });
  let report;

  do {
    report = await retry(() => bulk.getReport('write', jobId));
    if (report.status === 'In-Progress') {
      await delay(2000);
    }
  } while (report.status === 'In-Progress');

  const status = await retry(() => bulk.getStatus('write', jobId, true));
  const operations = Object.values(status[table] || {}).filter(Boolean);
  const processed = operations.reduce(
    (total, operation) => total + Number(operation.rows_processed || 0),
    0,
  );
  const failures = operations.reduce(
    (total, operation) => total + Number(operation.fail_count || 0),
    0,
  );

  console.log(
    `NETRA_IMPORT_RESULT table=${table} job=${jobId} status=${report.status} processed=${processed} failures=${failures}`,
  );

  if (report.status !== 'Completed' || failures !== 0) {
    console.error(report.results?.description || 'Catalyst import failed');
    process.exitCode = 1;
  }
})()
  .catch((error) => {
    console.error(`NETRA_IMPORT_ERROR table=${table}: ${error.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(staged, { force: true });
    fs.rmSync(stagedConfig, { force: true });
  });
