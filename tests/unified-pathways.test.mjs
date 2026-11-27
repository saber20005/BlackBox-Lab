import test from 'node:test';import assert from 'node:assert/strict';import {tracks} from '../data.js';import {SUITE_PATHWAYS,SUITE_PATHWAYS_VERSION,suiteStepURL,localJourneyProgress} from '../assets/modules/training/suite-learning-pathways.js';import {suiteJourneysPage} from '../assets/modules/training/suite-learning-pathways-ui.js';
test('four suite routes are public and map to actual BLACKBOX tracks',()=>{assert.equal(SUITE_PATHWAYS_VERSION,'2026-11-22.v1');assert.equal(SUITE_PATHWAYS.length,4);for(const p of SUITE_PATHWAYS){assert.equal(p.steps.length,4);p.steps.forEach((s,i)=>{assert.equal(s.site,i%2===0?'cybertrace':'blackbox');if(s.site==='blackbox')assert(tracks.some(t=>t.id===s.id));else assert.match(s.id,/^INC-[0-9]{4}$/);const url=new URL(suiteStepURL(s));assert.equal(url.origin,s.site==='blackbox'?'https://blackboxlab.dev':'https://www.cybertracelab.dev');assert.deepEqual([...url.searchParams.keys()],s.site==='blackbox'?['view','track']:['case']);});}assert.throws(()=>suiteStepURL({site:'blackbox',id:'unsafe'}));});
test('read-only local summary and page do not mutate progress or grant credentials',()=>{const state={completed:{'logs-0':'2026-11-21T10:00:00.000Z','logs-1':'2026-11-21T10:15:00.000Z','logs-2':'2026-11-21T10:40:00.000Z'}};const before=JSON.stringify(state);const page=suiteJourneysPage(state,tracks);assert.match(page,/المسارات التعليمية المشتركة/);assert.match(page,/حالة التحقيقات غير معروفة للضيف/);assert.match(page,/تأكيدات BLACKBOX: <bdi dir="ltr">1 \/ 2<\/bdi>/);assert.match(page,/الخطوات ذات الإنجاز المعروف: <bdi dir="ltr">1 \/ 4<\/bdi>/);assert.equal((page.match(/<details class="suite-card"/g)||[]).length,4);assert.equal((page.match(/<li class="suite-step"/g)||[]).length,16);assert.equal(JSON.stringify(state),before);assert.deepEqual(localJourneyProgress(SUITE_PATHWAYS[0],'blackbox',id=>id==='logs'),{done:1,total:2,remoteKnown:false,credentialEligible:false});});

test('journey progress is only derived from passed scoped BLACKBOX data',()=>{
 const alice={completed:{'logs-0':'2026-11-20T08:00:00Z','logs-1':'2026-11-20T09:00:00Z','logs-2':'2026-11-20T10:00:00Z'}};
 const bob={completed:{}};
 const a=suiteJourneysPage(alice,tracks),b=suiteJourneysPage(bob,tracks);
 assert.match(a,/تأكيدات BLACKBOX: <bdi dir="ltr">1 \/ 2<\/bdi>/);
 assert.match(b,/تأكيدات BLACKBOX: <bdi dir="ltr">0 \/ 2<\/bdi>/);
 assert.deepEqual(bob,{completed:{}});
 assert.deepEqual(Object.keys(alice.completed),['logs-0','logs-1','logs-2']);
 assert.equal(/uid=|email=|token=|session=/.test(a),false);
});
