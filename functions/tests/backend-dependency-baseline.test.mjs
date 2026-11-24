import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// No live Firebase calls. Protect the dependency baseline of the trusted backend.
const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const installed=name=>lock.packages?.['node_modules/'+name]?.version;
const semver=value=>{
  assert.match(value??'',/^\d+\.\d+\.\d+$/,'valid pinned semver required');
  return value.split('.').map(Number);
};
const atLeast=(actual,minimum)=>{
  const a=semver(actual),b=semver(minimum);
  for(let i=0;i<3;i++){
    if(a[i]!==b[i])return a[i]>b[i];
  }
  return true;
};

test('backend SDK uses reviewed patched firebase-admin line with immutable lock',()=>{
  assert.equal(manifest.dependencies['firebase-admin'],'^14.5.1');
  const version=installed('firebase-admin');
  assert.equal(semver(version)[0],14);
  assert.ok(atLeast(version,'14.5.1'),'must retain Firebase Admin security fixes');
  assert.equal(lock.packages[''].dependencies['firebase-admin'],manifest.dependencies['firebase-admin']);
});

test('Firebase callable and Firestore APIs stay on a compatible Functions v7',()=>{
  const version=installed('firebase-functions');
  assert.equal(semver(version)[0],7);
  assert.ok(atLeast(version,'7.4.0'));
  assert.equal(manifest.engines.node,'24');
});
