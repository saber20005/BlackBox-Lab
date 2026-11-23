import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInitialState} from '../progress.js';
import {BB_FIRST_VISIT_KEY,BB_FIRST_VISIT_DONE,shouldStartBbTour,finishBbTour,hasFinishedBbTour,hasTrainingHistory} from '../assets/modules/onboarding/first-visit.js';
import {BB_TOUR_STEPS,BB_TOUR_DEMOS,renderBbWelcome} from '../assets/modules/onboarding/welcome-page.js';
import {parseRoute,routeURL,primaryView} from '../routes.js';
const db=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),items:()=>[...map]};};
test('first homepage only; existing users, explicit help, restored progress, direct routes bypass onboarding',()=>{
 const state=createInitialState(),local=db(),session=db();
 const url='https://blackboxlab.dev/';
 assert.equal(shouldStartBbTour(url,parseRoute(url),state,local,session),true);
 for(const link of ['?view=home','?view=account','?view=tracks','?view=exercise','?track=logs&stage=0','?intro=1#local-lab-setup','#local-lab-setup']) {
  const href=url+link;assert.equal(shouldStartBbTour(href,parseRoute(href),state,local,session),false,'Must bypass '+href);
 }
 assert.equal(hasTrainingHistory(state),false);
 state.notes['logs-0']='an existing analysis';
 assert.equal(shouldStartBbTour(url,parseRoute(url),state,local,session),false);
 state.notes={};state.checks['logs-0']=[0];
 assert.equal(hasTrainingHistory(state),true);
 state.checks['logs-0']=[];local.setItem('blackbox-lab-intro-seen-v1','1');
 assert.equal(shouldStartBbTour(url,parseRoute(url),state,local,session),false,'old users should not be interrupted');
});
test('skip and finish store only distinct key; local fallback to session, deny never throws',()=>{
 const local=db(),session=db(),state=createInitialState();local.setItem('blackbox-progress-data','{"completed":{"logs-0":true}}');
 assert.equal(finishBbTour(local,session),true);
 assert.equal(hasFinishedBbTour(local,session),true);
 assert.equal(local.getItem(BB_FIRST_VISIT_KEY),BB_FIRST_VISIT_DONE);
 assert.equal(local.getItem('blackbox-progress-data'),'{"completed":{"logs-0":true}}');
 assert.equal(shouldStartBbTour('https://blackboxlab.dev/',parseRoute('https://blackboxlab.dev/'),state,local,session),false);
 const denied={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(finishBbTour(denied,session),true);
 assert.equal(hasFinishedBbTour(denied,session),true);
 assert.equal(finishBbTour(denied,denied),false);
});
test('welcome preview has six actionable steps and practice examples never write progress',()=>{
 assert.equal(parseRoute('https://blackboxlab.dev/?view=welcome').view,'welcome');
 assert.equal(primaryView('welcome'),'home');
 assert.equal(routeURL({view:'welcome'}).searchParams.get('view'),'welcome');
 assert.equal(BB_TOUR_STEPS.length,6);
 for(const id of ['tracks','isolation','nmap','evidence']){
  assert.equal(BB_TOUR_DEMOS[id].filter(item=>item.correct).length,1);
  assert(BB_TOUR_DEMOS[id].every(item=>typeof item.reply==='string'));
 }
 for(let i=0;i<6;i++){
  const html=renderBbWelcome(i);
  assert.match(html,/data-bb-first-visit/);
  assert.match(html,/data-bb-tour-skip/);
  assert.match(html,/data-bb-tour-prev/);
  const progressOnly=html.match(/<nav class="bb-tour-progress"[\s\S]*?<\/nav>/)?.[0]??'';
  assert.equal((progressOnly.match(/data-bb-tour-step=/g)||[]).length,6);
  assert.match(html,/لم يتم تشغيل أي أداة/);
 }
 assert.match(renderBbWelcome(5),/data-bb-tour-go="logs"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/finishBbTour/);
 assert.match(app,/shouldStartBbTour/);
 assert.match(app,/data-bb-tour-answer/);
 assert.doesNotMatch(readFileSync(new URL('../assets/modules/onboarding/welcome-page.js',import.meta.url),'utf8'),/localStorage|fetch\(|firebase/);
});

test('Nmap preview remains a network-free interactive simulation',()=>{
 const html=renderBbWelcome(3);
 assert.match(html,/Nmap/);
 assert.match(html,/192\.168\.56\.10/);
 assert.match(html,/data-bb-tour-answer="safe"/);
 assert.match(html,/SAMPLE ONLY|NO NETWORK SCAN/);
 assert.match(html,/DESIGN PREVIEW/);
 assert.match(html,/blackboxlab\.dev\/\?view=welcome/);
 assert.equal(BB_TOUR_DEMOS.nmap.filter(item=>item.correct).length,1);
});

test('redesigned onboarding presents real logo, meaningful console, keyboard-accessible entry shortcuts and hidden Nmap output',()=>{
 const first=renderBbWelcome(0);
 assert.match(first,/src="\.\/favicon\.svg"/);
 assert.match(first,/data-bb-tour-step="1"/);
 assert.match(first,/data-bb-tour-step="2"/);
 assert.match(first,/BLACKBOX \/ SIMULATION/);
 const nmap=renderBbWelcome(3);
 assert.match(nmap,/data-bb-tour-nmap-output hidden/);
 assert.match(nmap,/22\/tcp/);
 assert.match(nmap,/قيم اصطناعية/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/sample\.hidden = !picked\.correct/);
});
