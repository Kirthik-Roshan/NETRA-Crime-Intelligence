import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const platform = require('../functions/ai_quickml/platform.js');
const originals = { ...platform };
let failure = false;
Object.assign(platform, {
  createRequestContext: async () => ({ authenticated: true, officer: { id: 'test', role: 'investigation_officer' }, app: {} }),
  cacheGet: async () => null, cachePut: async () => {},
  searchRecords: async () => { if (failure) throw new Error('Retrieval failed'); return { hits: [{ table: 'Firs', row: { id: 1, fir_number: '104100019202600001', crime_type: 'Vehicle Theft', district: 'Mysuru' } }], engine: 'test-store' }; },
  listRows: async () => ({ rows: [] }),
  writeAudit: async () => ({ id: 'audit-test', ref: null }),
});
process.env.QML_ORG = 'test-org'; process.env.QML_PROJECT_ID = 'test-project';
delete process.env.QML_REFRESH_TOKEN;
const handler = require('../functions/ai_quickml/index.js');
async function run() {
  const req = Readable.from([JSON.stringify({ mode: 'rag', query: 'Show vehicle theft cases', stream: true, refresh: true })]); req.method = 'POST'; req.headers = {};
  let body = ''; let headers;
  await handler(req, { writeHead(code, value) { headers = value; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  assert.match(headers['Content-Type'], /ndjson/);
  return body.trim().split('\n').map(line => JSON.parse(line));
}
try {
  const events = await run();
  assert(events.some(e => e.entry?.stage === 'Retrieval' && e.entry.status === 'complete'));
  assert(events.some(e => e.entry?.stage === 'Audit archive' && e.entry.status === 'warning'));
  assert.equal(events.at(-1).type, 'result');
  assert.equal(events.at(-1).status, 200);
  failure = true;
  const failed = await run();
  assert(failed.some(e => e.entry?.status === 'failed'));
  assert.equal(failed.at(-1).status, 500);
  console.log('Analysis stream: retrieval events, audit failure, final response and failed retrieval verified.');
} finally { Object.assign(platform, originals); }
