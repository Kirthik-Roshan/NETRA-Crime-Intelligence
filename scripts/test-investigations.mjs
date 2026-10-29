import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { analyzeInvestigation, digest } = require('../functions/ai_quickml/investigation-analysis.js');
const { investigations, briefPayload } = require('../functions/ai_quickml/investigations.js');

const firs = [
  { id: 1, fir_number: '104060011202600001', crime_type: 'Vehicle Theft', district: 'Mysuru', modus: 'vehicle lifting', description: 'Red car reported missing.', occurred_at: '2026-10-01', occurred_to: '2026-10-02' },
  { id: 2, fir_number: '104060011202600002', crime_type: 'Vehicle Theft', district: 'Mysuru', modus: 'vehicle lifting', description: 'Motorcycle theft reported.', occurred_at: '2026-10-03', occurred_to: '2026-10-04' },
  { id: 3, fir_number: '104060011202600003', crime_type: 'Vehicle Theft', district: 'Mysuru', description: 'Existing baseline case.' },
];
const links = [{ fir_id: 1, criminal_id: 7, accused_master_id: 70 }, { fir_id: 2, criminal_id: 7, accused_master_id: 71 }];
const observations = [
  { id: 'obs-car-00000001', case_id: 1, label: 'Image inspection', plate: 'KA 03 AB 7161', vehicle_type: 'car', reference: 'numberplate.png', note: 'Car registration observed in the submitted image.' },
  { id: 'obs-bike-00000001', case_id: 2, label: 'Image inspection', plate: 'KA03AB7161', vehicle_type: 'motorcycle', reference: 'Pasted image (3).png', note: 'Motorcycle registration observed in the submitted image.' },
];
const base = { firs: firs.slice(0, 2), links, observations, question: 'Could these incidents be connected?' };
const result = analyzeInvestigation(base);
assert.equal(result.counts.conflicts, 1);
assert(result.findings.some(item => item.title.includes('Shared registration')));
assert(result.sources.every(source => source.fingerprint.length === 64));
assert(result.findings.every(item => item.source_ids.every(id => result.sources.some(source => source.id === id))));
const excluded = analyzeInvestigation({ ...base, exclusions: [{ source_id: observations[1].id, reason: 'Disputed registration reading.' }] });
assert.equal(excluded.counts.conflicts, 0);
assert(excluded.findings.some(item => item.kind === 'conflict' && !item.active));
assert(!excluded.findings.some(item => item.active && item.title.includes('Shared registration')));
assert.equal(result.sources[0].excluded, false, 'recalculation never mutates the original analysis');
const extra = { ...observations[1], id: 'obs-bike-00000002', reference: 'Independent corroborating source' };
const corroborated = analyzeInvestigation({ ...base, observations: [...observations, extra], exclusions: [{ source_id: observations[1].id, reason: 'Exclude one redundant reading.' }] });
assert(corroborated.findings.some(item => item.active && item.kind === 'conflict'), 'remaining sources still support the conflict');
assert(corroborated.findings.some(item => item.active && item.title.includes('Shared registration')), 'remaining sources preserve the registration connection');
const dates = analyzeInvestigation({ ...base, firs: [{ ...firs[0], occurred_to: '2026-09-01' }, firs[1]] });
assert(dates.findings.some(item => item.kind === 'conflict' && item.title.includes('Invalid incident window')));
assert(!result.findings.some(item => /guilty|probability/i.test(item.title)));

const objects = new Map();
let journalRows = [], evidenceRows = [];
let evidenceFails = false;
let lastPdf;
const audits = [];
const bucket = {
  async listPagedObjects({ prefix, continuationToken }) {
    const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort();
    const offset = Number(continuationToken || 0); const next = offset + 2;
    return { contents: keys.slice(offset, next).map(key => ({ key })), truncated: String(next < keys.length), next_continuation_token: next < keys.length ? String(next) : undefined };
  },
  async getObject(key) { if (!objects.has(key)) throw new Error('Not found'); return Readable.from([objects.get(key)]); },
  async putObject(key, value, options) { assert.equal(options.overwrite, false); if (objects.has(key)) throw new Error('Object exists'); objects.set(key, value); return true; },
};
const context = { authenticated: true, officer: { id: 'officer-1', role: 'investigation_officer', full_name: 'Test Officer' }, app: {
  stratus: () => ({ bucket: () => bucket }), datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: journalRows, more_records: false }) }) }),
} };
const dependencies = {
  STRATUS_BUCKET: 'test-only',
  readKspViews: async (_app, _views, options) => { assert(options.requiredTables.includes('CaseMaster')); return { Firs: structuredClone(firs), FirCriminals: structuredClone(links) }; },
  listRows: async () => { if (evidenceFails) throw new Error('Evidence offline'); return { rows: structuredClone(evidenceRows) }; },
  writeAudit: async (_app, actor, event) => { audits.push({ actor, event }); return { id: `audit-${audits.length}`, ref: 'stratus://test-only/audit' }; },
  generatePdf: async (_context, payload) => { lastPdf = payload; return { pdf: Buffer.from('%PDF-test').toString('base64'), filename: payload.filename, storage_ref: 'stratus://test-only/pdf' }; },
};
const call = (payload, caller = context) => investigations(caller, payload, dependencies);
const input = { case_ids: [1, 2], question: base.question, observations, exclusions: [] };
await assert.rejects(() => call({ mode: 'investigation:analyze', ...input }, { ...context, authenticated: false }), error => error.statusCode === 401);
await assert.rejects(() => call({ mode: 'investigation:analyze', ...input }, { ...context, officer: { id: 'reader', role: 'readonly' } }), error => error.statusCode === 403);
await assert.rejects(() => call({ mode: 'investigation:analyze', ...input, case_ids: [1, 99], observations: [] }), error => error.statusCode === 404);
await assert.rejects(() => call({ mode: 'investigation:analyze', ...input, exclusions: [{ source_id: 'arbitrary', reason: 'Unknown source' }] }), error => error.statusCode === 409);
await assert.rejects(() => call({ mode: 'investigation:analyze', ...input, observations: [{ ...observations[0], reference: '' }] }));
const analysis = (await call({ mode: 'investigation:analyze', ...input })).analysis;
const save = { mode: 'investigation:save', ...input, title: 'Vehicle comparison', criteria: { enabled: true, crime_type: 'Vehicle Theft', district: 'Mysuru', term: '' }, review_status: 'reviewed', review_note: 'Sources inspected; the registration conflict remains unresolved.', annotation: 'Request original media.', request_id: 'request-test-00001', analysis_fingerprint: analysis.source_fingerprint };
const first = (await call(save)).saved;
assert.equal(first.analysis.counts.conflicts, 1);
assert.equal(first.review_status, 'reviewed');
assert(first.integrity_hash.length === 64);
assert.equal((await call(save)).duplicate, true, 'a retried create is idempotent');
await assert.rejects(() => call({ ...save, title: 'Changed duplicate request' }), error => error.statusCode === 409);
assert.equal((await call({ mode: 'investigation:list' })).rows.length, 1);
const other = { ...context, officer: { ...context.officer, id: 'officer-2' } };
assert.deepEqual((await call({ mode: 'investigation:list' }, other)).rows, []);
await assert.rejects(() => call({ mode: 'investigation:open', id: first.id }, other), error => error.statusCode === 404);
await assert.rejects(() => call({ mode: 'investigation:open', id: '../not-an-id' }), error => error.statusCode === 400);
await assert.rejects(() => call({ ...save, request_id: 'request-test-analyst' }, { ...context, officer: { id: 'analyst', role: 'analyst' } }), error => error.statusCode === 403);

let checked = await call({ mode: 'investigation:check' });
assert.equal(checked.alerts.length, 0, 'existing matching cases are the baseline');
firs.push({ id: 4, fir_number: '104060011202600004', crime_type: 'Vehicle Theft', district: 'Mysuru', description: 'New case recorded after watch save.' });
checked = await call({ mode: 'investigation:check' });
assert.equal(checked.alerts.length, 1); assert.equal(checked.alerts[0].kind, 'new_case');
assert.equal((await call({ mode: 'investigation:check' })).alerts.length, 1, 'repeated checks never duplicate alerts');
const alertId = checked.alerts[0].id;
await assert.rejects(() => call({ mode: 'investigation:alert', alert_id: alertId, status: 'read' }, other), error => error.statusCode === 404);
await call({ mode: 'investigation:alert', alert_id: alertId, status: 'read' });
assert.equal((await call({ mode: 'investigation:check' })).alerts[0].status, 'read');
await call({ mode: 'investigation:alert', alert_id: alertId, status: 'dismissed' });
assert.equal((await call({ mode: 'investigation:check' })).alerts[0].status, 'dismissed');
firs[1].status = 'under_investigation';
checked = await call({ mode: 'investigation:check' });
assert(checked.alerts.some(row => row.kind === 'selected_source_change' && row.case_id === 2), 'selected FIR status changes trigger a source update');
const statusAlertCount = checked.alerts.length;
assert.equal((await call({ mode: 'investigation:check' })).alerts.length, statusAlertCount, 'unchanged selected case updates remain deduplicated');
firs[3].description = 'The newly recorded case was corrected.';
assert.equal((await call({ mode: 'investigation:check' })).alerts.filter(row => row.kind === 'updated_case').length, 1, 'a distinct source revision can create a new alert');
journalRows = [{ ROWID: 'journal-1', CaseMasterID: 1, Content: 'New witness statement attached.', Kind: 'investigation', CREATEDTIME: '2026-10-24T12:00:00Z' }];
checked = await call({ mode: 'investigation:check' });
assert(checked.alerts.some(row => row.kind === 'selected_source_change' && row.case_id === 1));
evidenceFails = true;
const partial = await call({ mode: 'investigation:check' });
assert(partial.warnings.some(warning => warning.includes('Evidence register unavailable')));
evidenceFails = false;

const newInput = { ...input, exclusions: [{ source_id: observations[1].id, reason: 'Registration reading disputed by the reviewer.' }] };
const nextAnalysis = (await call({ mode: 'investigation:analyze', ...newInput })).analysis;
const second = (await call({ ...save, ...newInput, id: first.id, previous_revision: first.revision_id, request_id: 'request-test-00002', analysis_fingerprint: nextAnalysis.source_fingerprint })).saved;
assert.equal(second.revision_number, 2); assert.equal(second.previous_revision, first.revision_id);
assert.equal(second.analysis.counts.conflicts, 0);
assert(second.changes.some(change => change.includes('Changed')));
const old = await call({ mode: 'investigation:open', id: first.id, revision_id: first.revision_id });
assert.equal(old.saved.analysis.counts.conflicts, 1, 'older revisions retain the original source interpretation');
assert.equal(old.revisions.length, 2);
await assert.rejects(() => call({ ...save, id: first.id, previous_revision: first.revision_id, request_id: 'request-test-stale', analysis_fingerprint: nextAnalysis.source_fingerprint }), error => error.statusCode === 409);
firs[0].description = 'Changed after the officer ran the comparison.';
await assert.rejects(() => call({ ...save, id: first.id, previous_revision: second.revision_id, request_id: 'request-test-changed' }), error => error.statusCode === 409);
await call({ mode: 'investigation:pdf', id: first.id, revision_id: first.revision_id });
assert(lastPdf.turns.some(turn => turn.answer.includes('Red car reported missing.')) === false);
assert(lastPdf.source_register.some(source => source.includes('Red car reported missing.')), 'PDF uses saved sources, never current mutable records');
assert(lastPdf.source_register.every(source => source.includes('SHA-256:')));
assert.equal(lastPdf.relationship_graph.findings.filter(row => row.kind === 'conflict' && row.active).length, 1);
assert(briefPayload(first).turns.some(turn => turn.answer.includes(first.integrity_hash)));

const fresh = (await call({ mode: 'investigation:analyze', ...newInput })).analysis;
const competing = await Promise.allSettled([
  call({ ...save, ...newInput, id: first.id, previous_revision: second.revision_id, request_id: 'concurrent-request-1', annotation: 'First concurrent writer', analysis_fingerprint: fresh.source_fingerprint }),
  call({ ...save, ...newInput, id: first.id, previous_revision: second.revision_id, request_id: 'concurrent-request-2', annotation: 'Second concurrent writer', analysis_fingerprint: fresh.source_fingerprint }),
]);
assert.equal(competing.filter(row => row.status === 'fulfilled').length, 1, 'exactly one competing writer wins');
assert.equal(competing.find(row => row.status === 'rejected').reason.statusCode, 409);
assert.equal((await call({ mode: 'investigation:open', id: first.id })).revisions.length, 3, 'concurrent saves never create archive branches');

const revisionKey = [...objects.keys()].find(key => key.endsWith(`/${first.revision_id}.json`));
const corrupt = JSON.parse(objects.get(revisionKey)); corrupt.annotation = 'Tampered'; objects.set(revisionKey, JSON.stringify(corrupt));
await assert.rejects(() => call({ mode: 'investigation:open', id: first.id, revision_id: first.revision_id }), error => error.statusCode === 409);
assert(audits.some(row => row.event.action === 'INVESTIGATION_EXPORT_PDF'));
let renderedHtml = '';
const manyFindings = Array.from({ length: 110 }, (_, index) => ({
  id: `finding-${index}`, title: `Finding ${index} <script>untrusted title</script>`, kind: 'support', active: true,
  detail: `Source-backed observation ${index}. ` + 'Review the original record. '.repeat(80), source_ids: first.analysis.sources.map(source => source.id), case_ids: [1, 2],
}));
const pdfContext = { ...context, app: { ...context.app, smartbrowz: () => ({ convertToPdf: async html => {
  renderedHtml = html;
  return Readable.from([Buffer.from('%PDF-test')]);
} }) } };
await require('../functions/ai_quickml/platform.js').generatePdf(pdfContext, briefPayload({ ...first, analysis: { ...first.analysis, findings: manyFindings } }));
assert(renderedHtml.includes(first.integrity_hash), 'large briefs retain revision metadata');
assert(renderedHtml.includes('Source-backed observation 109.'), 'large briefs retain the last finding without grouped-answer truncation');
assert(renderedHtml.includes('Pasted image (3).png'), 'large briefs retain the source register');
assert(!renderedHtml.includes('<script>'), 'finding titles are escaped in generated reports');
assert.equal(digest({ known: true }).length, 64);
console.log('Investigation workbench: provenance, conflicts, redundant support, exclusion, permissions, owner isolation, source freshness, revisions, integrity, watch deduplication and saved PDF checks passed.');
