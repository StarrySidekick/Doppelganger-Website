/**
 * Tests for the layout engine.
 *
 * resolve() is deliberately shared with the standalone visual editor. Nothing
 * used to detect the two drifting apart; these assertions are that detector.
 * Run with `npm test` (node --test, no dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, compileCSS, scopeFor } from './adaptive-grid.js';

/** The /links layout, which exercises every flow. */
const layout = {
  columns: 24, rowHeight: 26, gap: 8, reflowBelow: 700,
  elements: [
    { id: 'nav-home', col: [1, 3],  row: [1, 3],  flow: 'pin'   },
    { id: 'nav-sun',  col: [22, 3], row: [1, 3],  flow: 'pin'   },
    { id: 'card',     col: [10, 6], row: [5, 8],  flow: 'full'  },
    { id: 'email',    col: [2, 8],  row: [9, 2],  flow: 'stack' },
    { id: 'phone',    col: [3, 7],  row: [12, 2], flow: 'stack' },
    { id: 'socials',  col: [8, 10], row: [15, 3], flow: 'full'  },
    { id: 'qr',       col: [11, 4], row: [19, 5], flow: 'keep'  },
  ],
};

const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));

test('at or above reflowBelow the authored layout is returned untouched', () => {
  const r = byId(resolve(layout, layout.reflowBelow));
  for (const e of layout.elements) {
    assert.equal(r[e.id]._col, e.col[0], `${e.id} column`);
    assert.equal(r[e.id]._span, e.col[1], `${e.id} span`);
    assert.equal(r[e.id]._row, e.row[0], `${e.id} row`);
    assert.equal(r[e.id]._rowSpan, e.row[1], `${e.id} rowSpan`);
  }
});

test('every element survives the reflow exactly once', () => {
  const out = resolve(layout, 400);
  assert.equal(out.length, layout.elements.length);
  assert.deepEqual(
    out.map((e) => e.id).sort(),
    layout.elements.map((e) => e.id).sort()
  );
});

test('pin holds its edge on row 1 and never joins the stack', () => {
  const r = byId(resolve(layout, 400));
  assert.equal(r['nav-home']._row, 1, 'left pin stays on row 1');
  assert.equal(r['nav-sun']._row, 1, 'right pin stays on row 1');
  assert.equal(r['nav-home']._col, 1, 'left pin holds the left edge');
  // A right-hand pin must end flush with the last column.
  assert.equal(r['nav-sun']._col + r['nav-sun']._span - 1, layout.columns);
});

test('full spans the whole width; stack insets; keep centres', () => {
  const r = byId(resolve(layout, 400));

  assert.equal(r.card._col, 1);
  assert.equal(r.card._span, layout.columns);

  assert.equal(r.email._col, 2, 'stack is inset by one column');
  assert.equal(r.email._col + r.email._span - 1, layout.columns - 1);

  const leftGap = r.qr._col - 1;
  const rightGap = layout.columns - (r.qr._col + r.qr._span - 1);
  assert.ok(Math.abs(leftGap - rightGap) <= 1, 'keep is centred');
});

test('no element is ever placed outside the grid', () => {
  for (const width of [320, 390, 500, 699, 700, 1024, 1440]) {
    for (const e of resolve(layout, width)) {
      assert.ok(e._col >= 1, `${e.id} starts before column 1 at ${width}`);
      assert.ok(e._span >= 1, `${e.id} has a non-positive span at ${width}`);
      assert.ok(
        e._col + e._span - 1 <= layout.columns,
        `${e.id} overflows the last column at ${width}`
      );
    }
  }
});

test('stacked elements never share a row', () => {
  const stacked = resolve(layout, 400).filter((e) => e.flow !== 'pin');
  const sorted = [...stacked].sort((a, b) => a._row - b._row);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    assert.ok(
      sorted[i]._row >= prev._row + prev._rowSpan,
      `${sorted[i].id} starts before ${prev.id} ends`
    );
  }
});

test('stacked elements clear the pinned row', () => {
  const out = resolve(layout, 400);
  const pinBottom = Math.max(
    ...out.filter((e) => e.flow === 'pin').map((e) => e._row + e._rowSpan - 1)
  );
  for (const e of out.filter((e) => e.flow !== 'pin')) {
    assert.ok(e._row > pinBottom, `${e.id} collides with the corner nav`);
  }
});

test('grid-auto-rows keeps the load-bearing auto', () => {
  // Without it, anything taller than its rows overflows and collides. This has
  // already shipped as a real bug once.
  const css = compileCSS(layout, 'ag-test');
  assert.match(css, /grid-auto-rows:minmax\(clamp\([^)]*\),auto\)/);
});

test('compiled CSS is confined to its scope', () => {
  const css = compileCSS(layout, 'ag-test');
  for (const line of css.split('\n')) {
    if (!line || line.startsWith('@') || line === '}') continue;
    assert.ok(line.startsWith('.ag-test'), `unscoped rule leaks globally: ${line}`);
  }
});

test('compileCSS refuses to emit global rules', () => {
  assert.throws(() => compileCSS(layout), /requires a scope/);
});

test('scopeFor is stable for a layout and distinct between layouts', () => {
  assert.equal(scopeFor(layout), scopeFor(structuredClone(layout)));
  assert.notEqual(scopeFor(layout), scopeFor({ ...layout, columns: 12 }));
  assert.match(scopeFor(layout), /^ag-[a-z0-9]+$/);
});

test('a layout with no pinned elements starts at the first row', () => {
  const plain = {
    columns: 12, rowHeight: 40, gap: 8, reflowBelow: 700,
    elements: [{ id: 'only', col: [1, 6], row: [1, 2], flow: 'stack' }],
  };
  assert.equal(resolve(plain, 400)[0]._row, 1);
});
