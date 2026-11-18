import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel prevents framing, MIME sniffing and high-risk browser permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const header = manifest.headers?.find(rule => rule.source === '/(.*)');
  assert(header, 'Site-wide response security headers are required');
  const values = Object.fromEntries(header.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(values['x-frame-options'], 'DENY');
  assert.equal(values['x-content-type-options'], 'nosniff');
  assert.match(values['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(values['content-security-policy'], /object-src 'none'/);
  assert.match(values['content-security-policy'], /base-uri 'self'/);
  assert.match(values['permissions-policy'], /camera=\(\)/);
  assert.match(values['permissions-policy'], /microphone=\(\)/);
  assert.match(values['referrer-policy'], /strict-origin-when-cross-origin/);
});
