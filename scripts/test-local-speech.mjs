import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('src/lib/microphone.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const calls = [], installs = [];
let states = { 'en-IN': 'available' };
class Recognition {
  processLocally = false;
  static async available(options) { calls.push(options); return states[options.langs[0]] || 'unavailable'; }
  static async install(options) { installs.push(options); return true; }
}
const box = { exports: {}, window: { SpeechRecognition: Recognition } };
vm.runInNewContext(js, box);
const { localSpeechSupport, installSpeechPack, microphoneError, recognitionError } = box.exports;
assert.equal((await localSpeechSupport('en')).language, 'en-IN');
states = { 'en-IN': 'unavailable', 'en-US': 'available' };
assert.equal((await localSpeechSupport('en')).language, 'en-US');
states = { 'en-IN': 'downloadable', 'en-US': 'available' };
assert.equal((await localSpeechSupport('en')).language, 'en-US', 'prefer an installed English pack over an unnecessary download');
states = { 'kn-IN': 'unavailable', 'en-US': 'available' };
const before = calls.length;
assert.equal((await localSpeechSupport('kn')).status, 'unavailable');
assert.equal(calls.length, before + 1, 'never substitute English recognition for Kannada');
states = { 'en-IN': 'downloadable' };
assert.equal((await localSpeechSupport('en')).status, 'downloadable');
assert.equal(installs.length, 0, 'language packs require explicit user action');
assert(await installSpeechPack('en-IN'));
assert.equal(installs[0].langs[0], 'en-IN');
assert(calls.every(options => options.processLocally === true));
class LegacyRecognition { static available() { throw new Error('must not call an unsupported engine'); } }
box.window.SpeechRecognition = LegacyRecognition;
assert.equal((await localSpeechSupport('en')).status, 'unsupported');
delete box.window.SpeechRecognition;
assert.equal((await localSpeechSupport('en')).status, 'unsupported');
for (const [name, expected] of [['NotAllowedError', /access is blocked/], ['NotFoundError', /could not find/],
  ['NotReadableError', /could not open/], ['OverconstrainedError', /recording settings/], ['AbortError', /interrupted/]]) {
  assert.match(microphoneError({ name }), expected);
}
assert(!microphoneError(new Error('unexpected')).includes('No microphone'));
assert.match(recognitionError('service-not-allowed'), /speech-recognition service/);
assert.match(recognitionError('language-not-supported'), /No other language or remote service/);
console.log('PASS: local-only capability checks, English dialect fallback, Kannada non-substitution, explicit pack install and accurate microphone/recognition errors.');
