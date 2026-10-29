const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  try {
    const origin = process.env.NETRA_UI_ORIGIN || 'http://127.0.0.1:3012';
    await page.route(origin + '/__netra-voice-test.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Kannada playback test</title></head><body></body></html>' }));
    await page.goto(origin + '/__netra-voice-test.html');
    const runtimeEnv = { NEXT_PUBLIC_CATALYST_WEB_CLIENT: new URL(origin).pathname.replace(/\/$/, '') === '/app' ? 'true' : 'false' };
    await page.addScriptTag({ content: `window.localVoiceModule={exports:{}};(function(exports,process){${compile('src/lib/offline-kannada-speech.ts')} })(window.localVoiceModule.exports,{env:${JSON.stringify(runtimeEnv)}});` });
    // This test covers the final basic fallback specifically. Neural playback
    // has its own test and must not be accidentally selected by the mock.
    const audio = await page.evaluate(async () => {
      const audio = await window.localVoiceModule.exports.synthesizeOfflineKannada('ನಮಸ್ಕಾರ. ನಾನು ನೇತ್ರ ತನಿಖಾ ಸಹಾಯಕ. ಮೈಸೂರಿನ ಪ್ರಕರಣಗಳ ವಿವರಗಳು ಇಲ್ಲಿವೆ.');
      const bytes = Uint8Array.from(atob(audio.split(',')[1]), char => char.charCodeAt(0));
      const decoded = await new AudioContext().decodeAudioData(bytes.buffer.slice(0));
      return { audio, duration: decoded.duration, peak: Math.max(...decoded.getChannelData(0).slice(0, 100000).map(Math.abs)), rate: decoded.sampleRate };
    });
    assert(audio.duration > 3 && audio.duration < 30);
    assert(audio.peak > 0.01, 'Kannada synthesis must generate non-silent speech');
    fs.mkdirSync('test-assets/voice', { recursive: true });
    fs.writeFileSync('test-assets/voice/netra-offline-kannada.wav', Buffer.from(audio.audio.split(',')[1], 'base64'));
    await page.addScriptTag({ content: `window.playbackModule={exports:{}};(function(exports,require){${compile('src/lib/speech-playback.ts')} })(window.playbackModule.exports,function(name){return name.includes('offline-kannada')?window.localVoiceModule.exports:{synthesizeSpeech:async()=>null,synthesizeNeuralKannada:async()=>{throw new Error('Neural voice deliberately unavailable in this basic-fallback test')}};});` });
    await page.evaluate(() => {
      window.nativeSpeaks=0;window.events=[];
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},getVoices(){return [{lang:'en-US',name:'English',localService:true}]},speak(){window.nativeSpeaks++},addEventListener(){},removeEventListener(){}}});
      window.playbackModule.exports.playSpeech('ನಮಸ್ಕಾರ. ನಾನು ನೇತ್ರ.', 'kn-IN', {
        onStart(){window.events.push('start')}, onEnd(){window.events.push('end')}, onError(error){window.events.push(error)},
      });
    });
    await page.waitForFunction(() => window.events.includes('end'), { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => window.events), ['start', 'end']);
    assert.equal(await page.evaluate(() => window.nativeSpeaks), 0);
    assert(requests.some(url => url.endsWith('/voices/kn.json')));
    assert(requests.every(url => url.startsWith(origin)), 'no text or voice request goes to a third-party host');
    assert.deepEqual(errors, []);
    console.log(`PASS: real Kannada audio generated and played in Chromium with Catalyst unavailable and no system Kannada voice (${audio.duration.toFixed(1)}s, ${audio.rate}Hz, non-silent). All requests same-origin.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
