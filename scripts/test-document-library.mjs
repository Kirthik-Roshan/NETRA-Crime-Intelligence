import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { saveLibraryFile, libraryRequest, getFile } = require('../functions/ai_quickml/file-library');
const { documentChat } = require('../functions/ai_quickml/document-chat');
const platform = require('../functions/ai_quickml/platform');
const objects = new Map(), storedFiles = new Map(), audit = [];
let nextFile = 0, pdfRead = false;
const bucket = {
  async putObject(key, body, options) { assert.equal(options.overwrite, false); assert(!objects.has(key)); objects.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body)); return true; },
  async getObject(key) { if (!objects.has(key)) throw new Error('Not found'); return Readable.from([objects.get(key)]); },
  async listPagedObjects({ prefix }) { return { contents: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: 'false' }; },
};
const read = async stream => { const parts = []; for await (const part of stream) parts.push(part); return Buffer.concat(parts); };
const context = { authenticated: true, officer: { id: 'officer-1', role: 'investigation_officer', full_name: 'Test Officer' }, app: {
  stratus: () => ({ bucket: () => bucket }),
  filestore: () => ({ folder: () => ({
    uploadFile: async ({ code }) => { const id = `file-${++nextFile}`; storedFiles.set(id, await read(code)); return { id }; },
    downloadFile: async id => storedFiles.get(id),
  }) }),
  zia: () => ({ extractOpticalCharacters: async (stream, options) => {
    const buffer = await read(stream); pdfRead = buffer.subarray(0, 5).toString() === '%PDF-'; assert.equal(options.modelType, 'OCR');
    return { text: 'FIR 104060011202600001. Vehicle theft was reported on 12 June 2026. The reported loss was Rs 25000.\nA witness reported a red motorcycle near the market.' };
  } }),
  smartbrowz: () => ({ convertToPdf: async () => Readable.from([Buffer.from('%PDF-1.7\nsynthetic generated report')]) }),
} };
const dependencies = { bucketName: 'test-only', ocrText: result => result.text, writeAudit: async (_app, _officer, entry) => { audit.push(entry); return { id: `audit-${audit.length}`, ref: 'stored' }; } };
const originalFolder = process.env.NETRA_FILESTORE_FOLDER_ID;
delete process.env.NETRA_FILESTORE_FOLDER_ID;
try {
  const reply = await libraryRequest(context, { mode: 'document:upload', name: 'case-scan.pdf', file: Buffer.from('%PDF-1.7\nsynthetic input').toString('base64') }, dependencies);
  assert(pdfRead, 'PDF is sent directly to Catalyst Zia OCR');
  const document = reply.file;
  assert.equal(document.provider, 'stratus'); assert.equal(document.extraction, 'Catalyst Zia OCR'); assert(document.passage_count > 0);
  assert(!('text' in document)); assert(!('storage' in document));
  assert.equal((await libraryRequest(context, { mode: 'files:list', kind: 'document' }, dependencies)).rows.length, 1);
  const downloaded = await libraryRequest(context, { mode: 'files:get', id: document.id }, dependencies);
  assert.equal(Buffer.from(downloaded.data, 'base64').subarray(0, 5).toString(), '%PDF-');
  const other = { ...context, officer: { ...context.officer, id: 'officer-2' } };
  await assert.rejects(getFile(other, document.id, 'test-only'), /unavailable/);
  assert.equal((await libraryRequest(other, { mode: 'files:list' }, dependencies)).rows.length, 0);
  await assert.rejects(libraryRequest({ ...context, authenticated: false }, { mode: 'files:list' }, dependencies), /Sign in/);
  await assert.rejects(libraryRequest({ ...context, officer: { id: 'read', role: 'readonly' } }, { mode: 'files:list' }, dependencies), /role/);
  await assert.rejects(libraryRequest(context, { mode: 'document:upload', file: Buffer.from('<html>not an image</html>').toString('base64') }, dependencies), /supported PDF or image/);
  const noText = { ...context, app: { ...context.app, zia: () => ({ extractOpticalCharacters: async stream => { await read(stream); return { text: '' }; } }) } };
  await assert.rejects(libraryRequest(noText, { mode: 'document:upload', file: Buffer.from('%PDF-1.7\nempty scan').toString('base64') }, dependencies), /could not extract/);

  let modelCalls = 0;
  const chatDependencies = { ...dependencies, complete: async prompt => {
    modelCalls++;
    const request = JSON.parse(prompt), first = request.passages[0];
    assert(request.previous_questions.length <= 3);
    return { answer: JSON.stringify({ answer: 'The document reports a loss of Rs 25000.', citations: [{ source_id: first.source_id, quote: 'The reported loss was Rs 25000.' }] }) };
  } };
  const answer = await documentChat(context, { query: 'What was the reported loss?', document_ids: [document.id], history: [{ role: 'user', content: 'Summarize the uploaded case' }] }, chatDependencies);
  assert.equal(answer.response_scope, 'documents'); assert.match(answer.answer, /25000/); assert.equal(answer.sources.length, 1); assert.match(answer.sources[0].title, /Passage 1/);
  const unsupported = await documentChat(context, { query: 'What was the loss?', document_ids: [document.id] }, { ...chatDependencies, complete: async () => ({ answer: JSON.stringify({ answer: 'A made-up loss of 999999.', citations: [{ source_id: 'fake', quote: 'A made-up quote that does not exist.' }] }) }) });
  assert(!unsupported.answer.includes('999999')); assert.match(unsupported.answer, /Relevant passages/);
  const fakeQuantity = await documentChat(context, { query: 'What was the reported loss?', document_ids: [document.id] }, { ...chatDependencies, complete: async prompt => {
    const first = JSON.parse(prompt).passages[0];
    return { answer: JSON.stringify({ answer: 'The loss was Rs 999999.', citations: [{ source_id: first.source_id, quote: 'The reported loss was Rs 25000.' }] }) };
  } });
  assert(!fakeQuantity.answer.includes('999999'), 'a real quote cannot legitimize a fabricated number');
  assert.match(fakeQuantity.answer, /25000/);
  const missing = await documentChat(context, { query: 'Explain quantum entanglement', document_ids: [document.id] }, chatDependencies);
  assert.equal(missing.response_kind, 'no_data'); assert.equal(modelCalls, 1);
  assert.equal(await documentChat(context, { query: 'hi', document_ids: [document.id] }, chatDependencies), null);
  assert.equal(await documentChat(context, { query: 'Hi how r u?', document_ids: [document.id] }, chatDependencies), null);
  assert.equal(await documentChat(context, { query: 'What is a bar chart?', document_ids: [document.id] }, chatDependencies), null, 'an attachment must not hijack a general explanation');
  assert.equal((await documentChat(context, { query: 'What is the total reported loss?', document_ids: [document.id] }, chatDependencies)).response_scope, 'documents', 'a real document question retains its source');
  await assert.rejects(documentChat(other, { query: 'What was the loss?', document_ids: [document.id] }, chatDependencies), /unavailable/);
  assert.equal(audit.filter(entry => entry.action === 'AI_DOCUMENT_QUERY').length, 5);
  process.env.NETRA_FILESTORE_FOLDER_ID = 'test-folder';
  const report = await saveLibraryFile(context, { kind: 'report', filename: 'saved-report.pdf', title: 'Saved investigation', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nReport'), text: 'The investigation recorded Rs 25000 in reported losses.' }, 'test-only');
  assert.equal(report.provider, 'filestore');
  assert.equal((await libraryRequest(context, { mode: 'files:get', id: report.id }, dependencies)).data, Buffer.from('%PDF-1.7\nReport').toString('base64'));
  storedFiles.set(report.storage.file_id, Buffer.from('altered'));
  await assert.rejects(libraryRequest(context, { mode: 'files:get', id: report.id }, dependencies), /integrity/);
  delete process.env.NETRA_FILESTORE_FOLDER_ID;
  const generated = await platform.generatePdf(context, { title: 'Portal report', turns: [{ question: 'Case summary', answer: 'Recorded facts from the selected FIR.' }] });
  assert(generated.library_id); assert(generated.storage_ref); assert.equal(generated.warning, null);
  const saved = await libraryRequest(context, { mode: 'files:list', kind: 'report' }, dependencies);
  assert(saved.rows.some(file => file.id === generated.library_id), 'exported PDFs appear in the portal library');
  assert.match((await getFile(context, generated.library_id, platform.STRATUS_BUCKET)).text, /Recorded facts/);
  const unavailable = { ...context, app: { ...context.app, stratus: () => ({ bucket: () => ({ putObject: async () => false }) }) } };
  await assert.rejects(platform.generatePdf(unavailable, { title: 'Archive unavailable', turns: [] }), /could not be saved to Saved reports/);
  const converterOffline = { ...context, app: { ...context.app, smartbrowz: () => ({ convertToPdf: async () => { throw new Error('offline'); } }) } };
  const printable = await platform.generatePdf(converterOffline, { title: 'Evidence printable copy', turns: [{ question: 'Plate?', answer: 'KA03AB7161' }] });
  assert(printable.library_id && printable.html && !printable.pdf);
  const preview = await platform.generatePdf(context, { title: 'Report print preview', turns: [] }, { previewOnly: true });
  assert(preview.library_id && preview.html);
  const allReports = await libraryRequest(context, { mode: 'files:list', kind: 'report' }, dependencies);
  for (const result of [generated, printable, preview]) assert(allReports.rows.some(row => row.id === result.library_id));
  const storedPreview = await libraryRequest(context, { mode: 'files:get', id: printable.library_id }, dependencies);
  assert.equal(storedPreview.file.mime, 'text/html');
  assert(Buffer.from(storedPreview.data, 'base64').toString().includes('KA03AB7161'));
  await assert.rejects(libraryRequest(other, { mode: 'files:get', id: printable.library_id }, dependencies), /unavailable/);
  console.log('Document library: PDF OCR, storage providers, private listing/download, integrity, citation validation, document-only fallback and automatic report archival passed.');
} finally {
  if (originalFolder == null) delete process.env.NETRA_FILESTORE_FOLDER_ID;
  else process.env.NETRA_FILESTORE_FOLDER_ID = originalFolder;
}
