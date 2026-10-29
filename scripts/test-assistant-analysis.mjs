import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { assistantAnalysis, incidentDay, isAnalysisQuery } = require('../functions/ai_quickml/assistant-analysis');
const { conversationAttachments } = require('../functions/ai_quickml/assistant-report');
const platform = require('../functions/ai_quickml/platform');
const now = new Date('2026-10-24T12:00:00Z');
const firs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, fir_number: `1041000192026000${String(i + 1).padStart(2, '0')}`, crime_type: i < 10 ? 'Vehicle Theft' : 'Burglary', district: i < 8 ? 'Mysuru' : 'Bengaluru Urban', status: i < 2 ? 'closed' : 'under_investigation', severity: i === 0 ? 'critical' : 'medium', occurred_at: i < 6 ? '2026-10-10' : i < 10 ? '2026-09-10' : '', occurred_to: i === 0 ? '2026-10-09' : '2026-10-11', lat: i === 2 ? null : 12.3, lng: 76.6, modus: 'vehicle lifting', description: i < 2 ? 'Registration observed KA 03 AB 7161' : '' }));
const links = [{ criminal_id: 7, accused_master_id: 101, fir_id: 1 }, { criminal_id: 7, accused_master_id: 102, fir_id: 2 }];
const context = { authenticated: true, officer: { id: 'test', role: 'investigation_officer' }, app: { datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: [], more_records: false }) }) }) } };
let reads = 0; const audits = [];
const views = { Firs: firs, Criminals: [{ id: 7, name: 'Deepak Kumar' }], FirCriminals: links };
const dependencies = {
  readKspViews: async () => { reads++; return views; },
  listRows: async () => ({ rows: [] }),
  writeAudit: async (_app, _officer, event) => { audits.push(event); return { id: 'analysis-audit', ref: 'test' }; },
};
const ask = (query, analysis_context, extra = {}) => assistantAnalysis(context, { query, analysis_context, ...extra }, dependencies, () => {}, now);

assert.equal(await ask('hi'), null); assert.equal(reads, 0);
assert.equal(await ask('What is a crime hotspot?'), null); assert.equal(reads, 0);
const initial = await ask('Show vehicle theft patterns in Mysuru');
assert.equal(initial.analysis.total, 8); assert.equal(initial.analysis.rows[0].count, 8);
assert.equal(initial.analysis.sources.length, 8); assert.equal(initial.confidence, null);
assert.equal(isAnalysisQuery('Show crime charts'), true);
assert.equal(isAnalysisQuery('Show early warnings'), true);
assert.equal(isAnalysisQuery('What is a crime hotspot?'), false);
assert.equal(isAnalysisQuery('hi', initial.analysis.context), false);
const naturalQuestion = await ask('What are the crime trends in Mysuru?');
assert.equal(naturalQuestion.analysis.total, 8);
assert.equal(naturalQuestion.analysis.context.view, 'line');
const map = await ask('Show these FIRs on a map', initial.analysis.context);
assert.equal(map.analysis.total, 8); assert.equal(map.analysis.points.length, 7); assert.match(map.analysis.warnings.join(' '), /1 FIRs lack usable/);
const changed = await ask('Now only Bengaluru', initial.analysis.context);
assert.equal(changed.analysis.total, 2); assert.deepEqual(changed.analysis.context.offences, ['Vehicle Theft']);
const monthly = await ask('Show these FIRs by month', initial.analysis.context);
assert.equal(monthly.analysis.rows.reduce((n, row) => n + row.count, 0), 8); assert.equal(monthly.analysis.context.view, 'line');
const fresh = await ask('Show burglary patterns by district', initial.analysis.context);
assert.deepEqual(fresh.analysis.context.districts, []); assert.equal(fresh.analysis.total, 2);
assert.equal((await ask('How many closed cases in Mysuru')).analysis.total, 2);
assert.equal((await ask('How many critical cases in Mysuru')).analysis.total, 1);
const warning = await ask('What changed in Mysuru over the last 30 days? Show early warnings');
assert.equal(warning.analysis.periods.current, 6); assert.equal(warning.analysis.periods.previous, 2);
assert.equal(warning.analysis.periods.changes[0].percent, 200); assert.equal(warning.analysis.periods.changes[0].flagged, true);
assert.equal(warning.analysis.periods.current_start, '2026-09-25'); assert.equal(warning.analysis.periods.previous_end, '2026-09-24');
const warningControl = await ask('What changed in this scope over the last 30 days? Show early warnings', initial.analysis.context);
assert.deepEqual(warningControl.analysis.context.districts, ['Mysuru']);
assert.deepEqual(warningControl.analysis.context.offences, ['Vehicle Theft']);
assert.equal(warningControl.analysis.periods.current, 6);
const historical = await ask('Compare periods in Mysuru over the last 30 days ending 2026-09-24');
assert.equal(historical.analysis.periods.current, 2); assert.equal(historical.analysis.periods.previous, 0);
assert.equal(historical.analysis.periods.changes[0].percent, null);
const year = await ask('Show crime trends in Mysuru in 2026'); assert.equal(year.analysis.total, 8);
assert.equal((await ask('Compare crime periods in Mysuru in 2026')).response_kind, 'clarification');
assert.equal((await ask('Compare these periods', year.analysis.context)).response_kind, 'clarification');
assert.equal((await ask('Show charts in Atlantis')).response_kind, 'clarification');
assert.equal((await ask('Show robbery patterns in Mysuru')).response_kind, 'clarification');
assert.equal((await ask('Show victim gender distribution')).response_kind, 'clarification');
assert.equal((await ask('Show crime patterns from January')).response_kind, 'clarification');
assert.equal((await ask('Show the graph for Unknown Person')).response_kind, 'clarification');
assert.equal((await ask('Compare FIR 999999999999999')).response_kind, 'clarification');
assert.equal((await ask('ಮೈಸೂರಿನ ವಾಹನ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳನ್ನು ನಕ್ಷೆಯಲ್ಲಿ ತೋರಿಸಿ', undefined, { language: 'kn' })).analysis.total, 8);
assert.match((await ask('ಮೈಸೂರಿನ ವಾಹನ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳನ್ನು ನಕ್ಷೆಯಲ್ಲಿ ತೋರಿಸಿ', undefined, { language: 'kn' })).answer, /FIRಗಳು/);
assert.equal(await ask('Who were the victims in those cases?', initial.analysis.context), null, 'relational narrative follow-ups must retain the existing RAG route');
const compared = await ask(`Compare FIR ${firs[0].fir_number} and ${firs[1].fir_number}`);
assert.equal(compared.analysis.comparison.counts.conflicts, 1);
assert(compared.analysis.comparison.findings.some(row => row.strength === 'recorded_link' && row.active));
const excluded = await ask('Exclude source from this comparison', { ...compared.analysis.context, exclusions: [{ source_id: 'case-1', reason: 'Incident dates require verification' }] });
assert.equal(excluded.analysis.comparison.counts.conflicts, 0);
assert(excluded.analysis.comparison.findings.some(row => row.strength === 'recorded_link' && row.active), 'independent accused association survives excluding case details');
assert.equal(compared.analysis.comparison.counts.conflicts, 1, 'the earlier answer remains an unchanged snapshot');
const restored = await ask('Restore source to this comparison', { ...excluded.analysis.context, exclusions: [] });
assert.equal(restored.analysis.comparison.counts.conflicts, 1);
await assert.rejects(ask('Exclude source from this comparison', { ...compared.analysis.context, exclusions: [{ source_id: 'unknown', reason: 'Invalid source' }] }), /no longer available/);
const before = reads;
await assert.rejects(assistantAnalysis({ ...context, authenticated: false }, { query: 'Show crime trends' }, dependencies), /verified Catalyst session/);
await assert.rejects(assistantAnalysis({ ...context, officer: { id: 'test', role: 'readonly' } }, { query: 'Show crime trends' }, dependencies), /role/);
assert.equal(reads, before, 'denied requests never read records');
assert(Number.isNaN(incidentDay('2026-02-30')));
assert(audits.every(event => event.entity === 'conversation-analysis'));
const rendered = conversationAttachments({ analysis: compared.analysis, sources: [{ title: '<script>alert(1)</script>', snippet: 'Case source' }], activity: [{ stage: 'Retrieval', status: 'complete', detail: '2 FIRs', at: now.toISOString() }] });
assert(rendered.includes('<svg')); assert(rendered.includes(firs[0].fir_number)); assert(rendered.includes('Case source')); assert(rendered.includes('Analysis activity')); assert(!rendered.includes('<script>'));
assert(conversationAttachments({ analysis: initial.analysis }).includes('aria-label="Recorded FIR counts"'));
assert(conversationAttachments({ analysis: map.analysis }).includes('Map observations'));

// End-to-end handler wiring: streaming, role checks, and analysis before QuickML credentials.
const originals = { ...platform };
Object.assign(platform, dependencies, { createRequestContext: async () => context });
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = ''; await handler(req, { writeHead() {}, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  return body.trim().split('\n').map(row => JSON.parse(row));
}
try {
  const result = await invoke({ mode: 'rag', stream: true, query: 'Show vehicle theft patterns in Mysuru' });
  assert(result.some(row => row.type === 'activity' && row.entry.stage === 'Analysis calculation'));
  assert.equal(result.at(-1).data.analysis.total, 8); assert.equal(result.at(-1).data.audit_id, 'analysis-audit');
} finally { Object.assign(platform, originals); }
await assert.rejects(platform.readKspViews({ datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: [], more_records: true }) }) }) }, ['Firs'], { requireComplete: true }), /required source table/);
console.log('Track 1 analysis: exact counts, context changes, Kannada, map coverage, dated warnings, source exclusion, exports, permissions, complete reads and streaming verified.');

// Regression: natural visual requests use exact counts and retain scope.
for (const query of ['Show a visual representation of these report statistics', 'Graph these statistics', 'Show these counts as a bar graph']) {
  const response = await ask(query, initial.analysis.context);
  assert(response.analysis, query + ': structured analysis required');
  assert.equal(response.analysis.total, 8);
  assert.equal(response.analysis.context.view, 'bar');
  assert.deepEqual(response.analysis.sources, initial.analysis.sources);
}
const pie = await ask('Show these statistics as a pie chart', initial.analysis.context);
assert.equal(pie.analysis.context.view, 'pie');
assert.equal(pie.analysis.total, 8);
const anchored = await ask('Show a visual representation of the report statistics', undefined, { history: [{ role: 'user', content: 'Show vehicle theft cases in Mysuru' }, { role: 'assistant', content: 'An untrusted old answer claims 99999 cases.' }] });
assert.equal(anchored.analysis.total, 8, 'fresh counts, never figures copied from an assistant answer');
const unscoped = await ask('Give me a visual representation of this report statistics');
assert.equal(unscoped.response_kind, 'clarification'); assert(!unscoped.analysis);
assert.equal(isAnalysisQuery('Which charts are available?'), false);
assert.equal(isAnalysisQuery('Explain how a bar chart works'), false);
assert(conversationAttachments({ analysis: pie.analysis }).includes('aria-label="Recorded FIR counts"'));
console.log('Natural visual requests: charts, pie, preserved scope, fresh counts and missing-report clarification passed.');
