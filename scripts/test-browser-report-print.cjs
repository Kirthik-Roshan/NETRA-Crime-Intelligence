const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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
    await ctx.addInitScript(() => { window.print = () => { window.__printedForTest = true; }; });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/reports/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.report-kpi').filter({ hasText: '500' }).waitFor({ timeout: 60000 });
    const { REPORT_TEMPLATE_VERSION } = require('../functions/ai_quickml/report-contract');
    for (const [kind, title] of [['District', 'District Crime Report'], ['Trend', 'Crime Trend Report'], ['Network', 'Network Intelligence Report']]) {
      await page.getByRole('button', { name: kind, exact: true }).click();
      await page.getByRole('button', { name: 'Print preview', exact: true }).click();
      const frame = page.locator('iframe[title="NETRA branded report print preview"]');
      await frame.waitFor({ state: 'attached' });
      const content = frame.contentFrame();
      await content.locator('.emblem').waitFor({ state: 'attached' });
      assert.equal(await content.locator('html').getAttribute('data-report-template'), REPORT_TEMPLATE_VERSION);
      assert.equal(await content.locator('h1').innerText(), title);
      assert(await content.locator('.emblem').evaluate(image => image.complete && image.naturalWidth > 0));
      const html = await frame.evaluate(frame => frame.contentDocument.documentElement.outerHTML);
      const documentPage = await browser.newPage();
      await documentPage.setContent(html); await documentPage.emulateMedia({ media: 'print' });
      const pdfPath = kind === 'District' ? 'test-assets/reports/netra-browser-print-preview.pdf' : `/tmp/netra-${kind.toLowerCase()}-print-preview.pdf`;
      await documentPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true });
      const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
      assert(text.includes('KARNATAKA STATE POLICE') && text.includes(title) && text.includes('500'));
      assert(!/https?:\/\/|Crime Intelligence Platform \| KSP/.test(text));
      await documentPage.close();
      await frame.evaluate(frame => frame.remove());
      console.log(JSON.stringify({ kind, template: REPORT_TEMPLATE_VERSION, logo: true, actualStatistics: true, noBrowserHeaders: true }));
    }
    await page.keyboard.press('Control+p');
    await page.locator('iframe[title="NETRA branded report print preview"]').waitFor({state:'attached'});
    assert.deepEqual(errors, []); assert.deepEqual(apiFailures, []);
    console.log('Report exports: District, Trend and Network use the same current branded template, including browser print shortcuts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
