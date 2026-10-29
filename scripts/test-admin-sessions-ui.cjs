const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const platform = require('../functions/ai_quickml/platform');
const { sessionPresence } = require('../functions/ai_quickml/session-presence');
const stored = new Map();
const bucket = {
  getObject: async key => Readable.from([stored.get(key)]),
  putObject: async (key, body) => { stored.set(key, body); return true; },
  listPagedObjects: async ({ prefix }) => ({ contents: [...stored.keys()].filter(key => key.startsWith(prefix)).sort().reverse().map(key => ({ key })), truncated: 'false' }),
};
const alice = { id: 'admin', username: 'alice@example.invalid', full_name: 'Alice Administrator', role: 'administrator' };
const bob = { id: 'officer', username: 'bob@example.invalid', full_name: 'Bob Investigator', role: 'investigation_officer' };
let officer = alice, broken = false;
const app = { stratus: () => ({ bucket: () => bucket }), userManagement: () => ({ getAllUsers: async () => [alice, bob].map(user => ({ user_id: user.id, first_name: user.full_name, email_id: user.username, role_details: { role_name: user.role } })) }) };
platform.createRequestContext = async () => ({ app, officer, authenticated: true });
platform.searchRecords = async () => ({ hits: [], engine: 'test-only' });
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  if (broken && payload.mode === 'auth:sessions') return { status: 503, contentType: 'application/json', body: '{"error":"Presence storage unavailable"}' };
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let status = 200, body = '';
  await handler(req, { writeHead(code) { status = code; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  return { status, contentType: 'application/json', body };
}
(async () => {
  for (const [user, id, device] of [[alice, 'alice-session-00000001', 'Chrome / Linux'], [bob, 'bobs-session-000000001', 'Firefox / Linux'], [bob, 'bobs-session-000000002', 'Chrome / Android']]) {
    await sessionPresence({ app, officer: user, authenticated: true }, { mode: 'auth:presence', session_id: id, path: '/app/evidence/', device }, platform.STRATUS_BUCKET);
  }
  for (const user of [alice, bob]) await platform.writeAudit(app, user, { action: 'AI_EVIDENCE_QUERY', entity: 'Evidence', detail: { note: 'UI test fixture' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"preview",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002') + url.pathname + url.search, maxRetries: 2 }) });
      return route.abort();
    });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/admin/');
    const presence = page.getByRole('region', { name: 'Portal session presence' });
    await presence.getByText('Bob Investigator', { exact: true }).waitFor();
    await presence.locator('article').filter({ hasText: 'bob@example.invalid' }).getByRole('button', { name: '2 sessions', exact: true }).click();
    await presence.locator('dl').filter({ hasText: 'Chrome / Android' }).waitFor();
    await presence.locator('article').filter({ hasText: 'bob@example.invalid' }).getByRole('button', { name: 'View activity' }).click();
    const audit = page.locator('#admin-audit-trail');
    await audit.getByText('Activity for Bob Investigator').waitFor();
    assert.equal(await audit.locator('tbody tr').count(), 1);
    await audit.locator('tbody tr').click();
    await page.getByRole('dialog', { name: 'Audit event details' }).getByText('bob@example.invalid', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close audit details' }).click();
    await page.screenshot({ path: '/tmp/netra-admin-sessions-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'admin page fits mobile');
    await page.screenshot({ path: '/tmp/netra-admin-sessions-mobile.png', fullPage: true });
    broken = true;
    await presence.getByRole('button', { name: 'Refresh', exact: true }).click();
    await presence.getByRole('alert').waitFor();
    assert.match(await presence.getByRole('alert').innerText(), /Presence storage unavailable/);
    broken = false; officer = bob;
    await page.reload();
    await presence.getByText('Department-wide portal presence', { exact: false }).waitFor();
    await presence.getByText('Bob Investigator', { exact: true }).waitFor();
    assert.equal(await presence.getByText('Alice Administrator', { exact: true }).count(), 1);
    assert(await presence.getByRole('button', { name: 'View activity' }).first().isDisabled());
    assert((await page.locator('#admin-audit-trail tbody tr').count()) >= 1);
    assert.equal(await page.locator('#admin-audit-trail tbody').getByText('alice@example.invalid', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Admin UI: multiple identities/devices, activity drilldown, audit details, storage warning, mobile layout and officer isolation passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
