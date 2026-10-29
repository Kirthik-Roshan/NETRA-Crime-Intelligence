const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const { KSP_ER_TABLES, buildKspReadModel } = require('../functions/ai_quickml/ksp-read-model');
const platform = require('../functions/ai_quickml/platform');

const db = new Database('data/netra.db', { readonly: true });
const official = Object.fromEntries(KSP_ER_TABLES.map(table => [table, db.prepare(`SELECT * FROM "${table}"`).all().map((row, index) => ({ ...row, ROWID: `${table}-${index + 1}` }))]));
db.close();
const model = buildKspReadModel(official);
const errors = [], failures = [], replies = [];
let browser, reportHtml = '';
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  stratus: () => ({ bucket: () => ({ putObject: async () => true, listPagedObjects: async () => ({ contents: [], truncated: 'false' }) }) }),
  datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: [], more_records: false }) }) }),
  smartbrowz: () => ({ convertToPdf: async html => {
    reportHtml = html;
    const page = await browser.newPage();
    try { await page.setContent(html); return Readable.from([await page.pdf({ format: 'A4', printBackground: true })]); }
    finally { await page.close(); }
  } }),
} };
Object.assign(platform, {
  createRequestContext: async () => context,
  cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, views) => Object.fromEntries(views.map(view => [view, model[view] || []])),
  listRows: async () => ({ rows: [] }),
  writeAudit: async () => ({ id: 'analysis-browser-audit', ref: 'stratus://test-only/audit' }),
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200, headers = {};
  await handler(req, { writeHead(code, value) { status = code; headers = value; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  if (status >= 400) failures.push({ mode: payload.mode, status, body });
  if (payload.mode === 'rag') {
    const result = body.trim().split('\n').map(line => JSON.parse(line)).find(row => row.type === 'result');
    replies.push(result?.data || JSON.parse(body));
  }
  return { status, headers, body };
}

(async () => {
  browser = await chromium.launch({ headless: true });
  try {
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1672, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) {
        const result = await invoke(route.request().postDataJSON());
        return route.fulfill({ status: result.status, contentType: result.headers['Content-Type'] || 'application/json', body: result.body });
      }
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002') + url.pathname + url.search }) });
      if (url.hostname.endsWith('tile.openstreetmap.org')) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/assistant/`);
    const input = page.getByPlaceholder(/Ask about crimes/);
    await input.waitFor({ timeout: 60000 });
    const panels = page.locator('.assistant-analysis');
    async function newAnalysis(action) {
      const count = await panels.count();
      await action();
      try { await page.waitForFunction(expected => document.querySelectorAll('.assistant-analysis').length === expected, count + 1); }
      catch (error) {
        await page.screenshot({ path: '/tmp/netra-track1-assistant-failure.png', fullPage: true });
        console.error('Latest analysis response:', JSON.stringify(replies.at(-1)));
        throw error;
      }
      return replies.at(-1).analysis;
    }
    async function ask(query) {
      return newAnalysis(async () => { await input.fill(query); await input.press('Enter'); });
    }
    await input.fill('hi'); await input.press('Enter');
    await page.getByText('Hi! How can I help you today?', { exact: true }).waitFor();
    assert.equal(await panels.count(), 0);
    const initial = await ask('Show all crime patterns by district');
    assert.equal(initial.total, 500);
    await panels.first().locator('.recharts-bar-rectangle').first().waitFor();
    const mapped = await newAnalysis(() => panels.first().getByRole('button', { name: 'Map', exact: true }).click());
    assert.equal(mapped.total, 500);
    await panels.first().locator('.leaflet-container').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.assistant-analysis .leaflet-tile')].some(image => image.complete && image.naturalWidth > 0), { timeout: 30000 });
    assert(mapped.points.length > 0);
    const narrowed = await ask('Now only Mysuru');
    assert.equal(narrowed.total, model.Firs.filter(row => row.district === 'Mysuru').length);
    assert.deepEqual(narrowed.context.districts, ['Mysuru']);
    const monthly = await ask('What are the crime trends in Mysuru?');
    assert.equal(monthly.total, narrowed.total);
    assert.equal(monthly.context.view, 'line');
    await panels.first().locator('.recharts-line').first().waitFor();
    await ask('Show vehicle theft patterns by district');
    const counts = panels.first();
    await counts.locator('summary').filter({ hasText: 'Matching FIRs' }).click();
    await counts.getByRole('checkbox').nth(0).check();
    await counts.getByRole('checkbox').nth(1).check();
    const comparison = await newAnalysis(() => counts.getByRole('button', { name: 'Compare selected FIRs', exact: true }).click());
    assert.equal(comparison.comparison.cases.length, 2);
    assert(comparison.comparison.findings.length > 0);
    await panels.first().locator('.react-flow__node').first().waitFor();
    await panels.first().locator('.analysis-finding').first().click();
    await panels.first().locator('summary').filter({ hasText: 'Evidence sources' }).click();
    const source = comparison.comparison.sources.find(row => row.table === 'CaseMaster');
    await panels.first().locator('details[open]').getByRole('button', { name: source.label, exact: true }).click();
    await panels.first().getByLabel('Exclusion reason', { exact: true }).fill('Source details require original-record verification.');
    const excluded = await newAnalysis(() => panels.first().getByRole('button', { name: 'Exclude & recalculate', exact: true }).click());
    assert.equal(excluded.comparison.counts.excluded, 1);
    assert(excluded.comparison.findings.some(row => !row.active));
    assert.equal(comparison.comparison.counts.excluded, 0, 'earlier analysis remains unchanged');
    const warning = await newAnalysis(() => panels.first().getByRole('button', { name: 'Warnings', exact: true }).click());
    assert(warning.periods);
    assert(warning.warnings.some(text => text.includes('Descriptive early-warning rule')));
    if (warning.latest_incident && warning.latest_incident < warning.periods.current_start) {
      await panels.first().getByRole('status').filter({ hasText: 'Latest incident date in this scope:' }).waitFor();
      const historical = await newAnalysis(() => panels.first().getByRole('button', { name: 'Compare at latest recorded incident', exact: true }).click());
      assert.equal(historical.context.end_date, warning.latest_incident);
      assert(historical.periods.current > 0, 'historical window uses actual recorded incidents');
      const shorter = await newAnalysis(() => panels.first().getByRole('combobox', { name: 'Comparison window length' }).selectOption('7'));
      assert.equal(shorter.context.days, 7);
      assert.equal(shorter.context.end_date, warning.latest_incident);
      assert.deepEqual(shorter.context.offences, ['Vehicle Theft']);
      const expected = model.Firs.filter(row => row.crime_type === 'Vehicle Theft' && row.occurred_at.slice(0, 10) >= shorter.periods.current_start && row.occurred_at.slice(0, 10) <= shorter.periods.current_end).length;
      assert.equal(shorter.periods.current, expected);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    await (await download).saveAs('/tmp/netra-track1-conversation.pdf');
    assert(reportHtml.includes('Map observations'));
    assert(reportHtml.includes('Evidence dependency graph'));
    assert(reportHtml.includes('Analysis activity'));
    assert(reportHtml.includes(source.fingerprint));
    assert(reportHtml.includes('Excluded: Source details require original-record verification.'));
    for (const width of [1672, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await page.waitForTimeout(400);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page fits ${width}px`);
      assert((await input.boundingBox()).width >= 200, `query input remains usable at ${width}px`);
      const overflow = await panels.first().evaluate(panel => [...panel.querySelectorAll('*')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > innerWidth + 2 && !element.closest('.analysis-table-scroll, .leaflet-container, .react-flow__viewport');
      }).map(element => ({ tag: element.tagName, class: String(element.className).slice(0, 70) })));
      assert.deepEqual(overflow, [], `analysis controls fit ${width}px`);
      await page.screenshot({ path: `/tmp/netra-track1-assistant-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log(JSON.stringify({ actualSyntheticFirs: model.Firs.length, charts: true, osmTiles: true, contextualFilters: true, comparison: true, exclusion: true, warningWindows: true, conversationPdf: true, viewports: [1672, 768, 390], errors, failures }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
