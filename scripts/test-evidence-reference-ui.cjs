const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const manifest = require('../functions/ai_quickml/profile-assets.json');
const platform = require('../functions/ai_quickml/platform');
const requests = [], errors = [], archives = [];
let matched = true;
const consume = async stream => { for await (const _ of stream) { /* consume exhibit */ } };
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  zia: () => ({
    analyseFace: async stream => { await consume(stream); return { faces_count: 1 }; },
    compareFace: async (left, right) => { await Promise.all([consume(left), consume(right)]); return { matched, confidence: matched ? 96 : 20 }; },
  }),
} };
Object.assign(platform, {
  createRequestContext: async () => context, cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, tables) => Object.fromEntries(tables.map(table => [table, []])),
  listRows: async () => ({ rows: [] }), countRows: async () => ({ counts: {} }),
  criminalIntelligence: async (_app, id) => ({ criminal: { id, name: manifest.profiles.find(row => row.profile_id === id).name, status: 'arrested', risk_score: 74 },
    counts: { firs: 1, arrests: 1, vehicles: 0, evidence: 1 },
    firs: [{ id: id + 1000, fir_number: `SYNTHETIC-FIR-${id}`, crime_type: 'Theft', district: 'Mysuru' }], arrests: [], associates: [] }),
  caseIntelligence: async (_app, id) => ({ fir: { id, fir_number: `SYNTHETIC-CASE-${id}` }, suspects: [], victims: [], arrests: [], chargesheets: [] }),
  persistEvidence: async (_app, payload) => { archives.push(payload); return { warnings: [], evidence_id: 123 }; },
  writeAudit: async () => ({ id: 'reference-ui-audit', ref: 'archived' }),
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  requests.push(payload);
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200;
  await handler(req, { writeHead(code) { status = code; }, write(part) { body += part; }, end(part) { body += part || ''; } });
  return { status, contentType: 'application/json', body };
}
const image = name => ({ name: 'renamed.png', mimeType: 'image/png', buffer: fs.readFileSync(manifest.profiles.find(row => row.name === name).source_file) });
const unknown = { name: 'profile-000028-sowmya-achar.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64') };

(async () => {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2', '-c:v', 'libvpx', '-an', '/tmp/netra-reference-test.webm']);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1672, height: 1050 }, serviceWorkers: 'block' });
  const origin = 'https://preview.catalystserverless.in';
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
    if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
    if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3011') + url.pathname + url.search }) });
    return route.abort();
  });
  const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/evidence/`);
    await page.getByRole('button', { name: /^Crowd watch/ }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: /^Crowd watch/ }).click();
    assert.equal(await page.locator('#evidence-subject').count(), 0, 'no name dropdown');
    await page.locator('#evidence-crowd-cctv-image').setInputFiles(image('Sowmya Achar'));
    const reference = page.locator('#evidence-watchlist-reference');
    await reference.setInputFiles(image('Sowmya Achar'));
    const referenceStatus = page.getByRole('status').filter({ hasText: 'file fingerprint' });
    await referenceStatus.getByText('Sowmya Achar', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Detect and check watchlist', exact: true }).click();
    await page.getByText('SYNTHETIC-FIR-28', { exact: true }).waitFor();
    const payload = requests.findLast(row => row.mode === 'crowd');
    assert(!('criminal_id' in payload));
    assert.equal(archives.at(-1).firId, 1028);
    await page.screenshot({ path: '/tmp/netra-automatic-crowd-reference.png', fullPage: true });
    // Replace reference after a successful scan: old result and profile must disappear.
    await reference.setInputFiles(image('Chetan Desai'));
    await referenceStatus.getByText('Chetan Desai', { exact: true }).waitFor();
    assert.equal(await page.getByText('SYNTHETIC-FIR-28', { exact: true }).count(), 0);
    matched = false;
    await page.getByRole('button', { name: 'Detect and check watchlist', exact: true }).click();
    await page.getByText('No reference match', { exact: true }).waitFor();
    assert.equal(await page.getByText('Associated FIR history', { exact: true }).count(), 0);
    matched = true;
    await reference.setInputFiles(unknown);
    await page.getByRole('status').filter({ hasText: 'Reference not registered' }).waitFor();
    await page.getByRole('button', { name: 'Detect and check watchlist', exact: true }).click();
    await page.getByText('Reference match', { exact: true }).waitFor();
    assert.equal(await page.getByText('Resolved watchlist profile', { exact: true }).count(), 0);
    // CCTV uses real browser video decoding and runtime frame extraction.
    await page.getByRole('button', { name: /^CCTV watchlist/ }).click();
    assert.equal(await page.locator('#evidence-subject').count(), 0);
    await page.locator('#evidence-cctv-video').setInputFiles('/tmp/netra-reference-test.webm');
    await page.locator('#evidence-target-watchlist-portrait').setInputFiles(image('Sowmya Achar'));
    await referenceStatus.getByText('Sowmya Achar', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Split clip and find target', exact: true }).click();
    await page.getByText('SYNTHETIC-FIR-28', { exact: true }).waitFor({ timeout: 30000 });
    const scan = requests.findLast(row => row.mode === 'cctv');
    assert(scan.frames.length >= 4 && scan.frames.every(frame => frame.image.startsWith('data:image/jpeg;base64,')));
    assert(!('criminal_id' in scan));
    assert.equal(archives.at(-1).firId, 1028);
    for (const width of [1672, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
      await page.screenshot({ path: `/tmp/netra-automatic-cctv-reference-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: Crowd watch and real CCTV extraction resolve uploaded fictional portraits without name selection; replacement clears stale records, no-match/unknown protection, 3 viewports, no browser errors.');
  } catch (error) {
    await page.screenshot({ path: '/tmp/netra-reference-ui-failure.png', fullPage: true });
    throw error;
  } finally { await ctx.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
