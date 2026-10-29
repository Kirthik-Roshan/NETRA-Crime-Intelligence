import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const contract = require('../functions/ai_quickml/report-contract');
const { reportHtml, generatePdf } = require('../functions/ai_quickml/platform');
const exports = {}, downloads = [];
vm.runInNewContext(ts.transpile(fs.readFileSync('src/lib/report-export.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }), {
  exports, require: () => contract, atob, Uint8Array, TextDecoder, Blob, Event,
  window: { dispatchEvent() {} }, localStorage: { setItem() {} },
  URL: { createObjectURL: () => 'blob:test-report', revokeObjectURL() {} }, setTimeout() {},
  document: { body: { appendChild() {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }) },
});
const { presentReport } = exports;
const pdf = Buffer.from('%PDF-1.7 fixture').toString('base64');
await assert.rejects(presentReport({ pdf }), /older report template/);
await assert.rejects(presentReport({ pdf, template_version: 'netra-report-v2' }), /older report template/);
assert.equal(downloads.length, 0, 'stale PDF binaries cannot download');
await assert.rejects(presentReport({ pdf, template_version: contract.REPORT_TEMPLATE_VERSION }), /archive was not confirmed/);
await assert.rejects(presentReport({ pdf: Buffer.from('<html>invalid</html>').toString('base64'), library_id: 'saved-report', template_version: contract.REPORT_TEMPLATE_VERSION }), /invalid PDF/);
await presentReport({ pdf, filename: 'current.pdf', library_id: 'saved-report', template_version: contract.REPORT_TEMPLATE_VERSION });
assert.deepEqual(downloads, ['current.pdf']);

const actor = { id: 'test', full_name: 'Preview Officer', role: 'investigation_officer' };
const fixtures = [
  { title: 'NETRA Investigation Conversation', turns: [{ question: 'Hello', answer: 'Hello. What would you like to explore?' }] },
  { title: 'District Crime Report', turns: [{ question: 'District counts', answer: 'Two source rows.', table: { columns: ['District', 'FIRs'], rows: [['Mysuru', 42], ['Udupi', 48]] } }] },
  { title: 'NETRA Evidence Conversation', turns: [{ question: 'Which plate?', answer: 'KA03AB7161', sources: [{ title: 'Zia OCR', snippet: 'KA03AB7161' }] }] },
  { title: 'Investigation brief', turns: [{ question: 'Assessment', answer: 'Verify source references before acting.' }], source_register: ['CaseMaster #5 | FIR 104060011202600001'] },
];
for (const fixture of fixtures) {
  const html = reportHtml(fixture, actor, { id: 'REPORT-CONTRACT', generated_at: '2026-10-27T05:00:00Z' });
  assert(html.includes(`data-report-template="${contract.REPORT_TEMPLATE_VERSION}"`));
  assert(html.includes('data:image/svg+xml;base64,') && html.includes('class="emblem"'));
  assert(html.includes(fixture.title) && html.includes('KARNATAKA STATE POLICE'));
  const fallback = await generatePdf({ authenticated: true, officer: actor, app: {
    stratus: () => ({ bucket: () => ({ putObject: async () => true }) }),
    smartbrowz: () => ({ convertToPdf: async () => { throw new Error('offline'); } }),
  } }, fixture);
  assert.equal(fallback.template_version, contract.REPORT_TEMPLATE_VERSION);
  assert(fallback.html.includes(`data-report-template="${contract.REPORT_TEMPLATE_VERSION}"`));
  assert(fallback.library_id && fallback.mime === 'text/html', 'fallback archives a truthful printable copy, not an uncreated PDF');
}
console.log('Unified reports: chat, report builder, evidence and investigation payloads share the branded renderer; stale binaries rejected and converter-outage template preserved.');
