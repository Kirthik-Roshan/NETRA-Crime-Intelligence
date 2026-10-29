'use strict';
const crypto = require('crypto');
function reject(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

// Revisions are new rows, never destructive updates to the organizer schema.
async function caseJournal(context, payload, { listRows, writeAudit }) {
  if (!context.authenticated) reject('A verified Catalyst session is required.', 401);
  if (!['administrator', 'senior_officer', 'investigation_officer'].includes(context.officer.role)) reject('Case journal requires an investigation officer, supervisor or administrator.', 403);
  const caseId = Number(payload.case_id);
  if (!Number.isSafeInteger(caseId) || caseId < 1) reject('A valid CaseMasterID is required.');
  const cases = await listRows(context, 'CaseMaster', 5000, true);
  if (!cases.rows.some(row => Number(row.CaseMasterID) === caseId)) reject('Case not found.', 404);
  const table = context.app.datastore().table('NetraCaseJournal');
  const rows = [];
  let nextToken;
  do {
    const page = await table.getPagedRows({ nextToken, maxRows: 200 });
    rows.push(...page.data.filter(row => Number(row.CaseMasterID) === caseId));
    nextToken = page.more_records ? page.next_token : null;
  } while (nextToken);
  if (payload.mode === 'journal:list') return { rows: rows.sort((a,b) => String(b.CREATEDTIME).localeCompare(String(a.CREATEDTIME))) };
  const kind = String(payload.kind || '');
  const content = String(payload.content || '').trim();
  const reason = String(payload.reason || '').trim();
  if (!['case_information', 'investigation', 'evidence_reference'].includes(kind)) reject('Unsupported entry type.');
  if (content.length < 5 || content.length > 12000) reject('Entry must contain 5 to 12000 characters.');
  if (reason.length < 5 || reason.length > 500) reject('A change reason of 5 to 500 characters is required.');
  const requestId = String(payload.request_id || '');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) reject('A unique request ID is required.');
  const previous = payload.previous_revision ? String(payload.previous_revision) : '';
  if (previous && !rows.some(row => String(row.ROWID) === previous && row.Kind === kind)) reject('Previous revision must belong to this case and entry type.');
  const duplicate = rows.find(row => row.RequestID === requestId);
  if (duplicate) return { row: duplicate, duplicate: true };
  const row = await table.insertRow({ CaseMasterID: caseId, Kind: kind, Content: content, Reason: reason, PreviousRevisionID: previous, RequestID: requestId, ActorID: String(context.officer.id), IntegrityHash: crypto.createHash('sha256').update(JSON.stringify({ caseId, kind, content, reason, previous, actor: context.officer.id })).digest('hex') });
  const audit = await writeAudit(context.app, context.officer, { action: 'CASE_JOURNAL_APPEND', entity: 'CaseMaster', entity_id: String(caseId), detail: { revision_id: row.ROWID, previous_revision: previous, kind, reason } });
  return { row, audit_id: audit.id, warning: audit.ref ? null : 'Entry saved; Stratus audit archive unavailable. Revision remains in Cloud Scale.' };
}
async function journalContext(context, hits) {
  if (!context.authenticated) return [];
  const ids = new Set(hits.map(hit => Number(hit.row.CaseMasterID || hit.row.fir_id || (['Firs', 'Cases'].includes(hit.table) ? hit.row.id : 0))).filter(id => Number.isSafeInteger(id) && id > 0));
  if (!ids.size) return [];
  const rows = []; let nextToken;
  do { const page = await context.app.datastore().table('NetraCaseJournal').getPagedRows({ nextToken, maxRows: 200 }); rows.push(...page.data.filter(row => ids.has(Number(row.CaseMasterID)))); nextToken = page.more_records ? page.next_token : null; } while (nextToken);
  const superseded = new Set(rows.map(row => String(row.PreviousRevisionID || '')));
  return rows.filter(row => !superseded.has(String(row.ROWID))).slice(-12).map(row => ({ table: 'NetraCaseJournal', score: 1, row: { id: row.ROWID, CaseMasterID: row.CaseMasterID, description: row.Content, entry_type: row.Kind, actor: row.ActorID, created_at: row.CREATEDTIME } }));
}
module.exports = { caseJournal, journalContext };
