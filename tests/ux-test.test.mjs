import test from 'node:test';import assert from 'node:assert/strict';import {summarizeUX} from '../ux-test-model.js';import {readFileSync} from 'node:fs';
test('summarizes self-reported tasks',()=>assert.deepEqual(summarizeUX({tasks:['success','partial','failed'],ease:3}),{completedWithoutHelp:1,totalTasks:3,completionRatePercent:33,ease:3}));
test('rejects fabricated task outcomes and invalid ratings',()=>{assert.throws(()=>summarizeUX({tasks:['success'],ease:3}));assert.throws(()=>summarizeUX({tasks:['success','success','success'],ease:9}));});
test('pilot is explicit about optional local export',()=>{const html=readFileSync(new URL('../ux-test.html',import.meta.url),'utf8');assert.match(html,/لا نرسل إجاباتك تلقائيًا/);assert.match(html,/ux-test.js/);});
