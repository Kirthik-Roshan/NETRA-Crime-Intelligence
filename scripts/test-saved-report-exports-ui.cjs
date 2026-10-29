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
    const page = await ctx.newPage(); page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    const exportReport = async (mode, title) => {
      const response = JSON.parse((await invoke({ mode, title, turns: [{ question: 'Recorded facts', answer: 'Source-linked test report.' }] })).body);
      assert(response.library_id, `${title} must be archived before returning`);
      return response;
    };
    const titles = ['Assistant conversation export', 'District report export', 'Evidence conversation export', 'Investigation brief export'];
    for (const title of titles) await exportReport('report:pdf', title);
    await page.goto(`${origin}/reports/`, { waitUntil:'domcontentloaded', timeout:90000 });
    await page.getByRole('button', {name:'Saved reports',exact:true}).click();
    const library = page.getByRole('region',{name:'Saved reports',exact:true});
    for(const title of titles) await library.getByRole('heading',{name:title,exact:true}).waitFor();
    converterOffline = true;
    const fallback = await exportReport('report:pdf', 'Printable evidence fallback');
    assert(fallback.html && !fallback.pdf);
    await page.evaluate(() => window.dispatchEvent(new Event('netra:library-updated')));
    await library.getByRole('heading',{name:'Printable evidence fallback',exact:true}).waitFor();
    await library.getByText('Printable report',{exact:false}).first().waitFor();
    await library.getByRole('button',{name:`Preview ${fallback.filename}`,exact:true}).click();
    const preview = page.getByRole('dialog'); await preview.waitFor();
    assert.equal(await preview.locator('iframe').getAttribute('sandbox'),'allow-modals');
    await page.getByRole('button',{name:'Close preview',exact:true}).click();
    const download = page.waitForEvent('download');
    await library.getByRole('button',{name:`Download ${fallback.filename}`,exact:true}).click();
    assert((await download).suggestedFilename().endsWith('.html'));
    const printable = await exportReport('report:preview', 'Report print preview export');
    assert(printable.library_id && printable.html);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage',{key:'netra:library-updated',newValue:String(Date.now())})));
    await library.getByRole('heading',{name:'Report print preview export',exact:true}).waitFor();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Saved reports',exact:true}).click();
    for(const title of [...titles,'Printable evidence fallback','Report print preview export']) await library.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.deepEqual(errors,[]); assert.deepEqual(apiFailures,[]);
    console.log(JSON.stringify({allExportKindsListed:true,pdfFallbackArchived:true,printPreviewArchived:true,savedPreviewAndDownload:true,refreshEvent:true,crossTabRefresh:true,persistedAfterReload:true,errors,apiFailures}));
    await ctx.unrouteAll({behavior:'wait'});
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
