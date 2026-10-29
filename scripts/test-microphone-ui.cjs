const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const platform = require('../functions/ai_quickml/platform');
const requests = [], errors = [];
const context = { authenticated: true, officer: { id: '1', role: 'administrator', full_name: 'Preview Officer' }, app: {
  stratus: () => ({ bucket: () => ({ putObject: async () => true, listPagedObjects: async () => ({ contents: [], truncated: 'false' }) }) }),
} };
Object.assign(platform, {
  createRequestContext: async () => context, cacheGet: async () => null, cachePut: async () => {},
  readKspViews: async (_app, tables) => Object.fromEntries(tables.map(table => [table, []])),
  listRows: async () => ({ rows: [] }), countRows: async () => ({ counts: {} }),
  writeAudit: async () => ({ id: 'microphone-test-audit', ref: 'stored' }),
});
const handler = require('../functions/ai_quickml/index');
async function invoke(payload) {
  requests.push(payload);
  if (payload.mode === 'transcribe') return { status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Zia service unavailable', status: 500 }) };
  if (payload.mode === 'voice:nlp') return { status: 200, contentType: 'application/json', body: JSON.stringify({ text: payload.text }) };
  const req = Readable.from([JSON.stringify(payload)]); req.method = 'POST'; req.headers = {};
  let body = '', status = 200;
  await handler(req, { writeHead(code) { status = code; }, write(part) { body += part; }, end(part) { body += part || ''; } });
  return { status, contentType: 'application/json', body };
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const origin = 'https://preview.catalystserverless.in';
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/server/ai_quickml')) return route.fulfill(await invoke(route.request().postDataJSON()));
    if (url.hostname === 'static.zohocdn.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.catalyst={auth:{isUserAuthenticated:async()=>({user_id:"1",first_name:"Preview",email_id:"preview@example.invalid"})}};' });
    if (url.pathname === '/__catalyst/sdk/init.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin) return route.fulfill({ response: await route.fetch({ url: (process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3012') + url.pathname + url.search }) });
    return route.abort();
  });
  await ctx.addInitScript(() => {
    window.localStatus = 'downloadable'; window.localStarts = []; window.installs = []; window.checks = [];
    class Recognition {
      processLocally = false;
      static async available(options) { window.checks.push(options); return window.localStatus; }
      static async install(options) { window.installs.push(options); window.localStatus = 'available'; return true; }
      start() {
        window.localStarts.push({ local: this.processLocally, language: this.lang });
        if (!this.processLocally) throw new Error('Remote recognition must not start');
        setTimeout(() => {
          if (window.localRecognitionError) {
            this.onerror?.({ error: window.localRecognitionError }); this.onend?.(); return;
          }
          const result = [{ transcript: 'who is Imran Reddy' }]; result.isFinal = true;
          this.onresult?.({ results: [result] }); this.onend?.();
        }, 50);
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = Recognition;
    window.testRecognitionConstructor = Recognition;
  });
  const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/assistant/');
    const mic = page.getByRole('button', { name: 'Voice input', exact: true });
    // Real browser MediaRecorder + WAV conversion, with a fake input device.
    await mic.waitFor({ timeout: 60000 });
    // Firefox/unsupported-browser case: recording still works, but neither
    // speech-recognition constructor is exposed. Recovery must stay visible.
    await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
    await mic.click();
    await page.getByText(/Listening - tap the microphone to stop/).waitFor();
    await page.waitForTimeout(700);
    await mic.click();
    await page.getByText(/Catalyst transcription is unavailable.*speech service 500/).waitFor();
    assert(requests.some(row => row.mode === 'transcribe' && row.audio.length > 100));
    const retry = page.getByRole('button', { name: 'Retry with on-device microphone', exact: true });
    await retry.waitFor();
    await retry.click();
    await page.getByText(/This browser does not expose on-device speech recognition/).waitFor();
    assert(await retry.isVisible(), 'unsupported-browser recovery control must not disappear');
    assert.equal(await page.evaluate(() => window.localStarts.length), 0);
    await page.evaluate(() => { window.SpeechRecognition = window.testRecognitionConstructor; });
    await retry.click();
    const install = page.getByRole('button', { name: /Install on-device speech pack/ });
    await install.waitFor();
    assert.equal(await page.evaluate(() => window.installs.length), 0);
    assert.equal(await page.evaluate(() => window.localStarts.length), 0);
    await install.click();
    await page.getByText(/Speech pack installed. Click Retry/).waitFor();
    await page.evaluate(() => { window.localRecognitionError = 'not-allowed'; });
    await retry.click();
    await page.getByText(/Chrome blocked microphone recognition/).waitFor();
    assert(await retry.isVisible(), 'a native recognition error must retain the retry action');
    assert.equal(await page.getByText(/No speech was captured on-device/).count(), 0, 'onend must preserve the specific permission error');
    await page.evaluate(() => { window.localRecognitionError = null; });
    await retry.click();
    const input = page.getByRole('textbox', { name: 'Investigation query', exact: true });
    await page.waitForFunction(() => document.querySelector('textarea')?.value === 'who is Imran Reddy');
    assert.equal(await input.inputValue(), 'who is Imran Reddy');
    assert.deepEqual(await page.evaluate(() => window.localStarts), [{ local: true, language: 'en-IN' }, { local: true, language: 'en-IN' }]);
    assert((await page.evaluate(() => window.checks)).every(item => item.processLocally === true));
    assert(!requests.some(row => ['rag', 'chat', 'assistant:analyze'].includes(row.mode)), 'dictation remains reviewable, not auto-submitted');
    await page.evaluate(() => { window.localStatus = 'unavailable'; });
    await page.getByRole('button', { name: 'Voice conversation', exact: true }).click();
    await page.getByText(/On-device recognition is unavailable for this browser/).waitFor();
    assert.equal(await page.evaluate(() => window.localStarts.length), 2);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Device busy', 'NotReadableError'); }; });
    await mic.click();
    await page.getByText(/Chrome could not open the microphone/).waitFor();
    assert(!(await page.locator('main').innerText()).includes('No microphone is available'));
    assert.deepEqual(errors, []);
    console.log('PASS: recording/WAV capture, provider 500, visible recovery with no recognition API, unsupported-browser explanation, explicit pack installation, local-only recovery, composer review and busy-device diagnosis. Native recognition results are simulated.');
  } catch (error) { await page.screenshot({ path: '/tmp/netra-microphone-failure.png', fullPage: true }); throw error; }
  finally { await ctx.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
