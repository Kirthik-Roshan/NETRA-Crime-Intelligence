import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { sessionPresence } = require('../functions/ai_quickml/session-presence');
const platform = require('../functions/ai_quickml/platform');
const stored = new Map();
const bucket = {
  listPagedObjects: async ({ prefix, continuationToken }) => {
    const keys = [...stored.keys()].filter(key => key.startsWith(prefix)).sort().reverse();
    const offset = Number(continuationToken || 0), page = keys.slice(offset, offset + 2);
    return { contents: page.map(key => ({ key })), truncated: String(offset + 2 < keys.length), next_continuation_token: offset + 2 < keys.length ? String(offset + 2) : undefined };
  },
  getObject: async key => Readable.from([stored.get(key)]),
  putObject: async (key, body) => { stored.set(key, body); return true; },
};
const officer = { id: 'officer-1', username: 'one@example.invalid', full_name: 'Test Officer', role: 'investigation_officer' };
const context = { authenticated: true, officer, app: { stratus: () => ({ bucket: () => bucket }) } };
const admin = { ...context, officer: { ...officer, id: 'admin', role: 'administrator' } };
const other = { ...context, officer: { ...officer, id: 'officer-2', username: 'two@example.invalid' } };
const reader = { ...context, officer: { ...officer, role: 'readonly' } };
const now = Date.parse('2026-10-26T23:59:00Z');
const beat = (ctx, id, time = now) => sessionPresence(ctx, { mode: 'auth:presence', session_id: id, path: '/app/evidence/?token=never-store-me', device: 'Chrome / Linux', user: { id: 'forged', role: 'administrator' } }, 'test-only', time);
const first = await beat(context, 'session-000000000001');
assert.equal(first.session.user.id, officer.id); assert.equal(first.session.user.role, officer.role);
assert.equal(first.session.path, '/app/evidence/');
await beat(context, 'session-000000000002'); await beat(other, 'session-000000000003');
const sessions = (ctx, time = now) => sessionPresence(ctx, { mode: 'auth:sessions' }, 'test-only', time);
assert.equal((await sessions(admin)).rows.length, 3, 'all paginated identities are loaded');
assert.equal((await sessions(context)).rows.length, 3, 'investigators see other signed-in officers across devices');
assert.equal((await sessions(context)).scope, 'department');
assert.equal((await sessions({ ...context, officer: { ...officer, role: 'analyst' } })).rows.length, 3);
assert.equal((await sessions(reader)).rows.length, 2, 'read-only accounts retain self scope');
assert.equal((await sessions(reader)).scope, 'self');
assert.equal((await sessions(admin)).scope, 'department');
assert.equal((await sessions(admin, now + 4 * 60000)).rows[0].status, 'idle');
assert.equal((await sessions(admin, now + 31 * 60000)).rows.length, 0, 'stale browsers expire');
await beat(context, 'session-000000000001', now + 120000);
assert.equal((await sessions(context, now + 120000)).rows.length, 3, 'day-boundary duplicates are collapsed');
await sessionPresence(context, { mode: 'auth:presence-end', session_id: 'session-000000000001' }, 'test-only', now + 130000);
const ended = await sessions(admin, now + 130000);
assert.equal(ended.rows.length, 2); assert(!ended.rows.some(row => row.id === 'session-000000000001'));
await assert.rejects(beat(context, 'session-000000000001', now + 140000), /ended/);
await sessionPresence(other, { mode: 'auth:presence-end', session_id: 'session-000000000002' }, 'test-only', now + 150000);
assert((await sessions(context, now + 150000)).rows.some(row => row.id === 'session-000000000002'), 'a different officer cannot close this browser reference');
await assert.rejects(beat({ ...context, authenticated: false }, 'session-000000000004'), /verified Catalyst/);
await assert.rejects(beat(context, '../bad-key'), /valid portal session/);
await assert.rejects(sessions({ ...context, app: { stratus: () => ({ bucket: () => ({ listPagedObjects: async () => { throw new Error('Storage unavailable'); } }) }) } }), /Storage unavailable/);
for (let i = 0; i < 5; i++) stored.set(`audit/2026/10/26/A-${i}.json`, JSON.stringify({ id: `A-${i}`, occurred_at: new Date(now + i * 1000).toISOString(), actor: { id: i % 2 ? 'officer-2' : officer.id } }));
assert.equal((await platform.listAudits(context.app, 200, officer.id)).length, 3, 'audit actor filter is applied while paging');
assert.equal((await platform.listAudits(context.app, 200)).length, 5);
const original = platform.createRequestContext;
let caller = context;
platform.createRequestContext = async () => caller;
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let status, body = '';
  await handler(req, { writeHead(code) { status = code; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  return { status, data: JSON.parse(body) };
}
try {
  assert.equal((await invoke({ mode: 'auth:sessions' })).data.scope, 'department');
  const selfAudit = await invoke({ mode: 'audit:list', max: 200 });
  assert(selfAudit.data.rows.every(row => row.actor.id === officer.id));
  caller = admin;
  assert.equal((await invoke({ mode: 'audit:list', max: 200 })).data.rows.length, 5);
  caller = { ...context, authenticated: false };
  assert.equal((await invoke({ mode: 'auth:sessions' })).status, 401);
} finally { platform.createRequestContext = original; }
console.log('Session presence: verified identities, browser isolation, pagination, day boundaries, expiry, logout, storage failures and audit permissions passed.');
