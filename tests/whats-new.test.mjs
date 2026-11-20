import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../whats-new.js',import.meta.url),'utf8');

test('new features guide is visible from the main app',()=>{for(const id of ['bb-whats-new','bb-whats-new-open','bb-whats-new-title','bb-whats-new-next','bb-whats-new-close'])assert.match(html,new RegExp('id="'+id+'"'));assert.ok(html.includes("href=\"./labs.html\""));});

function bootGuide(){
  const nodes=Object.create(null);
  const makeNode=()=>({textContent:'',disabled:false,isConnected:true,listeners:Object.create(null),addEventListener(type,fn){this.listeners[type]=fn;},focus(){document.activeElement=this;},getClientRects(){return [1];}});
  for(const id of ['bb-whats-new','bb-whats-new-open','bb-whats-new-close','bb-whats-new-step','bb-whats-new-title','bb-whats-new-description','bb-whats-new-prev','bb-whats-new-next','main-content'])nodes[id]=makeNode();
  const dialog=nodes['bb-whats-new'];
  dialog.open=false;
  dialog.showModal=function(){if(competitor.open)throw new Error('another modal is open');this.open=true;this.modal=true;};
  dialog.close=function(){this.open=false;this.listeners.close?.();};
  const competitor={open:true,closed:false,close(){this.open=false;this.closed=true;}};
  const document={activeElement:nodes['bb-whats-new-open'],getElementById(id){return nodes[id]??null;},querySelector(selector){assert.equal(selector,'dialog[open]:not(#bb-whats-new)');return competitor.open?competitor:null;},dispatchEvent(){return true;}};
  const localStorage={values:{},getItem(key){return this.values[key]??null;},setItem(key,value){this.values[key]=value;}};
  runInNewContext(js,{document,localStorage,Event:class Event{constructor(type){this.type=type;}},getComputedStyle(){return {display:'block',visibility:'visible'};}});
  return {nodes,dialog,competitor,document,localStorage};
}

test('explicit launch preserves a competing dialog and opens after it closes',()=>{
  const {nodes,dialog,competitor,document}=bootGuide();
  assert.equal(dialog.open,false,'guide must not auto-open');
  nodes['bb-whats-new-open'].listeners.click();
  assert.equal(competitor.open,true,'account or import dialog must not be dismissed');
  assert.equal(dialog.open,false,'guide waits until the competing dialog closes');
  competitor.close();
  nodes['bb-whats-new-open'].listeners.click();
  assert.equal(dialog.open,true);
  assert.equal(dialog.modal,true);
  assert.equal(document.activeElement,nodes['bb-whats-new-next']);
  assert.match(nodes['bb-whats-new-title'].textContent,/تدريب دفاعي/);
});

test('closing the guide records dismissal and restores focus to its launcher',()=>{
  const {nodes,dialog,competitor,document,localStorage}=bootGuide();
  competitor.close();
  nodes['bb-whats-new-open'].listeners.click();
  nodes['bb-whats-new-close'].listeners.click();
  assert.equal(dialog.open,false);
  assert.equal(localStorage.getItem('blackbox-whats-new-seen-v2'),'1');
  assert.equal(document.activeElement,nodes['bb-whats-new-open']);
});

