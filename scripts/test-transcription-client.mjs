import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync(new URL('../src/lib/ai-client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
let reply;
const sandbox = { exports: {}, process: { env: {} }, window: { location: { hostname: 'preview.catalystserverless.in', origin: 'https://preview.catalystserverless.in' } }, URL, setTimeout, clearTimeout, fetch: async () => { if (reply instanceof Error) throw reply; return reply; } };
vm.runInNewContext(js, sandbox);
const transcribe = sandbox.exports.transcribeAudio;
for (const [status, expected] of [[401,/session has expired/], [403,/role cannot access/], [429,/rate-limited/], [502,/service failure/], [503,/unavailable/]]) {
  reply = new Response(JSON.stringify({error:'upstream unavailable',status:503}), {status});
  await assert.rejects(() => transcribe('dGVzdA=='), expected);
}
reply = new Error('Network unavailable');
await assert.rejects(() => transcribe('dGVzdA=='), /could not be reached/);
reply = new Response(JSON.stringify({code:'NO_TRANSCRIPT'}), {status:422});
await assert.rejects(() => transcribe('dGVzdA=='), /no transcript/);
reply = new Response(JSON.stringify({text:{unexpected:true}}), {status:200});
await assert.rejects(() => transcribe('dGVzdA=='), /unexpected response/);
reply = new Response(JSON.stringify({text:'Show Mysuru cases',language:'en'}), {status:200});
assert.equal((await transcribe('dGVzdA==')).text, 'Show Mysuru cases');
console.log('Transcription client: session, role, rate-limit, upstream, network, empty/malformed responses and success verified.');
