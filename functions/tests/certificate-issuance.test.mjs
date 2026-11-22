import test from 'node:test';
import assert from 'node:assert/strict';
import { CERTIFICATE_MANIFESTS, requireCertificateGroup } from '../certificate-manifests.js';
import { cybertraceClaimId } from '../cybertrace-identity-service.js';
import { publicCertificateView } from '../certificate-registry.js';
import {
  issueVerifiedGroupCertificate, revokeIssuedGroupCertificate,
  validIssuancePolicy, validServerGradedCase, policyIdFor,
} from '../certificate-issuance-service.js';

const ID='0123456789abcdef0123456789abcdef';
const DATE=new Date('2026-11-21T12:00:00.000Z');
const FieldValue={serverTimestamp:()=>DATE};
const group=requireCertificateGroup('cybertrace','email');
const key=policyIdFor(group);
const policy={schemaVersion:1,enabled:true,reviewed:true,issuer:'cybertrace',
  groupId:'email',version:1,proofKind:'verifiedCybertrace',rubricVersion:1,
  minimumScore:70,requireAll:true,requiredCount:group.requiredIds.length};
const awardPath=uid=>'blackboxUsers/'+uid+'/certificateAwards/'+key;
const receiptPath=(uid,caseId)=>'blackboxUsers/'+uid+'/verifiedCybertrace/'+caseId;
const receipt=(caseId,overrides={})=>({
  schemaVersion:1,source:'server-grading',caseId,bestScore:70,
  rubricVersion:1,firstVerifiedAt:DATE,updatedAt:DATE,...overrides,
});
const linked=(uid)=>({schemaVersion:1,provider:'cybertrace-48ab0',status:'linked',
  blackboxUid:uid,cybertraceUid:'cyber-'+uid,linkedAt:DATE});
const dataset=(uid='alice')=>({
  ['blackboxUsers/'+uid+'/identityLinks/cybertrace']:linked(uid),
  ['cybertraceIdentityClaims/'+cybertraceClaimId('cyber-'+uid)]:linked(uid),
  ['certificatePolicies/'+key]:policy,
  ...Object.fromEntries(group.requiredIds.map(id=>[receiptPath(uid,id),receipt(id)])),
});

class MemoryDB {
  constructor(data={}){this.docs=new Map(Object.entries(data));this.operations=[];}
  doc(path){return {path};}
  async runTransaction(operation){
    const changes=[];let startedWriting=false;
    const tx={
      get:async ref=>{
        if(startedWriting)throw Error('read-after-write');
        return {exists:this.docs.has(ref.path),data:()=>this.docs.get(ref.path)};
      },
      create:(ref,value)=>{startedWriting=true;changes.push(['create',ref.path,value]);},
      update:(ref,value)=>{startedWriting=true;changes.push(['update',ref.path,value]);},
    };
    const result=await operation(tx);
    for(const [op,path] of changes){
      if(op==='create'&&this.docs.has(path))throw Error('document-already-exists');
      if(op==='update'&&!this.docs.has(path))throw Error('missing-document');
    }
    for(const [op,path,value] of changes){
      this.docs.set(path,op==='update'?{...this.docs.get(path),...value}:value);
      this.operations.push([op,path]);
    }
    return result;
  }
}

test('immutable source-controlled catalogue covers all eight CyberTrace categories and three BLACKBOX groups',()=>{
  const c=CERTIFICATE_MANIFESTS.filter(x=>x.issuer==='cybertrace');
  const b=CERTIFICATE_MANIFESTS.filter(x=>x.issuer==='blackbox');
  assert.equal(c.length,8); assert.equal(b.length,3);
  assert.deepEqual(c.flatMap(x=>x.requiredIds).length,28);
  assert.equal(new Set(c.flatMap(x=>x.requiredIds)).size,28);
  assert(b.every(x=>x.issuableByGradingService===false));
  assert.deepEqual(b.map(x=>x.requiredIds.length),[9,9,12]);
  assert.throws(()=>requireCertificateGroup('cybertrace','../../accounts'),/unsupported-certificate-group/);
});

test('policy is explicit, reviewed, versioned, exact and full-pass only',()=>{
  assert.equal(validIssuancePolicy(policy,group),true);
  for(const change of [{enabled:false},{reviewed:false},{rubricVersion:2},
    {minimumScore:49},{requireAll:false},{version:2},{requiredCount:1},
    {issuer:'blackbox'},{groupId:'malware'},{proofKind:'client'},{schemaVersion:2}]){
    assert.equal(validIssuancePolicy({...policy,...change},group),false);
  }
  assert.equal(validIssuancePolicy(null,group),false);
});

test('only independently server-graded records with exact case, version and timestamps count',()=>{
  assert(validServerGradedCase(receipt('INC-0512'),'INC-0512',policy));
  for(const change of [
    {source:'cybertrace'},{source:'browser'},{rubricVersion:2},
    {bestScore:69},{bestScore:999},{caseId:'INC-1202'},
    {firstVerifiedAt:'2026-11-21'},{updatedAt:null},{schemaVersion:2},
  ]) assert(!validServerGradedCase(receipt('INC-0512',change),'INC-0512',policy));
});

test('atomic issuance creates an opaque registry record and owner pointer, but never touches training progress',async()=>{
  const db=new MemoryDB(dataset());
  const result=await issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>ID);
  assert.deepEqual(result,{certificateId:ID,issuer:'cybertrace',groupId:'email',status:'verified',newlyIssued:true});
  assert.equal(db.docs.get('certificateRegistry/'+ID).uid,'alice');
  assert.equal(db.docs.get(awardPath('alice')).certificateId,ID);
  assert.equal(db.docs.get('certificateRegistry/'+ID).proofType,'server-assessment');
  assert.equal(publicCertificateView(ID,db.docs.get('certificateRegistry/'+ID)).valid,true);
  const idempotent=await issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>{throw Error('must not mint new ID');});
  assert.equal(idempotent.newlyIssued,false);
  assert.equal(idempotent.certificateId,ID);
  assert.deepEqual(db.operations.map(row=>row[1]).sort(),
    ['certificateRegistry/'+ID,awardPath('alice')].sort());
});

test('missing receipt, legacy receipt, low score, disabled policy and other users are rejected before ANY write',async()=>{
  for(const alteration of [
    data=>{delete data[receiptPath('alice','INC-0512')];},
    data=>{data[receiptPath('alice','INC-0512')]=receipt('INC-0512',{source:'cybertrace'});},
    data=>{data[receiptPath('alice','INC-0512')]=receipt('INC-0512',{bestScore:0});},
    data=>{data['certificatePolicies/'+key]={...policy,enabled:false};},
    data=>{data['certificatePolicies/'+key]={...policy,reviewed:false};},
  ]){
    const source=dataset();alteration(source);
    const db=new MemoryDB(source);
    await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
      uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
    },()=>ID),/verified-assessments-incomplete|certificate-policy-disabled/);
    assert.deepEqual(db.operations,[]);
  }
  const db=new MemoryDB(dataset('alice'));
  await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'bob',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>ID),/identity-link-required/);
  await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'blackbox',groupId:'network-foundations',consent:true,
  },()=>ID),/group-assessments-not-available/);
  await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:false,
  },()=>ID),/consent-required/);
  await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>'predictable'),/invalid-certificate-id/);
  assert.deepEqual(db.operations,[]);
});

test('server-side issuer rejects absent, wrong or unpaired identity ownership before writes',async()=>{
 for(const mutate of [
   d=>{delete d['blackboxUsers/alice/identityLinks/cybertrace'];},
   d=>{delete d['cybertraceIdentityClaims/'+cybertraceClaimId('cyber-alice')];},
   d=>{d['blackboxUsers/alice/identityLinks/cybertrace'].blackboxUid='bob';},
   d=>{d['cybertraceIdentityClaims/'+cybertraceClaimId('cyber-alice')].blackboxUid='bob';},
 ]) {
   const state=dataset();mutate(state);
   const db=new MemoryDB(state);
   await assert.rejects(()=>issueVerifiedGroupCertificate(db,FieldValue,{
     uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
   },()=>ID),/identity-link-required/);
   assert.deepEqual(db.operations,[]);
 }
});

test('admin-only revocation atomically invalidates registry and award; replay cannot reissue',async()=>{
  const db=new MemoryDB(dataset());
  await issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>ID);
  const revoked=await revokeIssuedGroupCertificate(db,FieldValue,{
    certificateId:ID,actor:'admin-reviewer',reason:'Evidence invalidated after review',
  });
  assert.deepEqual(revoked,{certificateId:ID,status:'revoked',changed:true});
  assert.equal(db.docs.get(awardPath('alice')).status,'revoked');
  assert.equal(publicCertificateView(ID,db.docs.get('certificateRegistry/'+ID)).valid,false);
  assert.equal(db.docs.get('certificateRevocationAudit/'+ID).actor,'admin-reviewer');
  const again=await revokeIssuedGroupCertificate(db,FieldValue,{
    certificateId:ID,actor:'admin-reviewer',reason:'Evidence invalidated after review',
  });
  assert.equal(again.changed,false);
  const retry=await issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>{throw Error('must not remint');});
  assert.equal(retry.status,'revoked');
  assert.equal(retry.newlyIssued,false);
  assert.equal(db.operations.filter(x=>x[1].startsWith('certificateRegistry/')).length,2);
});

test('cannot revoke unknown award, use a client fake admin actor, or leak personal data through public view',async()=>{
  const db=new MemoryDB(dataset());
  await assert.rejects(()=>revokeIssuedGroupCertificate(db,FieldValue,{
    certificateId:ID,actor:'admin',reason:'Invalidated for security reasons',
  }),/unknown-issued-certificate/);
  await issueVerifiedGroupCertificate(db,FieldValue,{
    uid:'alice',issuer:'cybertrace',groupId:'email',consent:true,
  },()=>ID);
  await assert.rejects(()=>revokeIssuedGroupCertificate(db,FieldValue,{
    certificateId:ID,actor:'admin',reason:'short',
  }),/invalid-revocation-request/);
  const publicResult=JSON.stringify(publicCertificateView(ID,db.docs.get('certificateRegistry/'+ID)));
  assert(!publicResult.includes('alice'));
  assert(!publicResult.includes('caseIds'));
  assert(!publicResult.includes('INC-0512'));
});
