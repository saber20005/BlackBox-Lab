import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../whats-new.js',import.meta.url),'utf8');

test('new features guide is visible from the main app',()=>{for(const id of ['bb-whats-new','bb-whats-new-open','bb-whats-new-title','bb-whats-new-next','bb-whats-new-close'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(html,/href="\.\/labs\.html"/);});

function bootGuide(){
  const handlers=new Map();
  const competitorDialogs=[{open:true,closed:false,close(){this.open=false;this.closed=true;}},{open:true,closed:false,close(){this.open=false;this.closed=true;}}];
  const makeNode=()=>({textContent:'',disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},focus(){this.focused=true;}});
  const nodes=Object.fromEntries(['bb-whats-new','bb-whats-new-open','bb-whats-new-close','bb-whats-new-step','bb-whats-new-title','bb-whats-new-description','bb-whats-new-prev','bb-whats-new-next'].map(id=>[id,makeNode()]));
  const dialog=nodes['bb-whats-new'];
  dialog.open=false;
  dialog.showModal=function(){if(competitorDialogs.some(item=>item.open))throw new Error('another dialog remains open');this.open=true;this.modal=true;};
  dialog.close=function(){this.open=false;this.closed=true;};
  const opener=nodes['bb-whats-new-open'];
  const document={activeElement:opener,getElementById(id){return nodes[id]??null;},querySelectorAll(selector){assert.equal(selector,'dialog[open]:not(#bb-whats-new)');return competitorDialogs.filter(item=>item.open);}};
  const localStorage={values:{},getItem(key){return this.values[key]??null;},setItem(key,value){this.values[key]=value;}};
  runInNewContext(js,{document,localStorage});
  return {nodes,dialog,competitorDialogs,handlers,localStorage,opener};
}

test('explicit launch closes every competing dialog, then opens the guide modally',()=>{
  const {nodes,dialog,competitorDialogs}=bootGuide();
  assert.equal(dialog.open,false,'the guide must not auto-open');
  nodes['bb-whats-new-open'].listeners.click();
  assert.deepEqual(competitorDialogs.map(item=>item.closed),[true,true]);
  assert.equal(dialog.open,true);
  assert.equal(dialog.modal,true);
  assert.match(nodes['bb-whats-new-title'].textContent,/مختبرات/);
});

test('closing the guide dismisses it and restores focus to the launcher',()=>{
  const {nodes,dialog,opener,localStorage}=bootGuide();
  nodes['bb-whats-new-open'].listeners.click();
  nodes['bb-whats-new-close'].listeners.click();
  assert.equal(dialog.open,false);
  assert.equal(dialog.closed,true);
  assert.equal(opener.focused,true);
  assert.equal(localStorage.getItem('blackbox-whats-new-seen-v2'),'1');
});
