import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = ['index.html', 'labs.html', 'vm-report.html'].map(name => ({
  name, html: readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
}));
const css = readFileSync(new URL('../assets/styles/loading.css', import.meta.url), 'utf8');

// Readiness and failure are exercised by test-loading-browser.mjs against real
// entry points; source keywords alone cannot establish that a screen is usable.
test('all loading-cue pages retain their shared non-blocking assets', () => {
  for (const { name, html } of pages) {
    assert.match(html, /id="bb-load-indicator"/, name);
    assert.match(html, /src="\.\/loading\.js"/, name);
    assert.match(html, /href="\.\/assets\/styles\/loading\.css"/, name);
  }
  assert.match(css, /pointer-events\s*:\s*none/);
});
test('loading transitions respect reduced motion', () => {
  assert.match(css, /prefers-reduced-motion\s*:\s*reduce/);
});
test('analytics remains available without blocking deferred application scripts', () => {
  for (const { name, html } of pages) {
    const analytics = html.match(/<script\b[^>]*src="\/_vercel\/insights\/script\.js"[^>]*>/)?.[0];
    assert(analytics, `${name} retains analytics`);
    assert.match(analytics, /\basync\b/, `${name} loads optional analytics asynchronously`);
  }
});
