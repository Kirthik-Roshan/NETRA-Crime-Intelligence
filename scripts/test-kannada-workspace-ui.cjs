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
    let page = await ctx.newPage(); page.setDefaultNavigationTimeout(90000); page.on('pageerror', error => errors.push(error.message));
    const routes = process.env.NETRA_KANNADA_ROUTES?.split(',') || ['dashboard', 'database', 'network', 'assistant', 'cases', 'cases/record/?id=1', 'criminals', 'criminals/record/?id=105', 'analytics', 'maps', 'predictions', 'evidence', 'investigations', 'reports', 'admin', 'settings'];
    await page.goto(`${origin}/dashboard/`, { waitUntil: 'domcontentloaded' });
    await page.locator('main h1').waitFor({ timeout: 60000 });
    await page.getByTitle('Toggle language', { exact: true }).click();
    await page.getByText('ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು', { exact: true }).first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'kn');
    const results = [];
    for (const route of routes) {
      await page.goto(`${origin}/${route}${route.includes('?') ? '' : '/'}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main h1').waitFor({ timeout: 60000 });
      await page.waitForTimeout(750);
      const heading = await page.locator('main h1').innerText();
      if (!route.includes('/record/')) assert(/[\u0C80-\u0CFF]/.test(heading), `${route} has a Kannada heading: ${heading}`);
      const text = await page.locator('main').innerText();
      if (route === 'dashboard') {
        for (const label of ['ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು', 'ಪ್ರಕರಣ ಪರಿಹಾರ ಪ್ರಮಾಣ', 'ಅಪರಾಧ ವರ್ಗಗಳು', 'ತಕ್ಷಣ ಪರಿಶೀಲನೆ ಅಗತ್ಯ', 'ಪ್ರಮುಖ ಜಿಲ್ಲೆಗಳು']) assert(text.includes(label), `dashboard: ${label}`);
        assert(text.includes('500')); assert(text.includes('309'));
        assert(!text.includes('Require immediate review'));
      }
      if (route.includes('id=105')) assert(text.includes('ಅಬ್ದುಲ್ ದೇಸಾಯಿ'), 'registered name has a Kannada display spelling');
      for (const width of [1600, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(200);
        const overflow = await page.locator('main').evaluate(main => [...main.querySelectorAll('*')].filter(element => {
          const r = element.getBoundingClientRect(), style = getComputedStyle(element);
          if (element instanceof SVGElement && element.ownerSVGElement) return false;
          if (!r.width || !r.height || r.right <= innerWidth + 2 || style.visibility === 'hidden' || style.opacity === '0' || element.closest('[aria-hidden="true"], .react-flow, .leaflet-container, .recharts-tooltip-wrapper')) return false;
          for (let p = element.parentElement; p && p !== main; p = p.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) return false;
          return true;
        }).slice(0, 8).map(e => e.textContent.slice(0, 100)));
        if (overflow.length) layoutFailures.push({ route, width, overflow });
      }
      await page.setViewportSize({ width: 1600, height: 900 });
      if (route === 'dashboard') await page.screenshot({ path: '/tmp/netra-kannada-dashboard.png', fullPage: true });
      results.push({ route, heading }); console.log(JSON.stringify(results.at(-1)));
      await page.close(); page = await ctx.newPage(); page.setDefaultNavigationTimeout(90000); page.on('pageerror', error => errors.push(error.message));
    }
    await page.goto(`${origin}/settings/`, { waitUntil: 'domcontentloaded' });
    await page.getByTitle('ಭಾಷೆ ಬದಲಿಸಿ', { exact: true }).click();
    await page.getByTitle('Toggle language', { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('main h1').innerText(), 'Settings');
    await page.goto(`${origin}/dashboard/`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Require immediate review', { exact: true }).waitFor();
    console.log(JSON.stringify({ pages: results.length, languagePersistence: true, englishRestored: true, recordNamesPreserved: true, layoutFailures, apiFailures, errors }));
    assert.deepEqual(errors, []); assert.deepEqual(layoutFailures, []); assert.deepEqual(apiFailures, []);
    await ctx.unrouteAll({ behavior: 'wait' });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
