import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  cybertraceClaimId, recentlyAuthenticated, linkCyberTraceIdentity,
  currentCyberTraceLink, unlinkCyberTraceIdentity,
} from '../cybertrace-identity-service.js';
const now=Date.parse('2026-11-22T11:00:00.000Z');
const sec=Math.floor(now/1000);
const bb={auth_time:sec-30};
const ct={uid:'ct-123',aud:'cybertrace-48ab0',auth_time:sec-40};
const FieldValue={serverTimestamp:()=>new Date(now)};
class FakeDB {
  constructor(){this.docs=new Map();this.operations=[];}
  doc(path){return {path,get:async()=>this.snap(path)};}
  snap(path){return {exists:this.docs.has(path),data:()=>this.docs.get(path)};}
  async runTransaction(task){
    const changes=[];let wrote=false;
    const tx={get:async r=>{if(wrote)throw Error('read-after-write');return this.snap(r.path);},
      create:(r,v)=>{wrote=true;changes.push(['create',r.path,v]);},
      delete:r=>{wrote=true;changes.push(['delete',r.path]);}};
    const result=await task(tx);
    for(const [type,path] of changes)if(type==='create'&&this.docs.has(path))throw Error('collision');
    for(const [type,path,v] of changes){if(type==='create')this.docs.set(path,v);else this.docs.delete(path);this.operations.push([type,path]);}
    return result;
  }
}
const linked=(db,blackboxUid='bb-123',claims=ct)=>linkCyberTraceIdentity(db,FieldValue,{
  blackboxUid,blackboxClaims:bb,cybertraceClaims:claims,consent:true,now,
});
test('cryptographic account identifier is deterministic, opaque and project separated',()=>{
  const id=cybertraceClaimId(ct.uid);
  assert.match(id,/^[0-9a-f]{64}$/);assert(!id.includes(ct.uid));
  assert.equal(cybertraceClaimId(ct.uid),id);
  assert.throws(()=>cybertraceClaimId('x/y'),/invalid-cybertrace-identity/);
});
test('explicit dual fresh sessions required; no email/UID matching shortcut',async()=>{
  const db=new FakeDB();
  for(const props of [{blackboxClaims:{auth_time:sec-900}}, {cybertraceClaims:{...ct,auth_time:sec-900}},
    {cybertraceClaims:{...ct,aud:'other-firebase-project'}},{consent:false}]){
    await assert.rejects(()=>linkCyberTraceIdentity(db,FieldValue,{
      blackboxUid:'bb-123',blackboxClaims:bb,cybertraceClaims:ct,consent:true,now,...props,
    }),/recent-login-required|invalid-identity-link/);
  }
  assert.equal(db.docs.size,0);
  assert.equal(recentlyAuthenticated(bb,ct,now),true);
});
test('atomic link, idempotent repeat, and exclusive ownership of both accounts',async()=>{
  const db=new FakeDB();
  assert.deepEqual(await linked(db),{linked:true,alreadyLinked:false});
  assert.equal(db.docs.size,2);
  assert.deepEqual(await linked(db),{linked:true,alreadyLinked:true});
  assert.equal(db.operations.length,2);
  assert.deepEqual(await currentCyberTraceLink(db,'bb-123'),{linked:true});
  await assert.rejects(()=>linked(db,'bb-other'),/identity-already-linked/);
  await assert.rejects(()=>linked(db,'bb-123',{...ct,uid:'ct-other'}),/identity-already-linked/);
  assert.deepEqual(await currentCyberTraceLink(db,'bb-other'),{linked:false});
});
test('unlink removes only exact bilateral records; no partial unlink',async()=>{
  const db=new FakeDB();
  await linked(db);
  assert.deepEqual(await unlinkCyberTraceIdentity(db,'bb-123'),{linked:false,changed:true});
  assert.equal(db.docs.size,0);
  assert.deepEqual(await unlinkCyberTraceIdentity(db,'bb-123'),{linked:false,changed:false});
  await linked(db);
  db.docs.delete('cybertraceIdentityClaims/'+cybertraceClaimId(ct.uid));
  await assert.rejects(()=>unlinkCyberTraceIdentity(db,'bb-123'),/invalid-existing-link/);
  assert.equal(db.docs.size,1);
});
test('endpoint validates 2 signed-in identities and App Check; Firestore claims blocked',()=>{
  const fn=readFileSync(new URL('../index.js',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
  assert.match(fn,/verifyIdToken\(data\.cybertraceIdToken,true\)/);
  assert.match(fn,/cybertrace-token-verifier/);
  for(const call of ['linkVerifiedCyberTraceAccount','getVerifiedCyberTraceLink','unlinkVerifiedCyberTraceAccount']){
    assert.match(fn,new RegExp('export const '+call+' = onCall\\('));
  }
  assert.match(fn,/enforceAppCheck: true/);
  assert.match(rules,/match \/cybertraceIdentityClaims\/\{claimId\} \{\s*allow read, write: if false;/);
  assert.match(rules,/match \/blackboxUsers\/\{uid\}\/identityLinks\/\{provider\}/);
  assert.doesNotMatch(fn,/request\.data\?\.email\s*===/);
});
