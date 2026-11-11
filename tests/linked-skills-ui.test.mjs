import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedSkillsPage, linkedSkillsSummary } from '../linked-skills-ui.js';

const user = { uid: 'owner-A', email: 'owner@example.test' };
const receipt = {
  schemaVersion: 1, source: 'cybertrace', caseId: 'INC-1101', bestScore: 70,
  firstSyncedAt: '2026-11-11T12:00:00.000Z', updatedAt: '2026-11-11T12:00:00.000Z',
};
const ready = { enabled: true, phase: 'ready', receipts: { 'INC-1101': receipt }, fromCache: false };

test('disabled and guest skill views do not render private account receipts', () => {
  assert.equal(linkedSkillsSummary({ ...ready, enabled: false }, user), '');
  const guest = linkedSkillsPage(ready, null);
  assert(guest.includes('data-open-account'));
  assert(!guest.includes('linkedSkillPoints'));
  assert(!guest.includes('70 / 70'));
  const signedOut = linkedSkillsPage({ ...ready, phase: 'guest' }, user);
  assert(!signedOut.includes('70 / 70'));
});

test('skill UI displays best-score credit, source, and contextual practice without awarding stages', () => {
  const html = linkedSkillsPage(ready, user);
  assert(html.includes('id="linkedSkillPoints">70</strong>'));
  assert(html.includes('data-skill-id="web"'));
  assert(html.includes('data-linked-case-id="INC-1101"'));
  assert(html.includes('70 / 70'));
  assert(html.includes('مصدر الإنجاز: CyberTrace'));
  assert(html.includes('data-track="webgoat"'));
  assert(html.includes('data-track="proxy"'));
  assert(!html.includes('data-check='));
  assert(!html.includes('data-open='));
});

test('loading is unknown, while cached data and service errors are labelled', () => {
  const loading = linkedSkillsPage({ enabled: true, phase: 'loading', receipts: {} }, user);
  assert(loading.includes('id="linkedSkillPoints">—</strong>'));
  const cached = linkedSkillsPage({ ...ready, fromCache: true }, user);
  assert(cached.includes('نسخة محلية'));
  const failed = linkedSkillsPage({ ...ready, phase: 'error', fromCache: true }, user);
  assert(failed.includes('id="linkedSkillPoints">70</strong>'));
  assert(failed.includes('data-retry-skills'));
  assert(failed.includes('آخر نسخة متاحة'));
});

test('invalid receipts add no points and cross-site links carry no account information', () => {
  const html = linkedSkillsPage({ ...ready, receipts: { 'INC-1101': { ...receipt, bestScore: 999, title: '<img src=x onerror=alert(1)>' } } }, user);
  assert(html.includes('id="linkedSkillPoints">0</strong>'));
  assert(!html.includes('<img'));
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'));
    assert.equal(url.origin, 'https://cybertracelab.dev');
    assert.deepEqual([...url.searchParams.keys()].filter(key => !['case', 'view', 'utm_source', 'utm_medium', 'utm_campaign'].includes(key)), []);
    assert(!url.href.includes(user.uid));
    assert(!url.href.includes('owner%40'));
  }
});
