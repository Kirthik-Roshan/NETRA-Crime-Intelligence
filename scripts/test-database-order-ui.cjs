const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const { KSP_ER_TABLES, buildKspReadModel } = require('../functions/ai_quickml/ksp-read-model');
const platform = require('../functions/ai_quickml/platform');
const db = new Database('data/netra.db', { readonly: true });
const official = Object.fromEntries(KSP_ER_TABLES.map(table => [table, db.prepare(`SELECT * FROM "${table}"`).all().map((row, i) => ({ ...row, ROWID: `${table}-${i + 1}` }))]));
db.close();
const model = buildKspReadModel(official);
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  datastore: () => ({ table: name => ({ getPagedRows: async () => ({ data: official[name] || [], more_records: false }) }) }),
  stratus: () => ({ bucket: () => ({ putObject: async () => true, listPagedObjects: async () => ({ contents: [], truncated: 'false' }) }) }),
  userManagement: () => ({ getAllUsers: async () => [{ user_id: '1', first_name: 'Preview', last_name: 'Officer', email_id: 'preview@example.invalid' }] }),
} };
Object.assign(platform, {
  createRequestContext: async () => context,
  cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, tables) => Object.fromEntries(tables.map(table => [table, model[table] || []])),
  countRows: async (_context, tables) => ({ counts: Object.fromEntries(tables.map(table => [table, (official[table] || model[table] || []).length])) }),
  listRows: async (_context, table) => ({ rows: official[table] || model[table] || [] }),
  searchRecords: async () => ({ hits: [], engine: 'test-fixture' }),
  writeAudit: async () => ({ id: 'layout-audit', ref: 'stratus://test-only/audit' }),
});
const handler = require('../functions/ai_quickml/index');
const errors = [], apiFailures = [], layoutFailures = [];
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200, headers = {};
  await handler(req, { writeHead(code, value) { status = code; headers = value; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  if (status >= 400) apiFailures.push({ mode: payload.mode, status, body });
  return { status, contentType: headers['Content-Type'] || 'application/json', body };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002') + url.pathname + url.search, maxRetries: 2 }) });
      if (url.hostname.endsWith('tile.openstreetmap.org')) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/database/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.database-records tbody tr').nth(49).waitFor({ timeout: 60000 });
    const ids = () => page.locator('.database-records tbody tr td:first-child').allTextContents();
    assert.deepEqual((await ids()).map(Number), Array.from({ length: 50 }, (_, i) => i + 1));
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    assert.deepEqual((await ids()).map(Number), Array.from({ length: 50 }, (_, i) => i + 51));
    await page.getByRole('button', { name: 'Sort by CaseMasterID', exact: true }).click();
    assert.deepEqual((await ids()).map(Number), Array.from({ length: 50 }, (_, i) => 500 - i));
    await page.getByRole('button', { name: 'Sort by CaseMasterID', exact: true }).click();
    const first = model.Cases.find(row => row.id === 1);
    const values = await page.locator('.database-records tbody tr').first().locator('td').allTextContents();
    const columns = await page.locator('.database-records th button').allTextContents();
    assert.equal(values[0], '1');
    assert.equal(values[1], String(official.CaseMaster.find(row => row.CaseMasterID === 1).CrimeNo));
    for (const [width, height] of [[1600, 900], [1366, 680], [390, 844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      const box = await page.locator('.database-scroll').boundingBox();
      if (width >= 1024) assert(box.y + box.height < height, 'scroll area fits within application viewport');
      const gap = await page.locator('.database-workspace > section').evaluate(section => section.getBoundingClientRect().bottom - section.lastElementChild.getBoundingClientRect().bottom);
      assert(gap < 40, `no stretched empty footer: ${gap}`);
      await page.locator('.database-scroll').evaluate(element => { element.scrollTop = 400; element.scrollLeft = 200; });
      const aligned = await page.locator('.database-records').evaluate(table => {
        const headers = [...table.querySelectorAll('th')], cells = [...table.querySelector('tbody tr').children];
        return headers.every((header, i) => Math.abs(header.getBoundingClientRect().left - cells[i].getBoundingClientRect().left) < 1);
      });
      assert(aligned, 'headers and values remain column-aligned while scrolling');
      const header = await page.locator('.database-records th').first().boundingBox();
      const viewport = await page.locator('.database-scroll').boundingBox();
      assert(Math.abs(header.y - viewport.y) < 3, 'column headings stick to table viewport');
      await page.locator('.database-scroll').evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.screenshot({ path: '/tmp/netra-database-sorted.png', fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(apiFailures, []);
    console.log('Database: numeric CaseMasterID 1–50 / 51–100, reverse 500–451, correct CrimeNo mapping, viewport fit, sticky aligned headers and no empty footer verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
