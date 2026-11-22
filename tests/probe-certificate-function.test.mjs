import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCertificateVerifier,VERIFY_FUNCTION_URL} from '../scripts/probe-certificate-function.mjs';
const ID='0123456789abcdef0123456789abcdef';
const reply=(status,type,body)=>({status,headers:{get:k=>k==='content-type'?type:null},json:async()=>body});
test('a not-found JSON from the real endpoint contract is healthy, a generic HTML 404 is NOT',async()=>{
 let requests=0;
 const result=await probeCertificateVerifier(async(url,opts)=>{
   requests++;assert.equal(url,VERIFY_FUNCTION_URL+'?id='+ID);
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.method,'GET');
   return reply(404,'application/json; charset=utf-8',{status:'not-found',valid:false});
 },ID);
 assert.deepEqual(result,{ready:true,httpStatus:404,notFound:true});
 assert.equal(requests,1);
 for(const mock of [
   reply(404,'text/html',{status:'not-found',valid:false}),
   reply(500,'application/json',{status:'not-found',valid:false}),
   reply(200,'application/json',{status:'verified',valid:true}),
   reply(302,'text/html',{}),
   reply(404,'application/json',{status:'unavailable',valid:false}),
 ]){
   await assert.rejects(()=>probeCertificateVerifier(async()=>mock,ID),/not-deployed-or-unhealthy|invalid-response/);
 }
});
test('only 128-bit hex IDs can be tested',async()=>{
 await assert.rejects(()=>probeCertificateVerifier(async()=>{throw Error('must not fetch');},'../../../admin'),/invalid-probe-id/);
});
