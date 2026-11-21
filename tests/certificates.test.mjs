import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tracks } from '../data.js';
import { createInitialState } from '../progress.js';
import { completedTrainingTracks, trainingCertificateGroups, completedTrainingGroups, TRAINING_CERTIFICATE_GROUPS, DRAFT_NOTICE, validLearnerName } from '../certificates.js';

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

test('group certificates require every stage of each constituent track and preserve saved progress', () => {
  const p = createInitialState();
  const before = JSON.stringify(p);
  const groups = trainingCertificateGroups(p);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.trackCount), [3, 3, 4]);
  assert.deepEqual(groups.map(group => group.stageCount), [9, 9, 12]);
  assert.equal(completedTrainingGroups(p).length, 0);
  assert.equal(JSON.stringify(p), before, 'computing groups cannot modify progress');

  for (const trackId of TRAINING_CERTIFICATE_GROUPS[0].trackIds.slice(0, 2)) {
    const track = tracks.find(item => item.id === trackId);
    track.stages.forEach((_, i) => { p.completed[`${track.id}-${i}`] = '2026-11-20T10:00:00.000Z'; });
  }
  assert.equal(completedTrainingGroups(p).length, 0, 'two complete tracks do not produce a group record');
  const third = tracks.find(item => item.id === TRAINING_CERTIFICATE_GROUPS[0].trackIds[2]);
  third.stages.forEach((_, i) => { p.completed[`${third.id}-${i}`] = '2026-11-20T11:00:00.000Z'; });
  const completed = completedTrainingGroups(p);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, 'network-foundations');
  assert.equal(completed[0].stageCount, 9);
  assert.equal(completed[0].completedStages, 9);
  assert.equal(completed[0].completedAt, Date.parse('2026-11-20T11:00:00.000Z'));
});

test('certificate group selector stays available but printing is gated', () => {
  const page = readFileSync(new URL('../certificates-page.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../certificates.html', import.meta.url), 'utf8');
  assert(page.includes('trainingCertificateGroups(next.progress)'));
  assert(page.includes("trainingCertificateGroups(null)"));
  assert(page.includes('select.disabled = false;'));
  assert(page.includes('print.disabled = !ready'));
  assert(page.includes('if (!eligible() || print.disabled) return'));
  assert(page.includes('completedTrainingGroups(snapshot.progress)'));
  assert(html.includes('اختر مجموعتك التدريبية'));
  assert(html.includes('إفادة إتمام مجموعة تدريبية'));
  assert(html.includes('aria-describedby="bb-cert-track-help"'));
  assert(!html.includes('<select id="bb-cert-track" disabled'));
});
