/**
 * Adaptive Grid — two stored layouts, one per device.
 *
 * This is the SAME engine the visual editor uses. That is the whole point: the
 * editor and the site must never disagree about what a layout means.
 *
 * An element stores a box per device:
 *   desk:   {col:[start,span], row:[start,span]}   the wide layout
 *   narrow: {col:[start,span], row:[start,span]}   the narrow one, optional
 *
 * `flow` is the SEED for narrow, not a runtime rule. An element with no stored
 * narrow box gets one derived from its flow; the moment the editor moves it at
 * narrow width, that derived box is written down and flow stops applying to it.
 * So a layout can be authored once and refined per device only where it needs
 * it, and a newly added element still lands somewhere sensible instead of on
 * top of its neighbours.
 *
 *   pin   → holds its edge, never joins the stack (corner navigation)
 *   keep  → centres and scales, holding rough proportion
 *   full  → spans the full width
 *   stack → drops into a single inset column
 *
 * The grid is a coordinate space, not a flow. There is no grid-auto-flow: an
 * empty cell stays empty, and a move that would overlap a sibling is refused
 * rather than shoving it aside — position is meant to carry meaning.
 *
 * An element also carries `type` and `content` — see elements.js. This file
 * stays responsible for WHERE something sits and elements.js for WHAT it is,
 * which is why the two can be validated and reasoned about separately.
 */
import { checkElement } from './elements.js';

/** The only legal values for an element's reflow seed. */
export const FLOWS = ['pin', 'keep', 'full', 'stack'];

/** The two devices a layout stores a box for. */
export const DEVICES = ['desk', 'narrow'];

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

/**
 * Accept both the old and new element shapes.
 *
 * v1 put a single box on the element as `col`/`row`. That box was always the
 * wide one, so it becomes `desk` and narrow stays derived.
 */
export function normalizeElement(e) {
  if (!e || typeof e !== 'object') return e;
  const desk = e.desk ?? (e.col && e.row ? { col: e.col, row: e.row } : undefined);
  const out = { id: e.id, flow: e.flow, desk };
  if (e.narrow) out.narrow = e.narrow;
  if (e.locked) out.locked = true;
  // v3: content lives on the element. This function used to build `out` from a
  // fixed set of keys, which meant anything new was silently DROPPED — a text
  // edit would round-trip through the editor and vanish. Carry them explicitly.
  // An element with no type is a slot, so every layout written before v3 keeps
  // rendering from its page's markup exactly as it did.
  if (e.type) out.type = e.type;
  if (e.content) out.content = structuredClone(e.content);
  return out;
}

/** Normalise a whole layout, tolerating v1 input. */
export function normalizeLayout(layout) {
  if (!layout || typeof layout !== 'object') return layout;
  return {
    ...layout,
    version: 3,
    // Narrow may use a coarser grid than the wide one — dragging a tile with a
    // thumb across 24 columns is miserable. Defaults to the same count so an
    // existing layout is unchanged.
    narrowColumns: layout.narrowColumns ?? layout.columns,
    // Pass a non-array straight through rather than throwing — validateLayout
    // is often handed junk on purpose and has to be able to report on it.
    elements: Array.isArray(layout.elements)
      ? layout.elements.map(normalizeElement)
      : layout.elements,
  };
}

/** How many columns this device's grid has. */
export const columnsFor = (layout, device) =>
  device === 'narrow' ? (layout.narrowColumns ?? layout.columns) : layout.columns;

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/** Do two boxes share any cell? Boxes are {col:[s,n], row:[s,n]}. */
export function overlaps(a, b) {
  const ax = a.col[0], aw = a.col[1], ay = a.row[0], ah = a.row[1];
  const bx = b.col[0], bw = b.col[1], by = b.row[0], bh = b.row[1];
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/**
 * Is this box a legal placement for `id` on `device`?
 *
 * Refused rather than resolved: nothing you arranged moves unless you move it.
 * Only elements that actually have a box on this device can be collided with.
 */
export function boxOk(layout, id, box, device = 'desk') {
  const cols = columnsFor(layout, device);
  if (box.col[0] < 1 || box.row[0] < 1 || box.col[1] < 1 || box.row[1] < 1) return false;
  if (box.col[0] + box.col[1] - 1 > cols) return false;

  return !resolveDevice(layout, device).some(
    (other) => other.id !== id && overlaps(box, boxOf(other))
  );
}

/** The lowest free spot for a box of this size, scanning left-to-right then down. */
export function freeSpot(layout, size, device = 'desk', ignoreId = null) {
  const cols = columnsFor(layout, device);
  const [w, h] = size;
  for (let row = 1; row < 400; row++) {
    for (let col = 1; col <= cols - w + 1; col++) {
      const box = { col: [col, w], row: [row, h] };
      if (boxOk(layout, ignoreId, box, device)) return box;
    }
  }
  return { col: [1, w], row: [1, h] };
}

const boxOf = (r) => ({ col: [r._col, r._span], row: [r._row, r._rowSpan] });

/* ------------------------------------------------------------------ *
 * Resolving
 * ------------------------------------------------------------------ */

/**
 * Derive a narrow box for every element from its flow rule.
 *
 * This is the seed only. resolveDevice() prefers a stored narrow box and falls
 * back to this, so an untouched layout behaves exactly as it did when narrow
 * was always computed.
 */
export function deriveNarrow(layout) {
  const columns = columnsFor(layout, 'narrow');
  const elements = layout.elements ?? [];
  const ordered = [...elements].sort(
    (a, b) => a.desk.row[0] - b.desk.row[0] || a.desk.col[0] - b.desk.col[0]
  );
  const out = new Map();

  const pinned = ordered.filter((e) => e.flow === 'pin');
  let cursor = 1;
  if (pinned.length) {
    let pinRow = 1;
    for (const e of pinned) {
      const span = Math.min(
        Math.max(2, Math.round(e.desk.col[1] * 1.2)),
        Math.max(2, Math.floor(columns / 3))
      );
      const onRight = e.desk.col[0] + e.desk.col[1] / 2 > layout.columns / 2;
      out.set(e.id, {
        col: [onRight ? columns - span + 1 : 1, span],
        row: [1, e.desk.row[1]],
      });
      pinRow = Math.max(pinRow, e.desk.row[1]);
    }
    cursor = pinRow + 2;
  }

  for (const e of ordered) {
    if (e.flow === 'pin') continue;
    let col, span;
    if (e.flow === 'keep') {
      span = Math.min(
        Math.max(Math.round(columns / 3), Math.round(e.desk.col[1] * 1.4)),
        columns
      );
      col = Math.max(1, Math.round((columns - span) / 2) + 1);
    } else if (e.flow === 'full') {
      col = 1; span = columns;
    } else {
      col = 2; span = Math.max(1, columns - 2);
    }
    out.set(e.id, { col: [col, span], row: [cursor, e.desk.row[1]] });
    cursor += e.desk.row[1] + 1;
  }

  return out;
}

/**
 * Placed elements for one device.
 * @returns elements with _col/_span/_row/_rowSpan and _derived
 */
export function resolveDevice(layout, device = 'desk') {
  const elements = layout.elements ?? [];
  if (device !== 'narrow') {
    return elements.map((e) => ({
      ...e,
      _col: e.desk.col[0], _span: e.desk.col[1],
      _row: e.desk.row[0], _rowSpan: e.desk.row[1],
      _derived: false,
    }));
  }
  const seeds = deriveNarrow(layout);
  return elements.map((e) => {
    const box = e.narrow ?? seeds.get(e.id);
    return {
      ...e,
      _col: box.col[0], _span: box.col[1],
      _row: box.row[0], _rowSpan: box.row[1],
      _derived: !e.narrow,
    };
  });
}

/** Which device a width belongs to. */
export const deviceFor = (layout, width) =>
  width >= layout.reflowBelow ? 'desk' : 'narrow';

/** Placed elements at a given width. Kept for callers that think in pixels. */
export function resolve(layout, width) {
  return resolveDevice(layout, deviceFor(layout, width));
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Check a layout is well formed. Returns a list of problems, empty if fine.
 *
 * Layouts used to be literals written by hand in a component. They are data
 * now and an editor writes them, so a malformed layout is a real thing that can
 * happen rather than a typo caught in review. Every caller — build, tests, and
 * the editor before it saves — should run this.
 */
export function validateLayout(input, name = 'layout') {
  const problems = [];
  const bad = (msg) => problems.push(`${name}: ${msg}`);

  if (!input || typeof input !== 'object') {
    bad('is not an object');
    return problems;
  }
  const layout = normalizeLayout(input);

  for (const key of ['columns', 'rowHeight', 'gap', 'reflowBelow']) {
    const v = layout[key];
    if (!Number.isFinite(v) || v <= 0) bad(`${key} must be a positive number, got ${JSON.stringify(v)}`);
  }
  for (const key of ['columns', 'narrowColumns']) {
    const v = layout[key];
    // `stack` insets one column each side and `pin` divides by three, so a grid
    // narrower than this cannot produce a valid placement.
    if (Number.isFinite(v) && v < 3) bad(`${key} must be at least 3, got ${v}`);
  }

  if (!Array.isArray(layout.elements)) {
    bad('elements must be an array');
    return problems;
  }

  const seen = new Set();
  for (const [i, e] of layout.elements.entries()) {
    const at = `elements[${i}]`;
    if (!e || typeof e !== 'object') { bad(`${at} is not an object`); continue; }

    if (typeof e.id !== 'string' || !e.id) bad(`${at}.id must be a non-empty string`);
    // The id becomes a CSS selector and an HTML id, so it has to be usable as
    // both without escaping.
    else if (!/^[A-Za-z][\w-]*$/.test(e.id)) bad(`${at}.id ${JSON.stringify(e.id)} is not a valid css/html id`);
    else if (seen.has(e.id)) bad(`${at}.id ${JSON.stringify(e.id)} is duplicated`);
    else seen.add(e.id);

    if (!FLOWS.includes(e.flow)) bad(`${at}.flow must be one of ${FLOWS.join(', ')}, got ${JSON.stringify(e.flow)}`);

    // Content is data an editor writes, so a malformed or unsafe body is a real
    // thing that can reach this file. Fail the build rather than ship it.
    for (const problem of checkElement(e, at)) bad(problem);

    if (!e.desk) { bad(`${at} has no desk box`); continue; }
    for (const device of DEVICES) {
      const box = e[device];
      if (!box) continue; // narrow is optional; it gets derived
      checkBox(box, `${at}.${device}`, columnsFor(layout, device), bad);
    }
  }

  // Two elements in the same cell means one is hidden behind the other. The
  // grid refuses this on every move, so stored data should never contain it.
  for (const device of DEVICES) {
    const placed = layout.elements.every((e) => e.desk) ? resolveDevice(layout, device) : [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (overlaps(boxOf(placed[i]), boxOf(placed[j]))) {
          bad(`${placed[i].id} overlaps ${placed[j].id} on ${device}`);
        }
      }
    }
  }

  return problems;
}

function checkBox(box, at, cols, bad) {
  if (!box || typeof box !== 'object') { bad(`${at} must be a box object`); return; }
  for (const axis of ['col', 'row']) {
    const v = box[axis];
    if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger)) {
      bad(`${at}.${axis} must be [start, span] integers, got ${JSON.stringify(v)}`);
      continue;
    }
    const [start, span] = v;
    if (start < 1) bad(`${at}.${axis} starts at ${start}; grid lines start at 1`);
    if (span < 1) bad(`${at}.${axis} span must be at least 1, got ${span}`);
    if (axis === 'col' && Number.isFinite(cols) && start + span - 1 > cols) {
      bad(`${at}.col ${start}+${span} overflows the ${cols}-column grid`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Compiling
 * ------------------------------------------------------------------ */

/**
 * A stable scope class for a layout.
 *
 * Derived from the layout itself rather than a random string, so a given
 * layout compiles to byte-identical CSS on every build — the dist output stays
 * diffable, and editor and site agree on the class name too.
 */
export function scopeFor(layout) {
  // Geometry only. The scope names a LAYOUT, and hashing the whole object would
  // fold the copy into it: fixing a typo would rename every rule in the
  // compiled CSS, so an edit that changes no positions would still rewrite the
  // whole stylesheet and make the built output undiffable.
  const json = JSON.stringify({
    columns: layout.columns,
    narrowColumns: layout.narrowColumns,
    rowHeight: layout.rowHeight,
    gap: layout.gap,
    reflowBelow: layout.reflowBelow,
    elements: (layout.elements ?? []).map((e) => [e.id, e.desk, e.narrow]),
  });
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'ag-' + (h >>> 0).toString(36);
}

/**
 * Compile a layout to real CSS Grid.
 *
 * Container queries, not media queries — the layout then works correctly inside
 * ANY container, not just at the viewport. That is also what lets the editor
 * show an exact narrow preview in a pane rather than an iframe. Row height and
 * gap use clamp() with cqi units so sizing scales continuously.
 */
export function compileCSS(input, scope) {
  // Element rules are keyed by id, and ids are a GLOBAL namespace — exactly the
  // hazard the keyframe rule exists for. Without a scope, a second grid on the
  // page silently overwrites the first's columns and every shared id. Callers
  // must pass one; AdaptiveGrid.astro generates it per instance.
  if (!scope) {
    throw new Error(
      'compileCSS() requires a scope. Two unscoped grids on one page overwrite ' +
        "each other's rules — the second wins and the first loses its layout."
    );
  }

  const layout = normalizeLayout(input);
  const { rowHeight, gap, reflowBelow } = layout;
  const s = `.${scope}`;
  const lines = [];

  const track = (cols) =>
    `display:grid;grid-template-columns:repeat(${cols},1fr);` +
    `grid-auto-rows:minmax(clamp(${Math.round(rowHeight * 0.7)}px,${(rowHeight / 14).toFixed(2)}cqi,${Math.round(rowHeight * 1.5)}px),auto);` +
    `gap:clamp(4px,0.6cqi,${gap}px)`;

  // The scope class sits on the .ag-root element itself, so every rule below is
  // confined to this one grid.
  // minmax(..., auto): rows keep their fluid target height but are allowed to
  // GROW when content needs more room. Without the auto, any element taller
  // than its allotted rows silently overflows and collides with what follows.
  lines.push(`${s}{container-type:inline-size}`);
  lines.push(`${s} .ag-grid{${track(layout.columns)}}`);
  for (const r of resolveDevice(layout, 'desk')) {
    lines.push(`${s} #${r.id}{grid-column:${r._col}/span ${r._span};grid-row:${r._row}/span ${r._rowSpan}}`);
  }

  lines.push(`@container (max-width:${reflowBelow - 1}px){`);
  // Only restate the track when narrow actually uses a different column count.
  const narrowCols = columnsFor(layout, 'narrow');
  if (narrowCols !== layout.columns) lines.push(`${s} .ag-grid{${track(narrowCols)}}`);
  for (const r of resolveDevice(layout, 'narrow')) {
    lines.push(`${s} #${r.id}{grid-column:${r._col}/span ${r._span};grid-row:${r._row}/span ${r._rowSpan}}`);
  }
  lines.push(`}`);

  return lines.join('\n');
}
