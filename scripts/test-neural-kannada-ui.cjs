const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const origin = process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3012';
  const host = new URL(origin).origin, requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => requests.push(request.url()));
  await context.route('**/*', route => {
    if (route.request().url() === origin + '/__neural-voice-test.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Local neural Kannada test</title>' });
    if (!route.request().url().startsWith(host)) return route.abort();
    return route.continue();
  });
  const load = async () => {
    await page.goto(origin + '/__neural-voice-test.html');
    await page.addScriptTag({ content: `window.localVoiceModule={exports:{}};(function(exports,process){${compile('src/lib/neural-kannada-speech.ts')} })(window.localVoiceModule.exports,{env:{NEXT_PUBLIC_CATALYST_WEB_CLIENT:${JSON.stringify(new URL(origin).pathname.replace(/\/$/, '') === '/app' ? 'true' : 'false')}}});` });
  };
  try {
    await load();
    const first = await page.evaluate(async () => {
      const progress = [];
      const audio = await window.localVoiceModule.exports.synthesizeNeuralKannada('ನಮಸ್ಕಾರ. ನಾನು ನೇತ್ರ ತನಿಖಾ ಸಹಾಯಕ. ಮೈಸೂರಿನ ಪ್ರಕರಣಗಳ ವಿವರಗಳು ಇಲ್ಲಿವೆ.', message => progress.push(message));
      const bytes = Uint8Array.from(atob(audio.split(',')[1]), char => char.charCodeAt(0));
      const view = new DataView(bytes.buffer);
      const decoded = await new AudioContext().decodeAudioData(bytes.buffer.slice(0));
      const samples = decoded.getChannelData(0); let peak = 0, energy = 0;
      for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
      return { audio, duration: decoded.duration, fileRate: view.getUint32(24, true), peak, rms: Math.sqrt(energy / samples.length), progress };
    });
    assert(first.duration > 3 && first.duration < 30);
    assert.equal(first.fileRate, 22050);
    assert(first.peak > 0.05 && first.rms > 0.01, 'actual neural output must contain speech');
    assert(first.progress.includes('Generating Kannada speech on this device...'));
    fs.mkdirSync('test-assets/voice', { recursive: true });
    fs.writeFileSync('test-assets/voice/netra-neural-kannada-preview.wav', Buffer.from(first.audio.split(',')[1], 'base64'));
    const modelRequests = () => requests.filter(url => url.endsWith('/voice/kn-v1.onnx')).length;
    assert.equal(modelRequests(), 1);
    const cancelled = await page.evaluate(async () => {
      const controller = new AbortController();
      const pending = window.localVoiceModule.exports.synthesizeNeuralKannada('ಇದು ರದ್ದುಗೊಳಿಸಿದ ಧ್ವನಿ.', undefined, controller.signal).catch(error => error.name);
      controller.abort(); return pending;
    });
    assert.equal(cancelled, 'AbortError');
    await page.evaluate(() => window.localVoiceModule.exports.synthesizeNeuralKannada('ಮೈಸೂರಿನ ಪ್ರಕರಣಗಳು.'));
    assert.equal(modelRequests(), 1, 'repeated speech reuses model/session');
    // Navigation creates a fresh engine but the public model stays cached.
    await load();
    const cached = await page.evaluate(async () => {
      const progress = [];
      await window.localVoiceModule.exports.synthesizeNeuralKannada('ನಮಸ್ಕಾರ.', message => progress.push(message));
      return progress;
    });
    assert(cached.includes('Loading cached Kannada voice...'));
    assert.equal(modelRequests(), 1, 'a new page must reuse the persisted model');
    assert(requests.every(url => url.startsWith(host)), 'all speech assets are served by NETRA; text never leaves the worker');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ actualNeuralModel: true, kannadaSampleRate: first.fileRate, duration: first.duration,
      nonSilent: true, cancellation: true, cachedAfterNavigation: true, sameOriginOnly: true, modelDownloads: modelRequests(), errors }));
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
