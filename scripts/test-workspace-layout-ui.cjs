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
    const routes = process.env.NETRA_LAYOUT_ROUTES?.split(',') || ['dashboard', 'database', 'network', 'assistant', 'cases', 'cases/record/?id=1', 'criminals', 'criminals/record/?id=105', 'analytics', 'maps', 'predictions', 'evidence', 'investigations', 'reports', 'admin', 'settings'];
    for (const route of routes) {
      await page.goto(`${origin}/${route}${route.includes('?') ? '' : '/'}`);
      await page.locator('main h1').waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      for (const [width, height] of [[1600, 900], [1366, 680], [768, 900], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        const overflow = await page.locator('main').evaluate(main => [...main.querySelectorAll('*')].filter(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          // Chart geometry can extend beyond its clipped viewBox without overflowing the page.
          if (element instanceof SVGElement && element.ownerSVGElement) return false;
          if (!rect.width || !rect.height || rect.right <= innerWidth + 2 || style.visibility === 'hidden' || style.opacity === '0' || element.closest('[aria-hidden="true"], .react-flow, .leaflet-container, .recharts-tooltip-wrapper')) return false;
          for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth) return false;
          }
          return true;
        }).slice(0, 12).map(element => ({ tag: element.tagName, class: String(element.className).slice(0, 120), text: element.textContent.slice(0, 80) })));
        if (overflow.length) layoutFailures.push({ route, width, overflow });
        if (['database', 'network', 'assistant'].includes(route) && [1600, 390].includes(width)) await page.screenshot({ path: `/tmp/netra-layout-${route}-${width}.png`, fullPage: true });
      }
      console.log(JSON.stringify({ route, overflowFailures: layoutFailures.filter(item => item.route === route) }));
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`${origin}/database/`);
    await page.locator('.database-records tbody tr').nth(20).waitFor();
    const blank = await page.locator('.database-workspace > section').evaluate(section => {
      const last = section.lastElementChild.getBoundingClientRect();
      return section.getBoundingClientRect().bottom - last.bottom;
    });
    assert(blank < 40, `database has no stretched blank footer: ${blank}px`);
    await page.goto(`${origin}/network/`);
    await page.locator('.react-flow__node').first().waitFor();
    async function checkGraph(label) {
      await page.waitForTimeout(500);
      const clipped = await page.locator('.netra-network-canvas').evaluate(canvas => {
        const bounds = canvas.getBoundingClientRect();
        return [...canvas.querySelectorAll('.react-flow__node')].filter(node => {
          const box = node.getBoundingClientRect();
          return box.left < bounds.left - 2 || box.top < bounds.top - 2 || box.right > bounds.right + 2 || box.bottom > bounds.bottom + 2;
        }).map(node => node.dataset.id);
      });
      assert.deepEqual(clipped, [], `${label}: every node fits`);
      const overlaps = await page.locator('.netra-network-canvas').evaluate(canvas => {
        const nodes = [...canvas.querySelectorAll('.react-flow__node')];
        return nodes.flatMap((node, index) => {
          const a = node.getBoundingClientRect();
          return nodes.slice(index + 1).filter(other => {
            const b = other.getBoundingClientRect();
            return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
          }).map(other => [node.dataset.id, other.dataset.id]);
        });
      });
      assert.deepEqual(overlaps, [], `${label}: graph nodes do not overlap`);
    }
    await checkGraph('initial graph');
    await page.getByRole('button', { name: 'All direct links', exact: true }).click();
    await checkGraph('expanded graph');
    const transform = await page.locator('.react-flow__viewport').getAttribute('style');
    await page.locator('.netra-network-canvas').hover();
    await page.mouse.wheel(0, 500); await page.waitForTimeout(300);
    assert.equal(await page.locator('.react-flow__viewport').getAttribute('style'), transform, 'page scrolling does not move the graph');
    for (const width of [1366, 768, 390, 1600]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 680 });
      await checkGraph(`resized graph at ${width}`);
    }
    console.log(JSON.stringify({ routes: routes.length, viewports: 4, databaseBlankSpace: blank, graphFitsAfterResize: true, wheelPreservesGraph: true, layoutFailures, apiFailures, errors }));
    assert.deepEqual(layoutFailures, []); assert.deepEqual(apiFailures, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
