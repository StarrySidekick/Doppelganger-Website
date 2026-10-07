/**
 * The editor's geometry, checked without a browser.
 *
 * Every defect in the September 2026 gesture pass lived in a pointer handler,
 * and not one of them was covered — there was no editor test at all, because
 * everything interesting needed a DOM. Most of it still does. But the part that
 * decides WHERE a press landed and WHAT SIZE the box between two presses is does
 * not, and that is the part the sketch was getting wrong: it asked
 * `document.elementFromPoint` for a checkerboard cell and gave up whenever the
 * finger crossed a tile, because a tile sits above the cells. So the two pure
 * halves are lifted out and checked here, and the DOM half is now only "read the
 * tracks and hand them over".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { trackAt, cellAt, spanBetween, slugify, newLayout } from './editor.js';
import { validateLayout } from './adaptive-grid.js';

/** Track edges for `n` columns of `size` px with `gap` between them. */
function edgesFor(n, size, gap) {
  const out = [0];
  let at = 0;
  for (let i = 0; i < n; i++) { at += size + gap; out.push(at); }
  return out;
}

/** What `tracks()` would hand back for a plain 24-column board of 40px cells. */
const board = (cols = 24, size = 40, gap = 0) => ({
  x: edgesFor(cols, size, gap),
  y: edgesFor(20, size, gap),
  colStep: size + gap,
  rowStep: size + gap,
});

const RECT = { left: 100, top: 50 };

test('trackAt', async (t) => {
  const e = edgesFor(4, 40, 0);   // [0, 40, 80, 120, 160]

  await t.test('the first pixel of a track is that track', () => {
    assert.equal(trackAt(e, 0, 40), 1);
    assert.equal(trackAt(e, 40, 40), 2);
    assert.equal(trackAt(e, 120, 40), 4);
  });

  await t.test('the last pixel of a track is still that track', () => {
    assert.equal(trackAt(e, 39.9, 40), 1);
    assert.equal(trackAt(e, 79.9, 40), 2);
  });

  await t.test('past the last drawn track it keeps counting', () => {
    // The board grows downward, so a pointer below the last row still names a
    // row rather than clamping to the bottom of the checkerboard.
    assert.equal(trackAt(e, 160, 40), 5);
    assert.equal(trackAt(e, 200, 40), 6);
  });

  await t.test('a gap belongs to the track before it, not to the one after', () => {
    const g = edgesFor(4, 40, 8);  // [0, 48, 96, 144, 192]
    assert.equal(trackAt(g, 44, 48), 1, 'four px into the gap is still column one');
    assert.equal(trackAt(g, 48, 48), 2);
  });
});

test('cellAt', async (t) => {
  const t24 = board();

  await t.test('reads a point relative to the grid, not the window', () => {
    // The grid starts at 100,50 — so the window point 100,50 is cell 1,1.
    assert.deepEqual(cellAt(t24, RECT, 24, 100, 50), { col: 1, row: 1 });
    assert.deepEqual(cellAt(t24, RECT, 24, 140, 90), { col: 2, row: 2 });
  });

  await t.test('a point over a tile still names its cell', () => {
    /* This is the whole bug. `elementFromPoint` returned the tile, `.closest(
       '.ag-cell')` returned null, and the sketch froze. Arithmetic does not
       care what is drawn on top. */
    assert.deepEqual(cellAt(t24, RECT, 24, 500, 450), { col: 11, row: 11 });
  });

  await t.test('clamps sideways to the board but lets rows run on', () => {
    assert.equal(cellAt(t24, RECT, 24, -400, 50).col, 1, 'left of the board');
    assert.equal(cellAt(t24, RECT, 24, 9999, 50).col, 24, 'right of the board');
    assert.equal(cellAt(t24, RECT, 24, 100, -400).row, 1, 'above the board');
    assert.ok(cellAt(t24, RECT, 24, 100, 4050).row > 20, 'below the last drawn row');
  });

  await t.test('a coarser narrow board clamps to its own column count', () => {
    assert.equal(cellAt(board(8), RECT, 8, 9999, 50).col, 8);
  });
});

test('spanBetween', async (t) => {
  await t.test('one cell to itself is a 1x1 box', () => {
    assert.deepEqual(spanBetween({ col: 3, row: 4 }, { col: 3, row: 4 }),
      { col: [3, 1], row: [4, 1] });
  });

  await t.test('measures the box, not the travel', () => {
    assert.deepEqual(spanBetween({ col: 2, row: 2 }, { col: 5, row: 4 }),
      { col: [2, 4], row: [2, 3] });
  });

  await t.test('the corner you started from does not matter', () => {
    const a = { col: 2, row: 2 }, b = { col: 5, row: 4 };
    assert.deepEqual(spanBetween(a, b), spanBetween(b, a),
      'dragging up-and-left must draw the same box as down-and-right');
  });

  await t.test('never produces a span of zero', () => {
    for (const [a, b] of [[1, 1], [1, 2], [9, 3]]) {
      const box = spanBetween({ col: a, row: a }, { col: b, row: b });
      assert.ok(box.col[1] >= 1 && box.row[1] >= 1);
    }
  });
});

test('a page made in the editor is a layout the build accepts', () => {
  // newLayout() and slugify() are what "New page…" and "New drawer" write, and
  // what they write goes into the repo unreviewed.
  const made = newLayout('Game Design');
  assert.deepEqual(validateLayout(made, 'game-design'), []);
  assert.equal(made.gap, 0, 'a new board is a plain grid, not a field of squares');
  assert.equal(slugify('Game Design'), 'game-design');
  assert.equal(slugify('  Essays About Everything!  '), 'essays-about-everything');
  assert.equal(slugify('***'), '', 'a name with no letters has no address');
});
