/**
 * The tool's own rules, asserted on its source.
 *
 * These lived in the website's site.test.mjs while the tool and the site were
 * one folder. They are about the editor and the build stamp, not about any
 * site, so they came with the tool when it moved to digidesk/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { versionFrom, buildInfo } from '../version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/* ---------------- the editor's own rules ---------------- */

test('the board never declares touch-action, it decides per gesture', () => {
  /* This test used to assert the opposite: that `.ag-unlocked .ag-grid` carried
     `touch-action: pinch-zoom`. That rule was the wrong instrument and it is
     gone. It gave the one finger to the drag, which cost one-finger scrolling
     outright, and on iOS `pinch-zoom` buys two-finger ZOOM rather than
     two-finger PAN on an unzoomed page — so the scrolling it was supposed to
     leave you barely worked either.

     Bureau never sets touch-action on its board (its wire.js). It lets the page
     scroll as a page scrolls and takes the finger only once the hold has landed,
     with a non-passive `touchmove` that preventDefaults while a drag is armed.
     The hold is what makes that legal: the finger has been still, so no native
     scroll has started, and preventDefault can still stop one. */
  const css = read('components/LayoutEditor.astro');
  assert.doesNotMatch(css, /\.ag-grid\s*\{[^}]*touch-action/,
    'the board must not declare touch-action — the gesture decides');

  const js = read('src/editor.js');
  assert.match(js, /addEventListener\('touchmove'[\s\S]{0,120}dragArmed\(\)[\s\S]{0,60}preventDefault/,
    'a non-passive touchmove must preventDefault while, and only while, a drag is armed');
  assert.match(js, /\{ passive: false \}/, 'that listener has to be non-passive or it is ignored');
  assert.match(js, /touches\.length > 1[\s\S]{0,40}onCancel\(\)/,
    'two fingers is never a drag — hand the gesture back so the page scrolls');
});

test('a gesture has one owner, and letting go of it takes every mark off', () => {
  /* The stranded-highlight family. Six visual states are poked onto the DOM by
     hand because the editor cannot re-render, and `pointercancel` used to clean
     up two of them — it cleared the tile drag and never touched the sketch, so
     the sketch's ghost stayed on the board and the next press orphaned it.
     A pointercancel fires exactly when a second finger lands. */
  const js = read('src/editor.js');

  assert.match(js, /function clearGestureState\(\)/, 'one teardown, not one per gesture');
  for (const mark of ['ag-lifted', 'ag-dragging', 'ag-invalid', 'ag-drop', 'ag-ghost']) {
    const at = js.indexOf('function clearGestureState()');
    const body = js.slice(at, at + 1800);
    assert.ok(body.includes(mark), `clearGestureState must account for .${mark}`);
  }
  // Both gestures, both timers.
  const body = js.slice(js.indexOf('function clearGestureState()'), js.indexOf('function clearGestureState()') + 1800);
  for (const held of ['holdTimer', 'menuTimer', 'sketch', 'G']) {
    assert.ok(body.includes(held), `clearGestureState must put ${held} down`);
  }

  assert.match(js, /if \(!e\.isPrimary\) return clearGestureState\(\);[\s\S]*if \(!e\.isPrimary\) return clearGestureState\(\);/,
    'both pointerdown handlers must refuse a second finger');
  assert.match(js, /e\.pointerId !== G\.pointerId/, 'only the finger that started a gesture may drive it');
  assert.match(js, /e\.pointerId !== sketch\.pointerId/, 'and the same for the sketch');
});

test('the sketch never asks the DOM where the finger is', () => {
  /* `elementFromPoint(...).closest('.ag-cell')` returned null over any existing
     tile — tiles are z-index 1, cells are 0 — so the ghost froze at the last
     bare square and a box could not be drawn across anything. */
  const js = read('src/editor.js');
  // A call, not the word — the comment explaining why it went is allowed to say it.
  assert.doesNotMatch(js, /elementFromPoint\s*\(/,
    'the checkerboard is a look, not the thing that decides where you pressed');
  assert.match(js, /export function cellAt/, 'the geometry is pure, and tested in editor.test.js');
});

test('iOS long-press must not open the object menu twice', () => {
  // iOS raises contextmenu from the same press that arms the drag, at ~500ms.
  const js = read('src/editor.js');
  const at = js.indexOf('function onContext');
  assert.ok(at > 0);
  assert.match(js.slice(at, at + 500), /if \(dragArmed\(\)\) \{ e\.preventDefault\(\); return; \}/);
});

test('there is one selection for the page, not one per board', () => {
  /* A page mounts three editors. `selected` used to be a variable inside each,
     so pressing a tile in the page and then one in the footer left both wearing
     the accent ring. The chrome holds it now and paints both boards. */
  const js = read('src/editor.js');
  assert.match(js, /select, selectedOn, selectionOn, dropSelection,/, 'the chrome owns the selection');
  assert.match(js, /function paintSelection\(\)/);
  // …and paint() re-asserts it, which is what an undo that re-mounts a tile needs.
  const at = js.indexOf('  function paint() {');
  assert.match(js.slice(at, at + 4000), /paintSelection\(\);/);
});

/* ---------------- which build is this ---------------- */

test('the version is the commit count, as 0.NN', () => {
  /* Bureau's scheme (its persist.js), and for its reason: a number chosen by
     hand says nothing you can check. The hundredth commit is the first honest
     claim to a 1.0 this will have made. */
  assert.equal(versionFrom(0), '0.00');
  assert.equal(versionFrom(7), '0.07');
  assert.equal(versionFrom(54), '0.54');
  assert.equal(versionFrom(99), '0.99');
  assert.equal(versionFrom(100), '1.00');
  assert.equal(versionFrom(154), '1.54');
  // Always two decimals, so the number sorts and reads the same at every width.
  for (const n of [1, 9, 10, 90, 100, 250]) assert.match(versionFrom(n), /^\d+\.\d\d$/);
});

test('the build stamp says what it is', () => {
  const b = buildInfo();
  assert.ok(Number.isInteger(b.build) && b.build > 0, 'a commit count');
  assert.match(b.sha, /^[0-9a-f]{7,}$/, 'the commit it was built from');
  assert.match(b.at, /^\d{4}-\d\d-\d\dT/, 'when');
  // A working tree with changes in it is marked, so a number read off a dev
  // server is never mistaken for one that could be deployed.
  assert.equal(b.version, versionFrom(b.build) + (b.dirty ? '+' : ''));
});

test('the build stamp reaches a visitor through the tool too', () => {
  // A file you can curl and the editor's bar, both reading the one stamp the
  // integration defines. The head of every page is the site's own shell.
  assert.match(read('routes/version.js'), /__BUILD__/);
  assert.match(read('index.js'), /__BUILD__: JSON\.stringify/);
  assert.match(read('src/editor.js'), /data-bar="version"/);
});

/* ---------------- a phone has no hover ---------------- */

test('every :hover is inside a hover-capable media query', () => {
  /* Bureau's decision 277, found in WebKit: on an iPhone a tap leaves :hover
     stuck on whatever it touched until the next tap lands elsewhere, so a
     button stays lit and a grip stays shown. A rule that only a mouse should
     see says so with @media (hover: hover). */
  const bad = [];
  for (const f of ['components/LayoutEditor.astro', 'styles/faces.css', 'src/edit-mode.js', 'src/model-editor.js']) {
    // Comments may say ":hover"; blank them out but keep the line count.
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const stack = [];   // the at-rule heading each open brace belongs to
    let head = '';
    let line = 1;
    for (const ch of src) {
      if (ch === '\n') line++;
      if (ch === '{') { stack.push(head); head = ''; continue; }
      if (ch === '}') { stack.pop(); head = ''; continue; }
      if (ch === ';') { head = ''; continue; }
      head += ch;
      // Switching something OFF for reduced motion may name :hover anywhere.
      if (head.endsWith(':hover') && !stack.some((h) => /@media[^{]*(hover:\s*hover|prefers-reduced-motion)/.test(h))) {
        bad.push(`${f}:${line}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'wrap these in @media (hover: hover)');
});
