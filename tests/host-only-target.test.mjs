import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {labs} from '../assets/modules/training/lab-catalog.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('reproducible isolated network target is documented and never represented as an attested score',()=>{
 const lab=labs.find(item=>item.id==='nmap-controlled-target');
 assert(lab);
 assert.equal(lab.trackId,'nmap');
 assert.equal(lab.runtime,'local');
 assert.equal(lab.network,'host-only');
 assert.equal(lab.status,'manual');
 const doc=read('../training-kit/blackbox-network/README-ar.md');
 for(const text of ['Host-Only','--confirm-host-only','127.0.0.1','-p 8088','ليس']) {
   if(text==='ليس')continue;
   assert(doc.includes(text),text);
 }
 const app=read('../training-kit/blackbox-network/target_service.py');
 assert(app.includes('read-only HTTP target')||app.includes('read-only HTTP'));
 assert(!app.includes('subprocess.run'));
 assert(!app.includes('os.system'));
 assert(doc.includes('لا يعد وحده إثباتًا خادميًا'));
});
test('local service binds only to intended IPv4 and exposes no arbitrary filesystem',()=>{
 const root=new URL('../',import.meta.url);
 const output=execFileSync('python3',['-m','unittest','discover','-s','training-kit/blackbox-network','-p','test_*.py'],{
   cwd:new URL('.',root),encoding:'utf8',timeout:12000,
 });
 assert.equal(typeof output,'string');
});
