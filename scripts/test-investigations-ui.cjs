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
const evidence = [
  { ROWID: 'test-car-evidence', id: 9001, fir_id: 1, type: 'ZIA_OCR', description: 'Synthetic car image OCR observation: KA 03 AB 7161', storage_ref: 'stratus://test-only/car' },
  { ROWID: 'test-bike-evidence', id: 9002, fir_id: 2, type: 'ZIA_OCR', description: 'Synthetic motorcycle image OCR observation: KA 03 AB 7161', storage_ref: 'stratus://test-only/bike' },
];
const objects = new Map(), journal = [], errors = [], apiFailures = [];
let browser;
let renderedPdfHtml = '';
const bucket = {
  async listPagedObjects({ prefix }) { return { contents: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: 'false' }; },
  async getObject(key) { if (!objects.has(key)) throw new Error('Not found'); return Readable.from([objects.get(key)]); },
  async putObject(key, body, options) { if (options.overwrite === false && objects.has(key)) throw new Error('Already exists'); objects.set(key, body); return true; },
};
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  stratus: () => ({ bucket: () => bucket }),
  datastore: () => ({ table: name => ({
    getPagedRows: async () => ({ data: name === 'NetraCaseJournal' ? journal : [], more_records: false }),
    insertRow: async row => { const saved = { ...row, ROWID: `journal-${journal.length + 1}`, CREATEDTIME: new Date().toISOString() }; journal.push(saved); return saved; },
  }) }),
  smartbrowz: () => ({ convertToPdf: async html => {
    renderedPdfHtml = html;
    const pdfPage = await browser.newPage();
    try { await pdfPage.setContent(html); return Readable.from([await pdfPage.pdf({ format: 'A4', printBackground: true })]); }
    finally { await pdfPage.close(); }
  } }),
} };
Object.assign(platform, {
  createRequestContext: async () => context,
  cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, views) => Object.fromEntries(views.map(view => [view, model[view] || []])),
  listRows: async (_ctx, table) => ({ rows: table === 'Evidence' ? evidence : official[table] || [] }),
  writeAudit: async () => ({ id: 'browser-test-audit', ref: 'stratus://test-only/audit' }),
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200, headers = {};
  await handler(req, { writeHead(code, value) { status = code; headers = value; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  if (status >= 400) apiFailures.push({ mode: payload.mode, status, body });
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
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002')) + url.pathname + url.search }) });
      return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/investigations/?cases=1,2`);
    await page.getByRole('button', { name: 'Compare records', exact: true }).waitFor({ timeout: 60000 });
    await page.getByText('500 available', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Officer observations', exact: false }).click();
    async function observation(caseId, type, reference) {
      await page.getByLabel('FIR', { exact: true }).selectOption(String(caseId));
      await page.getByLabel('Registration', { exact: true }).fill('KA 03 AB 7161');
      await page.getByLabel('Vehicle type', { exact: true }).selectOption(type);
      await page.getByLabel('Media / source reference', { exact: true }).fill(reference);
      await page.getByLabel('Review note', { exact: true }).fill(`Officer inspected the ${type} registration in synthetic demo media.`);
      await page.getByRole('button', { name: 'Add observation', exact: true }).click();
    }
    await observation(1, 'car', 'numberplate.png');
    await observation(2, 'motorcycle', 'Pasted image (3).png');
    await page.getByRole('button', { name: 'Compare records', exact: true }).click();
    await page.getByRole('heading', { name: 'Different vehicle types for KA03AB7161', exact: true }).waitFor();
    assert.equal(await page.locator('.investigation-metric.tone-danger strong').innerText(), '1');
    await page.locator('.react-flow__edge').first().waitFor();
    assert(await page.locator('.react-flow__node').count() >= 5, 'graph has actual case and finding nodes');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/netra-investigation-assessment.png', fullPage: true });
    await page.getByRole('tab', { name: 'Brief & watch', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Cross-case vehicle review');
    await page.getByLabel('Officer annotations', { exact: true }).fill('Both synthetic media items require original-source review.');
    await page.getByLabel('Review status', { exact: true }).selectOption('reviewed');
    await page.getByLabel('Review note', { exact: true }).fill('Reviewed source references; conflicting vehicle types remain unresolved.');
    await page.getByRole('checkbox', { name: 'Watch for matching FIRs and changes to selected records' }).check();
    await page.getByLabel('Offence', { exact: true }).selectOption('Vehicle Theft');
    await page.getByRole('button', { name: 'Save investigation', exact: true }).click();
    await page.getByText('Revision 1 saved. The evidence snapshot is preserved.', { exact: true }).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export brief', exact: true }).click();
    await (await downloadPromise).saveAs('/tmp/netra-investigation-brief.pdf');
    assert(renderedPdfHtml.includes('<svg'), 'saved PDF renders the graph');
    assert(renderedPdfHtml.includes('Pasted image (3).png'), 'saved PDF includes source references');
    assert(!renderedPdfHtml.includes('<script'), 'generated document contains no executable script');
    await page.getByRole('tab', { name: 'Sources', exact: true }).click();
    const source = page.locator('.investigation-source').filter({ hasText: 'Pasted image (3).png' });
    await source.getByRole('button', { name: 'Exclude source', exact: true }).click();
    await source.getByLabel('Exclusion reason', { exact: true }).fill('Registration reading is disputed and needs verification.');
    await source.getByRole('button', { name: 'Exclude & recalculate', exact: true }).click();
    await page.getByText(/finding.*lost support/).waitFor();
    assert.equal(await page.locator('.investigation-metric.tone-danger strong').innerText(), '0');
    await page.getByRole('tab', { name: 'Brief & watch', exact: true }).click();
    await page.getByRole('button', { name: 'Save new revision', exact: true }).click();
    await page.getByText('Revision 2 saved. The evidence snapshot is preserved.', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/netra-investigation-brief-settings.png', fullPage: true });

    model.Firs.push({ id: 501, fir_number: 'TEST-NEW-FIR-501', crime_type: 'Vehicle Theft', district: 'Mysuru', description: 'New synthetic case matching the saved watch.' });
    await page.getByRole('tab', { name: 'Updates', exact: false }).click();
    await page.getByRole('button', { name: 'Check now', exact: true }).click();
    await page.getByText('FIR TEST-NEW-FIR-501', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
    const journalReply = await invoke({ mode: 'journal:save', case_id: 1, kind: 'investigation', content: 'A new witness statement was entered during the review.', reason: 'Synthetic browser test update', request_id: 'browser-journal-00000001' });
    assert.equal(journalReply.status, 200);
    await page.getByRole('button', { name: 'Check now', exact: true }).click();
    await page.getByRole('heading', { name: 'Selected case sources changed', exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/netra-investigation-alerts.png', fullPage: true });
    await page.getByRole('tab', { name: 'Brief & watch', exact: true }).click();
    await page.getByRole('button', { name: /Revision 1.*reviewed/ }).click();
    await page.getByText(/Historical snapshot/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add observation', exact: true }).count(), 0, 'historical snapshots have no writable observation form');
    await page.getByRole('tab', { name: 'Assessment', exact: true }).click();
    assert.equal(await page.locator('.investigation-metric.tone-danger strong').innerText(), '1', 'old revision retains original conflict');
    for (const width of [1672, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await page.waitForTimeout(400);
      const clippedNodes = await page.locator('.investigation-graph').evaluate(graph => {
        const bounds = graph.getBoundingClientRect();
        return [...graph.querySelectorAll('.react-flow__node')].filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.left < bounds.left - 2 || rect.right > bounds.right + 2 || rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2;
        }).length;
      });
      assert.equal(clippedNodes, 0, `the relationship graph fits its container at ${width}px`);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => {
        const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
        return rect.width > 0 && rect.right > innerWidth + 2 && style.position !== 'absolute' && !el.closest('.react-flow__viewport') && !el.closest('.workspace-landmark');
      }).map(el => ({ tag: el.tagName, class: String(el.className).slice(0, 90) })));
      assert.deepEqual(overflow, [], `visible components fit at ${width}px`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/netra-investigation-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(apiFailures, []);
    console.log(JSON.stringify({ errors, apiFailures, localFirs: official.CaseMaster.length, liveHandlerWithInMemoryCatalyst: true, conflictAndExclusion: true, revisions: true, savedPdf: true, newRecordAlert: true, journalUpdateAlert: true, viewports: [1672, 1024, 768, 390] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
