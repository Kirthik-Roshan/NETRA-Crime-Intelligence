import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { uploadPhoto } = require('../functions/ai_quickml/photo-context');
const { documentChat } = require('../functions/ai_quickml/document-chat');
const { evidenceChat } = require('../functions/ai_quickml/evidence-chat');
const { getFile } = require('../functions/ai_quickml/file-library');
const { sourceChat } = require('../functions/ai_quickml/source-chat');
const manifest = require('../functions/ai_quickml/profile-assets.json');
const objects = new Map(), audits = [];
let scans = 0, profileReads = 0, firId = 5, ziaFails = false;
const bucket = { putObject: async (key, body) => { objects.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body)); return true; }, getObject: async key => { if (!objects.has(key)) throw new Error('Missing object'); return Readable.from([objects.get(key)]); } };
const context = { authenticated: true, officer: { id: 'photo-officer', role: 'investigation_officer' }, app: {
  stratus: () => ({ bucket: () => bucket }),
  zia: () => ({ analyseFace: async (stream, options) => { for await (const _part of stream) { /* consume upload */ } scans++; assert.equal(options.gender, 'false'); if (ziaFails) throw new Error('Zia offline'); return { faces_count: 1, details: [{ gender: 'do not retain', age: 40 }] }; } }),
} };
const first = manifest.profiles.find(row => row.name === 'Chetan Desai');
assert(first);
const intel = { criminal: { id: first.profile_id, name: first.name }, counts: { firs: 2, arrests: 1 }, firs: [{ id: 5, fir_number: '104060011202600001', crime_type: 'Vehicle Theft' }], arrests: [{ id: 8, date: '2026-10-01' }] };
const evidence = { ROWID: '9001', id: 12345, type: 'ZIA_PLATE', collected_at: '2026-10-26', fir_id: firId,
  storage_ref: JSON.stringify({ bucket: 'test', result_key: 'evidence/2026-10-26/test-stamp/plate-result.json' }) };
objects.set('evidence/2026-10-26/test-stamp/plate-result.json', Buffer.from(JSON.stringify({ analysis: 'plate', actor: context.officer, result: { text: 'KA 03 AB 7161', plate: 'KA03AB7161' } })));
const dependencies = { bucketName: 'test', writeAudit: async (_app, _officer, entry) => { audits.push(entry); return { id: `audit-${audits.length}`, ref: 'archive' }; },
  criminalIntelligence: async (_app, id) => { profileReads++; assert.equal(id, first.profile_id); return intel; },
  caseIntelligence: async (_app, id) => { assert.equal(id, firId); return { case: { id, title: 'Vehicle Theft' }, fir: { id, fir_number: `FIR-${id}` }, suspects: [] }; },
  listRows: async () => ({ rows: [evidence] }), complete: async () => null };
const previousFolder = process.env.NETRA_FILESTORE_FOLDER_ID;
delete process.env.NETRA_FILESTORE_FOLDER_ID;
try {
  for (const filename of [first.source_file, 'public' + first.public_path]) {
    const result = await uploadPhoto(context, { file: fs.readFileSync(filename).toString('base64'), name: 'renamed-photo.png', profile_id: 99999 }, dependencies);
    assert.equal(result.file.photo_context.profile_id, first.profile_id);
    assert.equal(result.file.photo_context.link_method, 'exact_synthetic_asset_sha256');
    assert.match(result.file.photo_context.notice, /not biometric identification/);
    assert(!('text' in result.file)); assert(!JSON.stringify(result).includes('do not retain'));
    const stored = await getFile(context, result.file.id, 'test');
    assert.doesNotMatch(stored.text, /"age"|"gender"|do not retain/);
    const reply = await documentChat(context, { query: 'Who is he?', document_ids: [result.file.id] }, dependencies);
    assert.equal(reply.response_scope, 'documents'); assert.match(reply.answer, /Chetan Desai/);
    assert(reply.sources.some(source => /Linked record summary/.test(source.title)));
    const firs = await documentChat(context, { query: 'Which FIRs are linked to him?', document_ids: [result.file.id] }, dependencies);
    assert.match(firs.answer, /104060011202600001/);
    const other = { ...context, officer: { ...context.officer, id: 'other' } };
    await assert.rejects(documentChat(other, { query: 'Who is he?', document_ids: [result.file.id] }, dependencies), /unavailable/);
  }
  const reads = profileReads;
  // A misleading filename or client-selected ID must never identify an unknown photo.
  const unknown = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  const result = await uploadPhoto(context, { file: unknown.toString('base64'), name: first.source_file, profile_id: first.profile_id }, dependencies);
  assert.equal(result.file.photo_context.profile_id, null);
  const noMatch = await documentChat(context, { query: 'Who is he?', document_ids: [result.file.id] }, dependencies);
  assert.match(noMatch.answer, /does not establish identity/); assert.equal(profileReads, reads);
  ziaFails = true;
  const degraded = await uploadPhoto(context, { file: unknown.toString('base64'), name: 'unknown.png' }, dependencies);
  assert.equal(degraded.file.photo_context.faces_count, null); assert.match(degraded.warning, /unavailable/);
  await assert.rejects(uploadPhoto({ ...context, authenticated: false }, { file: unknown.toString('base64') }, dependencies), /Sign in/);
  await assert.rejects(uploadPhoto({ ...context, officer: { id: 'read', role: 'readonly' } }, { file: unknown.toString('base64') }, dependencies), /role/);
  await assert.rejects(uploadPhoto(context, { file: Buffer.from('%PDF-1.7').toString('base64') }, dependencies), /requires/);
  const reply = await evidenceChat(context, { record_id: '9001', query: 'Summarize this analysis', result: { plate: 'MADE-UP-PLATE' } }, dependencies);
  assert.equal(reply.response_scope, 'evidence'); assert.match(reply.answer, /KA03AB7161/); assert.doesNotMatch(reply.answer, /MADE-UP/);
  assert(reply.sources.some(source => source.title.includes('Linked record summary')));
  const linked = await evidenceChat(context, { evidence_id: 12345, query: 'Which FIR is linked?' }, dependencies);
  assert.match(linked.answer, /FIR-5/);
  firId = 6; evidence.fir_id = firId;
  assert.match((await evidenceChat(context, { evidence_id: 12345, query: 'Which FIR is linked?' }, dependencies)).answer, /FIR-6/);
  evidence.fir_id = null;
  assert.match((await evidenceChat(context, { record_id: '9001', query: 'Which FIR is linked?' }, dependencies)).answer, /not currently linked/);
  await assert.rejects(evidenceChat({ ...context, officer: { ...context.officer, id: 'other' } }, { record_id: '9001', query: 'Summarize' }, dependencies), /officer who created/);
  await assert.rejects(evidenceChat(context, { record_id: '1111', query: 'Summarize' }, dependencies), /unavailable/);
  await assert.rejects(evidenceChat(context, { record_id: '../source', query: 'Summarize' }, dependencies), /saved evidence/);
  const previousStorage = evidence.storage_ref;
  evidence.storage_ref = JSON.stringify({ bucket: 'other', result_key: 'evidence/../../private-result.json' });
  await assert.rejects(evidenceChat(context, { record_id: '9001', query: 'Summarize' }, dependencies), /valid archived/);
  evidence.storage_ref = previousStorage;
  const blocks = [{ id: 'test-source', title: 'Plate observation', text: 'The saved OCR plate was KA03AB7161.' }];
  const generated = await sourceChat(context, { query: 'Which plate?' }, blocks, { ...dependencies, complete: async (_prompt, system) => {
    assert.match(system, /untrusted data/);
    return { answer: JSON.stringify({ answer: 'The observed plate was KA03AB7161.', citations: [{ source_id: 'test-source', quote: 'The saved OCR plate was KA03AB7161.' }] }) };
  } });
  assert.equal(generated.model, 'Catalyst QuickML Evidence Q&A');
  const rejected = await sourceChat(context, { query: 'Which plate?' }, blocks, { ...dependencies, complete: async () => ({ answer: JSON.stringify({ answer: 'A false claim', citations: [{ source_id: 'made-up', quote: 'fabricated source' }] }) }) });
  assert.doesNotMatch(rejected.answer, /false claim/); assert.match(rejected.answer, /Relevant saved/);
  assert.equal((await sourceChat(context, { query: 'Explain quantum physics', history: [{ role: 'user', content: 'Which plate?' }] }, blocks, dependencies)).response_kind, 'no_data');
  assert(scans >= 4); assert(audits.some(entry => entry.action === 'AI_EVIDENCE_QUERY')); assert(audits.some(entry => entry.action === 'AI_PHOTO_QUERY'));
  console.log('Photo & evidence chat: PNG/WebP synthetic file lookup, unknown-photo protection, Zia failure, ownership/roles, stored-result trust, current FIR linkage, citations and model-offline fallback passed.');
} finally { if (previousFolder == null) delete process.env.NETRA_FILESTORE_FOLDER_ID; else process.env.NETRA_FILESTORE_FOLDER_ID = previousFolder; }
