const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Database = require('better-sqlite3');
const { REPORT_TEMPLATE_VERSION } = require('../functions/ai_quickml/report-contract');
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
const errors = [], apiFailures = [], layoutFailures = []; let converterOffline = false; const rendered = []; const auditEvents = [];
const objects = new Map();
context.app.stratus = () => ({bucket: () => ({putObject: async (key, value) => { objects.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value)); return true; }, getObject: async key => Readable.from([objects.get(key)]), listPagedObjects: async ({prefix}) => ({ contents: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({key})), truncated:'false' }) })});
context.app.zia = () => ({ extractOpticalCharacters: async stream => { for await(const part of stream) {} return {text:'| District | FIRs |\n| --- | --- |\n| Mysuru | 42 |\n| Udupi | 48 |'}; } });
delete process.env.NETRA_FILESTORE_FOLDER_ID;

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
    context.app.smartbrowz = () => ({ convertToPdf: async (html, {pdf_options:o}) => {rendered.push(html); if(converterOffline) throw new Error('Simulated outage'); const p = await browser.newPage(); try {await p.setContent(html); return Readable.from([await p.pdf({format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:o.header_template,footerTemplate:o.footer_template,margin:o.margin})]);} finally {await p.close();}}});
    const origin = 'https://preview.catalystserverless.in';
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
      if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
      if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3006') + url.pathname + url.search, maxRetries: 2 }) });
      if (url.hostname.endsWith('tile.openstreetmap.org')) return route.continue();
      return route.abort();
    });
    await ctx.addInitScript(() => { window.print = () => { window.__printedForTest = true; }; });
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));

    page.setDefaultTimeout(60000);
    await page.goto(`${origin}/assistant/`, {waitUntil:'domcontentloaded',timeout:90000});
    const input = page.getByRole('textbox', {name:'Investigation query',exact:true}); await input.waitFor();
    let rawPrintCalls = 0;
    await page.exposeFunction('__unexpectedPrint', () => { rawPrintCalls++; });
    await page.evaluate(() => { window.print = () => { window.__unexpectedPrint(); }; });
    const panels = page.getByRole('region',{name:'Source-backed analysis'});
    async function ask(q) {await input.fill(q);await input.press('Enter');}
    async function count(n) {for(let i=0;i<100;i++){if(await panels.count()===n)return;await page.waitForTimeout(100);}assert.equal(await panels.count(),n);}
    console.log('Checking greetings and live charts');
    await ask('Hi, how are you?');await page.getByText('I’m here and ready to help. How are you doing, and what would you like to talk about?',{exact:true}).waitFor();assert.equal(await panels.count(),0);
    await ask('Show crime counts by district');await count(1);assert((await panels.first().innerText()).includes(String(model.Firs.length)));
    await ask('Show a visual representation of these report statistics');await count(2);
    await ask('Show these statistics as a pie chart');await count(3);await panels.first().locator('.recharts-pie').first().waitFor();
    const downloaded = page.waitForEvent('download');await page.getByRole('button',{name:'Export PDF',exact:true}).click();
    await (await downloaded).saveAs('test-assets/reports/netra-assistant-unified-preview.pdf');
    const pdfText = require('node:child_process').execFileSync('pdftotext',['test-assets/reports/netra-assistant-unified-preview.pdf','-'],{encoding:'utf8'});
    assert(pdfText.includes('KARNATAKA STATE POLICE')&&pdfText.includes('Recorded-data analysis')&&pdfText.includes('500'));
    assert(!/https?:\/\/preview|Crime Intelligence Platform \| KSP/.test(pdfText));
    assert(rendered.at(-1).includes(`data-report-template="${REPORT_TEMPLATE_VERSION}"`));
    console.log('PDF export passed; checking outage fallback');
    converterOffline=true;
    await page.getByRole('button',{name:'Export PDF',exact:true}).click();
    const frame=page.locator('iframe[title="NETRA branded report print preview"]');await frame.waitFor({state:'attached'});
    const content=frame.contentFrame();await content.locator('.emblem').waitFor({state:'attached',timeout:15000});
    assert.equal(await content.locator('html').getAttribute('data-report-template'),REPORT_TEMPLATE_VERSION);
    assert(await content.locator('.emblem').evaluate(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await content.getByText('Recorded-data analysis',{exact:true}).count(),3);
    await page.goto(`${origin}/assistant/`,{waitUntil:'domcontentloaded'});await input.waitFor();
    await page.getByRole('button',{name:'Clear conversation',exact:true}).click();
    await ask('Draw a chart of these supplied figures:\nMysuru: 42\nUdupi: 48');
    const suppliedRegion = page.getByRole('region',{name:'Report statistics chart'}); await suppliedRegion.waitFor();
    assert((await suppliedRegion.innerText()).includes('not verified'));
    await ask('Now show these as a pie chart'); await suppliedRegion.first().locator('.recharts-pie').first().waitFor();
    assert((await suppliedRegion.first().innerText()).includes('48'));
    await page.keyboard.press('Control+p');
    await page.locator('iframe[title="NETRA branded report print preview"]').waitFor({state:'attached'});
    assert.equal(rawPrintCalls, 0, 'Ctrl+P must not print the application shell');
    await page.goto(`${origin}/assistant/`,{waitUntil:'domcontentloaded'});await input.waitFor();
    await page.getByRole('button',{name:'Clear conversation',exact:true}).click();
    await page.locator('input[type="file"]').setInputFiles({name:'district-stats.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 fixture')});
    await page.getByText('district-stats.pdf',{exact:true}).first().waitFor();
    await ask('Show a visual representation of this report statistics');
    const chart=page.getByRole('region',{name:'Report statistics chart'});await chart.waitFor();
    assert((await chart.innerText()).includes('42')&&(await chart.innerText()).includes('48'));
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'/tmp/netra-document-chart-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(apiFailures,[]);
    console.log(JSON.stringify({greetings:true,exactCounts:model.Firs.length,visualFollowup:true,pie:true,brandedConversationPdf:true,brandedOutageFallback:true,sourceDocumentChart:true,mobile:true,errors,apiFailures}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
