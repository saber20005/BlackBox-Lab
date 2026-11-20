import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sources = Object.fromEntries(await Promise.all(['onboarding.js', 'whats-new.js', 'landing.js'].map(async name => [name, await readFile(new URL('../' + name, import.meta.url), 'utf8')])));

class Event {
  constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
}
class Events {
  listeners = new Map();
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
  dispatchEvent(event) { event.target ||= this; for (const listener of [...(this.listeners.get(event.type) || [])]) listener.call(this, event); return !event.defaultPrevented; }
}
class Element extends Events {
  constructor(document, id, tag = 'div') {
    super(); Object.assign(this, { ownerDocument: document, id, tagName: tag.toUpperCase(), hidden: false, disabled: false, isConnected: true, style: {}, dataset: {}, attributes: new Map(), children: [], textContent: '', value: '', open: false, offsetHeight: 220, focusCalls: 0, closeCalls: 0 });
    const classes = new Set(); this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  getClientRects() {
    if (this.hidden || this.style.display === 'none' || this.classList.contains('hidden') || (this.tagName === 'DIALOG' && !this.open)) return [];
    if (this.id === 'app' && this.ownerDocument.body.classList.contains('bb-landing-active')) return [];
    if (this.parentElement && !this.parentElement.getClientRects().length) return [];
    return [{}];
  }
  getBoundingClientRect() { return { top: 100, left: 1200, right: 1380, width: 180, height: 50 }; }
  scrollIntoView() {}
  focus() { this.focusCalls++; if (!this.disabled && this.getClientRects().length) this.ownerDocument.activeElement = this; }
  closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : this.parentElement?.closest(selector) || null; }
  click() {
    if (this.disabled) return;
    const event = new Event('click', { bubbles: true }); event.target = this;
    this.dispatchEvent(event); this.ownerDocument.dispatchEvent(event);
  }
  showModal() { this.open = true; this.ownerDocument.activeElement = this; this.ownerDocument.openChanged(); }
  close() { this.closeCalls++; this.open = false; this.ownerDocument.openChanged(); this.dispatchEvent(new Event('close')); }
}

function fixture({ storageFails = false, navigationHref, href = 'https://blackboxlab.dev/' } = {}) {
  const document = new Events();
  const nodes = new Map(); const observers = []; const storage = new Map();
  document.body = new Element(document, 'body'); document.activeElement = document.body;
  document.documentElement = new Element(document, 'html');
  const add = (id, tag = 'div', parent = document.body) => { const node = new Element(document, id, tag); nodes.set(id, node); parent.append(node); return node; };
  const app = add('app'); const landing = add('landing-page');
  for (const id of ['landing-enter', 'landing-enter-top', 'landing-start-tour', 'landing-start-tour-bottom']) add(id, 'button', landing);
  add('main-content', 'main', app);
  const overlay = add('bb-tour-overlay'); overlay.hidden = true;
  add('bb-tour-spotlight', 'div', overlay); const bubble = add('bb-tour-bubble', 'div', overlay);
  for (const id of ['bb-tour-heading', 'bb-tour-description', 'bb-tour-count']) add(id, 'div', bubble);
  for (const id of ['bb-tour-prev', 'bb-tour-next', 'bb-tour-skip']) add(id, 'button', bubble);
  const navigation = ['home', 'tracks', 'progress', 'account'].map(view => { const node = add('nav-' + view, 'button', app); node.dataset.view = view; return node; });
  add('bb-whats-new-open', 'button', app); const dialog = add('bb-whats-new', 'dialog');
  for (const id of ['bb-whats-new-step', 'bb-whats-new-title', 'bb-whats-new-description']) add(id, 'div', dialog);
  for (const id of ['bb-whats-new-prev', 'bb-whats-new-next', 'bb-whats-new-close']) add(id, 'button', dialog);
  const otherDialog = add('account-dialog', 'dialog');
  const welcome = add('welcome-guide', 'section', app);
  for (const id of ['welcome-dismiss', 'welcome-reopen', 'welcome-tour', 'welcome-tour-secondary', 'kali-details-toggle']) add(id, 'button', welcome);
  for (const id of ['kali-guide-steps', 'welcome-tips']) add(id, 'div', welcome);
  for (const id of ['bb-wizard-count', 'bb-wizard-progress', 'bb-wizard-question', 'bb-wizard-help', 'bb-wizard-answers', 'bb-wizard-check', 'bb-wizard-feedback', 'bb-wizard-result']) add(id, 'div', landing);
  add('bb-wizard-confirm', 'input', landing);
  add('bb-wizard-back', 'button', landing); add('bb-wizard-next', 'button', landing);
  const radios = ['beginner', 'hobbyist', 'intermediate', 'advanced'].map(level => { const node = add('level-' + level, 'input', landing); node.value = level; return node; });
  document.getElementById = id => nodes.get(id) || null;
  document.createElement = tag => new Element(document, '', tag);
  document.querySelector = selector => {
    if (selector === 'dialog[open]' || selector === 'dialog[open]:not(#bb-whats-new)') return [...nodes.values()].find(node => node.tagName === 'DIALOG' && node.open && (selector === 'dialog[open]' || node.id !== 'bb-whats-new')) || null;
    const view = /^\[data-view="([a-z]+)"\]$/.exec(selector)?.[1];
    return view ? navigation.find(node => node.dataset.view === view) || null : null;
  };
  document.querySelectorAll = selector => selector === 'input[name="bb-level"]' ? radios : [];
  document.openChanged = () => { for (const observer of observers) observer.callback(); };
  const window = new Events();
  const location = { href };
  const context = vm.createContext({
    document, window, Event, URL,
    performance: { getEntriesByType: () => [{ name: navigationHref || href }] },
    location, innerWidth: 1440, innerHeight: 1000,
    getComputedStyle: element => ({ display: element.getClientRects().length ? 'block' : 'none', visibility: element.style.visibility || 'visible' }),
    localStorage: {
      getItem(key) { if (storageFails) throw new Error('storage-unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageFails) throw new Error('storage-unavailable'); storage.set(key, value); }
    },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() { observers.push(this); } },
  });
  for (const name of ['onboarding.js', 'whats-new.js', 'landing.js']) vm.runInContext(sources[name], context, { filename: name });
  const activate = id => { const node = nodes.get(id); node.focus(); node.click(); };
  return { document, window, location, nodes, storage, overlay, bubble, dialog, otherDialog, activate };
}

test('classic guides load together, stay manual, and the native guide opens, closes and reopens', () => {
  const f = fixture();
  f.window.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(f.dialog.open, false);
  f.activate('landing-enter-top');
  assert.equal(f.dialog.open, false);
  f.activate('bb-whats-new-open');
  assert.equal(f.dialog.open, true);
  assert.equal(f.document.activeElement.id, 'bb-whats-new-next');
  assert.equal(f.nodes.get('bb-whats-new-step').textContent, 'الجديد 1 / 4');
  f.activate('bb-whats-new-next');
  assert.equal(f.nodes.get('bb-whats-new-prev').disabled, false);
  f.activate('bb-whats-new-close');
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement.id, 'bb-whats-new-open');
  assert.equal(f.storage.get('blackbox-whats-new-seen-v2'), '1');
  f.activate('bb-whats-new-open');
  assert.equal(f.dialog.open, true);
  assert.equal(f.nodes.get('bb-whats-new-step').textContent, 'الجديد 1 / 4');
});

test('a competing account dialog is neither closed nor replaced by the feature guide', () => {
  const f = fixture(); f.activate('landing-enter-top'); f.otherDialog.showModal();
  f.nodes.get('bb-whats-new-open').click();
  assert.equal(f.otherDialog.open, true);
  assert.equal(f.otherDialog.closeCalls, 0);
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement, f.otherDialog);
});

test('native cancel closes the guide and a hidden opener falls back to the visible workspace', () => {
  const f = fixture({ storageFails: true }); f.activate('landing-enter-top'); f.activate('bb-whats-new-open');
  f.nodes.get('bb-whats-new-open').hidden = true;
  const cancel = new Event('cancel'); f.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement.id, 'main-content');
});

test('ending the final feature step closes the dialog through its ordinary close lifecycle', () => {
  const f = fixture(); f.activate('landing-enter-top'); f.activate('bb-whats-new-open');
  for (let index = 0; index < 4; index++) f.activate('bb-whats-new-next');
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement.id, 'bb-whats-new-open');
});

test('opening the feature guide stops the custom tour before the native dialog takes focus', () => {
  const f = fixture(); f.activate('landing-start-tour');
  assert.equal(f.overlay.hidden, false);
  assert.equal(f.bubble.getAttribute('aria-modal'), 'false');
  assert.equal(f.dialog.open, false);
  f.activate('bb-whats-new-open');
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.dialog.open, true);
  assert.equal(f.document.activeElement.id, 'bb-whats-new-next');
  assert.equal(f.nodes.get('nav-home').classList.contains('bb-tour-target'), false);
});

test('Escape finishes the nonmodal tour and restores visible focus instead of the hidden landing button', () => {
  const f = fixture(); f.activate('landing-start-tour');
  const escape = new Event('keydown'); escape.key = 'Escape'; f.document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.document.activeElement.id, 'nav-home');
  assert.equal(f.nodes.get('landing-start-tour').focusCalls, 1, 'hidden opener is never refocused');
});

test('the four-section tour finishes at the account section and releases its listeners', () => {
  const f = fixture(); f.activate('landing-start-tour');
  for (let index = 0; index < 4; index++) {
    assert.equal(f.nodes.get('bb-tour-count').textContent, `${index + 1} / 4`);
    assert(f.nodes.get('bb-tour-heading').textContent.startsWith(`${index + 1}.`));
    f.activate('bb-tour-next');
  }
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.document.activeElement.id, 'nav-account');
  assert.equal((f.window.listeners.get('resize') || []).length, 0);
});

test('opening another native dialog stops the tour without taking focus from that dialog', () => {
  const f = fixture(); f.activate('landing-start-tour'); f.otherDialog.showModal();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.document.activeElement, f.otherDialog);
  f.nodes.get('landing-start-tour').click();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.otherDialog.open, true);
});

test('a failed native open after stopping a tour leaves visible workspace focus', () => {
  const f = fixture(); f.activate('landing-start-tour');
  f.dialog.showModal = () => { throw new Error('InvalidStateError'); };
  // A programmatic launcher retains the tour-control focus until that tour stops.
  f.nodes.get('bb-whats-new-open').click();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement.id, 'main-content');
});

test('returning to the explicit introduction during a tour restores focus in that visible introduction', () => {
  const f = fixture(); f.activate('landing-start-tour');
  f.location.href = 'https://blackboxlab.dev/?intro=1';
  f.window.dispatchEvent(new Event('popstate'));
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.nodes.get('landing-page').hidden, false);
  assert.equal(f.document.activeElement.id, 'landing-start-tour');
});


test('fresh deep links bypass the introduction without requiring a stored seen marker', () => {
  for (const route of ['?view=home', '?view=progress', '?view=account', '?track=logs&stage=0']) {
    const f = fixture({ href: 'https://blackboxlab.dev/' + route });
    assert.equal(f.nodes.get('landing-page').hidden, true, route);
    assert.equal(f.document.body.classList.contains('bb-landing-active'), false, route);
    assert.equal(f.nodes.get('main-content').getClientRects().length, 1, route);
  }
});


test('explicit workspace home still opens when route normalization runs before deferred landing startup', () => {
  const f = fixture({ href: 'https://blackboxlab.dev/', navigationHref: 'https://blackboxlab.dev/?view=home' });
  assert.equal(f.nodes.get('landing-page').hidden, true);
  assert.equal(f.document.body.classList.contains('bb-landing-active'), false);
  assert.equal(f.storage.get('blackbox-lab-intro-seen-v1'), '1');
});
