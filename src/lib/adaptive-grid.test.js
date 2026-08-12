/**
 * Tests for the layout engine.
 *
 * The engine is deliberately shared with the visual editor. Nothing used to
 * detect the two drifting apart; these assertions are that detector.
 * Run with `npm test` (node --test, no dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolve, resolveDevice, deriveNarrow, compileCSS, scopeFor, validateLayout,
  normalizeLayout, overlaps, boxOk, freeSpot, columnsFor, deviceFor,
} from './adaptive-grid.js';

/** The /links layout in v1 shape — one box per element, narrow derived. */
const v1 = {
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
const layout = normalizeLayout(v1);
const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));

test('a v1 layout normalises: its single box becomes the desk box', () => {
  const e = byId(layout.elements);
  assert.deepEqual(e.card.desk, { col: [10, 6], row: [5, 8] });
  assert.equal(e.card.narrow, undefined, 'narrow stays derived until edited');
  assert.equal(layout.version, 2);
  assert.equal(layout.narrowColumns, 24, 'defaults to the wide column count');
});

test('the desk layout is returned exactly as authored', () => {
  const r = byId(resolveDevice(layout, 'desk'));
  for (const e of layout.elements) {
    assert.equal(r[e.id]._col, e.desk.col[0], `${e.id} column`);
    assert.equal(r[e.id]._span, e.desk.col[1], `${e.id} span`);
    assert.equal(r[e.id]._row, e.desk.row[0], `${e.id} row`);
    assert.equal(r[e.id]._rowSpan, e.desk.row[1], `${e.id} rowSpan`);
  }
});

test('every element survives the narrow resolve exactly once', () => {
  const out = resolveDevice(layout, 'narrow');
  assert.equal(out.length, layout.elements.length);
  assert.deepEqual(
    out.map((e) => e.id).sort(),
    layout.elements.map((e) => e.id).sort()
  );
});

test('pin holds its edge on row 1 and never joins the stack', () => {
  const r = byId(resolveDevice(layout, 'narrow'));
  assert.equal(r['nav-home']._row, 1, 'left pin stays on row 1');
  assert.equal(r['nav-sun']._row, 1, 'right pin stays on row 1');
  assert.equal(r['nav-home']._col, 1, 'left pin holds the left edge');
  assert.equal(r['nav-sun']._col + r['nav-sun']._span - 1, 24, 'right pin is flush');
});

test('full spans the whole width; stack insets; keep centres', () => {
  const r = byId(resolveDevice(layout, 'narrow'));

  assert.equal(r.card._col, 1);
  assert.equal(r.card._span, 24);

  assert.equal(r.email._col, 2, 'stack is inset by one column');
  assert.equal(r.email._col + r.email._span - 1, 23);

  const leftGap = r.qr._col - 1;
  const rightGap = 24 - (r.qr._col + r.qr._span - 1);
  assert.ok(Math.abs(leftGap - rightGap) <= 1, 'keep is centred');
});

test('no element is ever placed outside the grid', () => {
  for (const device of ['desk', 'narrow']) {
    const cols = columnsFor(layout, device);
    for (const e of resolveDevice(layout, device)) {
      assert.ok(e._col >= 1, `${e.id} starts before column 1 on ${device}`);
      assert.ok(e._span >= 1, `${e.id} has a non-positive span on ${device}`);
      assert.ok(e._col + e._span - 1 <= cols, `${e.id} overflows the last column on ${device}`);
    }
  }
});

test('nothing overlaps on either device', () => {
  for (const device of ['desk', 'narrow']) {
    const placed = resolveDevice(layout, device);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const hit = a._col < b._col + b._span && b._col < a._col + a._span &&
                    a._row < b._row + b._rowSpan && b._row < a._row + a._rowSpan;
        assert.ok(!hit, `${a.id} overlaps ${b.id} on ${device}`);
      }
    }
  }
});

test('stacked elements clear the pinned row', () => {
  const out = resolveDevice(layout, 'narrow');
  const pinBottom = Math.max(
    ...out.filter((e) => e.flow === 'pin').map((e) => e._row + e._rowSpan - 1)
  );
  for (const e of out.filter((e) => e.flow !== 'pin')) {
    assert.ok(e._row > pinBottom, `${e.id} collides with the corner nav`);
  }
});

/* ---------------- two layouts ---------------- */

test('a stored narrow box wins over the derived one', () => {
  const edited = normalizeLayout({
    ...v1,
    elements: v1.elements.map((e) =>
      e.id === 'card' ? { ...e, narrow: { col: [3, 8], row: [40, 4] } } : e
    ),
  });
  const r = byId(resolveDevice(edited, 'narrow'));
  assert.equal(r.card._col, 3);
  assert.equal(r.card._span, 8);
  assert.equal(r.card._row, 40);
  assert.equal(r.card._derived, false, 'a stored box is not derived');
  // Its neighbours are untouched — editing one element does not reflow the rest.
  assert.equal(r.email._derived, true);
  assert.deepEqual(
    { c: r.email._col, s: r.email._span },
    { c: 2, s: 22 }
  );
});

test('editing narrow leaves desk alone, and the reverse', () => {
  const edited = normalizeLayout({
    ...v1,
    elements: v1.elements.map((e) =>
      e.id === 'qr' ? { ...e, narrow: { col: [1, 6], row: [50, 6] } } : e
    ),
  });
  const desk = byId(resolveDevice(edited, 'desk'));
  assert.equal(desk.qr._col, 11, 'desk box is untouched by a narrow edit');
  assert.equal(desk.qr._row, 19);
});

test('narrow can use a coarser grid than desk', () => {
  const coarse = normalizeLayout({ ...v1, narrowColumns: 12 });
  assert.equal(columnsFor(coarse, 'desk'), 24);
  assert.equal(columnsFor(coarse, 'narrow'), 12);
  for (const e of resolveDevice(coarse, 'narrow')) {
    assert.ok(e._col + e._span - 1 <= 12, `${e.id} overflows the 12-column narrow grid`);
  }
});

test('deviceFor picks the device by width, and resolve() agrees', () => {
  assert.equal(deviceFor(layout, 1440), 'desk');
  assert.equal(deviceFor(layout, 700), 'desk', 'reflowBelow is inclusive of desk');
  assert.equal(deviceFor(layout, 699), 'narrow');
  assert.deepEqual(resolve(layout, 1440), resolveDevice(layout, 'desk'));
  assert.deepEqual(resolve(layout, 390), resolveDevice(layout, 'narrow'));
});

/* ---------------- collision ---------------- */

test('overlaps is true only for boxes sharing a cell', () => {
  const a = { col: [1, 4], row: [1, 4] };
  assert.ok(overlaps(a, { col: [3, 4], row: [3, 4] }), 'corner touch overlaps');
  assert.ok(!overlaps(a, { col: [5, 4], row: [1, 4] }), 'adjacent columns do not');
  assert.ok(!overlaps(a, { col: [1, 4], row: [5, 4] }), 'adjacent rows do not');
});

test('boxOk refuses overlap and anything off the grid', () => {
  // card sits at col 10..15, row 5..12 on desk.
  assert.ok(!boxOk(layout, 'email', { col: [10, 4], row: [5, 2] }, 'desk'), 'onto card');
  assert.ok(boxOk(layout, 'email', { col: [2, 8], row: [30, 2] }, 'desk'), 'empty space');
  assert.ok(boxOk(layout, 'card', { col: [10, 6], row: [5, 8] }, 'desk'), 'its own cells');
  assert.ok(!boxOk(layout, 'card', { col: [22, 6], row: [40, 2] }, 'desk'), 'past last column');
  assert.ok(!boxOk(layout, 'card', { col: [0, 4], row: [40, 2] }, 'desk'), 'before column 1');
  assert.ok(!boxOk(layout, 'card', { col: [1, 4], row: [0, 2] }, 'desk'), 'before row 1');
  assert.ok(!boxOk(layout, 'card', { col: [1, 0], row: [1, 2] }, 'desk'), 'zero span');
});

test('freeSpot finds somewhere legal', () => {
  const spot = freeSpot(layout, [4, 2], 'desk');
  assert.ok(boxOk(layout, null, spot, 'desk'));
});

/* ---------------- data + compile ---------------- */

test('the shipped layout data is valid and matches this fixture', () => {
  const onDisk = JSON.parse(
    readFileSync(new URL('../data/layouts/links.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(validateLayout(onDisk, 'links'), []);
  assert.deepEqual(normalizeLayout(onDisk), layout);
});

test('validateLayout catches the ways editor-written data can break', () => {
  const el = (over = {}) => ({ id: 'a', desk: { col: [1, 2], row: [1, 2] }, flow: 'stack', ...over });
  const base = { columns: 12, rowHeight: 40, gap: 8, reflowBelow: 700, elements: [el()] };
  const one = (over) => validateLayout({ ...base, ...over }).join(' | ');

  assert.match(one({ columns: 0 }), /columns must be a positive number/);
  assert.match(one({ columns: 2 }), /columns must be at least 3/);
  assert.match(one({ narrowColumns: 2 }), /narrowColumns must be at least 3/);
  assert.match(one({ rowHeight: -1 }), /rowHeight must be a positive number/);
  assert.match(one({ elements: 'nope' }), /elements must be an array/);
  assert.match(one({ elements: [el({ flow: 'wiggle' })] }), /flow must be one of/);
  assert.match(one({ elements: [el({ id: '' })] }), /id must be a non-empty string/);
  assert.match(one({ elements: [el({ id: '2col' })] }), /not a valid css\/html id/);
  assert.match(one({ elements: [el(), el()] }), /is duplicated/);
  assert.match(one({ elements: [{ id: 'a', flow: 'stack' }] }), /has no desk box/);
  assert.match(one({ elements: [el({ desk: { col: [1], row: [1, 2] } })] }), /must be \[start, span\] integers/);
  assert.match(one({ elements: [el({ desk: { col: [0, 2], row: [1, 2] } })] }), /grid lines start at 1/);
  assert.match(one({ elements: [el({ desk: { col: [1, 2], row: [1, 0] } })] }), /span must be at least 1/);
  assert.match(one({ elements: [el({ desk: { col: [11, 4], row: [1, 2] } })] }), /overflows the 12-column grid/);
  // A narrow box is checked against the narrow column count, not the wide one.
  assert.match(
    one({ narrowColumns: 6, elements: [el({ narrow: { col: [4, 4], row: [1, 2] } })] }),
    /overflows the 6-column grid/
  );

  assert.deepEqual(validateLayout(null), ['layout: is not an object']);
});

test('validateLayout rejects two elements in the same cell', () => {
  const problems = validateLayout({
    columns: 12, rowHeight: 40, gap: 8, reflowBelow: 700,
    elements: [
      { id: 'a', desk: { col: [1, 4], row: [1, 4] }, flow: 'stack' },
      { id: 'b', desk: { col: [3, 4], row: [3, 4] }, flow: 'stack' },
    ],
  });
  assert.ok(problems.some((p) => /a overlaps b on desk/.test(p)), problems.join(' | '));
});

test('every emitted track keeps the load-bearing auto', () => {
  // Without it, anything taller than its rows overflows and collides. This has
  // already shipped as a real bug once.
  const withAuto = (css) =>
    (css.match(/grid-auto-rows:minmax\(clamp\([^)]*\),auto\)/g) ?? []).length;
  const anyTrack = (css) => (css.match(/grid-auto-rows:/g) ?? []).length;

  // Same column count both ways: one track, not restated needlessly.
  const same = compileCSS(layout, 'ag-test');
  assert.equal(anyTrack(same), 1);
  assert.equal(withAuto(same), 1);

  // A coarser narrow grid needs its own track — which must also carry the auto.
  const coarse = compileCSS(normalizeLayout({ ...v1, narrowColumns: 12 }), 'ag-test');
  assert.equal(anyTrack(coarse), 2, 'one per device when they differ');
  assert.equal(withAuto(coarse), 2);
  assert.match(coarse, /repeat\(12,1fr\)/);
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
  const plain = normalizeLayout({
    columns: 12, rowHeight: 40, gap: 8, reflowBelow: 700,
    elements: [{ id: 'only', col: [1, 6], row: [1, 2], flow: 'stack' }],
  });
  assert.equal(resolveDevice(plain, 'narrow')[0]._row, 1);
});

test('deriveNarrow covers every element', () => {
  const seeds = deriveNarrow(layout);
  assert.equal(seeds.size, layout.elements.length);
});
