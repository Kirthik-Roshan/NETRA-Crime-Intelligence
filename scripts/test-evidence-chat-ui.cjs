const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const manifest = require('../functions/ai_quickml/profile-assets.json');
const platform = require('../functions/ai_quickml/platform');
const portrait = manifest.profiles.find(row => row.name === 'Chetan Desai');
const objects = new Map(), evidence = [], payloads = [], failures = [], errors = [];
let browser;
delete process.env.NETRA_FILESTORE_FOLDER_ID;
const bucket = {
  putObject: async (key, value) => { objects.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value)); return true; },
  getObject: async key => { if (!objects.has(key)) throw new Error('Missing object'); return Readable.from([objects.get(key)]); },
  listPagedObjects: async ({ prefix }) => ({ contents: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: 'false' }),
};
const consume = async stream => { for await (const _part of stream) { /* source read */ } };
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  stratus: () => ({ bucket: () => bucket }),
  datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: evidence, more_records: false }), insertRow: async row => { const saved = { ...row, ROWID: String(9000 + evidence.length) }; evidence.push(saved); return saved; } }) }),
  zia: () => ({ analyseFace: async stream => { await consume(stream); return { faces_count: 1 }; }, detectObject: async stream => { await consume(stream); return { objects: [{ object: 'motorcycle', confidence: 0.97 }] }; } }),
  smartbrowz: () => ({ convertToPdf: async html => { const page = await browser.newPage(); try { await page.setContent(html); return Readable.from([await page.pdf()]); } finally { await page.close(); } } }),
} };
Object.assign(platform, {
  createRequestContext: async () => context, cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, tables) => Object.fromEntries(tables.map(table => [table, []])),
  listRows: async (_context, table) => ({ rows: table === 'Evidence' ? evidence : [] }), countRows: async () => ({ counts: {} }),
  criminalIntelligence: async () => ({ criminal: { id: portrait.profile_id, name: portrait.name }, counts: { firs: 1 }, firs: [{ id: 1, fir_number: '104060011202600001', crime_type: 'Vehicle Theft' }], arrests: [], associates: [] }),
  writeAudit: async () => ({ id: 'photo-evidence-browser-audit', ref: 'stored' }),
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
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1672, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
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
    await page.getByRole('combobox', { name: 'Attachment analysis type' }).waitFor({ timeout: 60000 });
    const input = page.getByRole('textbox', { name: 'Investigation query', exact: true });
    await input.fill('am new to this application...how can u assisst me here'); await input.press('Enter');
    await page.getByText(/I can help you get started with NETRA/).first().waitFor();
    await page.getByRole('combobox', { name: 'Attachment analysis type' }).selectOption('photo');
    await page.locator('input[type=file]').setInputFiles({ name: 'demo-reference.png', mimeType: 'image/png', buffer: fs.readFileSync(portrait.source_file) });
    await page.getByRole('button', { name: 'Detach demo-reference.png', exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: 'not biometric identification' }).waitFor();
    await input.fill('Who is he?'); await input.press('Enter');
    await page.locator('main').getByText(/Relevant saved observations and records/).first().waitFor();
    assert((await page.locator('main').innerText()).includes('Chetan Desai'));
    await input.fill('Which FIRs are linked to him?'); await input.press('Enter');
    await page.getByText(/104060011202600001/).first().waitFor();
    await page.screenshot({ path: '/tmp/netra-photo-chat.png', fullPage: true });
    await page.goto(`${origin}/evidence/`);
    await page.getByRole('button', { name: 'Objects', exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    await page.locator('input[type=file]').first().setInputFiles({ name: 'exhibit.png', mimeType: 'image/png', buffer: fs.readFileSync(portrait.source_file) });
    await page.getByRole('button', { name: 'Analyze and preserve evidence', exact: true }).click();
    const chat = page.getByRole('region', { name: 'Evidence conversation' });
    await chat.getByRole('button', { name: 'Summarize this analysis', exact: true }).waitFor();
    await chat.getByRole('button', { name: 'Summarize this analysis', exact: true }).click();
    await chat.getByText(/motorcycle/).first().waitFor();
    await chat.getByRole('textbox', { name: 'Evidence question', exact: true }).fill('Which FIR is linked?');
    await chat.getByRole('button', { name: 'Ask evidence question', exact: true }).click();
    await chat.getByText(/not currently linked to an official FIR/).first().waitFor();
    const followup = payloads.filter(payload => payload.mode === 'evidence:chat').at(-1);
    assert(followup.record_id); assert(followup.history.some(message => message.content === 'Summarize this analysis'));
    assert(!('result' in followup), 'browser sends an identifier, never an authoritative scan result');
    await chat.locator('summary').first().click();
    const download = page.waitForEvent('download'); await chat.getByRole('button', { name: 'Export evidence conversation', exact: true }).click();
    await (await download).saveAs('/tmp/netra-evidence-conversation.pdf');
    for (const width of [1672, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(200);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `evidence overflow at ${width}`);
      await chat.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/netra-evidence-chat-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'OCR', exact: true }).click();
    assert.equal(await page.getByRole('region', { name: 'Evidence conversation' }).count(), 0, 'new analysis clears prior chat');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log(JSON.stringify({ onboarding: true, syntheticPhotoUpload: true, linkedProfileAndFir: true, evidenceChat: true, followups: true, sources: true, pdf: true, resetOnNewScan: true, viewports: [1672, 768, 390], errors, failures }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
