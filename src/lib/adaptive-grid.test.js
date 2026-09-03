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
  normalizeLayout, overlaps, boxOk, freeSpot, columnsFor, deviceFor, packLayout,
} from './adaptive-grid.js';

/**
 * A synthetic layout in v1 shape — one box per element, narrow derived.
 *
 * It started as a copy of /links and is now its own thing, kept because it
 * exercises all four flows including `pin`, which the shipped layouts no longer
 * do at page level (the header owns the corner navigation now). Its job is the
 * engine's geometry; the shipped files are asserted separately, below.
 */
const v1 = {
  columns: 24, gap: 8, reflowBelow: 700,
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
  assert.equal(layout.version, 5);
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

const shipped = (name) => normalizeLayout(JSON.parse(
  readFileSync(new URL(`../data/layouts/${name}.json`, import.meta.url), 'utf8')
));

test('every shipped layout is valid', () => {
  // The build throws on an invalid layout, but only for layouts a page uses.
  // This covers the files themselves, so one that nothing renders yet cannot
  // rot unnoticed.
  for (const name of ['links', 'header', 'footer']) {
    assert.deepEqual(validateLayout(shipped(name), name), [], name);
  }
});

test('the shipped /links geometry is what we think it is', () => {
  const onDisk = shipped('links');
  assert.deepEqual(
    onDisk.elements.map((e) => [e.id, e.flow]),
    [['card', 'full'], ['email', 'stack'], ['phone', 'stack'], ['socials', 'full'], ['qr', 'keep']]
  );
  // The corner navigation moved into the header layout. If it comes back here
  // as well, the page has two home icons and nobody notices until it ships.
  assert.equal(onDisk.elements.some((e) => e.id.startsWith('nav-')), false);
});

test('the chrome layouts hold the site navigation', () => {
  const header = shipped('header');
  const footer = shipped('footer');
  assert.deepEqual(header.elements.map((e) => e.id), ['site-home', 'site-wordmark', 'site-sun']);
  // Header and footer ids must not collide with each other or with a page's:
  // they end up in one document, where an id is a global name.
  const all = [...header.elements, ...footer.elements, ...shipped('links').elements].map((e) => e.id);
  assert.equal(new Set(all).size, all.length, 'ids are unique across the whole page');

  // Hard rule 2: these are site-relative and only work because the text
  // renderer sends them through url(). Stored bare on purpose.
  assert.match(footer.elements.find((e) => e.id === 'site-nav').body, /href="\/writing"/);
});

test('the shipped layout carries its own content, not the page markup', () => {
  const e = byId(shipped('links').elements);

  // The point of v3: these two were unreachable markup inside links.astro and
  // are now editable data. If this regresses, the editor silently goes back to
  // being able to move the email tile but not change the email.
  assert.match(e.email.body, /TimothyVlangas@gmail\.com/);
  assert.match(e.phone.body, /401-297-8580/);
  // The whole line is the link, as it was in the markup this replaced. Splitting
  // the label out of the anchor is what lost the space after "Email:".
  assert.match(e.email.body, /^<a href="mailto:/);
  assert.equal(e.qr.kind, 'image');

  // The flip card stays a slot: it is a component with its own behaviour, and
  // a content schema would only get in its way. Written out rather than left
  // off, so it reads as a decision instead of a forgotten field.
  assert.equal(e.card.kind, 'slot');
  assert.equal(e.socials.kind, 'slot');
});

test('validateLayout catches the ways editor-written data can break', () => {
  const el = (over = {}) => ({ id: 'a', desk: { col: [1, 2], row: [1, 2] }, flow: 'stack', ...over });
  const base = { columns: 12, gap: 8, reflowBelow: 700, elements: [el()] };
  const one = (over) => validateLayout({ ...base, ...over }).join(' | ');

  assert.match(one({ columns: 0 }), /columns must be a positive number/);
  assert.match(one({ columns: 2 }), /columns must be at least 3/);
  assert.match(one({ narrowColumns: 2 }), /narrowColumns must be at least 3/);
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
    columns: 12, gap: 8, reflowBelow: 700,
    elements: [
      { id: 'a', desk: { col: [1, 4], row: [1, 4] }, flow: 'stack' },
      { id: 'b', desk: { col: [3, 4], row: [3, 4] }, flow: 'stack' },
    ],
  });
  assert.ok(problems.some((p) => /a overlaps b on desk/.test(p)), problems.join(' | '));
});

test('every emitted track is a rigid square cell, and no row ever grows', () => {
  // Rows used to be minmax(clamp(...), auto) so they grew with their content.
  // That is deliberately gone: the board is rigid, a cell is one column wide
  // and exactly as tall, and content that does not fit clips. If `auto` ever
  // comes back, tiles stop being the size you drew them.
  const css = compileCSS(layout, 'ag-test');
  // `grid-auto-rows` is the property; what must never come back is a track
  // that sizes itself — the `auto` keyword as a value, or a minmax around it.
  assert.doesNotMatch(css, /grid-auto-rows:[^;}]*\bauto\b/, 'no track may size itself to content');
  assert.doesNotMatch(css, /minmax/);
  assert.doesNotMatch(css, /clamp/, 'the cell is derived, not clamped between guesses');

  // The cell: one column of the container's own width, so the board scales and
  // the cell stays square at every window size.
  assert.match(css, /--ag-cell:calc\(\(100cqi - \d+px\) \/ 24\)/);
  assert.match(css, /grid-auto-rows:var\(--ag-cell\)/);

  // One track per device, always — the narrow one restates the cell because
  // its column count differs, which is the whole point of the breakpoint.
  assert.equal((css.match(/grid-auto-rows:/g) ?? []).length, 2);
  const narrow = css.slice(css.indexOf('@container'));
  assert.match(narrow, /--ag-cols:24/, 'same count here, but stated for its own block');

  const coarse = compileCSS(normalizeLayout({ ...v1, narrowColumns: 8 }), 'ag-test');
  assert.match(coarse.slice(coarse.indexOf('@container')), /--ag-cell:calc\(\(100cqi - 56px\) \/ 8\)/);
});

test('a board can be given a fixed height in cells, and can float', () => {
  // How tall the header is, and whether it follows you down the page, are two
  // fields on its layout rather than CSS to go and find.
  const fixed = compileCSS(normalizeLayout({ ...v1, rows: 3 }), 'ag-test');
  assert.match(fixed, /grid-template-rows:repeat\(3,var\(--ag-cell\)\)/);
  assert.match(fixed, /min-height:calc\(var\(--ag-cell\) \* 3/);
  assert.deepEqual(validateLayout({ ...v1, rows: 3, sticky: true }), []);
  assert.match(validateLayout({ ...v1, rows: 0 }).join(), /whole number of cells/);
  assert.match(validateLayout({ ...v1, sticky: 'yes' }).join(), /sticky must be true or false/);
});

test('packLayout repacks top to bottom in reading order, growing downward', () => {
  // The answer to "these no longer fit". The board never does this on its own —
  // nothing moves unless you move it — so this is the deliberate version.
  const scattered = normalizeLayout({
    columns: 6, gap: 8, reflowBelow: 700,
    elements: [
      { id: 'c', col: [1, 3], row: [9, 2], flow: 'stack' },
      { id: 'a', col: [1, 4], row: [1, 2], flow: 'stack' },
      { id: 'b', col: [5, 2], row: [1, 2], flow: 'stack' },
    ],
  });
  const packed = packLayout(scattered, 'desk');
  // Reading order: a and b share the top row, c follows underneath.
  assert.deepEqual(packed.get('a'), { col: [1, 4], row: [1, 2] });
  assert.deepEqual(packed.get('b'), { col: [5, 2], row: [1, 2] });
  assert.deepEqual(packed.get('c'), { col: [1, 3], row: [3, 2] });
  // Sizes are never changed, only positions.
  for (const [id, box] of packed) {
    const e = scattered.elements.find((x) => x.id === id);
    assert.deepEqual(box.col[1], e.desk.col[1]);
    assert.deepEqual(box.row[1], e.desk.row[1]);
  }
  // And the result is legal: nothing overlaps.
  const boxes = [...packed.values()];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.equal(overlaps(boxes[i], boxes[j]), false);
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

test('scopeFor ignores content, so fixing a typo does not rewrite the CSS', () => {
  const withCopy = normalizeLayout({
    ...v1,
    elements: v1.elements.map((e) => (e.id === 'email' ? { ...e, kind: 'note', body: 'Emial' } : e)),
  });
  const fixed = normalizeLayout({
    ...v1,
    elements: v1.elements.map((e) => (e.id === 'email' ? { ...e, kind: 'note', body: 'Email' } : e)),
  });
  assert.equal(scopeFor(withCopy), scopeFor(fixed));
  // Moving it must still change the scope, or the guarantee is worthless.
  const moved = normalizeLayout({
    ...v1,
    elements: v1.elements.map((e) => (e.id === 'email' ? { ...e, row: [20, 2] } : e)),
  });
  assert.notEqual(scopeFor(withCopy), scopeFor(moved));
});

test('normalizeElement carries type and content through a round trip', () => {
  // It used to build its output from a fixed set of keys, so anything it did
  // not know about was silently dropped — which would have meant a text edit
  // surviving in the browser and vanishing on save.
  const round = (e) => normalizeLayout({ ...v1, elements: [e] }).elements[0];
  const typed = round({ id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', kind: 'note', body: 'hello', face: 'card' });
  assert.equal(typed.kind, 'note');
  assert.equal(typed.body, 'hello');
  assert.equal(typed.face, 'card');
  // And the shape before this one still reads, upgraded on the way in.
  const old = round({ id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', type: 'text', content: { html: 'hello' } });
  assert.equal(old.kind, 'note');
  assert.equal(old.body, 'hello');

  // Untyped elements stay untyped: every layout written before v3 keeps
  // rendering from its page's markup.
  const plain = round({ id: 'a', col: [1, 2], row: [1, 2], flow: 'stack' });
  assert.equal(plain.kind, undefined);
  assert.equal(plain.body, undefined);

  // The clone is real, or the editor would mutate the file it loaded from.
  const source = { id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', kind: 'image', media: { src: 'x' } };
  round(source).media.src = 'changed';
  assert.equal(source.media.src, 'x');
});

test('validateLayout rejects unknown kinds and unsafe content', () => {
  const el = (over) => ({ id: 'a', desk: { col: [1, 2], row: [1, 2] }, flow: 'stack', ...over });
  const one = (e) => validateLayout({ columns: 12, gap: 8, reflowBelow: 700, elements: [e] }).join(' | ');

  assert.match(one(el({ kind: 'carousel' })), /is not one of/);
  assert.match(one(el({ kind: 'note', body: 42 })), /body must be a string/);
  assert.match(one(el({ kind: 'image', media: {} })), /media\.src must be a non-empty string/);

  // The guard rail, not a security boundary — but a paste from a rich-text
  // source can carry a handler by accident, and the build should say so.
  assert.match(one(el({ kind: 'note', body: '<script>x</script>' })), /<script> tag/);
  assert.match(one(el({ kind: 'note', body: '<b onclick="x">hi</b>' })), /inline event handler/);
  assert.match(one(el({ kind: 'image', media: { src: 'javascript:x' } })), /javascript: URL/);

  // Fields on a slot never render, so it is a dropped kind rather than data.
  assert.match(one(el({ body: 'orphan' })), /would never render/);
  // The shape before this one still validates, because it is upgraded on read.
  assert.deepEqual(validateLayout({
    columns: 12, gap: 8, reflowBelow: 700,
    elements: [el({ type: 'text', content: { html: 'Email: <a href="mailto:a@b.c">a@b.c</a>' } })],
  }), []);
});

test('a layout with no pinned elements starts at the first row', () => {
  const plain = normalizeLayout({
    columns: 12, gap: 8, reflowBelow: 700,
    elements: [{ id: 'only', col: [1, 6], row: [1, 2], flow: 'stack' }],
  });
  assert.equal(resolveDevice(plain, 'narrow')[0]._row, 1);
});

test('deriveNarrow covers every element', () => {
  const seeds = deriveNarrow(layout);
  assert.equal(seeds.size, layout.elements.length);
});

test('normalizeElement carries an unlisted field through, whatever it is', () => {
  // The regression this guards: it used to copy a NAMED set of fields, so
  // every new part of the model was silently dropped between the editor and
  // the file until someone remembered to add it. Twice. A field nobody has
  // invented yet must survive a round trip.
  const round = (e) => normalizeLayout({ ...v1, elements: [e] }).elements[0];
  const out = round({
    id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', kind: 'list',
    arrange: 'accordion', onclick: 'page', fold: { cols: 9, rows: 5 },
    items: [{ id: 'i', kind: 'note', title: 'T' }],
    somethingNobodyHasInventedYet: { deep: ['value'] },
  });
  assert.equal(out.arrange, 'accordion');
  assert.equal(out.onclick, 'page');
  assert.deepEqual(out.fold, { cols: 9, rows: 5 });
  assert.deepEqual(out.items, [{ id: 'i', kind: 'note', title: 'T' }]);
  assert.deepEqual(out.somethingNobodyHasInventedYet, { deep: ['value'] });

  // The two shapes it exists to fold in are still the only things dropped.
  const old = round({ id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', type: 'text', content: { html: 'x' } });
  assert.equal(old.col, undefined);
  assert.equal(old.type, undefined);
  assert.equal(old.content, undefined);
  assert.equal(old.body, 'x');

  // And the clone is deep, or the editor would mutate the file it loaded from.
  const source = { id: 'a', col: [1, 2], row: [1, 2], flow: 'stack', kind: 'list', items: [{ id: 'i', title: 'T' }] };
  round(source).items[0].title = 'changed';
  assert.equal(source.items[0].title, 'T');
});
