/**
 * Tests for the door into edit mode.
 *
 * The bug these exist for: `?edit=1` was the only way in, so following any link
 * dropped you out of edit mode with no way back except retyping the address.
 * The two things worth pinning are that the mode SURVIVES a page with no `edit`
 * in its URL, and that Done really clears it — a way out that leaves the flag
 * set would put you straight back in on the next page.
 *
 * There is no DOM here, so `wireEditEntry` is not exercised; the browser checks
 * cover it, per hard rule 5.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editingNow, isKnown, enterEdit, leaveEdit, wireEditEntry, EDIT_FLAG, KNOWN_FLAG, SHOW_CORNER } from './edit-mode.js';

/** A browser, cut down to the four things this file touches. */
function browser(search = '', store = {}) {
  const replaced = [];
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  globalThis.location = {
    pathname: '/Doppelganger-Website/links',
    search,
    hash: '',
    replace: (to) => replaced.push(to),
  };
  globalThis.history = { replaceState: (_a, _b, to) => { globalThis.location.search = to.includes('?') ? '?' + to.split('?')[1] : ''; } };
  const events = [];
  globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  // Just enough document for wireEditEntry to hang its button and its style on.
  const added = [];
  const node = () => ({
    className: '', textContent: '', title: '', tabIndex: 0, type: '',
    attrs: {},
    classList: { add(c) { this.owner.className += ' ' + c; } },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {},
  });
  globalThis.document = {
    createElement: (tag) => { const n = node(); n.tag = tag; n.classList.owner = n; return n; },
    head: { appendChild: (n) => added.push(n) },
    body: { appendChild: (n) => added.push(n) },
    addEventListener() {},
  };
  return { store, replaced, events, added };
}

test('?edit=1 still means edit', () => {
  browser('?edit=1');
  assert.equal(editingNow(), true);
});

test('and so does a bare ?edit', () => {
  browser('?edit');
  assert.equal(editingNow(), true);
});

test('?edit=0 means do not, whatever this browser last did', () => {
  browser('?edit=0', { [EDIT_FLAG]: 'true' });
  assert.equal(editingNow(), false);
});

test('a page with no edit parameter is not editing by default', () => {
  browser('');
  assert.equal(editingNow(), false);
});

test('THE BUG: edit mode survives a link to a page with no ?edit in it', () => {
  // Arrive editing…
  const b = browser('?edit=1');
  wireEditEntry();
  assert.equal(b.store[EDIT_FLAG], 'true', 'arriving with ?edit=1 turns the mode on');
  // …follow the header home link, which carries no parameter of its own.
  browser('', b.store);
  assert.equal(editingNow(), true, 'the next page still mounts the editor');
});

test('Done clears the mode, so the page after it is the site', () => {
  const b = browser('?edit=1', { [EDIT_FLAG]: 'true' });
  leaveEdit();
  assert.equal(b.store[EDIT_FLAG], undefined, 'the flag is gone');
  assert.deepEqual(b.replaced, ['/Doppelganger-Website/links'], 'and it reloads without the parameter');
  browser('', b.store);
  assert.equal(editingNow(), false);
});

test('Done keeps any other query the page was carrying', () => {
  const b = browser('?edit=1&ref=news');
  leaveEdit();
  assert.deepEqual(b.replaced, ['/Doppelganger-Website/links?ref=news']);
});

test('?edit=0 lets you out from a link, not only from the bar', () => {
  const b = browser('?edit=0', { [EDIT_FLAG]: 'true' });
  wireEditEntry();
  assert.equal(b.store[EDIT_FLAG], undefined);
});

test('pressing the corner turns the mode on, writes the parameter, and asks to mount', () => {
  const b = browser('');
  enterEdit();
  assert.equal(b.store[EDIT_FLAG], 'true');
  assert.equal(globalThis.location.search, '?edit=1', 'the address says what state the page is in');
  assert.deepEqual(b.events, ['ag:enter-edit'], 'and the editor mounts where you stand, with no reload');
});

test('the corner stays hidden until you have been in once', () => {
  const b = browser('');
  assert.equal(isKnown(), false);
  enterEdit();
  assert.equal(b.store[KNOWN_FLAG], 'true');
  browser('', b.store);
  assert.equal(isKnown(), true, 'and is a one-press way in from then on');
});

test('a browser that refuses localStorage is not a broken page', () => {
  browser('');
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(editingNow(), false);
  assert.doesNotThrow(() => enterEdit());
  assert.doesNotThrow(() => leaveEdit());
});

test('the corner is on an ordinary page, and never where the bar already is', () => {
  const visitor = browser('');
  wireEditEntry();
  assert.equal(visitor.added.filter((n) => n.tag === 'button').length, 1, 'a visitor page carries the way in');

  const editing = browser('?edit=1');
  wireEditEntry();
  assert.equal(editing.added.length, 0, 'a page already editing has Done in the bar instead');
});

test('a browser that has been in edit mode gets the visible, one-press corner', () => {
  const warm = browser('', { [KNOWN_FLAG]: 'true' });
  wireEditEntry();
  const known = warm.added.find((n) => n.tag === 'button');
  assert.ok(known.className.includes('is-known'));
  assert.equal(known.attrs['aria-label'], 'Edit this site');
});

// The two halves of SHOW_CORNER. Both are asserted whichever way it is set, so
// flipping it back cannot quietly change what the corner does to a visitor.
test('SHOW_CORNER on: every page shows the dot, so it can be found', { skip: !SHOW_CORNER }, () => {
  const first = browser('');
  wireEditEntry();
  const cold = first.added.find((n) => n.tag === 'button');
  assert.ok(cold.className.includes('is-known'), 'visible from the first page load');
  assert.equal(cold.attrs['aria-label'], 'Edit this site');
});

test('SHOW_CORNER off: invisible and unannounced until it has been used', { skip: SHOW_CORNER }, () => {
  const first = browser('');
  wireEditEntry();
  const cold = first.added.find((n) => n.tag === 'button');
  assert.ok(!cold.className.includes('is-known'));
  assert.equal(cold.attrs['aria-hidden'], 'true', 'a visitor is not offered a control they cannot use');
});
