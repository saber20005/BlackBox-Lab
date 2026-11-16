import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../firebase-client.js',import.meta.url),'utf8');
test('Firestore is not included in initial auth SDK Promise.all',()=>{
 const initial=source.slice(source.indexOf('const [appSDK, authSDK]'),source.indexOf('const app ='));
 assert.doesNotMatch(initial,/firebase-firestore\.js/);
 assert.match(source,/const getStore = \(\) => storePromise \?\?= import/);
});
test('read and write await Firestore and still enforce UID ownership',()=>{
 assert.match(source,/async read\(uid\).*await getStore/);
 assert.match(source,/const \{ storeSDK, database \} = await getStore\(\);\s*const reference = documentFor/);
 assert.match(source,/auth\.currentUser\.uid !== uid/);
});
test('listener cancellation is safe while SDK loads',()=>{
 assert.match(source,/let cancelled = false/);
 assert.match(source,/if \(cancelled\) return/);
 assert.match(source,/return \(\) => \{ cancelled = true; unsubscribe\?\.\(\); \}/);
});
