import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLocalTarget, sampleLocal } from '../scripts/local-load-smoke.mjs';

test('sampler rejects public domains, credentials, paths, redirects and privileged non-loopback hosts',()=>{
  for(const target of [
    'https://blackboxlab.dev/', 'https://cybertracelab.dev/',
    'http://0.0.0.0:3000/', 'http://192.168.56.101:3000/',
    'http://localhost.evil.example/', 'http://127.0.0.1@evil.example/',
    'http://127.0.0.1:4173/?view=admin', 'http://localhost:4173/api',
    'http://localhost:4173/#secret', 'ftp://localhost:4173/', '',
  ]) assert.throws(()=>safeLocalTarget(target),undefined,target);
  assert.equal(safeLocalTarget('http://127.0.0.1:4173/').hostname,'127.0.0.1');
  assert.equal(safeLocalTarget('http://[::1]:4173/').hostname,'[::1]');
});

test('sampler caps concurrency and total request count',async()=>{
  const target='http://127.0.0.1:4173/';
  for(const opts of [{requests:17},{requests:0},{concurrency:3},{requests:1,concurrency:2}])
    await assert.rejects(()=>sampleLocal(target,opts),/unsafe-sampling-limits/);
});

test('sampler performs eight bounded GETs with no redirect-following',async()=>{
  let active=0,maxActive=0,calls=0;
  const fetchImpl=async (url,opts)=>{
    calls++;active++;maxActive=Math.max(maxActive,active);
    assert.equal(url,'http://127.0.0.1:4173/');
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'manual');
    await new Promise(resolve=>setTimeout(resolve,4));
    active--;
    return {status:200,arrayBuffer:async()=>new ArrayBuffer(0)};
  };
  const r=await sampleLocal('http://127.0.0.1:4173/',{requests:8,concurrency:2,fetchImpl});
  assert.equal(calls,8);assert.equal(r.successful,8);
  assert.equal(r.failed,0);assert.equal(maxActive,2);
  assert(r.p95Ms>=r.p50Ms);
});

test('sampler never follows a redirect and correctly reports a failure',async()=>{
  let calls=0;
  const r=await sampleLocal('http://localhost:4173/',{
    requests:1,concurrency:1,
    fetchImpl:async()=>{calls++;return {status:302,body:{cancel:async()=>{}}};},
  });
  assert.equal(calls,1);assert.equal(r.failed,1);
});
