const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const platform = require('../functions/ai_quickml/platform');
const objects = new Map(), files = new Map(), payloads = [], errors = [], failures = [];
let browser, fileCount = 0, docCount = 0;
process.env.NETRA_FILESTORE_FOLDER_ID = 'test-folder';
const collect = async stream => { const parts = []; for await (const part of stream) parts.push(part); return Buffer.concat(parts); };
const bucket = {
  async putObject(key, value) { objects.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value)); return true; },
  async getObject(key) { if (!objects.has(key)) throw new Error('Not found'); return Readable.from([objects.get(key)]); },
  async listPagedObjects({ prefix }) { return { contents: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: 'false' }; },
};
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  stratus: () => ({ bucket: () => bucket }),
  datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: [], more_records: false }) }) }),
  filestore: () => ({ folder: () => ({ uploadFile: async ({ code }) => { const id = String(++fileCount); files.set(id, await collect(code)); return { id }; }, downloadFile: async id => files.get(id) }) }),
  zia: () => ({ extractOpticalCharacters: async stream => { const buffer = await collect(stream); docCount++; return { text: buffer.subarray(0, 5).toString() === '%PDF-' ? 'Vehicle theft was reported on 12 June 2026. The reported loss was Rs 25000. A witness described a red motorcycle.' : 'Registration KA 03 AB 7161 appears on this vehicle photograph.' }; } }),
  smartbrowz: () => ({ convertToPdf: async html => { const page = await browser.newPage(); try { await page.setContent(html); return Readable.from([await page.pdf({ format: 'A4' })]); } finally { await page.close(); } } }),
} };
Object.assign(platform, {
  createRequestContext: async () => context, cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, views) => Object.fromEntries(views.map(view => [view, []])),
  listRows: async () => ({ rows: [] }), countRows: async () => ({ counts: {} }),
  writeAudit: async () => ({ id: 'document-browser-audit', ref: 'stratus://test-only/audit' }),
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  payloads.push(payload);
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200, headers = {};
  await handler(req, { writeHead(code, value) { status = code; headers = value; }, write(chunk) { body += chunk; }, end(chunk) { body += chunk || ''; } });
  if (status >= 400) failures.push({ mode: payload.mode, status, body });
  return { status, contentType: headers['Content-Type'] || 'application/json', body };
}
(async () => {
  browser = await chromium.launch({ headless: true });
  try {
    const pdfPage = await browser.newPage(); await pdfPage.setContent('<h1>Case memo</h1><p>Vehicle theft. Reported loss Rs 25000.</p>');
    const pdf = await pdfPage.pdf(); await pdfPage.close();
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1672, height: 1100 }, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3002') + url.pathname + url.search }) });
      return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/assistant/`);
    await page.getByRole('button', { name: 'Attach document', exact: true }).waitFor({ timeout: 60000 });
    await page.locator('input[type=file]').setInputFiles({ name: 'case-memo.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Detach case-memo.pdf', exact: true }).waitFor();
    const input = page.getByRole('textbox', { name: 'Investigation query', exact: true });
    await input.fill('What was the reported loss?'); await input.press('Enter');
    await page.getByText('Document Q&A', { exact: true }).waitFor();
    assert((await page.locator('main').innerText()).includes('Rs 25000'));
    await input.fill('When was the vehicle theft reported?'); await input.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('main span')].filter(node => node.textContent.trim() === 'Document Q&A').length >= 2);
    const questions = payloads.filter(payload => payload.mode === 'rag');
    assert.equal(questions.at(-1).document_ids.length, 1);
    assert(questions.at(-1).history.some(message => message.content === 'What was the reported loss?'));
    assert.equal(payloads.filter(payload => payload.mode === 'search:records').length, 0);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'vehicle.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Detach vehicle.png', exact: true }).waitFor();
    await input.fill('Which registration appears in the photograph?'); await input.press('Enter');
    await page.getByText(/Registration KA 03 AB 7161 appears/).first().waitFor();
    const exportDownload = page.waitForEvent('download'); await page.getByRole('button', { name: /Export PDF/ }).click();
    await (await exportDownload).saveAs('/tmp/netra-document-conversation.pdf');
    await page.getByRole('status').filter({ hasText: 'PDF saved to Reports' }).waitFor();
    await page.screenshot({ path: '/tmp/netra-document-chat.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert((await input.boundingBox()).width >= 200);
    await page.screenshot({ path: '/tmp/netra-document-chat-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1672, height: 1100 });
    await page.goto(`${origin}/reports/`);
    await page.getByRole('button', { name: 'Saved reports', exact: true }).click();
    const library = page.getByRole('region', { name: 'Saved reports' });
    await library.getByRole('button', { name: /^Preview / }).first().waitFor();
    await library.getByRole('button', { name: /^Preview / }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    const savedDownload = page.waitForEvent('download'); await library.getByRole('button', { name: /^Download / }).first().click();
    await (await savedDownload).saveAs('/tmp/netra-library-downloaded-report.pdf');
    await library.getByRole('link', { name: /^Chat about / }).first().click();
    await page.getByRole('button', { name: /^Detach netra-report-/ }).waitFor();
    await page.goto(`${origin}/reports/`);
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await page.getByRole('heading', { name: 'case-memo.pdf', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'vehicle.png', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Preview vehicle.png', exact: true }).click();
    await page.getByRole('dialog').locator('img').waitFor();
    await page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth > 0);
    await page.getByRole('button', { name: 'Close preview', exact: true }).click();
    for (const width of [1672, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
      await page.waitForTimeout(200);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `/tmp/netra-library-${width}.png`, fullPage: true });
    }
    assert.equal(docCount, 2); assert.equal(files.size, 3); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log(JSON.stringify({ pdfUpload: true, imageUpload: true, documentFollowups: true, noDatabaseFallback: true, fileStoreUploads: files.size, savedReports: true, preview: true, downloads: true, reopenForChat: true, viewports: [1672, 768, 390], errors, failures }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
