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

/**
 * Compile a layout to real CSS Grid.
 *
 * Container queries, not media queries — the layout then works correctly inside
 * ANY container, not just at the viewport. Row height and gap use clamp() with
 * cqi units so sizing scales continuously instead of snapping between states.
 */
export function compileCSS(layout, scope) {
  const { columns, rowHeight, gap, reflowBelow } = layout;
  const s = scope ? `.${scope} ` : '';
  const lines = [];

  // minmax(..., auto): rows keep their fluid target height but are allowed to
  // GROW when content needs more room. Without the auto, any element taller
  // than its allotted rows silently overflows and collides with what follows.
  lines.push(`${s}.ag-root{container-type:inline-size}`);
  lines.push(
    `${s}.ag-grid{display:grid;grid-template-columns:repeat(${columns},1fr);` +
      `grid-auto-rows:minmax(clamp(${Math.round(rowHeight * 0.7)}px,${(rowHeight / 14).toFixed(2)}cqi,${Math.round(rowHeight * 1.5)}px),auto);` +
      `gap:clamp(4px,0.6cqi,${gap}px)}`
  );

  for (const e of layout.elements) {
    lines.push(
      `${s}#${e.id}{grid-column:${e.col[0]}/span ${e.col[1]};grid-row:${e.row[0]}/span ${e.row[1]}}`
    );
  }

  lines.push(`@container (max-width:${reflowBelow - 1}px){`);
  for (const r of resolve(layout, reflowBelow - 1)) {
    lines.push(
      `${s}#${r.id}{grid-column:${r._col}/span ${r._span};grid-row:${r._row}/span ${r._rowSpan}}`
    );
  }
  lines.push(`}`);

  return lines.join('\n');
}
