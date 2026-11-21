import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Suite Pro information is discoverable from both landing and signed-in workspace',()=>{
 const html=read('../index.html');
 assert.match(html,/class="bb-pro-nav" href="\.\/pro\.html"/);
 assert.match(html,/class="bb-pro-sidebar" href="\.\/pro\.html"/);
 assert.match(html,/class="bb-pro-cta" href="\.\/pro\.html"/);
 assert.match(html,/aria-label="الاشتراك Suite Pro — قريبًا ولم يبدأ البيع"/);
 assert.match(html,/href="\.\/pro\.html">الاشتراك Suite Pro — قريبًا/);
});
test('there is no checkout or fake payment button while Suite Pro is not for sale',()=>{
 const pro=read('../pro.html'),index=read('../index.html');
 assert.match(pro,/suite-pro-sales-status/);
 assert.match(pro,/suite-subscribe-disabled" type="button" disabled/);
 assert.match(pro,/لا يوجد دفع أو شراء أو اشتراك فعّال الآن/);
 assert.doesNotMatch(index,/checkout|payment-intent|stripe\.com\/checkout/);
});
test('responsive navigation is keyboard usable, branded, and print-hidden',()=>{
 const css=read('../assets/styles/workspace-shell.css');
 assert.match(css,/\.bb-pro-cta:focus-visible/);
 assert.match(css,/\.bb-pro-sidebar:focus-visible/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media print \{\.bb-pro-cta,\.bb-pro-sidebar/);
 const html=read('../index.html');
 assert.match(html,/<a class="bb-pro-sidebar"/);
});
