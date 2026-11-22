import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterLabs, labStartURL, labs } from '../assets/modules/training/lab-catalog.js';
import { summarizeUX } from '../assets/modules/diagnostics/ux-test-model.js';
import { classifyRecaptchaFailure } from '../assets/modules/diagnostics/recaptcha-diagnostic-core.js';
import { getStageHints } from '../assets/modules/training/training-hints.js';
import { appendDocumentationTemplate } from '../assets/modules/training/documentation-templates.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=p=>readFileSync(join(root,p),'utf8');
test('relocated pure modules remain functional without changing any learning data',()=>{
  assert.equal(labs.length,7);
  assert.equal(filterLabs({category:'network'}).length,2);
  assert.match(labStartURL(labs.find(lab=>lab.id==='webgoat-local')),/track=webgoat/);
  assert.equal(summarizeUX({tasks:['success','partial','failed'],ease:3}).totalTasks,3);
  assert.equal(classifyRecaptchaFailure({code:'probe/empty-token'},'execute'),'empty-token');
  assert.equal(getStageHints('recon', 0).length, 3);
  assert.equal(appendDocumentationTemplate('', 'notes').ok, true);
});
test('public entry points import only their new internal module paths',()=>{
  for(const [entry,expected] of [
    ['ux-test.js','./assets/modules/diagnostics/ux-test-model.js'],
    ['recaptcha-independent-diagnostic.js','./assets/modules/diagnostics/recaptcha-diagnostic-core.js'],
    ['labs.html','./assets/modules/training/lab-catalog.js'],
    ['app.js','./assets/modules/training/documentation-templates.js'],
    ['mission-mode.js','./assets/modules/training/documentation-templates.js'],
    ['app.js','./assets/modules/training/training-hints.js'],
  ]) {
    assert(source(entry).includes(expected),entry);
    assert(existsSync(join(root,expected.replace(/^\.\//,''))),entry);
  }
  for(const old of ['ux-test-model.js','recaptcha-diagnostic-core.js','lab-catalog.js','training-hints.js','documentation-templates.js']) {
    assert.equal(existsSync(join(root,old)),false,'root module not moved: '+old);
  }
});
