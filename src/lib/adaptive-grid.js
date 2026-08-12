/**
 * Adaptive Grid — one authored layout, derived reflow.
 *
 * This is the SAME resolve() the visual editor uses. That is the whole point:
 * the editor and the site must never disagree about what a layout means.
 *
 * Reflow rules, per element:
 *   pin   → holds its edge, never joins the stack (corner navigation)
 *   keep  → centres and scales, holding rough proportion
 *   full  → spans the full width
 *   stack → drops into a single inset column
 */

/** @returns elements with resolved _col/_span/_row/_rowSpan for a given width */
export function resolve(layout, width) {
  const { columns, reflowBelow, elements } = layout;

  if (width >= reflowBelow) {
    return elements.map((e) => ({
      ...e,
      _col: e.col[0], _span: e.col[1],
      _row: e.row[0], _rowSpan: e.row[1],
    }));
  }

  const ordered = [...elements].sort(
    (a, b) => a.row[0] - b.row[0] || a.col[0] - b.col[0]
  );
  const out = [];

  // Pinned elements share a top row and are excluded from the stack.
  const pinned = ordered.filter((e) => e.flow === 'pin');
  let cursor = 1;
  if (pinned.length) {
    let pinRow = 1;
    for (const e of pinned) {
      const span = Math.min(
        Math.max(2, Math.round(e.col[1] * 1.2)),
        Math.floor(columns / 3)
      );
      const onRight = e.col[0] + e.col[1] / 2 > columns / 2;
      out.push({
        ...e,
        _col: onRight ? columns - span + 1 : 1,
        _span: span, _row: 1, _rowSpan: e.row[1],
      });
      pinRow = Math.max(pinRow, e.row[1]);
    }
    cursor = pinRow + 2;
  }

  for (const e of ordered) {
    if (e.flow === 'pin') continue;
    let _col, _span;
    if (e.flow === 'keep') {
      _span = Math.min(
        Math.max(Math.round(columns / 3), Math.round(e.col[1] * 1.4)),
        columns
      );
      _col = Math.max(1, Math.round((columns - _span) / 2) + 1);
    } else if (e.flow === 'full') {
      _col = 1; _span = columns;
    } else {
      _col = 2; _span = columns - 2;
    }
    out.push({ ...e, _col, _span, _row: cursor, _rowSpan: e.row[1] });
    cursor += e.row[1] + 1;
  }

  return out;
}

/** The only legal values for an element's reflow rule. */
export const FLOWS = ['pin', 'keep', 'full', 'stack'];

/**
 * Check a layout is well formed. Returns a list of problems, empty if fine.
 *
 * Layouts used to be literals written by hand in a component. They are data
 * now, and an editor will eventually write them, so a malformed layout is a
 * real thing that can happen rather than a typo caught in review. Every caller
 * — build, tests, and any future editor — should run this before trusting one.
 */
export function validateLayout(layout, name = 'layout') {
  const problems = [];
  const bad = (msg) => problems.push(`${name}: ${msg}`);

  if (!layout || typeof layout !== 'object') {
    bad('is not an object');
    return problems;
  }

  for (const key of ['columns', 'rowHeight', 'gap', 'reflowBelow']) {
    const v = layout[key];
    if (!Number.isFinite(v) || v <= 0) bad(`${key} must be a positive number, got ${JSON.stringify(v)}`);
  }
  // `stack` insets by one column each side and `pin` divides by three, so a
  // grid narrower than this cannot produce a valid placement.
  if (Number.isFinite(layout.columns) && layout.columns < 3) {
    bad(`columns must be at least 3, got ${layout.columns}`);
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

    for (const axis of ['col', 'row']) {
      const v = e[axis];
      if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger)) {
        bad(`${at}.${axis} must be [start, span] integers, got ${JSON.stringify(v)}`);
        continue;
      }
      const [start, span] = v;
      if (start < 1) bad(`${at}.${axis} starts at ${start}; grid lines start at 1`);
      if (span < 1) bad(`${at}.${axis} span must be at least 1, got ${span}`);
      if (axis === 'col' && Number.isFinite(layout.columns) && start + span - 1 > layout.columns) {
        bad(`${at}.col ${start}+${span} overflows the ${layout.columns}-column grid`);
      }
    }
  }
  return problems;
}

/**
 * A stable scope class for a layout.
 *
 * Derived from the layout itself rather than a random string, so a given
 * layout compiles to byte-identical CSS on every build — the dist output stays
 * diffable, and editor and site agree on the class name too.
 */
export function scopeFor(layout) {
  const json = JSON.stringify(layout);
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
 * ANY container, not just at the viewport. Row height and gap use clamp() with
 * cqi units so sizing scales continuously instead of snapping between states.
 */
export function compileCSS(layout, scope) {
  const { columns, rowHeight, gap, reflowBelow } = layout;
  const s = `.${scope}`;
  const lines = [];

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

  // The scope class sits on the .ag-root element itself, so every rule below is
  // confined to this one grid.
  // minmax(..., auto): rows keep their fluid target height but are allowed to
  // GROW when content needs more room. Without the auto, any element taller
  // than its allotted rows silently overflows and collides with what follows.
  lines.push(`${s}{container-type:inline-size}`);
  lines.push(
    `${s} .ag-grid{display:grid;grid-template-columns:repeat(${columns},1fr);` +
      `grid-auto-rows:minmax(clamp(${Math.round(rowHeight * 0.7)}px,${(rowHeight / 14).toFixed(2)}cqi,${Math.round(rowHeight * 1.5)}px),auto);` +
      `gap:clamp(4px,0.6cqi,${gap}px)}`
  );

  for (const e of layout.elements) {
    lines.push(
      `${s} #${e.id}{grid-column:${e.col[0]}/span ${e.col[1]};grid-row:${e.row[0]}/span ${e.row[1]}}`
    );
  }

  lines.push(`@container (max-width:${reflowBelow - 1}px){`);
  for (const r of resolve(layout, reflowBelow - 1)) {
    lines.push(
      `${s} #${r.id}{grid-column:${r._col}/span ${r._span};grid-row:${r._row}/span ${r._rowSpan}}`
    );
  }
  lines.push(`}`);

  return lines.join('\n');
}
