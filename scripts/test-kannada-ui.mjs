import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpile(fs.readFileSync(file, 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  }), { exports, require: relative => load(`src/lib/${relative.replace('./', '')}.ts`) });
  return exports;
}
const { kannadaUi, interfaceText } = load('src/lib/ui-kannada.ts');
for (const text of ['Total FIRs', 'Solve Rate', 'Require immediate review', 'Case journal & updates',
  'Victim Gender', 'Audit entries', 'Choose registered demo portrait', 'Revision history',
  'View all', 'Crime categories', 'Under Investigation', 'Charge Sheeted', 'No records']) {
  assert(/[\u0C80-\u0CFF]/.test(kannadaUi(text)), `${text} has Kannada copy`);
  assert.equal(interfaceText('en', text), text, 'English restored without modifying sources');
}
for (const text of ['KA03AB7161', '104060011202600001',
  'The witness reported a red motorcycle.', '<script>alert(1)</script>', '500', '38%']) {
  assert.equal(kannadaUi(text), text, 'unknown record values and evidence are preserved');
}
assert.equal(kannadaUi('92 critical priority'), '92 ಅತ್ಯಂತ ಗಂಭೀರ ಆದ್ಯತೆಯ ಪ್ರಕರಣಗಳು');
assert.equal(kannadaUi('of 500 FIRs on record'), 'ದಾಖಲಾದ 500 ಎಫ್‌ಐಆರ್‌ಗಳಲ್ಲಿ');
assert.equal(kannadaUi('38% case solve rate'), '38% ಪ್ರಕರಣ ಪರಿಹಾರ ಪ್ರಮಾಣ');
assert(kannadaUi('66 records').includes('66'));
assert(kannadaUi('Vehicle Theft is the most frequent (66).').includes('ವಾಹನ ಕಳವು'));
assert.equal(kannadaUi('ComplainantDetails'), 'ದೂರುದಾರರ ವಿವರಗಳು');
assert.equal(kannadaUi('ComplaintDetails'), 'ದೂರಿನ ವಿವರಗಳು');
assert.equal(kannadaUi('Abdul Desai'), 'ಅಬ್ದುಲ್ ದೇಸಾಯಿ');
assert.equal(kannadaUi('Mysuru'), 'ಮೈಸೂರು');
assert.equal(kannadaUi('Vehicle Theft - Udupi'), 'ವಾಹನ ಕಳವು — ಉಡುಪಿ');
assert(/[\u0c80-\u0cff]/.test(kannadaUi('Accused.CaseMasterID')));
const schema = JSON.parse(fs.readFileSync('data/cloudscale-import/schema.json', 'utf8'));
for (const table of schema.tables) {
  assert(/[\u0c80-\u0cff]/.test(kannadaUi(table.name)), `schema table ${table.name}`);
  for (const field of table.fields) assert(/[\u0c80-\u0cff]/.test(kannadaUi(field.name)), `schema column ${field.name}`);
}
for (const name of JSON.parse(fs.readFileSync('functions/ai_quickml/profile-names.json', 'utf8'))) {
  assert(/[\u0c80-\u0cff]/.test(kannadaUi(name)), `registered synthetic name ${name}`);
}
assert(kannadaUi('Udupi leads with 48 FIRs.').includes('Udupi'));
assert.equal(kannadaUi(' TOTAL FIRS '), ' ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು ');
console.log('Kannada UI: shared labels, dynamic counts, reversible language and source-value preservation passed.');
