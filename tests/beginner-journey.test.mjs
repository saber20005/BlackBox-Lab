import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../beginner-journey.html', import.meta.url), 'utf8');
test('opt-in beginner journey uses a known beginner case and existing safe lab stage', () => {
  assert.match(html, /case=INC-0417/);
  assert.match(html, /track=recon&amp;stage=0|track=recon&stage=0/);
  assert.match(html, /mission-mode\.html/);
});
test('journey does not install billing, overwrite progress, or claim verified skills', () => {
  assert.doesNotMatch(html, /localStorage|setItem\(|checkout|stripe|paddle/i);
  assert.match(html, /ليس شهادة مهارية موثّقة/);
});
