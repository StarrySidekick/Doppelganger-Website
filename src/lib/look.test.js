import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokensFor, lookCSS, validateLook, normalizeLook, isDark, DEFAULT_LOOK } from './look.js';

test('a look resolves to a complete token set derived from a few colours', () => {
  const t = tokensFor({ bg: '#000000', ink: '#ffffff', accent: '#ffd27a' });
  assert.equal(t['--paper'], '#000000');
  assert.equal(t['--ink'], '#ffffff');
  assert.equal(t['--accent'], '#ffd27a');
  // The steps are mixes toward the other colour, not hand-tuned values.
  assert.match(t['--ink-2'], /color-mix\(in srgb, #ffffff 64%, #000000\)/);
  assert.match(t['--paper-2'], /color-mix/);
  for (const k of ['--paper-3', '--ink-3', '--line', '--accent-2', '--board-1', '--board-2', '--body-font']) assert.ok(t[k], k);
});

test('a light page walks its tints the other way', () => {
  assert.equal(isDark('#000'), true);
  assert.equal(isDark('#fff'), false);
  const dark = tokensFor({ bg: '#000000' })['--paper-2'];
  const light = tokensFor({ bg: '#ffffff' })['--paper-2'];
  assert.match(dark, /#fff\)$/, 'a raised surface on a dark page goes toward white');
  assert.match(light, /#000\)$/, 'and on a light page toward black');
});

test('lookCSS is one :root rule', () => {
  const css = lookCSS(DEFAULT_LOOK);
  assert.match(css, /^:root\{--paper:#000000;/);
  assert.doesNotMatch(css, /\n/);
});

test('a stored look is filled in and checked', () => {
  assert.deepEqual(normalizeLook({}).board, DEFAULT_LOOK.board);
  assert.deepEqual(validateLook({ bg: '#123', ink: '#abcdef', board: ['#000', '#111'] }), []);
  assert.match(validateLook({ bg: 'red' }).join(), /hex colour/);
  assert.match(validateLook({ board: ['#000'] }).join(), /two hex colours/);
  assert.match(validateLook({ font: 'comic' }).join(), /serif or display/);
});
