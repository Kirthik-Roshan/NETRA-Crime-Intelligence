'use strict';

const { authorize } = require('./file-library');
const { sourceChat, compact, readable, intelligenceBlocks, fail } = require('./source-chat');

async function evidenceChat(context, payload, dependencies, event = () => {}) {
  authorize(context);
  if (!String(payload.record_id || payload.evidence_id || '').match(/^\d{1,25}$/)) fail('Select a saved evidence record to ask about.');
  event('Evidence access', 'running', 'Reading the saved evidence record and its archived analysis');
  const { rows } = await dependencies.listRows(context, 'Evidence', 5000, true);
  const row = rows.find(item => payload.record_id ? String(item.ROWID || item.rowid) === String(payload.record_id) : String(item.id) === String(payload.evidence_id));
  if (!row) fail('The selected evidence record is unavailable.', 404);
  let storage;
  try { storage = JSON.parse(row.storage_ref); } catch { fail('This evidence has no saved analysis to query.', 409); }
  if (storage.bucket !== dependencies.bucketName || !/^evidence\/[\w/-]+-result\.json$/.test(storage.result_key || '') || storage.result_key.includes('..')) fail('This evidence has no valid archived analysis.', 409);
  const stream = await context.app.stratus().bucket(dependencies.bucketName).getObject(storage.result_key);
  let size = 0; const parts = [];
  for await (const chunk of Buffer.isBuffer(stream) ? [stream] : stream) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length; if (size > 2 * 1024 * 1024) fail('Saved analysis exceeds the query limit.', 413); parts.push(buffer); }
  let archive;
  try { archive = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { fail('The archived analysis could not be read.', 409); }
  // Chat is scoped to this officer’s own scan, not a client-supplied result/key.
  if (!archive.actor?.id || String(archive.actor.id) !== String(context.officer.id)) fail('Only the officer who created this scan can query its analysis.', 403);
  const prefix = `evidence:${row.ROWID || row.id}`;
  const blocks = [{ id: `${prefix}:scan`, title: `Saved ${archive.analysis} analysis · Evidence ${row.id}`, text: readable(compact({ analysis: archive.analysis, collected_at: row.collected_at, observations: archive.result })).slice(0, 16000) },
    { id: `${prefix}:limits`, title: 'Analysis limits and missing information', text: 'This saved scan contains machine observations, not independent verification of the exhibit. Source authenticity, event time and location, and any person’s identity require separate supporting records and officer review. Ask about a specific extracted value or FIR to check the available sources.' }];
  const firId = Number(row.fir_id);
  if (Number.isSafeInteger(firId) && firId > 0) {
    const intelligence = await dependencies.caseIntelligence(context.app, firId);
    blocks.push(...intelligenceBlocks(intelligence, prefix));
  } else blocks.push({ id: `${prefix}:link`, title: 'FIR linkage', text: 'This evidence is not currently linked to an official FIR. Select an incident FIR to correlate it; no case association has been inferred.' });
  event('Evidence access', 'complete', 'Saved scan verified; current FIR linkage checked');
  return sourceChat(context, payload, blocks, dependencies, event);
}
module.exports = { evidenceChat };
