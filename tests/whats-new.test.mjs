import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../whats-new.js',import.meta.url),'utf8');
test('new features guide is visible from the main app',()=>{for(const id of ['bb-whats-new','bb-whats-new-open','bb-whats-new-title','bb-whats-new-next','bb-whats-new-close'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(html,/href="\.\/labs\.html"/);});
test('guide is versioned and dismissible with native dialog',()=>{assert.match(js,/blackbox-whats-new-seen-v2/);assert.match(js,/showModal\(/);assert.match(js,/localStorage\.setItem/);assert.match(js,/MutationObserver/);});
