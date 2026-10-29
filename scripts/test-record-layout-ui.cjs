const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const { KSP_ER_TABLES } = require('../functions/ai_quickml/ksp-read-model');
const platform = require('../functions/ai_quickml/platform');

const db = new Database('data/netra.db', { readonly: true });
const rows = Object.fromEntries(KSP_ER_TABLES.map(table => [table, db.prepare(`SELECT * FROM "${table}"`).all().map((row, index) => ({ ...row, ROWID: `${table}-${index + 1}` }))]));
db.close();
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  datastore: () => ({ table: name => ({ getPagedRows: async () => ({ data: rows[name] || [], more_records: false }) }) }),
  stratus: () => ({ bucket: () => ({ putObject: async () => true, listPagedObjects: async () => ({ contents: [], truncated: 'false' }) }) }),
} };
Object.assign(platform, {
  createRequestContext: async () => context,
  countRows: async (_context, tables) => ({ counts: Object.fromEntries(tables.map(table => [table, rows[table]?.length || 0])) }),
  listRows: async (_context, table) => ({ rows: rows[table] || [] }),
  cacheGet: async () => null, cachePut: async () => {},
  writeAudit: async () => ({ id: 'layout-test-audit', ref: 'stratus://test-only/audit' }),
});
const handler = require('../functions/ai_quickml/index');
const errors = [], failures = [];
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200;
  await handler(req, { writeHead(code) { status = code; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  if (status >= 400) failures.push({ mode: payload.mode, status, body });
  return { status, contentType: 'application/json', body };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002') + url.pathname + url.search }) });
      return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    for (const id of [105, 24]) {
      await page.goto(`${origin}/criminals/record/?id=${id}`);
      await page.locator('.record-columns').waitFor({ timeout: 60000 });
      for (const width of [1920, 1280, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
        await page.waitForTimeout(200);
        const overflow = await page.locator('.record-detail').evaluate(root => [...root.querySelectorAll('*')].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.right > innerWidth + 2;
        }).map(element => ({ tag: element.tagName, class: String(element.className).slice(0, 100) })));
        assert.deepEqual(overflow, [], `profile ${id} fits ${width}px without hidden content`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (width === 1920 || width === 390) await page.screenshot({ path: `/tmp/netra-profile-${id}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${origin}/database/`);
    await page.locator('.database-records tbody tr').nth(20).waitFor({ timeout: 60000 });
    const scroll = page.locator('.database-scroll');
    for (const theme of ['daylight', 'nightwatch']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await scroll.evaluate(element => { element.scrollTop = 340; element.scrollLeft = 0; });
      await page.waitForTimeout(100);
      const head = page.locator('.database-records th').first();
      const header = await head.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { background: getComputedStyle(element).backgroundColor, top: rect.top, hit: document.elementFromPoint(rect.left + 10, rect.top + 15)?.closest('th') === element };
      });
      assert(header.hit, `${theme}: scrolling records stay below column headings`);
      assert(!header.background.startsWith('rgba('), `${theme}: header background is opaque`);
      const bounds = await scroll.boundingBox();
      assert(Math.abs(header.top - bounds.y - 1) < 2, `${theme}: header stays at scroll container top`);
      await scroll.evaluate(element => { element.scrollLeft = 650; });
      await page.screenshot({ path: `/tmp/netra-database-scroll-${theme}.png`, fullPage: true });
    }
    await page.evaluate(() => document.documentElement.dataset.theme = 'daylight');
    const landmark = await page.locator('.workspace-landmark').evaluate(element => {
      const image = element.querySelector('img');
      return { filter: getComputedStyle(image).filter, opacity: Number(getComputedStyle(element).opacity), mask: getComputedStyle(image).maskImage, ratio: image.clientWidth / image.clientHeight };
    });
    assert(landmark.filter.includes('netra-landmark-ink')); assert(landmark.opacity <= .26); assert(landmark.mask.includes('gradient'));
    assert(Math.abs(landmark.ratio - 1280 / 419) < .03, 'the masked image box follows the photograph edges without letterboxing');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log(JSON.stringify({ profiles: [105, 24], viewports: [1920, 1280, 768, 390], noProfileOverflow: true, opaqueStickyHeaders: true, landmarkBlended: true, errors, failures }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
