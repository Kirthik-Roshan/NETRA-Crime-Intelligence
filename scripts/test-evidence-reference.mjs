import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const manifest = require('../functions/ai_quickml/profile-assets.json');
const platform = require('../functions/ai_quickml/platform');
const { syntheticReference } = require('../functions/ai_quickml/synthetic-reference');
const calls = { profiles: [], archives: [], audits: [], comparisons: 0, cases: [] };
let matched = true, unavailable = false, stale = false;
const consume = async stream => { for await (const _ of stream) { /* read uploaded evidence */ } };
const context = { authenticated: true, officer: { id: 'officer-1', role: 'investigation_officer' }, app: {
  zia: () => ({
    analyseFace: async stream => { await consume(stream); return { faces_count: 1 }; },
    compareFace: async (reference, evidence) => {
      await Promise.all([consume(reference), consume(evidence)]);
      calls.comparisons++;
      if (unavailable) throw new Error('Zia offline');
      return { matched, confidence: matched ? 96 : 20 };
    },
  }),
} };
Object.assign(platform, {
  createRequestContext: async () => context,
  criminalIntelligence: async (_app, id) => {
    calls.profiles.push(id);
    const profile = manifest.profiles.find(row => row.profile_id === id);
    assert(profile, 'lookup must use an actual registered synthetic profile');
    return { criminal: { id, name: stale ? 'Different person' : profile.name },
      firs: [{ id: id + 1000, fir_number: `SYNTHETIC-FIR-${id}` }], arrests: [], associates: [] };
  },
  caseIntelligence: async (_app, id) => { calls.cases.push(id); return { fir: { id } }; },
  persistEvidence: async (_app, payload) => { calls.archives.push(payload); return { warnings: [], evidence_id: 123, record_id: '901' }; },
  writeAudit: async (_app, _officer, payload) => { calls.audits.push(payload); return { id: 'audit-1', ref: 'archived' }; },
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let status, body = '';
  await handler(req, { writeHead(code) { status = code; }, write(part) { body += part; }, end(part) { body += part || ''; } });
  return { status, body: JSON.parse(body) };
}
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
const image = `data:image/png;base64,${fixture.toString('base64')}`;
const video = `data:video/mp4;base64,${Buffer.from('synthetic test video').toString('base64')}`;
const args = (mode, file, extra = {}) => ({ mode, image, image2: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`,
  name2: 'renamed-reference.png', video, video_mime: 'video/mp4', duration_seconds: 10,
  frames: [{ index: 0, timestamp: 1, image }, { index: 1, timestamp: 8, image }], ...extra });

for (const entry of manifest.profiles) {
  for (const file of [entry.source_file, 'public' + entry.public_path]) {
    const link = syntheticReference({ buffer: fs.readFileSync(file) });
    assert.equal(link.profile_id, entry.profile_id);
    assert.equal(link.name, entry.name);
  }
}
const sowmya = manifest.profiles.find(row => row.profile_id === 28);
const chetan = manifest.profiles.find(row => row.profile_id === 176);
for (const mode of ['crowd', 'cctv', 'compareFace']) {
  // Omitted ID and a deliberately contradictory old dropdown ID.
  for (const extra of [{}, { criminal_id: chetan.profile_id }]) {
    const reply = await invoke(args(mode, sowmya.source_file, extra));
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.intelligence.criminal.name, 'Sowmya Achar');
    assert.equal(reply.body.resolved_fir_id, 1028);
    assert.equal(reply.body.reference_link.profile_id, 28);
    assert.equal(calls.profiles.at(-1), 28);
    assert.equal(calls.archives.at(-1).firId, 1028);
  }
  const next = await invoke(args(mode, chetan.source_file));
  assert.equal(next.body.intelligence.criminal.id, 176, 'replacement portrait must replace the linkage');
  matched = false;
  const reads = calls.profiles.length, caseReads = calls.cases.length;
  const noMatch = await invoke(args(mode, sowmya.source_file));
  assert.equal(noMatch.status, 200);
  assert.equal(noMatch.body.intelligence, null);
  assert.equal(noMatch.body.resolved_fir_id, null);
  assert.equal(calls.profiles.length, reads, 'no profile retrieval on failed comparison');
  assert.equal(calls.cases.length, caseReads);
  matched = true;
  const unknown = await invoke({ ...args(mode, sowmya.source_file), image2: image,
    name2: sowmya.source_file, criminal_id: 28 });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.match.matched, true);
  assert.equal(unknown.body.intelligence, null, 'an unknown reference never inherits a submitted ID');
  assert.equal(unknown.body.resolved_fir_id, null);
  assert.equal(unknown.body.reference_link.profile_id, null);
  assert.equal(calls.profiles.length, reads);
  assert(unknown.body.warnings.some(text => /not registered/.test(text)));
  stale = true;
  const conflict = await invoke(args(mode, sowmya.source_file));
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.error, /no longer matches/);
  stale = false;
}
const readCount = calls.profiles.length;
const preview = await invoke({ mode: 'evidence:reference', image: args('crowd', sowmya.source_file).image2, criminal_id: 176 });
assert.equal(preview.body.reference_link.profile_id, 28);
assert.equal(calls.profiles.length, readCount, 'preview returns registry metadata, not case details');
context.officer.role = 'analyst';
assert.equal((await invoke({ mode: 'evidence:reference', image })).status, 403);
assert.equal((await invoke(args('crowd', sowmya.source_file))).status, 403);
context.officer.role = 'investigation_officer';
unavailable = true;
const offline = await invoke(args('cctv', sowmya.source_file));
assert.equal(offline.status, 502);
assert.equal(calls.profiles.length, readCount);
assert(calls.audits.some(row => row.action === 'EVIDENCE_CCTV_FACE_SCAN' && row.detail.reference_link.profile_id === 28));
console.log('PASS: 140 registered PNG/WebP files; automatic CCTV/crowd/face linkage; forged/stale ID, unknown reference, no-match, stale DB, roles, audit and Zia failure guards.');
