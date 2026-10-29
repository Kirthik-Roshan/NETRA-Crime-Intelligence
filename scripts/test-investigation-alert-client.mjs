import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const events = new EventTarget();
const pending = [];
const calls = [];
let respond = async () => ({ alerts: [], warnings: [], watched: 1, checked_at: 'initial' });
const box = {
  exports: {}, Date, Event,
  window: { addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) },
  require: () => ({ investigationRequest: payload => { calls.push(payload); return respond(payload); } }),
};
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/investigations.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(compiled, box);
const { checkInvestigations, refreshInvestigationAlerts } = box.exports;
await checkInvestigations();
await checkInvestigations();
assert.equal(calls.length, 1, 'the bell and workbench share their recent check');
events.dispatchEvent(new Event('netra:records-updated'));
await checkInvestigations();
assert.equal(calls.length, 2, 'record updates invalidate the cached watch immediately');

refreshInvestigationAlerts();
respond = () => new Promise(resolve => pending.push(resolve));
const beforeUpdate = checkInvestigations();
events.dispatchEvent(new Event('netra:records-updated'));
const afterUpdate = checkInvestigations();
const anotherConsumer = checkInvestigations();
pending.shift()({ alerts: [], warnings: [], watched: 1, checked_at: 'before-write' });
await beforeUpdate;
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(pending.length, 1, 'concurrent consumers share one follow-up after a write during an active check');
pending.shift()({ alerts: [{ id: 'new-update' }], warnings: [], watched: 1, checked_at: 'after-write' });
assert.equal((await afterUpdate).alerts[0].id, 'new-update');
assert.equal((await anotherConsumer).checked_at, 'after-write');
assert.equal((await checkInvestigations()).checked_at, 'after-write');
console.log('Investigation alert client: shared checks, immediate write invalidation and concurrent-update recovery passed.');
