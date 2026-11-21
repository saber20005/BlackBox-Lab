import test from 'node:test';
import assert from 'node:assert/strict';
import {
  membershipForClient, SUITE_PLAN_ID, SUITE_RELEASE, SUITE_FEATURES,
  validTrustedSuiteMembership, suiteFeatureAllowed,
} from '../suite-membership.js';

const now = Date.parse('2026-11-21T12:00:00.000Z');
const valid = {
  schemaVersion:1, plan:SUITE_PLAN_ID, status:'active', source:'trusted-billing',
  expiresAt:'2026-12-19T12:00:00.000Z', uid:'private-uid',
  paymentMethod:'private-payment-reference',
};

test('the pre-sale gate rejects even an otherwise valid Admin record',()=>{
  assert.equal(SUITE_RELEASE,'not-for-sale');
  assert.deepEqual(SUITE_FEATURES,['advanced-soc','advanced-reports']);
  assert.equal(validTrustedSuiteMembership(valid,now),true);
  assert.deepEqual(membershipForClient(valid,now),membershipForClient(null,now));
  assert.equal(membershipForClient(valid,now).active,false);
  assert.deepEqual(membershipForClient(valid,now).features,[]);
  for(const feature of ['advanced-soc','advanced-reports','admin','billing','certificates']){
    assert.equal(suiteFeatureAllowed(valid,feature,now),false,feature);
  }
});

test('untrusted, paid-but-expired, malformed and long-dated records fail closed',()=>{
  const changes=[
    {status:'trialing'},{status:'past_due'},{status:'canceled'},
    {source:'client'},{source:'cybertrace'},{source:'manual'},
    {schemaVersion:2},{plan:'free'},{plan:'other'},
    {expiresAt:'2026-11-20T00:00:00.000Z'},
    {expiresAt:'2026-11-21T12:00:00.000Z'},
    {expiresAt:'not-a-date'}, {expiresAt:null},
    {expiresAt:'2029-01-01T00:00:00.000Z'},
  ];
  for(const patch of changes){
    const sample={...valid,...patch};
    assert.equal(validTrustedSuiteMembership(sample,now),false,JSON.stringify(patch));
    assert.equal(membershipForClient(sample,now).active,false);
  }
  for(const sample of [undefined,null,[],{},'paid']){
    assert.equal(validTrustedSuiteMembership(sample,now),false);
    assert.equal(membershipForClient(sample,now).active,false);
  }
});

test('valid server timestamp can be read but private identity and payment remain hidden',()=>{
  const expiry=Date.parse(valid.expiresAt);
  const stamp={toMillis:()=>expiry};
  assert.equal(validTrustedSuiteMembership({...valid,expiresAt:stamp},now),true);
  const publicResponse=membershipForClient({...valid,expiresAt:stamp},now);
  assert.equal(JSON.stringify(publicResponse).includes('private-uid'),false);
  assert.equal(JSON.stringify(publicResponse).includes('private-payment-reference'),false);
  assert.equal(Object.isFrozen(publicResponse),true);
  assert.equal(Object.isFrozen(publicResponse.features),true);
});

test('the endpoint remains a BLACKBOX-authenticated, App-Check-enforced read only operation',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
  const match=source.match(/export const getSuiteMembership = onCall\([\s\S]+?\n\}\);/);
  assert(match,'getSuiteMembership callable exists');
  assert.match(match[0],/enforceAppCheck: true/);
  assert.match(match[0],/authUid\(request\)/);
  assert.match(match[0],/suiteMemberships\/\$\{uid\}/);
  assert.match(match[0],/membershipForClient\(/);
  assert.doesNotMatch(match[0],/\.set\(|\.update\(|\.create\(|request\.data\?\.uid/);
});
