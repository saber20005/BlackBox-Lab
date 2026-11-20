import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Suite Pro is informational only and preserves the free training entry', () => {
  const page = read('../pro.html');
  const home = read('../index.html');
  assert(page.includes('قيد التطوير'));
  assert(page.includes('لا يوجد دفع أو شراء أو اشتراك فعّال الآن'));
  assert(page.includes('https://cybertracelab.dev/?view=pro'));
  assert(page.includes('https://cybertracelab.dev/?view=soc'));
  assert(page.includes('3 مناوبات SOC مجانية'));
  for (const id of ['SOC-SHIFT-01','SOC-SHIFT-02','SOC-SHIFT-03']) {
    assert(page.includes('https://cybertracelab.dev/?view=soc&shift='+id));
  }
  assert(page.includes('تقييم محلي غير موثق'));
  assert(!page.includes('مناوبة SOC مدفوعة الآن'));

  assert(home.includes('href="./pro.html"'));
  assert(home.includes('id="landing-enter"'));
  assert(home.includes('id="landing-enter-top"'));
  assert(!/stripe\.com|paypal\.com|checkout\.stripe\.com|payment_intent/.test(page.toLowerCase()));
});
test('client Firestore rules explicitly deny membership writes and existing progress stays owner-only', () => {
  const rules = read('../firestore.rules');
  assert.match(rules, /match \/suiteMemberships\/\{uid\}\s*\{\s*allow read, write: if false;/);
  assert.match(rules, /match \/blackboxUsers\/\{uid\}\/state\/progress/);
  assert.match(rules, /match \/blackboxUsers\/\{uid\}\/cybertrace\/\{caseId\}/);
});
test('membership callable reads identity from verified request and makes no payment writes', () => {
  const backend = read('../functions/index.js');
  assert.match(backend, /getSuiteMembership = onCall\(\{ region: REGION, enforceAppCheck: true/);
  assert.match(backend, /const uid = authUid\(request\);\s*try\s*\{\s*const snap = await db\.doc\(`suiteMemberships\/\$\{uid\}`\)\.get/);
  assert(!backend.includes('request.data?.uid'));
});
