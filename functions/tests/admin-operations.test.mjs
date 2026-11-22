import test from 'node:test';
import assert from 'node:assert/strict';
import { tracks } from '../../data.js';
import { TRAINING_GROUPS, buildBlackBoxTrainingOverview, requireBlackBoxAdmin } from '../admin-operations.js';

const request=(uid='editor',token='signed-token')=>({
  auth:uid?{uid}:null,
  rawRequest:{headers:{authorization:token===null?undefined:'Bearer '+token}},
  data:{},
});
const provider=(claims, user)=>async()=>({
  verifyIdToken:async (_token,checkRevoked)=>{
    assert.equal(checkRevoked,true);
    if(claims instanceof Error)throw claims;
    return claims;
  },
  getUser:async uid=>user??{uid,disabled:false,customClaims:{admin:true}},
});

test('server catalog counts match the actual BLACKBOX training source and never use private progress',()=>{
  const data=buildBlackBoxTrainingOverview();
  const ids=TRAINING_GROUPS.flatMap(g=>g.tracks);
  assert.deepEqual(new Set(ids),new Set(tracks.map(t=>t.id)));
  assert.equal(data.catalog.trackCount,tracks.length);
  assert.equal(data.catalog.stageCount,tracks.reduce((n,t)=>n+t.stages.length,0));
  assert.equal(data.catalog.groups.reduce((n,g)=>n+g.stages,0),data.catalog.stageCount);
  assert.deepEqual(data.catalog.integrity,{uniqueTracks:true,uniqueStages:true});
  assert.equal(data.metrics,null);
  assert.equal(data.availability.userTotals,'not_configured');
  assert.equal(Object.hasOwn(data,'users'),false);
});

test('approved administrator requires a current signed UID, nonrevoked token and current role',async()=>{
  const owner=request();
  assert.equal(await requireBlackBoxAdmin(owner,provider({uid:'editor',admin:true}),'editor'),'editor');
});

test('guest, another UID, missing bearer and invalid/removed admin claims are denied',async()=>{
  const good=provider({uid:'editor',admin:true});
  await assert.rejects(requireBlackBoxAdmin(request(null),good,null));
  await assert.rejects(requireBlackBoxAdmin(request('other'),good,'editor'));
  await assert.rejects(requireBlackBoxAdmin(request('editor',null),good,'editor'));
  await assert.rejects(requireBlackBoxAdmin(request('editor','bad token'),good,'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),provider({uid:'someone-else',admin:true}),'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),provider({uid:'editor',admin:false}),'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),provider({uid:'editor',admin:true},{uid:'editor',disabled:true,customClaims:{admin:true}}),'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),provider({uid:'editor',admin:true},{uid:'editor',disabled:false,customClaims:{}}),'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),provider({uid:'editor',admin:true},{uid:'other',disabled:false,customClaims:{admin:true}}),'editor'));
});

test('revoked/expired tokens and Firebase Auth outage never grant admin operations',async()=>{
  for(const problem of ['auth/id-token-revoked','auth/id-token-expired','auth/user-disabled']){
    await assert.rejects(requireBlackBoxAdmin(request(),provider(Error(problem)),'editor'));
  }
  await assert.rejects(requireBlackBoxAdmin(request(),async()=>{throw Error('firebase-unavailable');},'editor'));
  await assert.rejects(requireBlackBoxAdmin(request(),async()=>({
    verifyIdToken:async()=>({uid:'editor',admin:true}),
    getUser:async()=>{throw Error('firebase-read-failed');}
  }),'editor'));
});

test('backend callable is explicitly App Check-gated and does not accept account-specific queries',()=>{
  // Structural guard for a deliberately non-deploying PR, not a production emulator substitute.
  const code=readFunctionSource();
  assert.match(code,/getAdminTrainingOverview\s*=\s*onCall/);
  assert.match(code,/enforceAppCheck:\s*true/);
  assert.match(code,/requireBlackBoxAdmin\(request/);
});
import { readFileSync } from 'node:fs';
function readFunctionSource(){return readFileSync(new URL('../index.js',import.meta.url),'utf8');}
