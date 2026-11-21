import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tracks } from '../data.js';
import { createInitialState } from '../progress.js';
import { completedTrainingTracks, DRAFT_NOTICE, validLearnerName } from '../certificates.js';

test('only whole manually confirmed tracks appear, not partial progress or raw notes', () => {
  const p = createInitialState();
  assert.equal(completedTrainingTracks(p).length, 0);
  p.completed[tracks[0].id + '-0'] = '2026-11-20T10:00:00.000Z';
  assert.equal(completedTrainingTracks(p).length, 0);
  tracks[0].stages.forEach((_, index) => { p.completed[tracks[0].id + '-' + index] = '2026-11-20T10:00:00.000Z'; });
  p.notes[tracks[0].id + '-0'] = 'PRIVATE_ANNOTATION';
  const drafts = completedTrainingTracks(p);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].trackId, tracks[0].id);
  assert(!JSON.stringify(drafts).includes('PRIVATE_ANNOTATION'));
});
test('learner display names are restricted to safe printable text', () => {
  assert(validLearnerName('متدرب تجريبي'));
  assert(!validLearnerName('<img>'));
  assert(!validLearnerName('A'.repeat(71)));
});
test('certificate page only reads progress, and print retains the unverified label', () => {
  const page = readFileSync(new URL('../certificates-page.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../certificates.html', import.meta.url), 'utf8');
  assert(page.includes('createProgressSession'));
  assert(page.includes('window.print()'));
  assert(!page.includes('saveProgress('));
  assert(!page.includes('setDoc('));
  assert(html.includes('noindex,nofollow'));
  assert(DRAFT_NOTICE.includes('غير موثّقة'));
  assert(html.includes('bb-cert-printed-disclaimer'));
});

test('BLACKBOX certificate keeps its own blue lab brand and accessible PDF layout', () => {
  const html = readFileSync(new URL('../certificates.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/styles/certificates.css', import.meta.url), 'utf8');
  assert(html.includes('src="./favicon.svg"'));
  assert(html.includes('BLACKBOX <span>LAB</span>'));
  assert(html.includes('bb-cert-facts'));
  assert(html.includes('bb-cert-printed-disclaimer'));
  assert(!html.includes('CYBERTRACE'));
  assert(css.includes('#3988ff'));
  assert(css.includes('@media print'));
  assert(css.includes('print-color-adjust:exact'));
});

test('BLACKBOX links to the single shared preview without claiming issuance', () => {
  const html = readFileSync(new URL('../certificates.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/styles/certificates.css', import.meta.url), 'utf8');
  assert(html.includes('href="https://www.cybertracelab.dev/?view=joint-certificate"'));
  assert(html.includes('معاينة تصميم الشهادة المشتركة'));
  assert(html.includes('المعاينة نموذج غير صادر'));
  assert(css.includes('.bb-cert-joint-link'));
  assert(!html.includes('verify?id='));
});
