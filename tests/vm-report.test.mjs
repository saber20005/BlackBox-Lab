import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVMReport} from '../vm-report.js';
const id='12345678-1234-1234-1234-123456789abc';
const report=(adapters)=>JSON.stringify({ok:true,mode:'read-only',machines:[{id,name:'Kali',state:'running',isolated:true,adapters}]});
test('accepts host-only inventory',()=>assert.equal(parseVMReport(report([{slot:1,attachment:'hostonly'}]))[0].isolated,true));
test('recomputes isolation instead of trusting input flag',()=>assert.equal(parseVMReport(report([{slot:1,attachment:'bridged'}]))[0].isolated,false));
test('rejects unrecognized and excessive input',()=>{
 assert.throws(()=>parseVMReport('{}'));
 assert.throws(()=>parseVMReport('x'.repeat(256001)));
 assert.throws(()=>parseVMReport(report([{slot:0,attachment:'hostonly'}])));
});
