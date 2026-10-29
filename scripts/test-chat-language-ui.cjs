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
let translations = 0;
const originalAnswer = 'The record contains 42 FIRs.\n\n- Review FIR 104060011202600001.\n- Verify the original evidence.';
const kannadaAnswer = 'ದಾಖಲೆಯಲ್ಲಿ 42 ಎಫ್‌ಐಆರ್‌ಗಳಿವೆ.\n\n- ಎಫ್‌ಐಆರ್ 104060011202600001 ಪರಿಶೀಲಿಸಿ.\n- ಮೂಲ ಸಾಕ್ಷ್ಯವನ್ನು ಪರಿಶೀಲಿಸಿ.';
async function invoke(payload) {
  if (payload.mode === 'tts') return { status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated Catalyst TTS outage' }) };
  if (payload.mode === 'translate') { translations++; return { status: 200, contentType: 'application/json', body: JSON.stringify({translation: payload.target === 'kn' ? kannadaAnswer : originalAnswer}) }; }
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
    await ctx.addInitScript(answer => {
      window.kannadaAudioPlayed = [];
      const NativeAudio = window.Audio;
      window.Audio = function(...args) {
        const player = new NativeAudio(...args);
        player.addEventListener('playing', () => window.kannadaAudioPlayed.push(player.src));
        return player;
      };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        cancel() {}, getVoices() { return [{ lang: 'en-US', name: 'English only', localService: true }]; },
        speak() { throw new Error('An English system voice must not read Kannada'); }, addEventListener() {}, removeEventListener() {},
      } });
      if (!localStorage.getItem('language-chat-fixture')) {
        localStorage.setItem('language-chat-fixture', '1');
        const explain = {confidence:null,source:'lookup',records_used:1,reasoning:'Data quality',evidence:[],alternatives:[],audit_id:'fixture',processing_ms:1,ai_model:'fixture'};
        localStorage.setItem('netra_assistant_history_v1', JSON.stringify([{id:1,q:'Fixture question',ts:Date.now(),insight:{answer,explain}}]));
      }
    }, originalAnswer);
    let page = await ctx.newPage(); page.setDefaultNavigationTimeout(90000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/assistant/`, { waitUntil: 'domcontentloaded' });
    await page.getByText('The record contains 42 FIRs.', {exact:true}).waitFor({timeout:60000});
    await page.getByTitle('Toggle language', {exact:true}).click();
    await page.getByText('ದಾಖಲೆಯಲ್ಲಿ 42 ಎಫ್‌ಐಆರ್‌ಗಳಿವೆ.', {exact:true}).waitFor();
    await page.getByText('ಮೂಲ ಸಾಕ್ಷ್ಯವನ್ನು ಪರಿಶೀಲಿಸಿ.', {exact:true}).waitFor();
    await page.getByTitle('Read a concise summary aloud', {exact:true}).click();
    await page.waitForFunction(() => window.kannadaAudioPlayed.length > 0, {timeout:90000});
    assert((await page.evaluate(() => window.kannadaAudioPlayed[0])).startsWith('data:audio/wav;base64,'));
    await page.getByText('ಸಾಧನದಲ್ಲೇ ಕಾರ್ಯನಿರ್ವಹಿಸುವ ಕನ್ನಡ ನರಜಾಲ ಧ್ವನಿ', {exact:true}).waitFor();
    assert(!(await page.locator('main').innerText()).includes('No kn-IN voice'));
    await page.getByTitle('Stop reading', {exact:true}).click();
    assert.equal(await page.getByTitle('Translate to Kannada (ಕನ್ನಡ)').count(), 0, 'no separate chat language toggle required');
    assert.equal(translations, 1, 'one shared translation for the entire answer');
    assert((await page.locator('main').innerText()).includes('104060011202600001'));
    await page.getByTitle('ಭಾಷೆ ಬದಲಿಸಿ', {exact:true}).click();
    await page.getByText('The record contains 42 FIRs.', {exact:true}).waitFor();
    assert.equal(translations, 1, 'original English restored locally');
    await page.getByTitle('Toggle language', {exact:true}).click();
    await page.getByText('ದಾಖಲೆಯಲ್ಲಿ 42 ಎಫ್‌ಐಆರ್‌ಗಳಿವೆ.', {exact:true}).waitFor();
    assert.equal(translations, 1, 'Kannada translation cached across toggles');
    await page.goto(`${origin}/database/`, {waitUntil:'domcontentloaded'});
    const filter = page.getByPlaceholder('ಕೋಷ್ಟಕಗಳನ್ನು ಶೋಧಿಸಿ…'); await filter.fill('ದೂರುದಾರರ');
    await page.getByText('ದೂರುದಾರರ ವಿವರಗಳು',{exact:true}).first().waitFor();
    await page.getByText('ದೂರುದಾರರ ವಿವರಗಳು',{exact:true}).first().click();
    await page.locator('thead').getByText('ದೂರುದಾರರ ಹೆಸರು',{exact:true}).waitFor();
    await page.goto(`${origin}/criminals/`,{waitUntil:'domcontentloaded'});
    await page.getByText('ಅಬ್ದುಲ್ ದೇಸಾಯಿ',{exact:true}).first().waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(apiFailures, []);
    console.log(JSON.stringify({automaticChatLanguage:true,paragraphsAndLists:true,canonicalIdentifiersPreserved:true,englishRestored:true,translationCalls:translations,kannadaSchemaSearch:true,curatedNames:true,errors,apiFailures}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
