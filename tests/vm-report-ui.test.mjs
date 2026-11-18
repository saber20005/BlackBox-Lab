import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseVMReport} from '../vm-report.js';

const source=(await readFile(new URL('../vm-report-ui.js',import.meta.url),'utf8'))
  .replace("import {parseVMReport} from './vm-report.js';",'');

class Element {
  constructor(tag='div'){
    this.tag=tag;
    this.children=[];
    this.listeners=new Map();
    this.value='';
    this.files=[];
    this.text='';
  }
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw new Error('Report data must be rendered as text');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.text='';this.children=[...nodes];}
  addEventListener(type,listener){this.listeners.set(type,listener);}
}

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function report(names=['Kali'],attachment='hostonly'){
  return JSON.stringify({ok:true,mode:'read-only',machines:names.map(name=>({
    id:'12345678-1234-1234-1234-123456789abc',name,state:'running',
    isolated:true,adapters:[{slot:1,attachment}]
  }))});
}

function file(text,name='report.json'){
  return {name,size:text.length,text:async()=>text};
}

function harness(){
  const input=new Element('input');
  const output=new Element();
  const status=new Element('p');
  const clear=new Element('button');
  status.textContent='لم يُحمّل أي تقرير بعد.';
  const nodes={'vm-report-file':input,'vm-report-results':output,'vm-report-status':status,'vm-report-clear':clear};
  const created=[];
  vm.runInNewContext(source,{
    Error,parseVMReport,
    document:{
      getElementById:id=>nodes[id],
      createElement(tag){created.push(tag);return new Element(tag);}
    }
  });
  return {
    input,output,status,created,
    select(selected){input.files=selected?[selected]:[];input.value=selected?.name??'';return input.listeners.get('change')();},
    clear(){return clear.listeners.get('click')();},
    names(){return output.children.filter(node=>node.tag==='article').map(card=>card.children.find(node=>node.tag==='h3').textContent);}
  };
}

test('report renderer displays the current parsed inventory and recomputed isolation',async()=>{
  const state=harness();
  await state.select(file(report(['Kali','Target'],'bridged')));
  assert.deepEqual(state.names(),['Kali','Target']);
  assert(state.status.textContent.includes('2 أجهزة'));
  assert(state.output.textContent.includes('العزل غير مؤكد'));
  assert(!state.output.textContent.includes('Host-Only / Internal فقط'));
});

test('a later file selection wins when an older read completes last',async()=>{
  const state=harness();
  const first=deferred(),second=deferred();
  const readA=state.select({name:'a.json',size:100,text:()=>first.promise});
  const readB=state.select({name:'b.json',size:100,text:()=>second.promise});
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'جارٍ قراءة التقرير محليًا...');
  second.resolve(report(['Newest-B']));
  await readB;
  const latestStatus=state.status.textContent;
  assert.deepEqual(state.names(),['Newest-B']);
  first.resolve(report(['Stale-A']));
  await readA;
  assert.deepEqual(state.names(),['Newest-B']);
  assert.equal(state.status.textContent,latestStatus);
});

test('clearing a pending report prevents it from reappearing after its read completes',async()=>{
  const state=harness();
  const pending=deferred();
  const read=state.select({name:'pending.json',size:100,text:()=>pending.promise});
  state.clear();
  assert.equal(state.input.value,'');
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'لم يُحمّل أي تقرير بعد.');
  pending.resolve(report(['Cleared']));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'لم يُحمّل أي تقرير بعد.');
});

test('an older read rejection cannot overwrite a newer successful report',async()=>{
  const state=harness();
  const old=deferred();
  const read=state.select({name:'old.json',size:100,text:()=>old.promise});
  await state.select(file(report(['Newest'])));
  const latestStatus=state.status.textContent;
  old.reject(new Error('stale read failure'));
  await read;
  assert.deepEqual(state.names(),['Newest']);
  assert.equal(state.status.textContent,latestStatus);
  assert(!state.status.textContent.includes('stale'));
});

test('an older rejection cannot replace the cleared state',async()=>{
  const state=harness();
  const old=deferred();
  const read=state.select({name:'old.json',size:100,text:()=>old.promise});
  state.clear();
  old.reject(new Error('stale read failure'));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'لم يُحمّل أي تقرير بعد.');
});

test('an oversized new selection invalidates an earlier pending report without reading the large file',async()=>{
  const state=harness();
  const old=deferred();
  const read=state.select({name:'old.json',size:100,text:()=>old.promise});
  let largeRead=false;
  await state.select({name:'large.json',size:256001,text:async()=>{largeRead=true;return report();}});
  const errorStatus=state.status.textContent;
  assert.equal(largeRead,false);
  assert(errorStatus.includes('الملف كبير جدًا'));
  old.resolve(report(['Stale']));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,errorStatus);
});

test('an invalid new report keeps its validation error when an older valid read finishes',async()=>{
  const state=harness();
  const old=deferred();
  const read=state.select({name:'old.json',size:100,text:()=>old.promise});
  await state.select(file('{'));
  assert.equal(state.status.textContent,'الملف ليس JSON صالحًا');
  old.resolve(report(['Stale']));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'الملف ليس JSON صالحًا');
});

test('removing the file selection invalidates the previous pending read',async()=>{
  const state=harness();
  const old=deferred();
  const read=state.select({name:'old.json',size:100,text:()=>old.promise});
  await state.select(null);
  old.resolve(report(['Stale']));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'لم يُحمّل أي تقرير بعد.');
});

test('the current read failure is displayed after the loading state',async()=>{
  const state=harness();
  const pending=deferred();
  const read=state.select({name:'unreadable.json',size:100,text:()=>pending.promise});
  assert.equal(state.status.textContent,'جارٍ قراءة التقرير محليًا...');
  pending.reject(new Error('تعذرت قراءة الملف المحلي'));
  await read;
  assert.equal(state.output.children.length,0);
  assert.equal(state.status.textContent,'تعذرت قراءة الملف المحلي');
});

test('empty inventories and literal markup remain text-only local results',async()=>{
  const state=harness();
  await state.select(file(report([])));
  assert(state.status.textContent.includes('0 أجهزة'));
  assert.equal(state.output.children[0].textContent,'لا توجد أجهزة في التقرير.');
  const literal='<img src=x onerror=alert(1)>';
  await state.select(file(report([literal])));
  assert.deepEqual(state.names(),[literal]);
  assert(!state.created.includes('img'));
});
