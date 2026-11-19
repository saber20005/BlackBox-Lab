import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAuthEventsCSV, filterAuthEvents, formatEvidenceCitation, createEvidenceViewState, MAX_EVIDENCE_BYTES, MAX_EVIDENCE_ROWS } from '../evidence-workbench.js';

const header = 'time,user,src_ip,event,session_id,device,result,resource';
const row = '2026-01-15T08:55:00Z,analyst01,192.0.2.10,login,session-lab-01,LAB-LT01,success,/signin';
const original = await readFile(new URL('../training-kit/blackbox-defense/auth-events.csv', import.meta.url), 'utf8');

test('the actual evidence artifact preserves all events, fields and original line references', () => {
  const parsed = parseAuthEventsCSV(original);
  assert.equal(parsed.length, 12);
  assert.equal(parsed[0].line, 2);
  assert.equal(parsed.at(-1).line, 13);
  assert.equal(parsed[4].src_ip, '198.51.100.20');
  assert.equal(parsed[4].device, 'UNKNOWN');
  assert.equal(parsed[4].line, 6);
  assert.equal(parsed[4].event, 'session_use');
  assert(Object.isFrozen(parsed));
  assert(Object.isFrozen(parsed[0]));
});

test('CSV handles BOM, CRLF, escaped quotes and commas without changing evidence text', () => {
  const csv = '\uFEFF' + header + '\r\n' + row.replace('LAB-LT01', '"LAB, ""quoted"""') + '\r\n';
  const parsed = parseAuthEventsCSV(csv);
  assert.equal(parsed[0].device, 'LAB, "quoted"');
  assert.equal(parsed[0].line, 2);
  assert.equal(parsed[0].endLine, 2);
});

test('quoted multiline fields retain the physical start and end lines of each source record', () => {
  const parsed = parseAuthEventsCSV(header + '\n' + row.replace('/signin', '"/first\r\n/second"') + '\r\n\r\n' + row);
  assert.equal(parsed[0].resource, '/first\n/second');
  assert.equal(parsed[0].line, 2);
  assert.equal(parsed[0].endLine, 3);
  assert.equal(parsed[1].line, 5);
  assert.match(formatEvidenceCitation([parsed[0]]), /السطور 2–3/);
});

test('missing or duplicated headers and mismatched or empty evidence fields fail explicitly', () => {
  for (const csv of ['', header, header.replace('user', 'time') + '\n' + row, header + '\n' + row + ',extra', header + '\n' + row.replace(',LAB-LT01,', ',,'), header + '\n' + row.replace('2026-01-15T08:55:00Z', 'yesterday'), header + '\n' + row.replace('2026-01-15', '2026-02-30'), header + '\n""\n' + row]) {
    assert.throws(() => parseAuthEventsCSV(csv));
  }
});

test('malformed quotations and embedded NUL are not silently reinterpreted as valid evidence', () => {
  for (const bad of ['"unterminated', '"closed"suffix', 'prefix"quote', '\0']) {
    assert.throws(() => parseAuthEventsCSV(header + '\n' + row.replace('/signin', bad)));
  }
});

test('byte, field and row limits bound parser work, including multi-byte input', () => {
  assert.throws(() => parseAuthEventsCSV('أ'.repeat(MAX_EVIDENCE_BYTES / 2 + 1)), /حجم/);
  assert.throws(() => parseAuthEventsCSV(header + '\n' + row.replace('/signin', 'x'.repeat(4097))), /أطول/);
  const short = '2026-01-15T08:55:00Z,u,i,e,s,d,r,x';
  assert.equal(parseAuthEventsCSV(header + '\n' + Array(MAX_EVIDENCE_ROWS).fill(short).join('\n')).length, MAX_EVIDENCE_ROWS);
  assert.throws(() => parseAuthEventsCSV(header + '\n' + Array(MAX_EVIDENCE_ROWS + 1).fill(short).join('\n')), /عدد/);
});

test('search and independent filters combine without mutating records or selections', () => {
  const parsed = parseAuthEventsCSV(original), state = createEvidenceViewState();
  state.query = 'analyst01 UNKNOWN'; state.session = 'session-lab-01'; state.result = 'success';
  state.selected.add(2);
  assert.deepEqual(filterAuthEvents(parsed, state).map(row => row.line), [6, 7, 8, 9]);
  state.event = 'file_read';
  assert.deepEqual(filterAuthEvents(parsed, state).map(row => row.line), [7]);
  state.query = 'missing';
  assert.deepEqual(filterAuthEvents(parsed, state), []);
  assert.deepEqual([...state.selected], [2]);
  assert.equal(parsed.length, 12);
});

test('citations sort and deduplicate references, include every original field and grant no result', () => {
  const parsed = parseAuthEventsCSV(original);
  const selected = [parsed[4], parsed[0], parsed[4]];
  const citation = formatEvidenceCitation(selected);
  assert(citation.startsWith('[قرائن من ملف التدريب auth-events.csv]\nالسطر 2'));
  assert.equal(citation.match(/السطر 6/g).length, 1);
  assert.match(citation, /session_id: session-lab-01/);
  assert.match(citation, /device: UNKNOWN/);
  assert.match(citation, /resource: \/dashboard/);
  assert.equal(selected[0].line, 6);
  assert.equal(formatEvidenceCitation([]), '');
  assert.throws(() => formatEvidenceCitation([{ ...parsed[0], line: 0 }]));
});

test('literal markup in an evidence field stays an unclassified string rather than a solution or HTML', () => {
  const parsed = parseAuthEventsCSV(header + '\n' + row.replace('/signin', '<img src=x onerror=alert(1)>'));
  assert.equal(parsed[0].resource, '<img src=x onerror=alert(1)>');
  assert.match(formatEvidenceCitation(parsed), /<img src=x onerror=alert\(1\)>/);
  assert.deepEqual(filterAuthEvents(parsed, { query: 'onerror' }), [...parsed]);
});

test('each view starts with an independent selection set so an owner change can reset it', () => {
  const a = createEvidenceViewState(), b = createEvidenceViewState();
  a.selected.add(6); a.query = 'analyst01';
  assert.deepEqual([...b.selected], []);
  assert.equal(b.query, '');
});
