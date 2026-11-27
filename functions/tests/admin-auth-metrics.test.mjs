import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuthAccountMetrics} from '../admin-auth-metrics.js';
const now=Date.parse('2026-11-27T22:30:00Z');
const user=(uid,creationTime,lastSignInTime,providers=[],disabled=false)=>({uid,metadata:{creationTime,lastSignInTime},providerData:providers.map(providerId=>({providerId})),disabled,email:'private@example.test'});
test('counts separate accounts and providers across pages at Amman midnight, without PII or invented login counts',async()=>{
 const a=user('a','2026-11-27T21:05:00Z','2026-11-27T22:00:00Z',['google.com','password']);
 const b=user('b','2026-11-01T00:00:00Z','2026-11-25T00:00:00Z',['password'],true);
 const c=user('c','2026-10-01T00:00:00Z',undefined);
 const result=await readAuthAccountMetrics(async (_,token)=>token?{users:[b,c]}:{users:[a],pageToken:'next'},{now});
 assert.equal(result.totalAccounts,3);assert.equal(result.accountsCreatedToday,1);assert.equal(result.accountsLastSignedInToday,1);
 assert.equal(result.accountsLastSignedIn7d,2);assert.equal(result.accountsLastSignedIn30d,2);
 assert.equal(result.googleLinkedAccounts,1);assert.equal(result.passwordLinkedAccounts,2);assert.equal(result.disabledAccounts,1);
 assert.equal(result.loginEventsToday,null);assert.equal(result.googleLoginEventsToday,null);assert.equal(result.passwordLoginEventsToday,null);
 assert.ok(!JSON.stringify(result).includes('private@example.test'));
});
test('rejects duplicate records, malformed pages, cycles and incomplete scans',async()=>{
 const a=user('a');
 await assert.rejects(readAuthAccountMetrics(async()=>({users:[a,a]}),{now}),/duplicate/);
 await assert.rejects(readAuthAccountMetrics(async()=>({users:null}),{now}),/invalid-user-page/);
 await assert.rejects(readAuthAccountMetrics(async()=>({users:[],pageToken:'same'}),{now}),/invalid-pagination/);
 await assert.rejects(readAuthAccountMetrics(async()=>({users:[],pageToken:'next'}),{now,maxPages:1}),/scan-limit/);
});
