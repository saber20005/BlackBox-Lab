import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillsDeliveryKey } from '../firebase-client.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Firestore metadata echoes do not cause duplicate skill UI delivery',()=>{
 const first={'INC-0417':{bestScore:40},'INC-0512':{bestScore:65}};
 const reordered={'INC-0512':{bestScore:65},'INC-0417':{bestScore:40}};
 assert.equal(skillsDeliveryKey(first,false),skillsDeliveryKey(reordered,false));
 assert.notEqual(skillsDeliveryKey(first,true),skillsDeliveryKey(first,false));
 assert.notEqual(skillsDeliveryKey(first,false),skillsDeliveryKey({'INC-0417':{bestScore:70},'INC-0512':{bestScore:65}},false));
 assert.notEqual(skillsDeliveryKey({},true),skillsDeliveryKey({},false));
});

test('owner-bound listener still checks its UID, validates receipts, and unsubscribes',()=>{
 const source=read('../firebase-client.js');
 assert.match(source,/collection\(database, 'blackboxUsers', uid, 'cybertrace'\)/);
 assert.match(source,/if \(cancelled \|\| snapshot\.metadata\.hasPendingWrites\) return/);
 assert.match(source,/normalizeReceipt\(document\.data\(\), document\.id\)/);
 assert.match(source,/lastDeliveredKey = key/);
 assert.match(source,/return \(\) => \{ cancelled = true; unsubscribe\?\.\(\); \}/);
});
