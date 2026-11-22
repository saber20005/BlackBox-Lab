import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('defensive final is discoverable, accessible RTL, and does not pretend to issue certificates',()=>{
  const html=read('../defense-final.html');
  for(const value of ['lang="ar"','dir="rtl"','id="exam-form"','id="portfolio-form"',
    'id="reviewer-console" hidden','الامتحان النهائي','لا تُرسل الملفات الأصلية'])
    assert(html.includes(value),value);
  assert(read('../evidence-labs.html').includes('defense-final.html'));
  assert(read('../certificates.html').includes('defense-final.html'));
  const css=read('../assets/styles/defense-final.css');
  assert(css.includes('max-width:650px'));
  assert(css.includes('prefers-reduced-motion'));
});
test('client refuses local grades, uses verified callables only and does not transmit user file bytes',()=>{
  const src=read('../defense-final.js'),client=read('../lab-assessment-client.js');
  assert(src.includes('beginDefenseFinalCapstone'));
  assert(src.includes('submitDefenseFinalCapstone'));
  assert(src.includes('submitDefensePracticalPortfolio'));
  assert(src.includes('getMyDefenseFinalReadiness'));
  assert(src.includes('getDefensePortfolioForReview'));
  assert(src.includes('reviewDefensePracticalPortfolio'));
  assert(src.includes('reply.verifiedByServer!==true'));
  assert(src.includes('reply.credentialEligible!==false'));
  assert(src.includes('r.practicalEvidenceVerified!==false'));
  assert(src.includes('crypto.subtle.digest'));
  assert(src.includes('blob.arrayBuffer()'));
  assert(src.includes('sha256:items')===false);
  assert(!src.includes('localStorage.setItem'));
  assert(!src.includes('setDoc('));
  assert(!src.includes('uploadBytes('));
  assert(client.includes('export async function caller'));
  assert(client.includes('accountConfig.grading?.enabled === true'));
  const config=read('../account-config.js');
  assert(config.includes('grading: Object.freeze({ enabled: false'));
});
test('separate reviewer authorization is verified server-side, not via UI state alone',()=>{
  const src=read('../defense-final.js'),backend=read('../functions/index.js');
  assert(src.includes('token.claims.certificateReviewer===true'));
  assert(backend.includes("throw new HttpsError('permission-denied'"));
  assert(backend.includes("request.auth?.token?.certificateReviewer!==true"));
  assert(src.includes("'reviewed-unverified'")||read('../defense-final.html').includes('reviewed-unverified'));
  assert(!backend.includes('CERTIFICATE_ISSUANCE_ENABLED = true'));
});
