import test from 'node:test';
import assert from 'node:assert/strict';
import { tracks } from '../data.js';
import { getStageHints, createHintViewState, mountTrainingHints } from '../assets/modules/training/training-hints.js';

test('all existing stages have three distinct bounded guidance levels', () => {
  let count = 0;
  for (const track of tracks) for (let index = 0; index < track.stages.length; index++) {
    const hints = getStageHints(track.id, index);
    assert.equal(hints.length, 3);
    assert.equal(new Set(hints).size, 3);
    assert(Object.isFrozen(hints));
    for (const text of hints) assert(typeof text === 'string' && text.length >= 35 && text.length <= 700);
    count++;
  }
  assert.equal(count, 30);
});

test('unknown and prototype routes have no guidance and cannot coerce an index', () => {
  for (const id of ['missing', '__proto__', 'constructor', 'toString', null, {}, 'logs-0']) assert.equal(getStageHints(id, 0), null);
  for (const index of [-1, 3, 99, '0', null, NaN, 0.5]) assert.equal(getStageHints('logs', index), null);
});

test('hint definitions are immutable and independent view states do not share reveal state', () => {
  const hints = getStageHints('logs', 0);
  assert.throws(() => { hints[0] = 'changed'; }, TypeError);
  const first = createHintViewState(), second = createHintViewState();
  first.revealed = 2;
  assert.equal(second.revealed, 0);
  assert.equal(getStageHints('logs', 0), hints);
});

class Element {
  constructor(document, tag) { Object.assign(this, { ownerDocument: document, tagName: tag, children: [], dataset: {}, attributes: new Map(), listeners: new Map(), textContent: '', disabled: false }); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { if (!this.disabled) this.listeners.get('click')?.(); }
}
function fixture(options = {}) {
  const document = { createElement(tag) { return new Element(document, tag); } };
  const container = new Element(document, 'div');
  const viewState = createHintViewState();
  const controller = mountTrainingHints(container, { trackId: 'logs', stageIndex: 0, viewState, ...options });
  function find(predicate, node = container) { if (predicate(node)) return node; for (const child of node.children) { const value = find(predicate, child); if (value) return value; } return null; }
  const next = find(node => Object.hasOwn(node.dataset, 'hintNext'));
  const review = find(node => Object.hasOwn(node.dataset, 'hintReview'));
  return { container, controller, viewState, next, review, level: number => find(node => node.dataset.hintLevel === String(number)) };
}

test('review content stays absent until both guidance steps, a real attempt and an explicit click', () => {
  const f = fixture();
  assert.equal(f.level(1), null);
  assert.equal(f.level(3), null);
  assert.equal(f.review.disabled, true);
  f.next.click();
  assert(f.level(1));
  assert.equal(f.level(2), null);
  f.next.click();
  assert(f.level(2));
  assert.equal(f.level(3), null);
  f.review.click();
  assert.equal(f.level(3), null);
  f.controller.setAttempted(true);
  assert.equal(f.review.disabled, false);
  assert.equal(f.level(3), null, 'writing a note must not reveal the review automatically');
  f.review.click();
  assert(f.level(3));
  assert.match(f.level(3).children[1].textContent, /12 حدثًا/);
});

test('review can be hidden, attempt removal closes it, and disposing prevents later changes', () => {
  const f = fixture({ attempted: true });
  f.next.click(); f.next.click(); f.review.click();
  assert(f.level(3));
  f.review.click(); assert.equal(f.level(3), null);
  f.review.click(); assert(f.level(3));
  f.controller.setAttempted(false);
  assert.equal(f.level(3), null);
  assert.equal(f.review.disabled, true);
  f.controller.setAttempted(true);
  assert.equal(f.level(3), null);
  const previous = f.viewState.revealed;
  f.controller.dispose(); f.next.click(); f.review.click(); f.controller.setAttempted(false);
  assert.equal(f.viewState.revealed, previous);
});

test('a retained reveal state cannot display review when the current attempt is empty', () => {
  const f = fixture({ viewState: { revealed: 3 }, attempted: false });
  assert.equal(f.level(3), null);
  assert.equal(f.review.disabled, true);
});

test('guidance exposes no storage or progress mutation API', () => {
  const f = fixture({ attempted: true });
  assert.deepEqual(Object.keys(f.controller).sort(), ['dispose', 'setAttempted']);
  f.next.click(); f.next.click(); f.review.click();
  assert.equal(f.viewState.revealed, 3);
});
