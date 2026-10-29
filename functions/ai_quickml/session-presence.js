'use strict';

const crypto = require('crypto');
const ACTIVE_MS = 3 * 60 * 1000;
const RECENT_MS = 30 * 60 * 1000;
// Operational officers may see concurrent portal use. This permission does
// not grant access to another officer's audit trail or account administration.
const PRIVILEGED = new Set(['administrator', 'senior_officer', 'investigation_officer', 'analyst']);
const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
const fail = (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }); };
const day = value => new Date(value).toISOString().slice(0, 10);
const prefix = (now, owner = '') => `sessions/v1/${day(now)}/${owner ? `${digest(owner)}/` : ''}`;
async function read(bucket, key) {
  const parts = [];
  for await (const part of await bucket.getObject(key)) parts.push(Buffer.from(part));
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function records(bucket, scope, warnings) {
  let token; const keys = [];
  do {
    const page = await bucket.listPagedObjects({ prefix: scope, maxKeys: '200', ...(token ? { continuationToken: token } : {}) });
    keys.push(...(page.contents || []).map(item => item.key || item.keyDetails?.key).filter(key => key?.startsWith(scope) && key.endsWith('.json')));
    const next = page.next_continuation_token;
    if (String(page.truncated) === 'true' && (!next || next === token)) fail('Session presence listing is incomplete. Retry refresh.', 502);
    token = String(page.truncated) === 'true' ? next : null;
    if (keys.length >= 2000 && token) { warnings.push('Session listing reached its daily read limit. The displayed roster may be incomplete.'); break; }
  } while (token);
  const rows = [];
  for (let i = 0; i < keys.length; i += 20) {
    rows.push(...await Promise.all(keys.slice(i, i + 20).map(async key => {
      try { return { key, row: await read(bucket, key) }; }
      catch { warnings.push('One or more presence records could not be read.'); return null; }
    })));
  }
  return rows.filter(Boolean);
}
async function save(bucket, key, row) {
  const saved = await bucket.putObject(key, JSON.stringify(row), { contentType: 'application/json', overwrite: true });
  if (saved === false) fail('Session presence could not be stored.', 503);
}
function publicSession(row, now) {
  return { id: row.id, user: row.user, started_at: row.started_at, last_seen_at: row.last_seen_at, path: row.path, device: row.device, status: now - Date.parse(row.last_seen_at) <= ACTIVE_MS ? 'active' : 'idle' };
}
async function sessionPresence(context, payload, bucketName, now = Date.now()) {
  if (!context.authenticated || !context.officer?.id) fail('A verified Catalyst session is required.', 401);
  const bucket = context.app.stratus().bucket(bucketName);
  const owner = String(context.officer.id);
  const warnings = [];
  const id = String(payload.session_id || '');
  if (payload.mode !== 'auth:sessions' && !/^[a-zA-Z0-9-]{16,80}$/.test(id)) fail('A valid portal session identifier is required.', 400);
  if (payload.mode === 'auth:presence') {
    const key = `${prefix(now, owner)}${id}.json`;
    // Exact-key listing distinguishes a missing record from a storage outage.
    const existing = await records(bucket, key, warnings);
    const previous = existing.find(item => item.key === key)?.row;
    const user = context.officer;
    const row = {
      version: 1, id, user: { id: owner, username: user.username, full_name: user.full_name, role: user.role },
      started_at: previous?.started_at || new Date(now).toISOString(), last_seen_at: new Date(now).toISOString(),
      path: String(payload.path || '/').split(/[?#]/)[0].replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 200),
      device: String(payload.device || 'Browser').replace(/[^a-zA-Z0-9 /()._-]/g, '').slice(0, 100),
      ended_at: null,
    };
    if (previous?.ended_at) fail('This portal session has ended. Sign in again.', 401);
    await save(bucket, key, row);
    return { ok: true, session: publicSession(row, now), warnings: [...new Set(warnings)] };
  }
  const privileged = PRIVILEGED.has(context.officer.role);
  const scopeOwner = payload.mode === 'auth:sessions' && privileged ? '' : owner;
  const all = [...await records(bucket, prefix(now, scopeOwner), warnings), ...await records(bucket, prefix(now - 86400000, scopeOwner), warnings)];
  if (payload.mode === 'auth:presence-end') {
    // End this browser reference only. Other authenticated devices remain visible.
    for (const { key, row } of all.filter(item => String(item.row.user?.id) === owner && item.row.id === id && !item.row.ended_at)) {
      await save(bucket, key, { ...row, ended_at: new Date(now).toISOString() });
    }
    return { ok: true, warnings: [...new Set(warnings)] };
  }
  if (payload.mode !== 'auth:sessions') fail('Unsupported session operation.', 400);
  const latest = new Map();
  for (const { row } of all) {
    if (!row.user?.id || (!privileged && String(row.user.id) !== owner)) continue;
    const key = `${row.user.id}:${row.id}`;
    if (!latest.has(key) || row.last_seen_at > latest.get(key).last_seen_at) latest.set(key, row);
  }
  const rows = [...latest.values()].filter(row => !row.ended_at && now - Date.parse(row.last_seen_at) <= RECENT_MS && Date.parse(row.last_seen_at) <= now)
    .map(row => publicSession(row, now)).sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));
  return { rows, scope: privileged ? 'department' : 'self', observed_at: new Date(now).toISOString(), active_window_seconds: ACTIVE_MS / 1000, expiry_seconds: RECENT_MS / 1000, warnings: [...new Set(warnings)] };
}

module.exports = { sessionPresence, PRIVILEGED };
