import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../loading.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../loading.js',import.meta.url),'utf8');
test('loading indicator is non-blocking and wired',()=>{assert.match(html,/id="bb-load-indicator"/);assert.match(html,/src="\.\/loading\.js"/);assert.match(css,/pointer-events:none/);assert.match(js,/DOMContentLoaded/);assert.doesNotMatch(js,/setTimeout|localStorage|fetch\(/);});
test('transitions respect reduced motion',()=>assert.match(css,/prefers-reduced-motion:reduce/));
test('analytics remains enabled',()=>assert.match(html,/\/_vercel\/insights\/script\.js/));
