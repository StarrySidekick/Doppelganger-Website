/**
 * In-page editor.
 *
 * Loaded only for someone who has asked to edit — see src/lib/edit-mode.js for
 * the ways in and the one way out — so a visitor never pays for it and can
 * never pick a tile up. Once it is mounted there is ONE switch that decides
 * what the page is: **locked** is the site exactly as a visitor sees it, with
 * a bar along the bottom; **unlocked** is the board — a checkerboard under
 * everything, outlines on what can move, and every gesture below live. That
 * is Bureau's lock (its decision 74): not a property of a board but which mode
 * you are in, reading or arranging, one switch for every grid on the page.
 *
 * Interaction, after Bureau:
 *   padlock       lock or unlock everything (or press L)
 *   Done          leave edit mode altogether and reload as a visitor
 *   hold 200ms    pick a tile up
 *   hold still    the settings panel — a phone has no right button
 *   drag          move; ghost shows where it lands, red when refused
 *   corner grip   resize, live, like dragging a window edge
 *   double click  the words become a field where they sit
 *   click a cell  the picker — what you pick lands on that cell
 *   right click   settings for that object: its fields, its face, delete
 *   gear          the site's look: colours, tilt, type
 *
 * There is no device toggle. Which layout you are editing is decided by the
 * width you are actually looking at — narrow the window and you are editing
 * narrow, because that is the layout that is on screen. Two layouts are still
 * stored; what is gone is being asked to say which one you meant.
 *
 * There are no grid tabs either. A page has a header, a body and a footer, and
 * the one you touched is the one the bar acts on — each board says its own name
 * while you are arranging, so there is nothing to look up.
 *
 * Two things differ from Bureau, both forced by this grid:
 *
 * 1. The board is rigid and its cells are square, so a cell has ONE size and
 *    the drag maths could divide by it. It still walks the measured track
 *    edges instead, because that is correct either way and it is what keeps
 *    working if the track ever stops being uniform again.
 * 2. The narrow layout is a real stored layout, but an object that has never
 *    been touched at narrow width has no box of its own; it is showing one
 *    derived from its flow. Moving it writes the box down for the first time.
 */
import {
  resolveDevice, boxOk, boxesOk, freeSpot, columnsFor, normalizeLayout, validateLayout,
  packLayout, compileCSS, overlaps, FLOWS,
} from './adaptive-grid.js';
import {
  KINDS, PICKER_KINDS, FACES, ATTRS, USER_ATTRS, K, has, attrsOf, kindOf,
  isTyped, isInline, faceOf, clickOf, fieldsOf, getField, setField, setKind,
  toggleAttr, itemsOf, makeItem, feedOf, SORTS, renderElement, unsafeHtml,
  tiltFor, escapeHtml, isDecor, toItem, fromItem,
} from './elements.js';
import { prepareImage, blobToBase64, mediaPath, mediaRef, ACCEPT } from './media.js';
import { publishFiles, pathFor, TARGET } from './publish.js';
import { tokensFor, normalizeLook, validateLook } from './look.js';
import { queryWorks, typesOf, validateWorks, worksOf } from './works.js';
import { leaveEdit } from './edit-mode.js';

const TOKEN_KEY = 'doppelganger.ghToken';
const LOCK_KEY = 'doppelganger.locked';
const LOOK_KEY = 'doppelganger.look';
const LOOK_PATH = 'src/data/look.json';
const WORKS_KEY = 'doppelganger.works';
const WORKS_PATH = 'src/data/works.json';

/** For putting a stored value back into a form field without breaking out of it. */
const escapeAttr = escapeHtml;

/**
 * Two lengths of press, and the difference between them is whether you moved.
 *
 * **A finger needs longer than a mouse**, and this was one number for both.
 * 200ms on glass is inside the window in which the browser is still deciding
 * whether you meant to scroll — and it is also the whole budget for stopping
 * one, because `preventDefault` is ignored once a native scroll is under way.
 * So it cannot grow much either. These are Bureau's numbers for Bureau's
 * reason (its `gestures.js`).
 *
 * The menu is measured from the moment the hold LANDS rather than from the
 * press, so it can only ever follow a hold that actually armed. It used to be
 * a second timer started alongside the first, which meant it could fire on a
 * press the hold had already given up on.
 */
const HOLD_TOUCH = 300;
const HOLD_MOUSE = 200;
const MENU_AFTER = 320;
const NUDGE = 5;  // px of movement before a drag counts as a drag
const WOBBLE = 6; // px a finger resting on glass moves without meaning to
const holdFor = (e) => (e.pointerType === 'touch' ? HOLD_TOUCH : HOLD_MOUSE);

/* ------------------------------------------------------------------ *
 * Track geometry — measured, never assumed
 * ------------------------------------------------------------------ */

/**
 * Where every column and row line sits, in px relative to the grid box.
 * Read fresh at the start of each gesture: the cell is derived from the
 * container's width, so a resized window is a different set of numbers.
 */
export function tracks(grid) {
  const cs = getComputedStyle(grid);
  const parse = (s) => s.split(' ').filter(Boolean).map(parseFloat);
  const cols = parse(cs.gridTemplateColumns);
  const rows = parse(cs.gridTemplateRows);
  const gap = parseFloat(cs.rowGap) || 0;
  const colGap = parseFloat(cs.columnGap) || 0;

  const edges = (sizes, g) => {
    const out = [0];
    let at = 0;
    for (const s of sizes) { at += s + g; out.push(at); }
    return out;
  };
  return {
    x: edges(cols, colGap), y: edges(rows, gap),
    colCount: cols.length, rowCount: rows.length,
    // Past the last drawn row the grid has no track to measure, so extrapolate
    // from the last known height. Columns are all 1fr, so one width does.
    rowStep: rows.length ? rows[rows.length - 1] + gap : 24,
    colStep: cols.length ? cols[0] + colGap : 24,
  };
}

/**
 * Which 1-based track contains this px offset.
 *
 * Cells are square and uniform now, so this could divide by the step. It walks
 * the measured edges anyway: that is correct either way, it costs nothing, and
 * it is what kept working when rows DID vary — dividing by an average once
 * moved a tile seven rows when the pointer had crossed thirteen.
 */
export function trackAt(edges, px, step) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (px < edges[i + 1]) return i + 1;
  }
  const over = px - edges[edges.length - 1];
  return edges.length + (step > 0 ? Math.max(0, Math.floor(over / step)) : 0);
}

/**
 * Which cell a point on the board is in, from the measured tracks.
 *
 * **The sketch used to ask `document.elementFromPoint` for a `.ag-cell`, and
 * return if there wasn't one.** Tiles sit at `z-index: 1` and checkerboard
 * cells at 0, so the moment your finger crossed an existing object there was no
 * cell to find: the ghost froze at the last bare square it had seen, which
 * reads exactly like a stuck highlight, and meant a box could not be drawn
 * across anything. Bureau never asks the DOM where a finger is — it divides by
 * the cell step. This walks the measured track edges instead, which is the same
 * answer and stays right if the tracks ever stop being uniform. The
 * checkerboard stays for how it looks; it is simply no longer load-bearing.
 *
 * Exported with `spanBetween` because between them they are the whole geometry
 * of drawing a box, and neither needs a browser to be checked.
 */
export function cellAt(t, rect, cols, x, y) {
  return {
    col: Math.min(Math.max(trackAt(t.x, x - rect.left, t.colStep), 1), cols),
    row: Math.max(trackAt(t.y, y - rect.top, t.rowStep), 1),
  };
}

/** The box between two cells, whichever corner you started from. */
export const spanBetween = (a, b) => ({
  col: [Math.min(a.col, b.col), Math.abs(b.col - a.col) + 1],
  row: [Math.min(a.row, b.row), Math.abs(b.row - a.row) + 1],
});

/* ------------------------------------------------------------------ *
 * Cleaning what contenteditable produces
 * ------------------------------------------------------------------ */

/**
 * The tags a body may keep, and the attributes each may carry.
 *
 * contenteditable is generous: it will happily leave behind styled spans, font
 * tags and nested divs from a paste. What lands in the layout file is committed
 * to the repo and rendered with set:html on every build, so it gets narrowed to
 * the few things a sentence actually needs.
 */
const KEEP = { A: ['href'], EM: [], STRONG: [], B: [], I: [], BR: [] };

/** Strip a contenteditable's output down to KEEP. Browser only — uses the DOM. */
export function cleanRichText(html) {
  const box = document.createElement('div');
  box.innerHTML = html;

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }
      walk(child);                              // depth first, so unwrapping is safe
      const allow = KEEP[child.tagName];
      if (!allow) {
        // A block the browser inserted for a new line becomes the line break it
        // actually meant; everything else just loses its wrapper and keeps its
        // words, so no typing is ever thrown away by cleaning.
        if ((child.tagName === 'DIV' || child.tagName === 'P') && child.previousSibling) {
          child.parentNode.insertBefore(document.createElement('br'), child);
        }
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (!allow.includes(attr.name)) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A' && unsafeHtml(child.getAttribute('href') || '')) {
        child.removeAttribute('href');
      }
    }
  };
  walk(box);
  return box.innerHTML.replace(/\s+/g, ' ').trim();
}

/** A page name to a path segment: "Game Design" → "game-design". */
export const slugify = (s) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

/**
 * An empty board, for a page that does not exist yet.
 *
 * One definition, because a page can now be born two ways — behind a drawer,
 * or straight from the Pages panel — and two copies of these numbers would
 * drift. The gap is 0: a board's cells touch unless that board is told to
 * space them, which is the Board panel's business and not a new page's.
 */
export const newLayout = (title) => ({
  version: 5, columns: 24, narrowColumns: 8, gap: 0, reflowBelow: 700, title, elements: [],
});

/* ------------------------------------------------------------------ *
 * Editor
 * ------------------------------------------------------------------ */

export function mountEditor({
  root, layout: initial, published, name, scope, chrome: isChrome = false,
  assets = {}, base = '/', look, pages = [], works = { types: [], works: [] },
  build = null, onChange,
}) {
  const grid = root.querySelector('.ag-grid');
  if (!grid) throw new Error('mountEditor: no .ag-grid inside root');

  let layout = normalizeLayout(structuredClone(initial));
  // What the build rendered. Publish sends this layout only when it differs.
  let baselineJson = JSON.stringify(normalizeLayout(published ?? initial));
  /** Which stored layout is on screen. Observed from the width, never chosen. */
  const deviceNow = () => {
    const w = root.getBoundingClientRect().width;
    return w && w < layout.reflowBelow ? 'narrow' : 'desk';
  };
  let device = deviceNow();
  let undo = [];
  let redo = [];       // what undo took back, so it can be put forward again
  let G = null;          // the gesture in flight
  let sketch = null;     // the box being drawn on bare board
  let holdTimer = null;
  let menuTimer = null;
  let editing = null;    // {id, field, node, tile, before} while words are being edited

  const el = (id) => grid.querySelector(`#${CSS.escape(id)}`);
  const find = (id) => layout.elements.find((e) => e.id === id);
  const placed = () => resolveDevice(layout, device);
  const boxFor = (id) => {
    const r = placed().find((p) => p.id === id);
    return { col: [r._col, r._span], row: [r._row, r._rowSpan] };
  };

  const chrome = sharedChrome(look, pages, works, { build, base });
  const toast = chrome.toast;
  const locked = () => chrome.locked();

  /**
   * There is ONE selection for the whole page, and the chrome holds it.
   *
   * It used to be a variable inside each editor, and a page mounts three of
   * them — header, body and footer. Pressing a tile in the page and then one in
   * the footer left BOTH wearing the accent ring, because the page's editor was
   * never told to let go; and `paint()` re-asserted every other class on a tile
   * but not this one, so an undo that re-mounted a tile produced a fresh node
   * with no ring while the id was still selected and the arrow keys still moved
   * it. Bureau keeps the selection in the model and its renderer emits the class
   * from it (its decision 8), which is why neither can happen there. This is the
   * same arrangement: one truth, and `paintSelection()` is the only thing that
   * writes the class.
   */
  const selected = () => chrome.selectedOn(name);          // the primary
  const selection = () => chrome.selectionOn(name);        // the whole set
  const select = (ids, opts) => chrome.select(name, ids, opts);
  function paintSelection() {
    const set = new Set(selection());
    for (const node of grid.querySelectorAll('.ag-editable')) {
      node.classList.toggle('ag-selected', set.has(node.id));
    }
  }

  /**
   * Undo pinned to ONE step: the way back a toast offers. It undoes only if
   * that step is still the most recent thing, and says so otherwise, rather
   * than undoing whatever happens to be on top by the time you press it.
   */
  const undoOf = (step) => () => {
    if (undo[undo.length - 1] !== step) return toast('Something has changed since — use Undo in the bar');
    undoLast();
  };

  /* Which board is which. Three grids stacked up a page look like one page
     until you go to move something, and then it matters a great deal whether
     you are in the header or the body. The label only exists while unlocked. */
  const label = document.createElement('span');
  label.className = 'ag-label';
  label.textContent = name;
  root.appendChild(label);
  root.dataset.agName = name;

  /**
   * The compiled grid CSS for this board, so a geometry change can be SEEN.
   *
   * AdaptiveGrid emits it as an inline <style> at build time. Changing the
   * column count or the height only changes the data, so without this the
   * board looked exactly the same until the site had rebuilt — which is a poor
   * way to offer a size control. Recompiling under the SAME scope class keeps
   * every existing rule pointing at the same tiles; the build will hash a new
   * scope of its own, and that is internal.
   */
  const styleEl = scope
    ? [...document.querySelectorAll('style')].find((n) => n.textContent.includes(`.${scope} .ag-grid`))
    : null;
  function recompile() {
    if (!styleEl || !scope) return false;
    try {
      styleEl.textContent = compileCSS(layout, scope);
      return true;
    } catch (err) {
      console.error('[editor] could not recompile the grid', err);
      return false;
    }
  }

  /* ---- previewing an object's inside ---- */

  /**
   * Preview only: it resolves an asset key to its bare URL and skips the
   * srcset, because the sizing helpers live in assets.js and this file is not
   * allowed to import them. The build does the real thing.
   */
  const previewCtx = {
    image: (m) => ({ src: resolvePreview(m.src) }),
    link: (href) => href,
    /* A feed has to answer in the editor too, or a works tile is an empty box
       until the site rebuilds — and you would be arranging something you
       cannot see. The same query function the build uses, over the same
       catalogue, with the editor's own resolvers for pictures and addresses. */
    works: (query) => {
      const { items, tags, total } = queryWorks(chrome.works(), query);
      const types = Object.fromEntries((chrome.works().types ? typesOf(chrome.works()) : []).map((t) => [t.id, t.label]));
      return {
        tags, total,
        items: items.map((w) => ({
          title: w.title, year: w.year, blurb: w.blurb, tags: w.tags,
          typeLabel: types[w.type] ?? w.type,
          internal: w.link.startsWith('/'),
          href: w.link,
          image: w.media?.src ? { src: resolvePreview(w.media.src) } : null,
        })),
      };
    },
  };
  function resolvePreview(src) {
    if (src?.startsWith('asset:')) return assets[src.slice(6)] ?? src;
    if (src?.startsWith('media:')) {
      const file = src.slice(6);
      // A picked image is only in this browser until Publish, so show the local
      // copy; one that has already been committed is served from the site.
      return pending.get(file)?.previewUrl ?? `${base}/media/${file}`.replace(/\/{2,}/g, '/');
    }
    return src;
  }
  function dressTile(node, item) {
    for (const c of [...node.classList]) if (c.startsWith('fc-')) node.classList.remove(c);
    node.classList.add('ob', `fc-${faceOf(item)}`);
    node.classList.toggle('ob-decor', isDecor(item));
    node.style.setProperty('--tilt', tiltFor(item.id).toFixed(2) + 'deg');
    node.classList.toggle('ag-empty', has(item, 'media') && !item.media?.src && !item.body && !item.title);
  }
  /** Redraw one tile from its object. Forget what it was drawn from; paint() does the rest. */
  function repaintContent(id) {
    drawnFrom.delete(id);
    paint();
  }

  /* ---- applying a layout to the live DOM ---- */

  /**
   * What each typed tile was last drawn FROM, so paint() can tell whether it
   * needs drawing again. Bureau re-renders everything on every change
   * (decision 8) and never has to ask; this editor cannot, so it keeps the
   * question cheap instead: a tile is redrawn when its content differs from
   * what it was drawn from, and left alone otherwise — which is also what
   * keeps a field being typed into from being replaced under the caret.
   */
  const drawnFrom = new Map();

  /**
   * Make the board agree with the layout. The whole of it.
   *
   * This is as close as an editor on Astro's markup can come to Bureau's
   * "full re-render on every change": every fact the editor is responsible
   * for is asserted here from the model, on every commit, rather than poked
   * on at the moment something happened and trusted to still be right —
   *   - which tiles exist (a typed object with no node is mounted; a node
   *     whose object is gone is removed, so an undone add cannot leave a tile
   *     behind and a delete does not have to remember to take one away)
   *   - where each sits and how big it is
   *   - what each typed tile is drawn from (redrawn when its content changed,
   *     which is what used to be a separate `repaintContent()` every caller
   *     had to remember)
   *   - its face, its tilt, its decor standing, its grips
   *   - the selection
   *   - the checkerboard
   * Gesture state (lifted, dragging, invalid, the ghosts) is the exception and
   * belongs to `clearGestureState()`, because it is transient by nature and a
   * commit mid-gesture must not take it away.
   */
  function paint() {
    // Undo can take the selected object away underneath the selection.
    if (selected() && !find(selected())) select(null);

    // Tiles whose object no longer exists. Only ones the editor drew: a slot's
    // node is the page's markup and is never removed by the editor.
    const live = new Set(layout.elements.map((e) => e.id));
    for (const node of grid.querySelectorAll('.ob[id]')) {
      if (!live.has(node.id) && drawnFrom.has(node.id)) { node.remove(); drawnFrom.delete(node.id); }
    }

    for (const r of placed()) {
      /* An object made in the editor and kept in localStorage has no tile in
         the built page, so on a reload it would be in the layout, in the undo
         stack and in the publish set — and invisible. Mount it. Only a typed
         object can be mounted: a `slot` IS the page's markup, and if that has
         gone the layout is referring to something that no longer exists. */
      let node = el(r.id);
      if (!node) {
        if (!isTyped(r)) continue;
        node = mountTile(r);
      }
      node.style.gridColumn = `${r._col} / span ${r._span}`;
      node.style.gridRow = `${r._row} / span ${r._rowSpan}`;
      node.classList.toggle('ag-derived', device === 'narrow' && r._derived);
      node.classList.add('ag-editable');
      node.classList.toggle('ag-text', isInline(r));
      if (isTyped(r)) {
        const item = find(r.id);
        const from = JSON.stringify(contentOf(item));
        // Never under a caret: the tile being written in is redrawn by endEdit.
        if (drawnFrom.get(r.id) !== from && editing?.id !== r.id) {
          node.innerHTML = renderElement(item, previewCtx) ?? '';
          drawnFrom.set(r.id, from);
        }
        dressTile(node, item);
      }
      addGrips(node);
    }
    root.dataset.agDevice = device;
    // Asserted here, on every commit, rather than poked on at the moment of
    // pressing — see the note on `selected` above.
    paintSelection();
    paintChecker();
    if (chrome.activeName() === name) chrome.render();
  }

  function addGrips(node) {
    if (node.querySelector('.ag-grip')) return;
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      const g = document.createElement('span');
      g.className = `ag-grip ag-grip-${corner}`;
      g.dataset.rz = corner;
      node.appendChild(g);
    }
  }

  /**
   * The checkerboard: one cell per coordinate, in the grid itself.
   *
   * Placed with grid-column/grid-row like a tile, so each square is exactly one
   * real cell whatever height that row turned out to be. Drawn a few rows past
   * the last object, which is where a new thing would go.
   */
  function paintChecker() {
    grid.querySelectorAll('.ag-cell').forEach((c) => c.remove());
    if (locked()) return;
    const cols = columnsFor(layout, device);
    const last = placed().reduce((m, r) => Math.max(m, r._row + r._rowSpan - 1), 0);
    /* A board with a stated height is exactly that tall, and the checkerboard
       must not pretend otherwise: drawing spare rows past the end creates
       implicit tracks, and a 2-cell header rendered 8 cells deep in edit mode
       is not the header you are arranging. Only a board free to grow gets the
       few extra rows that make room to put something new. */
    const fixed = device === 'narrow' ? (layout.narrowRows ?? layout.rows) : layout.rows;
    const rows = fixed ?? Math.max(last + 5, 8);
    const frag = document.createDocumentFragment();
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const cell = document.createElement('i');
        cell.className = 'ag-cell' + ((c + r) % 2 ? ' ag-cell-b' : '');
        cell.style.gridColumn = `${c} / span 1`;
        cell.style.gridRow = `${r} / span 1`;
        cell.dataset.col = c; cell.dataset.row = r;
        frag.appendChild(cell);
      }
    }
    grid.prepend(frag);
  }

  /* ---- mutation ---- */

  const GEOMETRY = ['id', 'flow', 'desk', 'narrow', 'locked'];

  function pushUndo(step) {
    undo.push(step);
    if (undo.length > 20) undo.shift();
    /* A new move ends the branch you undid your way out of. Keeping the redo
       stack across an edit is how an undo history comes to offer a redo that
       reinstates a change on top of a board it no longer fits (decision 65). */
    redo.length = 0;
    return step;
  }

  function setBox(id, box, { record = true } = {}) {
    const e = find(id);
    if (!e) return null;
    const step = record
      ? pushUndo({ kind: 'box', id, device, prev: e[device] ? structuredClone(e[device]) : null })
      : null;
    e[device] = { col: [...box.col], row: [...box.row] };
    commit();
    return step;
  }

  /**
   * Move several at once, as ONE undo step. A group drag is one thing you did,
   * so ⌘Z must put the whole group back — decision 65's "one move per drop,
   * covering every object the drop touches".
   */
  function setBoxes(moves) {
    const items = [];
    for (const { id, box } of moves) {
      const e = find(id);
      if (!e) continue;
      items.push({ id, prev: e[device] ? structuredClone(e[device]) : null });
      e[device] = { col: [...box.col], row: [...box.row] };
    }
    const step = pushUndo({ kind: 'boxes', device, items });
    commit();
    return step;
  }

  function commit() {
    const problems = validateLayout(layout, name);
    if (problems.length) {
      // Should be unreachable: every move goes through boxOk first. If it does
      // happen, say so loudly rather than saving something the build rejects.
      console.error('[editor] refusing to save an invalid layout\n' + problems.join('\n'));
      toast('That would make the layout invalid — not saved');
      return false;
    }
    // The compiled rules are keyed by id and carry every box, so they have to
    // be rebuilt whenever a box changes — otherwise paint()'s inline styles and
    // the stylesheet disagree, and the disagreement shows the moment an inline
    // style is cleared.
    recompile();
    paint();
    onChange?.(layout);
    return true;
  }

  /** Everything on an object that is not its geometry. */
  const contentOf = (e) => {
    const out = {};
    for (const k of Object.keys(e)) if (!GEOMETRY.includes(k)) out[k] = structuredClone(e[k]);
    return out;
  };
  const restoreContent = (e, prev) => {
    for (const k of Object.keys(e)) if (!GEOMETRY.includes(k)) delete e[k];
    Object.assign(e, prev);
  };

  /**
   * Apply one step backwards and hand back the step that would apply it
   * forwards again. Bureau's `applyMove` (decision 65): redo is not a special
   * case, it is the same function pointed the other way — so every kind of
   * step here has to say what its own inverse is, and does.
   *
   * @returns {{step: object, said: string}|null}
   */
  function applyStep(move) {
    const at = (id) => layout.elements.findIndex((e) => e.id === id);
    const insert = (index, element) => {
      layout.elements.splice(Math.min(index, layout.elements.length), 0, element);
      mountTile(element);
    };
    const takeOut = (id) => {
      const i = at(id);
      return i >= 0 ? { index: i, element: layout.elements.splice(i, 1)[0] } : null;
    };

    switch (move.kind) {
      case 'add': {
        const gone = takeOut(move.id);
        return gone && { step: { kind: 'remove', ...gone }, said: `Removed ${move.id}` };
      }
      case 'remove':
        insert(move.index, move.element);
        return { step: { kind: 'add', id: move.element.id }, said: `Put ${move.element.id} back` };
      case 'adds': {
        const items = move.ids.map(takeOut).filter(Boolean);
        return { step: { kind: 'removes', items }, said: `Removed ${items.length}` };
      }
      case 'removes':
        for (const { index, element } of [...move.items].sort((a, b) => a.index - b.index)) insert(index, element);
        return { step: { kind: 'adds', ids: move.items.map((i) => i.element.id) }, said: `Put ${move.items.length} back` };

      case 'content': {
        const e = find(move.id);
        if (!e) return null;
        const now = contentOf(e);
        restoreContent(e, move.prev);
        drawnFrom.delete(move.id);
        return { step: { kind: 'content', id: move.id, prev: now }, said: `Undid the change to ${move.id}` };
      }
      case 'box': {
        const e = find(move.id);
        if (!e) return null;
        const now = e[move.device] ? structuredClone(e[move.device]) : null;
        if (move.prev) e[move.device] = move.prev; else delete e[move.device];
        device = move.device;
        return { step: { kind: 'box', id: move.id, device: move.device, prev: now }, said: `Moved ${move.id} back` };
      }
      case 'boxes': {
        const items = [];
        for (const { id, prev } of move.items) {
          const e = find(id);
          if (!e) continue;
          items.push({ id, prev: e[move.device] ? structuredClone(e[move.device]) : null });
          if (prev) e[move.device] = prev; else delete e[move.device];
        }
        device = move.device;
        return { step: { kind: 'boxes', device: move.device, items }, said: `Moved ${items.length} back` };
      }

      case 'group': {
        const holder = takeOut(move.id);
        for (const { index, element } of [...move.removed].sort((a, b) => a.index - b.index)) insert(index, element);
        return holder && { step: { kind: 'regroup', holder: holder.element, holderIndex: holder.index, ids: move.removed.map((r) => r.element.id) }, said: `Ungrouped ${move.id}` };
      }
      case 'regroup': {
        const removed = move.ids.map(takeOut).filter(Boolean);
        insert(move.holderIndex, move.holder);
        return { step: { kind: 'group', id: move.holder.id, removed }, said: `Grouped ${removed.length} again` };
      }
      case 'ungroup': {
        const made = move.made.map(takeOut).filter(Boolean);
        insert(move.index, move.holder);
        return { step: { kind: 'reungroup', holderId: move.holder.id, made }, said: `Put them back into ${move.holder.id}` };
      }
      case 'reungroup': {
        const holder = takeOut(move.holderId);
        for (const { index, element } of [...move.made].sort((a, b) => a.index - b.index)) insert(index, element);
        return holder && { step: { kind: 'ungroup', index: holder.index, holder: holder.element, made: move.made.map((m) => m.element.id) }, said: `Spread ${move.made.length} out again` };
      }
      case 'filed': {
        const holder = find(move.holderId);
        const filledWith = holder ? contentOf(holder) : null;
        if (holder) { restoreContent(holder, move.prev); drawnFrom.delete(holder.id); }
        insert(move.index, move.element);
        return { step: { kind: 'refile', id: move.element.id, holderId: move.holderId, filled: filledWith }, said: `Took ${move.element.id} back out` };
      }
      case 'refile': {
        const gone = takeOut(move.id);
        const holder = find(move.holderId);
        const prev = holder ? contentOf(holder) : null;
        if (holder && move.filled) { restoreContent(holder, move.filled); drawnFrom.delete(holder.id); }
        return gone && { step: { kind: 'filed', index: gone.index, element: gone.element, holderId: move.holderId, prev }, said: `Put ${move.id} back into ${move.holderId}` };
      }
      default:
        return null;
    }
  }

  function undoLast() {
    const move = undo.pop();
    if (!move) return toast('Nothing to undo');
    const was = device;
    const out = applyStep(move);
    commit();
    if (!out) return;
    redo.push(out.step);
    if (redo.length > 20) redo.shift();
    toast(was !== device ? `Undone on ${device}` : out.said);
  }

  function redoLast() {
    const move = redo.pop();
    if (!move) return toast('Nothing to redo');
    const was = device;
    const out = applyStep(move);
    commit();
    if (!out) return;
    // Straight onto the undo stack, not through pushUndo(), which would clear
    // the redo stack you are in the middle of walking back down.
    undo.push(out.step);
    if (undo.length > 20) undo.shift();
    toast(was !== device ? `Redone on ${device}` : `Redid — ${out.said.toLowerCase()}`);
  }

  /** Apply a content change to an object and record it. Shares the one undo stack. */
  function setContent(id, mutate) {
    const e = find(id);
    if (!e) return false;
    const prev = contentOf(e);
    mutate(e);
    const problems = validateLayout(layout, name);
    if (problems.length) {
      restoreContent(e, prev);
      toast(problems[0].replace(/^[^:]+: /, ''));
      return false;
    }
    const step = pushUndo({ kind: 'content', id, prev });
    commit();
    repaintContent(id);
    return step;
  }

  /* ---- making and removing things ---- */

  function uniqueId(kind) {
    const taken = new Set([...document.querySelectorAll('[id]')].map((n) => n.id));
    for (const e of layout.elements) taken.add(e.id);
    let n = 1;
    while (taken.has(`${kind}-${n}`)) n++;
    return `${kind}-${n}`;
  }

  /** A fresh tile in the DOM for an object that was not built into the page. */
  function mountTile(item) {
    let node = el(item.id);
    if (!node) {
      node = document.createElement('div');
      node.id = item.id;
      grid.appendChild(node);
    }
    node.innerHTML = renderElement(item, previewCtx) ?? '';
    drawnFrom.set(item.id, JSON.stringify(contentOf(item)));
    dressTile(node, item);
    return node;
  }

  /**
   * Make an object of a kind at a cell.
   *
   * Lands where you clicked at the size its kind declares, or in the first
   * free room if that would collide — the same rule as Bureau's `ensureBox()`.
   * The other device gets a free spot too, because an object needs a desk box
   * to be valid at all.
   */
  function create(kind, col, row, extra = {}, size = null) {
    const def = KINDS[kind];
    if (!def) return;
    const id = uniqueId(kind);
    const cols = columnsFor(layout, device);
    const want = size ? [size.col[1], size.row[1]] : def.size;
    const w = Math.min(want[0], cols);
    let box = { col: [Math.min(col, cols - w + 1), w], row: [row, want[1]] };
    if (!boxOk(layout, id, box, device)) box = freeSpot(layout, [w, want[1]], device, id);

    const item = { id, kind, flow: 'stack', ...extra };
    for (const k of ['body', 'title', 'fold', 'arrange']) {
      if (def[k] != null && item[k] == null) item[k] = structuredClone(def[k]);
    }
    if (item.body != null && !has(item, 'text')) delete item.body;
    /* An object made on one device has to exist on the other, or it is not on
       the site at all. The device you are looking at gets the box you drew;
       the other gets NO stored box, which means it shows up seeded by its flow
       — the way a new drawer appears — until you place it there by hand. */
    if (device === 'desk') {
      item.desk = box;
    } else {
      item.narrow = box;
      item.desk = freeSpot(layout, [Math.min(want[0], layout.columns), want[1]], 'desk', id);
    }
    layout.elements.push(item);
    const problems = validateLayout(layout, name);
    if (problems.length) {
      layout.elements.pop();
      toast(problems[0].replace(/^[^:]+: /, ''));
      return null;
    }
    const step = pushUndo({ kind: 'add', id });
    mountTile(item);
    commit();
    select(id);
    toast(`Added ${id}`, undoOf(step));
    return item;
  }

  function remove(id) {
    const index = layout.elements.findIndex((e) => e.id === id);
    if (index < 0) return;
    const [element] = layout.elements.splice(index, 1);
    const step = pushUndo({ kind: 'remove', index, element });
    commit();                                    // paint() takes the tile away
    toast(`Deleted ${id}`, undoOf(step));
  }

  /** Delete a set, as one undo step. Only typed objects go; a slot is the page. */
  function removeAll(ids) {
    const items = [];
    for (const id of ids) {
      const index = layout.elements.findIndex((e) => e.id === id);
      if (index < 0 || !isTyped(layout.elements[index])) continue;
      const [element] = layout.elements.splice(index, 1);
      items.push({ index, element });
    }
    if (!items.length) return toast('Those are drawn by the page itself, so there is nothing to delete');
    const step = pushUndo({ kind: 'removes', items });
    commit();
    toast(`Deleted ${items.length}`, undoOf(step));
  }

  /**
   * A drawer is a page. Making one writes a new empty layout file — pending
   * until Publish, like a picked image — and a tile here that opens it. The
   * dynamic route turns the file into the page on the next build.
   */
  function newDrawer(col, row, size = null) {
    const title = window.prompt('Name the drawer — it becomes a page:', '');
    if (!title) return;
    const slug = slugify(title);
    if (!slug) return toast('That name has no letters in it');
    const made = create('drawer', col, row, { title, link: `/${slug}`, onclick: 'page' }, size);
    if (!made) return;
    chrome.addFile(pathFor(slug), JSON.stringify(newLayout(title), null, 2) + '\n');
    toast(`"${title}" opens /${slug} once published`);
  }

  /* ---- grouping: Bureau's gather, as a website wants it ----
     Bureau's decision 24: drop two things together and they become a container
     holding both. Here a HOLDER is the container that lives inside one tile
     and lays its contents out by a rule — a stack, a row, a wrapping grid, an
     accordion — which is what a page wants where a desk wants a drawer. Two
     ways in: select several and Group (⌘G), or drop one onto a holder and it
     is filed in. Ungroup (⌘⇧G) spreads a holder's items back onto the board.
     A group made from a selection takes the room the selection had, so the
     board looks the same the moment after as the moment before. */

  /** Typed, not a slot, not itself a holder or a feed — things that can be held. */
  const holdable = (e) => e && isTyped(e) && !has(e, 'holds') && !has(e, 'feed') && !has(e, 'form');

  function group(ids) {
    const members = ids.map(find).filter(holdable);
    if (members.length < 2) return toast('Select two or more notes, pictures or buttons to group them');
    // Reading order, and the room they took up together.
    const boxes = members.map((m) => ({ m, b: boxFor(m.id) })).sort((a, b) => a.b.row[0] - b.b.row[0] || a.b.col[0] - b.b.col[0]);
    const c0 = Math.min(...boxes.map((x) => x.b.col[0])), r0 = Math.min(...boxes.map((x) => x.b.row[0]));
    const c1 = Math.max(...boxes.map((x) => x.b.col[0] + x.b.col[1])), r1 = Math.max(...boxes.map((x) => x.b.row[0] + x.b.row[1]));
    const id = uniqueId('list');
    const holder = { id, kind: 'list', flow: 'stack', arrange: 'stack', face: 'card', items: boxes.map((x) => toItem(x.m)) };
    holder[device] = { col: [c0, c1 - c0], row: [r0, r1 - r0] };
    if (device === 'narrow') holder.desk = freeSpot(layout, [Math.min(c1 - c0, layout.columns), r1 - r0], 'desk', id);
    // Out with the members, in with the holder, checked as one change.
    const removed = [];
    for (const { m } of boxes) {
      const index = layout.elements.findIndex((e) => e.id === m.id);
      removed.push({ index, element: layout.elements.splice(index, 1)[0] });
    }
    layout.elements.push(holder);
    const problems = validateLayout(layout, name);
    if (problems.length) {
      layout.elements.pop();
      for (const { index, element } of [...removed].sort((a, b) => a.index - b.index)) layout.elements.splice(index, 0, element);
      return toast(problems[0].replace(/^[^:]+: /, ''));
    }
    const step = pushUndo({ kind: 'group', id, removed });
    commit();
    select(id);
    toast(`Grouped ${members.length} into ${id}`, undoOf(step));
  }

  function ungroup(id) {
    const holder = find(id);
    if (!holder || !has(holder, 'holds')) return toast('Only a holder can be ungrouped');
    const items = itemsOf(holder);
    if (!items.length) return toast(`${id} holds nothing`);
    const b = boxFor(id);
    const made = [];
    const index = layout.elements.findIndex((e) => e.id === id);
    layout.elements.splice(index, 1);
    for (const it of items) {
      const o = fromItem(it, uniqueId(it.kind ?? 'note'));
      const size = KINDS[o.kind]?.size ?? [4, 2];
      const w = Math.min(size[0], columnsFor(layout, device), b.col[1]);
      // First choice: inside the room the holder had; then anywhere free.
      const at = { col: [b.col[0], w], row: [b.row[0] + made.length * size[1], size[1]] };
      o[device] = boxOk(layout, o.id, at, device) ? at : freeSpot(layout, [w, size[1]], device, o.id);
      if (device === 'narrow') o.desk = freeSpot(layout, [Math.min(size[0], layout.columns), size[1]], 'desk', o.id);
      layout.elements.push(o);
      made.push(o.id);
    }
    const problems = validateLayout(layout, name);
    if (problems.length) {
      for (const mid of made) layout.elements.splice(layout.elements.findIndex((e) => e.id === mid), 1);
      layout.elements.splice(index, 0, holder);
      return toast(problems[0].replace(/^[^:]+: /, ''));
    }
    const step = pushUndo({ kind: 'ungroup', index, holder, made });
    commit();
    select(made);
    toast(`Spread ${made.length} out of ${id}`, undoOf(step));
  }

  /** Drop one object into a holder: it leaves the board and joins the list. */
  function fileInto(id, holderId) {
    const o = find(id), holder = find(holderId);
    if (!holdable(o) || !holder || !has(holder, 'holds')) return false;
    const index = layout.elements.findIndex((e) => e.id === id);
    const prev = contentOf(holder);
    const [element] = layout.elements.splice(index, 1);
    holder.items = [...itemsOf(holder), toItem(element)];
    const problems = validateLayout(layout, name);
    if (problems.length) {
      restoreContent(holder, prev);
      layout.elements.splice(index, 0, element);
      toast(problems[0].replace(/^[^:]+: /, ''));
      return false;
    }
    const step = pushUndo({ kind: 'filed', index, element, holderId, prev });
    commit();
    select(holderId);
    toast(`Put ${id} into ${holderId}`, undoOf(step));
    return true;
  }

  /* ---- the picker ---- */

  function openPicker(col, row, x, y, size = null) {
    chrome.menu(x, y, `
      <div class="ag-menu-title">New, at ${col},${row}${size ? ` · ${size.col[1]}×${size.row[1]}` : ''}</div>
      <div class="ag-menu-kinds">
        ${PICKER_KINDS.map((k) => `<button class="ag-menu-btn" data-act="new:${k}">${KINDS[k].label}<small>${KINDS[k].says}</small></button>`).join('')}
      </div>
      <button class="ag-menu-btn ag-menu-cancel" data-act="none">Nothing, thanks</button>
    `, (act) => {
      const kind = act.startsWith('new:') && act.slice(4);
      if (!kind) return;
      if (kind === 'drawer') return newDrawer(col, row, size);
      const item = create(kind, col, row, {}, size);
      if (item && kind === 'image') pickFileFor(item.id);
    });
  }

  /**
   * Sketching a box on bare grid.
   *
   * A press on a cell starts it; dragging shows the box the new object will
   * take; letting go opens the picker at that size.
   *
   * **A quick tap on bare board does NOT open the picker**, and that is the
   * fix for it going off by accident. One finger belongs to the board while
   * you are arranging — that is the trade `touch-action: pinch-zoom` makes —
   * so every stray touch, every attempt to scroll with one finger, and every
   * tap meant to deselect used to land in the picker. A tap now means what it
   * means everywhere else on the board: nothing is selected any more.
   *
   * So the picker is asked for the same two ways a tile is picked up, which is
   * the symmetry Bureau has: HOLD it, or DRAG a size. It is never something a
   * press can do on its own.
   */
  function onCellDown(e) {
    if (locked() || e.button === 2) return;
    if (!e.isPrimary) return clearGestureState();
    // Bare board is a cell OR the grid itself — the cells are a look, not the
    // thing that decides where you pressed.
    const onBoard = e.target.closest('.ag-cell') || e.target === grid;
    if (!onBoard || !grid.contains(e.target)) return;
    if (editing) endEdit(true);
    // Pressing the board means "not that one" — unless shift is held, in which
    // case a band drawn from here ADDS to what is chosen.
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!add) select(null);

    const t = tracks(grid);
    const rect = grid.getBoundingClientRect();
    const cols = columnsFor(layout, device);
    const from = cellAt(t, rect, cols, e.clientX, e.clientY);
    sketch = {
      pointerId: e.pointerId,
      t, cols, from, to: from,
      sx: e.clientX, sy: e.clientY,
      moved: false,
      held: false,
      add,
      hits: [],                               // what the band has touched
      /* Whether the finger belongs to us yet. On a mouse it does at once, which
         is what makes dragging out a size on a desk immediate. On touch it does
         NOT until the hold lands — before that the finger belongs to the page,
         so one-finger scrolling works exactly as a visitor's does. That is the
         trade `touch-action: pinch-zoom` was making badly. */
      tracking: e.pointerType !== 'touch',
      node: Object.assign(document.createElement('div'), { className: 'ag-ghost ag-sketch' }),
    };
    // The ghost goes accent once the hold has landed, so the board says the
    // picker is coming before it arrives rather than surprising you with it.
    sketch.timer = setTimeout(() => {
      if (!sketch) return;
      sketch.held = true;
      sketch.tracking = true;
      sketch.node.classList.add('ag-armed');
      showSketch();
      chrome.dropSelection();
      navigator.vibrate?.(6);
    }, holdFor(e));
    // Not drawn until the finger is ours. On touch that is when the hold lands,
    // so a one-finger scroll off bare board no longer flashes a box on its way
    // past.
    if (sketch.tracking) showSketch();
  }

  /** Put the sketch's ghost on the board at whatever it currently spans. */
  function showSketch() {
    if (!sketch || sketch.node.isConnected) return;
    place(sketch.node, spanBetween(sketch.from, sketch.to));
    grid.appendChild(sketch.node);
  }

  function onSketchMove(e) {
    if (!sketch || e.pointerId !== sketch.pointerId) return;
    // Before the hold lands on touch the finger belongs to the page, and a
    // press that travels was a scroll. Stand down rather than wait to steal it.
    if (!sketch.tracking) {
      if (Math.abs(e.clientX - sketch.sx) > WOBBLE || Math.abs(e.clientY - sketch.sy) > WOBBLE) {
        clearGestureState();
      }
      return;
    }
    const to = cellAt(sketch.t, grid.getBoundingClientRect(), sketch.cols, e.clientX, e.clientY);
    if (to.col === sketch.to.col && to.row === sketch.to.row) return;
    sketch.to = to;
    sketch.moved = true;
    const box = spanBetween(sketch.from, to);
    /* Anything the band touches becomes the selection. If it touches nothing,
       the same drag is sketching the size of a new object — which is what
       stopped the two gestures from fighting each other in Bureau, and is why
       there is no "select tool". A decoration is passed over: it stands in
       front of things, so a band meant for what is behind it would always
       catch it first. Shift+band picks it up deliberately. */
    const hits = placed()
      .filter((r) => el(r.id)?.classList.contains('ag-editable'))
      .filter((r) => !find(r.id)?.locked)
      .filter((r) => sketch.add || !isDecor(find(r.id)))
      .filter((r) => overlaps(box, { col: [r._col, r._span], row: [r._row, r._rowSpan] }))
      .map((r) => r.id);
    sketch.hits = hits;
    if (hits.length) {
      // Shown live, so you can see what you are about to have chosen.
      select(hits, { add: sketch.add });
    } else if (!sketch.add) select(null);
    sketch.node.className = 'ag-ghost ag-sketch'
      + (sketch.held ? ' ag-armed' : '')
      + (hits.length ? ' ag-picking' : (boxOk(layout, null, box, device) ? '' : ' ag-bad'));
    place(sketch.node, box);
  }

  function onSketchUp(e) {
    if (!sketch || e.pointerId !== sketch.pointerId) return;
    const s = sketch;
    clearGestureState();
    // It was a lasso, not a sketch: the selection is already what it touched.
    if (s.hits.length) return;
    // A quick tap is a tap: it deselected on the way down and that is all it
    // does. Only a hold or a drawn box asks for the picker.
    if (!s.moved && !s.held) return;
    const box = spanBetween(s.from, s.to);
    // A drag says what size it wants; a hold lets the kind decide.
    openPicker(box.col[0], box.row[0], e.clientX, e.clientY, s.moved ? box : null);
  }

  /* ---- images picked in the browser, not yet in the repo ---- */

  /** name -> {path, base64, previewUrl}. Published with the layout, in one commit. */
  const pending = new Map();

  async function addImage(id, file) {
    const item = find(id);
    if (!item) return;
    if (!has(item, 'media')) return toast(`${id} does not carry a picture`);
    try {
      toast('Preparing…');
      const m = await prepareImage(file);
      pending.set(m.name, {
        path: mediaPath(m.name), base64: await blobToBase64(m.blob), previewUrl: m.previewUrl,
      });
      setContent(id, (o) => {
        o.media = { ...(o.media ?? {}), src: mediaRef(m.name) };
        // Stale dimensions from the image being replaced would set the wrong box,
        // and the CDN sizing does not apply to a local file.
        if (m.width) { o.media.width = m.width; o.media.height = m.height; } else { delete o.media.width; delete o.media.height; }
        delete o.media.widths; delete o.media.sizes;
      });
      chrome.render();
      toast(`${m.name} · ${m.note} · ${Math.round(m.bytes / 1024)}KB — Publish to commit it`);
    } catch (err) {
      toast(err.message || 'Could not use that image');
    }
  }

  /** One hidden <input type=file>, made fresh each time. The file arrives on change. */
  function pickFileFor(id) {
    if (!id) return toast('Right-click a picture first, or click a cell to make one');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) addImage(id, file);
    }, { once: true });
    input.click();
  }

  let dropTarget = null;
  const markDrop = (node) => {
    if (dropTarget === node) return;
    dropTarget?.classList.remove('ag-drop');
    dropTarget = node;
    dropTarget?.classList.add('ag-drop');
  };
  const allowDrop = (e) => {
    if (locked() || !e.dataTransfer?.types?.includes('Files')) return;
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return markDrop(null);
    e.preventDefault();
    markDrop(node);
  };
  function onDrop(e) {
    const node = e.target.closest('.ag-editable');
    const file = e.dataTransfer?.files?.[0];
    markDrop(null);
    if (locked() || !node || !grid.contains(node) || !file) return;
    e.preventDefault();
    addImage(node.id, file);
  }

  /* ---- gestures ---- */

  /**
   * Put every gesture down and take every mark off the board.
   *
   * **This is the fix for boxes stranded on the board, and it is one function
   * because there is no other way to get it right.** The editor cannot
   * re-render — the page belongs to Astro — so six visual states are poked onto
   * the DOM by hand: `ag-lifted`, `ag-dragging`, `ag-invalid`, `ag-drop`, the
   * drag ghost and the sketch ghost. Every exit path was expected to remember
   * all six, and `pointercancel` remembered two: it cleared the tile drag and
   * never touched the sketch at all. So the sketch's ghost stayed in the grid,
   * its timer went on to fire `ag-armed` onto it a moment later, and the next
   * press assigned a fresh sketch and orphaned that node for the life of the
   * page. They accumulated.
   *
   * A `pointercancel` fires exactly when a second finger lands, which is why
   * "boxes get stuck" and "two fingers barely scroll" were the same event seen
   * from both ends.
   *
   * The sweep at the end is deliberate belt and braces: it takes the classes
   * off anything still wearing one even if we have lost the handle on it,
   * because the whole class of bug is losing the handle.
   */
  function clearGestureState() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (menuTimer) { clearTimeout(menuTimer); menuTimer = null; }

    if (sketch) {
      clearTimeout(sketch.timer);
      sketch.node.remove();
      sketch = null;
    }
    if (G) {
      stopPan();
      try { G.node?.releasePointerCapture?.(G.pointerId); } catch { /* already gone */ }
      G = null;
    }
    markDrop(null);

    for (const stray of grid.querySelectorAll('.ag-lifted, .ag-dragging, .ag-invalid, .ag-drop')) {
      stray.classList.remove('ag-lifted', 'ag-dragging', 'ag-invalid', 'ag-drop');
      stray.style.transform = '';
    }
    for (const ghost of grid.querySelectorAll('.ag-ghost')) ghost.remove();
  }

  /**
   * Is a gesture of ours currently carrying the finger?
   *
   * Bureau asks this of its gesture module for one reason: it is what decides
   * whether the page may scroll (`wire.js`) and whether the browser's own long
   * press may raise a context menu. Both of those are answered by a predicate
   * rather than by a CSS property, which is the whole of divergence three.
   */
  const dragArmed = () => !!(G && G.armed) || !!(sketch && sketch.tracking);

  function candidate(g, dcol, drow) {
    const b = g.box;
    if (g.type === 'move') {
      return { col: [b.col[0] + dcol, b.col[1]], row: [b.row[0] + drow, b.row[1]] };
    }
    let [x, w] = b.col, [y, h] = b.row;
    const hd = g.handle;
    if (hd.includes('e')) w = b.col[1] + dcol;
    if (hd.includes('w')) { x = b.col[0] + dcol; w = b.col[1] - dcol; }
    if (hd.includes('s')) h = b.row[1] + drow;
    if (hd.includes('n')) { y = b.row[0] + drow; h = b.row[1] - drow; }
    // Never invert the box.
    if (w < 1) { if (hd.includes('w')) x = b.col[0] + b.col[1] - 1; w = 1; }
    if (h < 1) { if (hd.includes('n')) y = b.row[0] + b.row[1] - 1; h = 1; }
    return { col: [x, w], row: [y, h] };
  }

  function onDown(e) {
    if (locked()) return;
    if (e.button === 2) return;               // right click is the settings menu
    /* A second finger is never a drag — Bureau's rule, and the reason it takes
       the two-finger gesture itself rather than leaving it to the browser.
       There is one `G`, one `sketch` and one pair of timers for the whole
       board, and nothing used to check: a second touch simply overwrote them,
       so the FIRST finger's release then cleaned up the second gesture and left
       the first tile lifted, transformed and ringed for good. */
    if (!e.isPrimary) return clearGestureState();
    // A fold's own tab is a control, not a handle: pressing it should open the
    // fold so you can arrange what is inside it. Hold anywhere else to move it.
    if (e.target.closest('[data-fold],[data-acc]')) return;
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return;
    const id = node.id;
    const item = find(id);
    if (!item || item.locked) return;

    // While a tile's words are being edited it is a text field, not a tile.
    if (editing && node.id === editing.id) return;
    if (editing) endEdit(true);

    const grip = e.target.closest('[data-rz]');
    const t = tracks(grid);
    const rect = grid.getBoundingClientRect();
    /* Dragging any member of a selection moves the lot, keeping their relative
       positions — the offsets are captured up front, before anything moves.
       Bureau's `G.group`. Only a move: a corner grip resizes one tile. */
    const set = selection();
    const group = !grip && set.includes(id) && set.length > 1
      ? set.map((gid) => ({ id: gid, box: boxFor(gid), node: el(gid) }))
          .filter((m) => m.node && find(m.id) && !find(m.id).locked)
      : null;
    G = {
      type: grip ? 'resize' : 'move',
      id, node, handle: grip?.dataset.rz ?? null,
      pointerId: e.pointerId,                 // every later event must match it
      touch: e.pointerType === 'touch',
      armed: !!grip,                          // a grip drags at once, a tile waits
      menu: false,                            // the panel is up, the tile still in hand
      group,
      // Shift or ⌘ held at the press: a tap toggles this one in the selection
      // rather than replacing it. Read now, because the release may not carry it.
      toggle: e.shiftKey || e.metaKey || e.ctrlKey,
      px: e.clientX, py: e.clientY,           // where the pointer is, for the edge pan
      // The last candidate box that passed boxOk. A resize that ends on an
      // illegal box lands here instead of snapping all the way back to where it
      // started, which is most of "sizes don't stick": on a 24-column board
      // whose cells touch, almost any grow meets a neighbour eventually, and
      // throwing away the legal part of the gesture punishes you for it.
      lastOk: null,
      box: boxFor(id),
      // Measured once, at the start, and not re-read mid-gesture: the ground
      // must not move under the pointer while the tile is following it.
      t,
      startCol: trackAt(t.x, e.clientX - rect.left, t.colStep),
      startRow: trackAt(t.y, e.clientY - rect.top, t.rowStep),
      sx: e.clientX, sy: e.clientY,
      moved: false, ok: true, cand: null,
    };
    try { node.setPointerCapture?.(e.pointerId); } catch {}

    if (G.armed) return;                      // a grip: nothing to wait for

    const mine = G;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (G !== mine) return;
      /* Refusing `selectstart` stops a NEW selection and does nothing about one
         already on screen — and iOS begins its own during the press, after
         `pointerdown` has been and gone. So it is dropped again here, at the
         moment the hold lands, before iOS decides the hold was about text.
         Bureau's `dropSelection()`, called from the same place. */
      chrome.dropSelection();
      /* And look the tile up again rather than trusting the node captured at
         the press: an undo, or any repaint that re-mounts a tile, detaches it
         mid-hold and everything after this would be happening to something
         nobody can see. Bureau's `refind()`. */
      G.node = el(G.id) ?? G.node;
      G.armed = true;
      G.node.classList.add('ag-lifted');
      if (G.group) for (const m of G.group) { m.node = el(m.id) ?? m.node; m.node.classList.add('ag-lifted'); }
      navigator.vibrate?.(6);

      /* Keep holding WITHOUT moving and it becomes the menu instead. A phone
         has no right button, and Bureau makes the same bargain.
         Nested inside the hold, so the menu can only ever follow a hold that
         armed — it used to be a second timer started alongside the first, which
         could fire on a press the hold had already given up on.
         And the gesture is **not** cancelled when the menu appears: the tile is
         put back down but `G` stays alive, so you can keep holding, move, and
         have the menu go away with the tile in your hand. That is the iPhone
         home screen's gesture and Bureau's decision 47. Cancelling here made
         the hold a dead end — the menu came up and the finger was finished
         with, and you had to start the whole press again. */
      menuTimer = setTimeout(() => {
        menuTimer = null;
        if (G !== mine || G.moved) return;    // it started moving: it is a drag
        chrome.dropSelection();
        navigator.vibrate?.(12);
        G.menu = true;
        G.armed = false;
        G.node.classList.remove('ag-lifted'); // down, but still under the finger
        G.node.style.transform = '';
        if (G.group) for (const m of G.group) m.node.classList.remove('ag-lifted');
        openObjectMenu(G.id, G.sx, G.sy);
      }, MENU_AFTER);
    }, holdFor(e));
  }

  /* ---- thrown off the board ----
     Bureau's decision 112. Carrying a tile could put it anywhere and could not
     get rid of it; deleting was three deliberate acts for the one thing you
     often decide WHILE you have hold of it. A hard flick off an edge throws it
     away — the gesture every phone already has for dismissing something.
     Hard to do by accident, which means asking three things rather than one:
     fast (well past what a careful move ends at), let go at the very edge of
     the board or past it, and travelling OUT through that edge. Down is not an
     edge: below the board is more page, and the bar. Undo covers the rest. */
  const TOSS_TOUCH = 1.15;   // px per ms — about a third of a second across a phone
  const TOSS_MOUSE = 2.2;    // a mouse crosses a screen far faster than a thumb crosses a phone
  const TOSS_EDGE = 26;      // how close to the edge letting go counts as off it
  function tossed(g) {
    if (!g.moved || g.group || g.into || g.type !== 'move') return null;
    if (Math.hypot(g.vx || 0, g.vy || 0) < (g.touch ? TOSS_TOUCH : TOSS_MOUSE)) return null;
    const r = grid.getBoundingClientRect();
    if (g.px <= r.left + TOSS_EDGE && g.vx < 0) return 'left';
    if (g.px >= r.right - TOSS_EDGE && g.vx > 0) return 'right';
    if (g.py <= r.top + TOSS_EDGE && g.vy < 0) return 'up';
    return null;
  }

  /* ---- the edge pan ----
     A tall board cannot be dragged onto below the fold: the pointer reaches the
     bottom of the window and the page does not move, because a native scroll
     was the first thing the hold refused. So while a tile is in the air and the
     pointer is within PAN_EDGE of the top or bottom, the window scrolls on its
     own, faster the nearer the edge, and the drag is re-applied between pointer
     events — the finger is holding still at the edge and the board is what
     moves. Bureau's `autoPan`. */
  const PAN_EDGE = 56, PAN_MAX = 14;
  let panning = null;
  function panLoop() {
    panning = null;
    if (!G || !G.armed || !G.moved || G.type !== 'move') return;
    const h = window.innerHeight;
    // The bar owns the bottom of the screen, so the bottom edge starts above it.
    const barTop = chrome.barTop();
    let v = 0;
    if (G.py < PAN_EDGE) v = -Math.ceil(PAN_MAX * (1 - G.py / PAN_EDGE));
    else if (G.py > barTop - PAN_EDGE) v = Math.ceil(PAN_MAX * (1 - (barTop - G.py) / PAN_EDGE));
    if (v) {
      const before = window.scrollY;
      window.scrollBy(0, v);
      const moved = window.scrollY - before;
      if (moved) {
        /* The page moved under a pointer that did not. The tile follows the
           pointer through a translate from where the press began, so the start
           point has to move with the page for the tile to stay in hand. */
        G.sy -= moved;
        applyDrag(G, G.px, G.py);
      }
    }
    panning = requestAnimationFrame(panLoop);
  }
  const stopPan = () => { if (panning) { cancelAnimationFrame(panning); panning = null; } };

  /**
   * Everything a move redraws, given where the pointer is. Split out because
   * the edge pan has to redraw between pointer events.
   */
  function applyDrag(G, clientX, clientY) {
    const dx = clientX - G.sx, dy = clientY - G.sy;
    // Cells crossed, from the real track edges — not dx divided by a step.
    // The rect is re-read so the page can scroll mid-drag.
    const rect = grid.getBoundingClientRect();
    const dcol = trackAt(G.t.x, clientX - rect.left, G.t.colStep) - G.startCol;
    const drow = trackAt(G.t.y, clientY - rect.top, G.t.rowStep) - G.startRow;
    const box = candidate(G, dcol, drow);
    G.cand = box;

    /* Over a holder with nothing legal to do there? Then letting go files it
       in: the thing under the pointer is a place to land, not a collision.
       Bureau's aimDrop, cut to the one answer a page has. The aim is the cell
       under the pointer, never elementFromPoint — the tile in hand is what it
       would find. */
    G.into = null;
    if (G.type === 'move' && !G.group && holdable(find(G.id))) {
      const rect2 = grid.getBoundingClientRect();
      const at = cellAt(G.t, rect2, columnsFor(layout, device), clientX, clientY);
      const under = placed().find((r) => r.id !== G.id && has(find(r.id) ?? {}, 'holds')
        && at.col >= r._col && at.col < r._col + r._span && at.row >= r._row && at.row < r._row + r._rowSpan);
      if (under) G.into = under.id;
    }
    markDrop(G.into ? el(G.into) : null);

    if (G.group) {
      // The whole set has to land legally, and only collisions with objects
      // outside the set count — the set kept its shape.
      G.moves = G.group.map((m) => ({
        id: m.id,
        box: { col: [m.box.col[0] + dcol, m.box.col[1]], row: [m.box.row[0] + drow, m.box.row[1]] },
      }));
      G.ok = boxesOk(layout, G.moves, device);
    } else {
      G.ok = boxOk(layout, G.id, box, device);
    }
    if (G.ok) { G.lastOk = box; G.lastMoves = G.moves; }
    G.node.classList.toggle('ag-invalid', !G.ok);

    if (G.type === 'move') {
      G.node.style.transform = `translate(${dx}px,${dy}px)`;
      G.ghosts.forEach((ghost, i) => {
        // Aiming into a holder: the ghost hides, because the holder is where
        // it lands and a red box over it says the opposite.
        ghost.className = 'ag-ghost' + (G.into ? ' ag-hidden' : (G.ok ? '' : ' ag-bad'));
        place(ghost, G.group ? G.moves[i].box : box);
      });
      if (G.into) G.node.classList.remove('ag-invalid');
      if (G.group) for (const m of G.group) {
        if (m.id === G.id) continue;
        m.node.style.transform = `translate(${dx}px,${dy}px)`;
        m.node.classList.toggle('ag-invalid', !G.ok);
      }
    } else {
      place(G.node, box);                     // live resize
    }
  }

  function onMove(e) {
    if (!G) return;
    // Only the finger that started this gesture may drive it. Without this a
    // second pointer's movement steers a tile the first one is carrying.
    if (e.pointerId !== G.pointerId) return;

    const wobbled = Math.abs(e.clientX - G.sx) > WOBBLE || Math.abs(e.clientY - G.sy) > WOBBLE;
    // Any real movement means it was not a press-and-hold.
    if (wobbled && menuTimer) { clearTimeout(menuTimer); menuTimer = null; }
    if (wobbled && holdTimer) { clearTimeout(holdTimer); holdTimer = null; }

    /* The menu is up and the tile is still under your finger. Move, and the
       menu goes away and you are dragging — decision 47's "keep holding and
       move", which is the gesture every phone user already knows. */
    if (G.menu && wobbled) {
      G.menu = false;
      chrome.closeMenu();
      G.armed = true;
      G.node.classList.add('ag-lifted');
      if (G.group) for (const m of G.group) m.node.classList.add('ag-lifted');
    }
    if (!G.armed) return;
    /* Velocity, smoothed. One pointer event's worth is mostly noise and a
       threshold on noise fires at random; each reading is folded into the last
       instead, which is enough to tell a flick from a carry. For the throw. */
    const now = performance.now();
    const dt = now - (G.at ?? now);
    if (dt > 0) {
      const k = Math.min(1, dt / 50);
      G.vx = (G.vx || 0) * (1 - k) + ((e.clientX - G.px) / dt) * k;
      G.vy = (G.vy || 0) * (1 - k) + ((e.clientY - G.py) / dt) * k;
    }
    G.at = now;
    G.px = e.clientX; G.py = e.clientY;
    const dx = e.clientX - G.sx, dy = e.clientY - G.sy;
    if (!G.moved) {
      if (Math.abs(dx) < NUDGE && Math.abs(dy) < NUDGE) return;
      G.moved = true;
      G.node.classList.add('ag-dragging');
      G.ghosts = [];
      if (G.type === 'move') {
        // One ghost per thing in the air, so a group shows where each lands.
        for (const m of (G.group ?? [{ box: G.box }])) {
          const ghost = document.createElement('div');
          ghost.className = 'ag-ghost';
          place(ghost, m.box);
          grid.appendChild(ghost);
          G.ghosts.push(ghost);
        }
        if (G.group) for (const m of G.group) if (m.id !== G.id) m.node.classList.add('ag-dragging');
        if (!panning) panning = requestAnimationFrame(panLoop);
      }
    }
    applyDrag(G, e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!G) return;
    if (e && e.pointerId !== G.pointerId) return;
    const g = G;
    // Everything comes off in one place now, including the four classes and
    // both ghosts — see clearGestureState().
    clearGestureState();

    // The menu is up and you let go: that is the menu, not a move.
    if (g.menu) return;
    // A press that went nowhere is not a move; it is you saying which one —
    // or, with shift, one more of them.
    if (!g.moved) return select(g.id, { toggle: g.toggle });

    /* Land on the last box that was legal rather than throwing the whole
       gesture away. `boxOk` still refuses to shove a neighbour aside — that is
       decision 10 and it stays — but refusing the ILLEGAL part of a drag is a
       different thing from refusing the legal part that came before it. */
    if (g.into && fileInto(g.id, g.into)) return;
    if (tossed(g) && isTyped(find(g.id))) {
      const gone = g.id;
      select(null);
      remove(gone);
      navigator.vibrate?.([3, 20, 6]);
      return;
    }
    if (g.group) {
      const moves = g.ok ? g.moves : g.lastMoves;
      if (!moves) { paint(); return toast('No room there'); }
      const step = setBoxes(moves);
      toast(g.ok ? `Moved ${moves.length}` : 'No room there — left where they last fitted', undoOf(step));
      return;
    }
    const land = (g.cand && g.ok) ? g.cand : g.lastOk;
    if (land) {
      const first = device === 'narrow' && !find(g.id)?.narrow;
      const step = setBox(g.id, land);
      if (!g.ok) toast('No room there — left where it last fitted', undoOf(step));
      else if (first) toast(`${g.id} now has its own narrow position`, undoOf(step));
      else toast(g.type === 'resize' ? `Resized ${g.id}` : `Moved ${g.id}`, undoOf(step));
    } else {
      paint();                                // it was never legal: snap back
      toast('No room there');
    }
  }

  function onCancel() {
    clearGestureState();
    paint();
  }

  function place(node, box) {
    node.style.gridColumn = `${box.col[0]} / span ${box.col[1]}`;
    node.style.gridRow = `${box.row[0]} / span ${box.row[1]}`;
  }

  /* ---- editing the words, in place ---- */

  /**
   * The words become a field where they sit. The field is the [data-edit]
   * node inside the tile — a body, or a title — never the whole tile, because
   * a drawer front has a picture in it too and that is not text.
   */
  function beginEdit(id, field) {
    const item = find(id);
    const tile = el(id);
    if (!item || !tile || !isInline(item) || item.locked) return;
    const node = tile.querySelector(field ? `[data-edit="${field}"]` : '[data-edit]');
    if (!node) return;
    field = node.dataset.edit;
    if (editing) endEdit(true);
    onCancel();                                  // drop any half-started gesture
    editing = { id, field, node, tile, before: item[field] ?? '' };
    node.contentEditable = 'true';
    node.spellcheck = true;
    tile.classList.add('ag-writing');
    // Grips inside a contenteditable become editable content themselves.
    tile.querySelectorAll('.ag-grip').forEach((g) => g.remove());
    node.focus();
    toast('Editing — Escape to cancel, click away to keep');
  }

  function endEdit(keep) {
    if (!editing) return;
    const { id, field, node, tile, before } = editing;
    editing = null;
    node.contentEditable = 'false';
    tile.classList.remove('ag-writing');

    const next = keep
      ? (field === 'body' ? cleanRichText(node.innerHTML) : node.textContent.replace(/\s+/g, ' ').trim())
      : before;
    if (!keep || next === before) {
      repaintContent(id);                        // put the stored markup back
      if (!keep) toast('Reverted');
      return;
    }
    const step = setContent(id, (o) => { o[field] = next; });
    if (step) toast(`${id} updated`, undoOf(step));
  }

  function onDblClick(e) {
    if (locked()) return;
    const tile = e.target.closest('.ag-editable');
    if (!tile || !grid.contains(tile)) return;
    if (!isInline(find(tile.id))) return;
    e.preventDefault();
    const hit = e.target.closest('[data-edit]');
    beginEdit(tile.id, hit?.dataset.edit);
  }

  /** Paste as text. A paste from a browser or a doc arrives full of markup. */
  function onPaste(e) {
    if (!editing) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  /* ---- right click: settings for one object ---- */

  function onContext(e) {
    if (locked()) return;
    /* iOS raises this from the SAME long press that arms the drag, at around
       500ms. So on a phone the menu opened here, and then the editor's own
       hold landed and opened it a second time. Bureau's first line in this
       handler, for the same reason. */
    if (dragArmed()) { e.preventDefault(); return; }
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return;
    e.preventDefault();
    openObjectMenu(node.id, e.clientX, e.clientY);
  }

  /**
   * Hold a tile, or right-click it, and this is what opens.
   *
   * Bureau's bargain, kept: a hold is the way to say "this one, and I mean to
   * do something to it". What opens is a short list of THINGS TO DO — not a
   * form. It used to be one panel carrying every field, every select and every
   * action at once, which made the common case (delete this; copy that) a hunt
   * through a settings sheet, and made the uncommon case cramped in a 340px
   * column. The two are separate now: this menu acts, and **Edit…** opens the
   * object editor below, which is where an object is changed.
   */
  function openObjectMenu(id, x, y) {
    const item = find(id);
    if (!item) return;
    select(id);
    const hasOwn = device === 'narrow' && !!item.narrow;
    const typed = isTyped(item);

    chrome.menu(x, y, `
      <div class="ag-menu-title">${escapeAttr(id)} <span class="ag-menu-kind">${K(item).label}</span></div>
      ${typed ? '<button class="ag-menu-btn ag-menu-go" data-act="edit">Edit…<small>Its kind, what it carries, and every field</small></button>' : ''}
      ${has(item, 'media') ? '<button class="ag-menu-btn" data-act="pick">Choose an image…</button>' : ''}
      ${isInline(item) ? '<button class="ag-menu-btn" data-act="write">Edit the words<small>Or double-click them in the page</small></button>' : ''}
      ${typed ? '<button class="ag-menu-btn" data-act="duplicate">Duplicate<small>⌘D</small></button>' : ''}
      ${selection().length > 1 && selection().includes(id) ? '<button class="ag-menu-btn" data-act="group">Group these<small>⌘G · one holder, laid out by a rule</small></button>' : ''}
      ${has(item, 'holds') && itemsOf(item).length ? '<button class="ag-menu-btn" data-act="ungroup">Ungroup<small>⌘⇧G · back onto the board</small></button>' : ''}
      <button class="ag-menu-btn" data-act="lock">${item.locked ? 'Unlock' : 'Lock in place'}</button>
      ${device === 'narrow' ? `<button class="ag-menu-btn" data-act="reset"${hasOwn ? '' : ' disabled'}>
        ${hasOwn ? 'Reset to derived position' : 'Position is derived'}
      </button>` : ''}
      ${typed ? '<button class="ag-menu-btn ag-menu-danger" data-act="delete">Delete<small>⌫ · ⌘Z puts it back</small></button>' : ''}
      <div class="ag-menu-note">${describe(item)}</div>
    `, (act) => {
      if (act === 'edit') { openObjectEditor(id); return; }
      if (act === 'write') { beginEdit(id); return; }
      if (act === 'lock') { item.locked = !item.locked; commit(); }
      if (act === 'reset') { delete item.narrow; commit(); toast(`${id} back to its ${item.flow} rule`); }
      if (act === 'pick') { pickFileFor(id); return; }
      if (act === 'duplicate') { duplicate(id); }
      if (act === 'group') { group(selection()); }
      if (act === 'ungroup') { ungroup(id); }
      if (act === 'delete') { select(null); remove(id); }
    });
  }

  /**
   * The object editor: what this thing IS, and everything it carries.
   *
   * Three parts, in the order the model puts them. Its **kind** is a preset,
   * so changing it swaps the attributes and keeps the data. **What it carries**
   * is the attribute list itself, which `USER_ATTRS` has declared since the
   * model was ported and nothing has ever shown — so a note that also carries
   * a picture, the combination the whole design is built to allow, could not
   * actually be made. It can now. **Its fields** are drawn from whatever the
   * object ends up carrying, which is why a combination nobody designed still
   * gets a complete panel.
   *
   * Kind and attributes apply the moment they are changed, because both are
   * questions about identity and you want to see the answer. The fields wait
   * for Apply, because they are words being typed.
   */
  function openObjectEditor(id) {
    const item = find(id);
    if (!item || !isTyped(item)) return;
    select(id);
    const carries = attrsOf(item);

    /* A field draws itself from what it declares, so a new attribute's fields
       appear in this panel without it being edited. */
    const control = (f) => {
      const v = getField(item, f.key);
      if (f.kind === 'area') return `<textarea data-field="${f.key}" rows="4">${escapeAttr(v ?? '')}</textarea>`;
      if (f.kind === 'number') return `<input data-field="${f.key}" type="number" min="1" value="${escapeAttr(v ?? '')}" />`;
      if (f.kind === 'items') return itemsControl(item);
      if (f.kind === 'feed') return feedControl(item);
      // A short list typed as words with commas between — what a form asks for.
      if (f.kind === 'list') {
        return `<input data-field="${f.key}" type="text" value="${escapeAttr((Array.isArray(v) ? v : []).join(', '))}" />`;
      }
      if (f.kind === 'select') {
        return `<select data-field="${f.key}">${Object.entries(f.options).map(([k, label]) =>
          `<option value="${escapeAttr(k)}"${String(v ?? '') === k ? ' selected' : ''}>${escapeAttr(label)}</option>`).join('')}</select>`;
      }
      // Somewhere to go is nearly always a page on this site, and typing one by
      // hand is how you get a 404 that nothing catches until a visitor finds
      // it. The list is offered; anything else can still be typed.
      const list = f.key === 'link' ? ' list="ag-pages"' : '';
      return `<input data-field="${f.key}" type="text"${list} value="${escapeAttr(v ?? '')}" />`;
    };

    chrome.menu(null, null, `
      <div class="ag-menu-title">${escapeAttr(id)} <span class="ag-menu-kind">object editor</span></div>

      <label class="ag-menu-field">It is a
        <select data-act="kind">
          ${Object.entries(KINDS).filter(([k]) => k !== 'slot').map(([k, d]) =>
            `<option value="${k}"${k === kindOf(item) ? ' selected' : ''}>${escapeAttr(d.label)} — ${escapeAttr(d.says)}</option>`).join('')}
        </select>
      </label>

      <div class="ag-menu-sub">and it carries</div>
      <div class="ag-menu-attrs">
        ${USER_ATTRS.map((a) => `<label class="ag-menu-check" title="${escapeAttr(ATTRS[a].says)}">
          <input type="checkbox" data-attr="${a}"${carries.includes(a) ? ' checked' : ''} />
          ${escapeAttr(ATTRS[a].label)}</label>`).join('')}
      </div>
      <div class="ag-menu-note">
        What it can do is decided by what it carries, never by what it is
        called. Tick <b>Picture</b> on a note and it is a note with a picture —
        nothing was designed for that, and it works anyway.
      </div>

      ${fieldsOf(item).map((f) => `<label class="ag-menu-field">${escapeAttr(f.label)}${control(f)}</label>`).join('')}
      ${has(item, 'media') ? '<button class="ag-menu-btn" data-act="pick">Choose an image…</button>' : ''}

      <label class="ag-menu-row">Face
        <select data-act="face">
          ${Object.entries(FACES).map(([k, f]) => `<option value="${k}"${k === faceOf(item) ? ' selected' : ''}>${escapeAttr(f.label)}</option>`).join('')}
        </select>
      </label>
      <label class="ag-menu-row">Reflow seed
        <select data-act="flow">
          ${FLOWS.map((f) => `<option value="${f}"${f === item.flow ? ' selected' : ''}>${f}</option>`).join('')}
        </select>
      </label>

      <div class="ag-menu-actions">
        <button class="ag-menu-btn" data-act="fields">Apply</button>
        <button class="ag-menu-btn" data-act="close">Done</button>
      </div>
      <div class="ag-menu-note">${describe(item)}</div>
    `, (act, value, menuEl) => {
      if (act === 'close') return;
      if (act === 'flow') { item.flow = value; commit(); return reopen(); }
      if (act === 'face') { setContent(id, (o) => { o.face = value; }); return reopen(); }
      if (act === 'pick') { pickFileFor(id); return; }
      if (act === 'item-add') { menuEl.querySelector('[data-items]')?.insertAdjacentHTML('beforeend', itemRow()); return; }
      if (act === 'kind') {
        // Its identity, so it lands at once — and the panel has to be rebuilt,
        // because a different kind asks for different fields.
        setContent(id, (o) => setKind(o, value));
        return reopen();
      }
      if (act === 'attr') {
        const box = menuEl.querySelector(`[data-attr="${value}"]`);
        setContent(id, (o) => toggleAttr(o, value, box.checked));
        return reopen();
      }
      if (act === 'fields') {
        const step = applyFields(id, menuEl);
        if (step) toast(`${id} updated`, undoOf(step));
      }
    }, { wide: true });

    // Rebuilt rather than patched: the fields a panel shows are derived from
    // what the object carries, so a change to that IS a different panel.
    function reopen() { requestAnimationFrame(() => openObjectEditor(id)); }
  }

  /** Read every field control in a panel onto the object. */
  function applyFields(id, menuEl) {
    return setContent(id, (o) => {
      for (const f of fieldsOf(o)) {
        if (f.kind === 'items') { o.items = readItems(menuEl); continue; }
        if (f.kind === 'feed') { o.feed = readFeed(menuEl); continue; }
        if (f.kind === 'list') {
          const raw = menuEl.querySelector(`[data-field="${f.key}"]`)?.value ?? '';
          const list = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
          setField(o, f.key, list.length ? list : null);
          continue;
        }
        const input = menuEl.querySelector(`[data-field="${f.key}"]`);
        if (!input) continue;
        const raw = input.value.trim();
        // A number field has to store a number: "8" would fail its own check,
        // which asks for a positive count of cells.
        setField(o, f.key, f.kind === 'number' && raw !== '' ? Number(raw) : raw);
      }
    });
  }

  /**
   * Where a feed points: a section, a tag, how many, in what order.
   *
   * The sections and their usual tags come from the site as data — the editor
   * may not read src/data any more than the engine may (hard rule 4) — so the
   * lists here are whatever `works` was handed at mount.
   */
  function feedControl(o) {
    const q = feedOf(o);
    const types = works.types ?? [];
    const suggested = q.type
      ? (types.find((t) => t.id === q.type)?.tags ?? [])
      : [...new Set(types.flatMap((t) => t.tags ?? []))];
    return `<div class="ag-feed">
      <label class="ag-menu-field">Section
        <select data-feed="type">
          <option value=""${q.type ? '' : ' selected'}>Everything</option>
          ${types.map((t) => `<option value="${escapeAttr(t.id)}"${t.id === q.type ? ' selected' : ''}>${escapeAttr(t.label)}</option>`).join('')}
        </select>
      </label>
      <label class="ag-menu-field">Only this tag — blank means all of them
        <input data-feed="tag" type="text" list="ag-work-tags" value="${escapeAttr(q.tag)}" placeholder="${escapeAttr(suggested.slice(0, 3).join(', '))}" />
      </label>
      <label class="ag-menu-field">Order
        <select data-feed="sort">
          ${Object.entries(SORTS).map(([k, label]) => `<option value="${k}"${k === q.sort ? ' selected' : ''}>${escapeAttr(label)}</option>`).join('')}
        </select>
      </label>
      <label class="ag-menu-field">How many at most — blank means all of them
        <input data-feed="limit" type="number" min="1" value="${q.limit || ''}" />
      </label>
      <label class="ag-menu-check">
        <input data-feed="chips" type="checkbox"${q.chips ? ' checked' : ''} />
        Let a visitor narrow it by tag
      </label>
      <div class="ag-menu-note">
        A feed is a question, not a list. Add a work once in <b>Works</b> and
        every feed it answers shows it.
      </div>
    </div>`;
  }
  /** The query the feed controls describe. */
  function readFeed(menuEl) {
    const val = (k) => menuEl.querySelector(`[data-feed="${k}"]`)?.value.trim() ?? '';
    const limit = Number(val('limit'));
    const out = { sort: val('sort') || 'newest' };
    if (val('type')) out.type = val('type');
    if (val('tag')) out.tag = val('tag');
    if (Number.isFinite(limit) && limit > 0) out.limit = Math.round(limit);
    // Only written down when it is the unusual answer, so a layout file stays
    // readable and a default can still change later.
    if (!menuEl.querySelector('[data-feed="chips"]')?.checked) out.chips = false;
    return out;
  }

  /**
   * The rows of a holder, edited in the panel.
   *
   * Rows are read out of the DOM on Apply, in the order they are in, so adding
   * and removing one is a DOM change and nothing is committed until you say so
   * — the same bargain as every other field here.
   */
  function itemsControl(o) {
    const rows = itemsOf(o).map((it) => itemRow(it)).join('');
    return `<div class="ag-items" data-items>${rows}</div>
      <button class="ag-menu-btn" data-act="item-add">Add one</button>
      <div class="ag-menu-note">A title shows on its own only in an accordion;
        elsewhere the words are what you see. Leave a row blank to drop it.</div>`;
  }
  function itemRow(it = {}) {
    const cell = (k, place, v) =>
      `<input data-item="${k}" type="text" placeholder="${place}"${k === 'link' ? ' list="ag-pages"' : ''} value="${escapeAttr(v ?? '')}" />`;
    return `<div class="ag-item-row" data-item-row>
      ${cell('title', 'Title', it.title)}
      ${cell('body', 'Words', it.body)}
      ${cell('link', 'Goes to', it.link)}
      ${cell('src', 'Picture', it.media?.src)}
      <button class="ag-menu-btn ag-menu-danger ag-item-x" data-act="item-del" type="button">×</button>
    </div>`;
  }
  /** Every row on screen, as objects. Blank rows are how you delete one. */
  function readItems(menuEl) {
    return [...menuEl.querySelectorAll('[data-item-row]')]
      .map((row) => {
        const val = (k) => row.querySelector(`[data-item="${k}"]`)?.value.trim() ?? '';
        return { title: val('title'), body: val('body'), link: val('link'), src: val('src') };
      })
      .filter((r) => r.title || r.body || r.link || r.src)
      .map(makeItem);
  }

  const describe = (item) =>
    device === 'narrow'
      ? (item.narrow
          ? 'Placed by hand on narrow.'
          : `Derived from its <b>${item.flow}</b> rule. Move it to place it by hand.`)
      : `Desk position. Its <b>${item.flow}</b> rule seeds narrow.`;

  /* ---- selection, and the keyboard as a second pair of hands ----
     A tile you have pressed is the selected one. A drag is right for "roughly
     there" and wrong for "one cell left", which on a 24-column board is a few
     pixels of pointer travel, so the arrow keys do the exact version of what
     the drag does approximately. `select()` and `selected()` are at the top of
     this function; the chrome holds the value, because there is one selection
     for the page and not one per board. */

  /** Move or resize the selected tile by one cell. Refused the same way a drag is. */
  function nudge(dcol, drow, resize) {
    const ids = selection().filter((id) => find(id) && !find(id).locked);
    if (!ids.length) return;
    /* A resize is one tile's; a move is the whole selection's, kept in shape.
       The same rule as the drag — dragging any member moves the lot. */
    if (resize) {
      const id = ids[0];
      const b = boxFor(id);
      const box = { col: [b.col[0], Math.max(1, b.col[1] + dcol)], row: [b.row[0], Math.max(1, b.row[1] + drow)] };
      if (!boxOk(layout, id, box, device)) return toast('No room there');
      const first = device === 'narrow' && !find(id).narrow;
      const step = setBox(id, box);
      if (first) toast(`${id} now has its own narrow position`, undoOf(step));
      return;
    }
    const moves = ids.map((id) => {
      const b = boxFor(id);
      return { id, box: { col: [b.col[0] + dcol, b.col[1]], row: [b.row[0] + drow, b.row[1]] } };
    });
    if (!boxesOk(layout, moves, device)) return toast('No room there');
    const step = setBoxes(moves);
    if (moves.length > 1) toast(`Moved ${moves.length}`, undoOf(step));
  }

  /* ---- walking the selection by keyboard ----
     Bureau's decision 70: the arrows do not introduce a second idea of "the
     current tile" — they move the selection, which already draws itself. Here
     the plain arrows already NUDGE, because that is what every drawing program
     does with them and it is documented; so walking is Tab in reading order,
     and Alt+arrow spatially, with Bureau's rule — nearest in the direction
     pressed, weighing distance ACROSS the axis double, so Right from a tall
     tile finds the thing beside it and not the thing three rows down that
     happens to be marginally closer. With nothing selected, any of them
     selects the first tile, so the keyboard can get started at all. */
  const centre = (r) => ({ x: r._col + r._span / 2, y: r._row + r._rowSpan / 2 });
  const inOrder = () => placed().filter((r) => el(r.id)).sort((a, b) => a._row - b._row || a._col - b._col);
  function walkSelection(dir, add = false) {
    const tiles = inOrder();
    if (!tiles.length) return;
    const cur = selected() && tiles.find((t) => t.id === selected());
    let next = null;
    if (!cur) next = tiles[0];
    else if (dir === 'next' || dir === 'prev') {
      const i = tiles.indexOf(cur);
      next = tiles[(i + (dir === 'next' ? 1 : tiles.length - 1)) % tiles.length];
    } else {
      const from = centre(cur);
      const [dx, dy] = ARROWS[dir];
      let best = null, bestScore = Infinity;
      for (const t of tiles) {
        if (t === cur) continue;
        const to = centre(t);
        const along = (to.x - from.x) * dx + (to.y - from.y) * dy;   // forward distance
        if (along <= 0) continue;                                    // behind, or level
        const across = Math.abs((to.x - from.x) * dy) + Math.abs((to.y - from.y) * dx);
        const score = along + across * 2;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      next = best;
    }
    if (!next) return;
    select(next.id, { add });
    el(next.id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * A copy of an object, in the first free room.
   *
   * Five plaques that differ by two words is the ordinary case on this site,
   * and building each from the picker and retyping it is the slow way to say
   * it. Only a typed object can be copied — a `slot` IS the page's markup, and
   * a second copy of it would refer to markup that does not exist.
   */
  function duplicate(id) {
    const e = find(id);
    if (!e) return;
    if (!isTyped(e)) return toast('That one is drawn by the page itself, so there is nothing to copy');
    const b = boxFor(id);
    const copy = structuredClone(e);
    copy.id = uniqueId(e.kind ?? 'copy');
    delete copy.desk; delete copy.narrow;
    if (device === 'narrow') {
      copy.narrow = freeSpot(layout, [b.col[1], b.row[1]], 'narrow', copy.id);
      copy.desk = freeSpot(layout, [e.desk.col[1], e.desk.row[1]], 'desk', copy.id);
    } else {
      copy.desk = freeSpot(layout, [b.col[1], b.row[1]], 'desk', copy.id);
    }
    layout.elements.push(copy);
    const problems = validateLayout(layout, name);
    if (problems.length) {
      layout.elements.pop();
      return toast(problems[0].replace(/^[^:]+: /, ''));
    }
    const step = pushUndo({ kind: 'add', id: copy.id });
    mountTile(copy);
    commit();
    select(copy.id);
    toast(`${copy.id} — a copy of ${id}`, undoOf(step));
  }

  /* ---- keyboard ---- */

  const ARROWS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  function onKey(e) {
    if (chrome.activeName() !== name) return;
    if (e.key === 'Escape') {
      if (editing) { endEdit(false); return; }
      chrome.closeMenu();
      return;
    }
    if (e.target.matches('input,textarea,select')) return;
    // Inside a live text edit every key is a keystroke. Without this, typing
    // the letter d in an email address would flip the device tab.
    if (editing) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); endEdit(true); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      return e.shiftKey ? redoLast() : undoLast();
    }
    if (e.key === 'l' || e.key === 'L') { chrome.setLocked(!locked()); return; }
    if (locked()) return;

    /* Choosing by keyboard: Tab walks the board in reading order, Alt+arrow
       walks it spatially, ⌘A takes the lot. Any of them with nothing selected
       selects the first tile. */
    if (e.key === 'Tab') { e.preventDefault(); return walkSelection(e.shiftKey ? 'prev' : 'next'); }
    if (e.altKey && ARROWS[e.key]) { e.preventDefault(); return walkSelection(e.key, e.shiftKey); }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      return select(inOrder().filter((r) => !find(r.id)?.locked).map((r) => r.id));
    }

    const sel = selected();
    if (!sel) {
      if (ARROWS[e.key]) { e.preventDefault(); walkSelection('next'); }
      return;
    }

    /* The exact versions of the gestures. Shift resizes rather than moves,
       which is the same pairing every drawing program makes. */
    const step = ARROWS[e.key];
    if (step) { e.preventDefault(); return nudge(step[0], step[1], e.shiftKey); }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault(); return duplicate(sel);
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      return e.shiftKey ? ungroup(sel) : group(selection());
    }
    /* The two panels, without the hold. A hold is the only way a phone has to
       ask for them; a desk should not have to imitate one. */
    const at = () => {
      const r = el(sel)?.getBoundingClientRect();
      return r ? [r.left + r.width / 2, r.top + 8] : [window.innerWidth / 2, 120];
    };
    if (e.key === 'Enter') { e.preventDefault(); return openObjectMenu(sel, ...at()); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); return openObjectEditor(sel); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const gone = selection();
      select(null);
      return gone.length > 1 ? removeAll(gone) : remove(sel);
    }
  }

  /**
   * Follow the width. The grid is container-queried, so the board on screen
   * IS one of the two stored layouts — and the one on screen is the one an
   * edit should land in. A window dragged across the breakpoint switches which
   * layout you are arranging, which is the whole of the old toggle.
   */
  function syncDevice() {
    const next = deviceNow();
    if (next === device) return false;
    device = next;
    toast(`Now arranging the ${device === 'narrow' ? 'narrow' : 'wide'} layout`);
    return true;
  }
  const ro = new ResizeObserver(() => { if (syncDevice()) paint(); else paintChecker(); });
  ro.observe(root);

  /* ---- chrome ---- */

  chrome.register(name, {
    root,
    isChrome,
    getDevice: () => device,
    markActive: (on) => root.classList.toggle('ag-active', on),
    getLayout: () => layout,
    getPending: () => pending,
    // The chrome holds the one selection and calls this on whichever board is
    // losing it as well as the one gaining it.
    paintSelection,
    isDirty: () => JSON.stringify(layout) !== baselineJson,
    undo: undoLast,
    redo: redoLast,
    board: () => ({ columns: layout.columns, narrowColumns: layout.narrowColumns,
      gap: layout.gap, rows: layout.rows, narrowRows: layout.narrowRows, sticky: layout.sticky === true,
      title: layout.title ?? '', description: layout.description ?? '', image: layout.image ?? '' }),
    setBoard: (patch) => {
      const before = structuredClone(layout);
      Object.assign(layout, patch);
      for (const k of ['rows', 'narrowRows', 'title', 'description', 'image']) if (layout[k] === '' || layout[k] == null) delete layout[k];

      /* A coarser grid can leave objects hanging off the right-hand edge —
         #socials spans ten columns and cannot sit on a board eight wide. That
         is exactly the case where things HAVE to move, so this is where the
         repack earns its keep: keep sizes, keep reading order, walk them top
         to bottom and let the board grow downward. Only if that still cannot
         be made legal is the change refused. */
      let repacked = 0;
      if (validateLayout(layout, name).length) {
        for (const dev of ['desk', 'narrow']) {
          const cols = columnsFor(layout, dev);
          for (const e of layout.elements) {
            const box = e[dev];
            if (box && box.col[1] > cols) { box.col = [1, cols]; repacked++; }
          }
          for (const [id, box] of packLayout(layout, dev)) {
            const e = find(id);
            if (!e) continue;
            if (dev === 'narrow' && !e.narrow) continue;   // still seeded by flow
            if (JSON.stringify(e[dev]) !== JSON.stringify(box)) { e[dev] = box; repacked++; }
          }
        }
      }
      const problems = validateLayout(layout, name);
      if (problems.length) {
        for (const k of Object.keys(layout)) delete layout[k];
        Object.assign(layout, before);
        return toast(problems[0].replace(/^[^:]+: /, ''));
      }
      if (repacked) toast(`${repacked} object${repacked > 1 ? 's' : ''} moved to fit the new grid`);
      commit();
      const px = Math.round(root.querySelector('.ag-grid')?.getBoundingClientRect().width / layout.columns);
      toast(`Board changed — ${layout.columns} across, about ${px}px a piece`);
    },
    tidy: () => {
      const boxes = packLayout(layout, device);
      const moves = [];
      for (const [id, box] of boxes) {
        const cur = find(id)?.[device];
        if (!cur || cur.col[0] !== box.col[0] || cur.row[0] !== box.row[0]) moves.push({ id, box });
      }
      if (!moves.length) return toast('Already tidy');
      const step = setBoxes(moves);
      toast(`Tidied ${moves.length} object${moves.length > 1 ? 's' : ''} on ${device}`, undoOf(step));
    },
    /* A feed shows the catalogue, so editing the catalogue changes what is on
       the board without anything on the board having been touched. */
    repaintFeeds: () => {
      // A feed's words come from the catalogue, not from the object, so its
      // content hash does not change when the catalogue does. Forget them all
      // and let paint() draw them again.
      for (const e of layout.elements) if (has(e, 'feed')) drawnFrom.delete(e.id);
      paint();
    },
    onLock: () => { if (editing) endEdit(true); paint(); },
    resync: () => { syncDevice(); paint(); },
    afterPublish: () => {
      for (const { previewUrl } of pending.values()) URL.revokeObjectURL(previewUrl);
      pending.clear();
      baselineJson = JSON.stringify(layout);
      try { localStorage.removeItem(`doppelganger.layout.${name}`); } catch { /* ignore */ }
    },
  });

  /* What the build drew, so the first paint() does not redraw every typed
     tile: the page's own markup carries a sized srcset the preview resolver
     does not, and throwing it away on mount would fetch every original. A
     tile whose draft content differs from what was built IS redrawn, which is
     what a restored draft needs. */
  for (const e of normalizeLayout(published ?? initial).elements ?? []) {
    if (isTyped(e) && el(e.id)) drawnFrom.set(e.id, JSON.stringify(contentOf(e)));
  }

  grid.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  grid.addEventListener('contextmenu', onContext);
  grid.addEventListener('dblclick', onDblClick);
  grid.addEventListener('paste', onPaste);
  grid.addEventListener('dragover', allowDrop);
  grid.addEventListener('drop', onDrop);
  grid.addEventListener('dragleave', (e) => { if (!grid.contains(e.relatedTarget)) markDrop(null); });
  // A file drag abandoned outside the window fires neither `drop` nor, in every
  // browser, `dragleave` — and the green ring stayed on the tile.
  grid.addEventListener('dragend', () => markDrop(null));
  grid.addEventListener('pointerdown', onCellDown);
  window.addEventListener('pointermove', onSketchMove);
  window.addEventListener('pointerup', onSketchUp);

  /* ---- the touch policy, which is a predicate and not a CSS property ----
     `touch-action: pinch-zoom` on the board used to stand in for all of this.
     It cost one-finger scrolling outright, and on iOS it buys two-finger ZOOM
     rather than two-finger PAN on an unzoomed page — which is why scrolling
     with two fingers barely answered. Bureau never sets touch-action at all.
     It leaves the page scrolling as a page scrolls and takes the finger only
     once it knows it has a gesture, which is what these two listeners are.
     The hold is what makes it work: the finger has been still for 300ms, so no
     native scroll has begun, and `preventDefault` can still stop one from
     starting. Once scrolling is under way the call is ignored — which is also
     why the hold cannot get much longer than it is. */
  grid.addEventListener('touchstart', (e) => {
    if (locked()) return;
    // Two fingers is never a drag. Hand the gesture straight back to the
    // browser so the page scrolls, rather than holding a half-started one.
    if (e.touches.length > 1) onCancel();
  }, { passive: true });
  grid.addEventListener('touchmove', (e) => {
    if (dragArmed() && e.cancelable) e.preventDefault();
  }, { passive: false });

  /* A gesture the page never hears the end of: the tab goes to the background
     mid-drag, or the window loses focus to a file picker. Both used to leave
     the tile lifted. */
  const onHide = () => { if (document.hidden) onCancel(); };
  window.addEventListener('blur', onCancel);
  document.addEventListener('visibilitychange', onHide);
  // With a header, a page and a footer all on one screen there are three grids
  // and one bar. Touching a grid is what makes it the one the bar acts on.
  grid.addEventListener('pointerdown', () => chrome.setActive(name), true);
  // Clicking anywhere outside the tile being written in keeps the change — the
  // same bargain as a spreadsheet cell, and the reason there is no Save button.
  document.addEventListener('pointerdown', (e) => {
    if (editing && !editing.tile.contains(e.target)) endEdit(true);
  });
  window.addEventListener('keydown', onKey);
  /* While arranging you are not browsing. Half these tiles are links, and a
     drag ends with a click the browser sends anyway — without this, moving the
     home icon also navigates home and the editor is gone along with the
     arrangement. Locked, the site is the site, and links do what links do. */
  grid.addEventListener('click', (e) => {
    if (locked()) return;
    const link = e.target.closest('a[href]');
    if (link && grid.contains(link)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  grid.addEventListener('dragstart', (e) => { if (!locked()) e.preventDefault(); });

  paint();

  return {
    get layout() { return layout; },
    destroy() {
      ro.disconnect();
      grid.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      grid.removeEventListener('contextmenu', onContext);
      grid.removeEventListener('dblclick', onDblClick);
      grid.removeEventListener('paste', onPaste);
      grid.removeEventListener('dragover', allowDrop);
      grid.removeEventListener('drop', onDrop);
      grid.removeEventListener('pointerdown', onCellDown);
      window.removeEventListener('pointermove', onSketchMove);
      window.removeEventListener('pointerup', onSketchUp);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('keydown', onKey);
      chrome.unregister(name);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Chrome: one bar, one lock, one look, for every grid on the page
 * ------------------------------------------------------------------ */

/**
 * There is one bar, not one per grid.
 *
 * A page has a header, a body and a footer, and each is its own grid running
 * its own editor. Three bars stacked at the bottom of the screen would be
 * absurd, and worse, ambiguous — "Publish" would need to say which grid it
 * meant. So the chrome is a singleton every editor registers with; the lock
 * and the look are site-wide and live here; and Publish sends every grid that
 * changed, every picked image and any new page as ONE commit.
 */
let CHROME = null;
export const sharedChrome = (look, pages, works, site) => (CHROME ??= buildChrome(look, pages, works, site));

function buildChrome(lookInitial, pages = [], worksInitial = { types: {}, works: [] }, site = {}) {
  const bar = document.createElement('div');
  bar.className = 'ag-bar';
  document.body.appendChild(bar);

  const menu = document.createElement('div');
  menu.className = 'ag-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  const toastEl = document.createElement('div');
  toastEl.className = 'ag-toast';
  toastEl.hidden = true;
  document.body.appendChild(toastEl);

  /* Every page there is, offered to every field that asks where to go. A
     drawer's page and a button's destination are nearly always a page on this
     site, and a mistyped one is a 404 nothing catches until a visitor does. */
  const pageOptions = document.createElement('datalist');
  pageOptions.id = 'ag-pages';
  pageOptions.innerHTML = (pages ?? [])
    .map((p) => `<option value="${escapeAttr(p.path)}">${escapeAttr(p.title)}</option>`)
    .join('');
  document.body.appendChild(pageOptions);

  /** Every layout file there is, for the working page list. */
  const pageList = pages;

  /** name -> the editor's api. */
  const editors = new Map();
  let activeName = null;

  /**
   * Say something — and, if it was a change, offer the way back on the toast.
   *
   * A phone has no ⌘Z, and a toast that said "⌘Z puts it back" was talking to
   * a device with no ⌘. Bureau's toast carries its own Undo (its mutations.js),
   * and it is pinned to the move that was on top when the words were written:
   * the link used to call a bare undo(), which takes whatever is on top NOW,
   * so a toast still on screen after something else had changed undid the
   * newer thing and left the one you were looking at where it was. So `undo`
   * is a closure the editor hands over, and it checks its own step is still on
   * top before it does anything.
   */
  let toastTimer = null;
  let toastUndo = null;
  const toast = (msg, undo = null) => {
    toastUndo = typeof undo === 'function' ? undo : null;
    toastEl.textContent = msg;
    if (toastUndo) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ag-toast-undo';
      btn.textContent = 'Undo';
      toastEl.appendChild(btn);
    }
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    // Long enough to read and reach for; a toast with a button is one you may
    // want to press.
    toastTimer = setTimeout(() => { toastEl.hidden = true; toastUndo = null; }, toastUndo ? 5200 : 3200);
  };
  toastEl.addEventListener('click', (e) => {
    if (!e.target.closest('.ag-toast-undo')) return;
    const fn = toastUndo;
    toastEl.hidden = true; toastUndo = null; clearTimeout(toastTimer);
    fn?.();
  });

  const active = () => editors.get(activeName);

  /* ---- the lock ---- */

  // ?edit=1 is a request to edit, so the first visit lands unlocked. After
  // that it is whatever you left it, because you may have locked it to look.
  let isLocked = false;
  try { isLocked = localStorage.getItem(LOCK_KEY) === 'true'; } catch { /* ignore */ }
  const applyLock = () => {
    document.documentElement.classList.add('ag-editing');
    document.documentElement.classList.toggle('ag-unlocked', !isLocked);
  };
  function setLocked(v) {
    isLocked = !!v;
    try { localStorage.setItem(LOCK_KEY, String(isLocked)); } catch { /* ignore */ }
    applyLock();
    /* A highlight made while locked — where nothing refuses a selection,
       because locked is the site as a visitor sees it — was still on the screen
       the moment you unlocked, and the browser goes on extending an existing
       selection under the finger. Which is exactly what a hold feels like. */
    dropSelection();
    closeMenu();
    for (const e of editors.values()) e.onLock?.(isLocked);
    markBoards();
    render();
    toast(isLocked ? 'Locked — this is the site as a visitor sees it' : 'Unlocked — arrange, write, add');
  }
  applyLock();

  /* ---- the browser's own gestures, which fight the hold ----

     CSS turns the document off as a selectable surface while unlocked, but CSS
     is not the whole story: a selection can still be STARTED on something the
     rules missed, and once it exists the browser extends it through everything
     under the finger — which is what a hold-to-pick-up feels like from the
     outside. So the gestures themselves are refused at the document, where
     they begin, and only where you are not actually writing.

     `dragstart` was already refused, but only inside a grid; a picture in a
     panel, or a link in the bar, still started a native drag. */
  const writing = (target) => {
    const node = target?.nodeType === 3 ? target.parentElement : target;
    return node?.closest?.('input, textarea, select, [contenteditable="true"]') ?? null;
  };
  /**
   * Drop whatever is highlighted, unless it is highlighted inside a field.
   *
   * Refusing `selectstart` stops a NEW selection and does nothing about one
   * that already exists — Safari keeps a highlight, and the callout that goes
   * with it, from a press two gestures ago. Exported to the editors because
   * `pointerdown` is not the only moment worth calling it: **iOS begins its own
   * selection during the press**, after `pointerdown` has already fired, so the
   * hold has to drop it again when it arms. Bureau's `dropSelection()`, called
   * from both places for the same reason (its decision 52).
   */
  function dropSelection() {
    const active = document.activeElement;
    if (active?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  }
  document.addEventListener('selectstart', (e) => {
    if (!isLocked && !writing(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (!isLocked && !writing(e.target)) e.preventDefault();
  });
  // A selection made before you unlocked — or by a stray gesture the rules did
  // not catch — is still live, and the next press extends it instead of picking
  // the tile up. Pressing anywhere that is not a field starts clean.
  document.addEventListener('pointerdown', (e) => {
    if (isLocked || writing(e.target)) return;
    dropSelection();
  }, true);

  /* ---- the selection: one for the page, not one per board ---- */

  /**
   * Which object is selected, and on which board.
   *
   * It lives here because a page mounts three editors and there is only one
   * selection — see the note in mountEditor. Changing it repaints the board
   * losing it as well as the board gaining it, so two tiles can never wear the
   * accent ring at once.
   */
  /* A SET, on one board, with a primary — Bureau's `S.sel`. The primary is the
     one the keyboard's Enter, E and Delete act on and the one a drag is
     anchored to; the set is what moves together and what Delete removes. A
     selection never spans boards: a group drag across two grids has nowhere to
     land. */
  let selection = { board: null, ids: [] };
  const selectedOn = (board) => (selection.board === board ? selection.ids[0] ?? null : null);
  const selectionOn = (board) => (selection.board === board ? selection.ids.slice() : []);
  /**
   * @param ids  one id, an array, or null to clear
   * @param add  keep what was selected on this board and add to it
   * @param toggle  flip membership instead of setting it — shift-click
   */
  function select(board, ids, { add = false, toggle = false } = {}) {
    const want = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
    let next;
    if (!want.length) next = [];
    else if (toggle && selection.board === board) {
      next = selection.ids.slice();
      for (const id of want) {
        const i = next.indexOf(id);
        if (i >= 0) next.splice(i, 1); else next.push(id);
      }
    } else if (add && selection.board === board) {
      next = [...new Set([...selection.ids, ...want])];
    } else next = [...new Set(want)];

    const was = selection.board;
    const same = was === (next.length ? board : null)
      && next.length === selection.ids.length && next.every((id, i) => id === selection.ids[i]);
    if (same) return;
    selection = next.length ? { board, ids: next } : { board: null, ids: [] };
    if (was && was !== board) editors.get(was)?.paintSelection?.();
    editors.get(board)?.paintSelection?.();
  }

  /* ---- the look ---- */

  let publishedLook = normalizeLook(lookInitial);
  let look = publishedLook;
  try {
    const draft = localStorage.getItem(LOOK_KEY);
    if (draft) look = normalizeLook(JSON.parse(draft));
  } catch { /* ignore */ }
  const lookDirty = () => JSON.stringify(look) !== JSON.stringify(publishedLook);
  function applyLook() {
    const st = document.documentElement.style;
    for (const [k, v] of Object.entries(tokensFor(look))) st.setProperty(k, v);
    document.body.classList.toggle('look-tilt', !!look.tilt);
  }
  function setLook(patch) {
    const next = normalizeLook({ ...look, ...patch });
    const problems = validateLook(next);
    if (problems.length) return toast(problems[0]);
    look = next;
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ }
    applyLook();
    render();
  }
  applyLook();

  /* ---- the works: the site's catalogue, edited like the look ---- */

  /**
   * What has been made, as opposed to what is on a page.
   *
   * It is site-wide, like the look, so it lives here rather than on one board,
   * and it publishes in the same commit as everything else. A draft is kept in
   * this browser between visits for exactly the reason a layout draft is: a
   * catalogue is typed in over several sittings.
   */
  let publishedWorks = worksInitial;
  let worksNow = publishedWorks;
  try {
    const draft = localStorage.getItem(WORKS_KEY);
    if (draft) {
      const parsed = JSON.parse(draft);
      if (!validateWorks(parsed).length) worksNow = parsed;
    }
  } catch { /* ignore */ }
  const worksDirty = () => JSON.stringify(worksNow) !== JSON.stringify(publishedWorks);

  function setWorks(next) {
    const problems = validateWorks(next);
    if (problems.length) { toast(problems[0].replace(/^[^:]+: /, '')); return false; }
    worksNow = next;
    try { localStorage.setItem(WORKS_KEY, JSON.stringify(worksNow)); } catch { /* ignore */ }
    // Every feed on the page is now showing something out of date.
    for (const e of editors.values()) e.repaintFeeds?.();
    renderTagList();
    render();
    return true;
  }

  /* Suggested tags, offered to every place a tag is typed — the feed's filter
     and a work's own row. Rebuilt whenever the catalogue changes, because a
     tag you invented five minutes ago should be offered the next time. */
  const tagOptions = document.createElement('datalist');
  tagOptions.id = 'ag-work-tags';
  document.body.appendChild(tagOptions);
  function renderTagList() {
    const fromTypes = typesOf(worksNow).flatMap((t) => t.tags ?? []);
    const fromWorks = worksOf(worksNow).flatMap((w) => (Array.isArray(w.tags) ? w.tags : []));
    const all = [...new Set([...fromTypes, ...fromWorks].map((t) => String(t).trim()).filter(Boolean))].sort();
    tagOptions.innerHTML = all.map((t) => `<option value="${escapeAttr(t)}"></option>`).join('');
  }
  renderTagList();

  /**
   * The catalogue, as rows.
   *
   * One line per work — what it is called, which section it is in, what it is
   * tagged, when, and where it lives. The same shape as a holder's items, for
   * the same reason: a row you can read across is how a list of forty things
   * stays checkable, and nothing is committed until Apply.
   */
  function openWorks() {
    const types = typesOf(worksNow);
    const rows = worksOf(worksNow).map((w) => workRow(w, types)).join('');
    openMenu(null, null, `
      <div class="ag-menu-title">Works <span class="ag-menu-kind">${worksOf(worksNow).length} in the catalogue</span></div>
      <div class="ag-menu-note">
        Everything you have made, written down once. A <b>section</b> is where
        it lives; <b>tags</b> are everything else true about it — what you did
        on it, what form it took. Any feed that matches a work shows it, so
        adding it here puts it on every page it belongs on.
      </div>
      <div class="ag-works-rows" data-works>${rows}</div>
      <button class="ag-menu-btn ag-menu-new" data-act="work-add">Add a work<small>Or press it and fill the row in</small></button>
      <div class="ag-menu-actions">
        <button class="ag-menu-btn" data-act="works-apply">Apply</button>
        <button class="ag-menu-btn" data-act="close">Done</button>
      </div>
      <div class="ag-menu-note">Saved to <code>${WORKS_PATH}</code> when you publish.</div>
    `, (act, _v, menuEl) => {
      if (act === 'work-add') {
        menuEl.querySelector('[data-works]')?.insertAdjacentHTML('beforeend', workRow({}, types));
        return;
      }
      if (act !== 'works-apply') return;
      const next = { ...worksNow, works: readWorks(menuEl) };
      if (setWorks(next)) toast(`${next.works.length} work${next.works.length === 1 ? '' : 's'} — publish to commit them`);
    }, { wide: true });
  }

  function workRow(w, types) {
    const v = (k) => escapeAttr(w?.[k] ?? '');
    return `<div class="ag-work-row" data-work-row>
      <input data-w="title" type="text" placeholder="Title" value="${v('title')}" />
      <select data-w="type">
        ${types.map((t) => `<option value="${escapeAttr(t.id)}"${t.id === w?.type ? ' selected' : ''}>${escapeAttr(t.label)}</option>`).join('')}
      </select>
      <input data-w="tags" type="text" list="ag-work-tags" placeholder="Tags, comma separated"
             value="${escapeAttr((Array.isArray(w?.tags) ? w.tags : []).join(', '))}" />
      <input data-w="year" type="number" placeholder="Year" value="${v('year')}" />
      <input data-w="link" type="text" list="ag-pages" placeholder="Where it lives" value="${v('link')}" />
      <input data-w="blurb" type="text" placeholder="A line about it" value="${v('blurb')}" />
      <input data-w="id" type="hidden" value="${v('id')}" />
      <button class="ag-menu-btn ag-menu-danger ag-item-x" data-act="work-del" type="button" title="Remove">×</button>
    </div>`;
  }

  /** Every row on screen, as works. A row with no title is how you delete one. */
  function readWorks(menuEl) {
    const taken = new Set();
    return [...menuEl.querySelectorAll('[data-work-row]')]
      .map((row) => {
        const val = (k) => row.querySelector(`[data-w="${k}"]`)?.value.trim() ?? '';
        const title = val('title');
        if (!title) return null;
        // An id is how a work is addressed, so it is kept once it exists — a
        // renamed work must not become a different work.
        let id = val('id') || slugify(title) || 'work';
        while (taken.has(id)) id = id.replace(/-(\d+)$/, (_, n) => `-${+n + 1}`).replace(/^([^-].*[^0-9-])$/, '$1-2');
        taken.add(id);
        const year = Number(val('year'));
        const out = { id, title, type: val('type') || typesOf(worksNow)[0]?.id || '' };
        const tags = val('tags').split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length) out.tags = tags;
        if (Number.isInteger(year) && year > 0) out.year = year;
        if (val('blurb')) out.blurb = val('blurb');
        if (val('link')) out.link = val('link');
        return out;
      })
      .filter(Boolean);
  }

  /* ---- which build this is, and whether the live one has caught up ----

     The version IS the commit count, as 0.NN — scripts/version.mjs, Bureau's
     scheme. The bar shows the build this page came from; pressing it asks the
     site what is live now. Those two differ exactly when something has been
     published and rebuilt since the page was loaded, which is the one question
     a publish leaves you with: *did it land?*

     Publish itself then watches for it. A commit takes about a minute to
     become a deploy, and before this the only way to find out was to keep
     reloading — so the bar polls /version.json until the number moves past the
     one this page was built from, and says so when it does. */
  const BUILD = site.build ?? null;
  const versionUrl = `${site.base ?? '/'}/version.json`.replace(/\/{2,}/g, '/');
  let live = null;                 // the build the site is serving, once asked

  async function askLive() {
    const res = await fetch(`${versionUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`the site said ${res.status}`);
    return res.json();
  }

  /** Press the version: what is live, and is it this? */
  async function checkLive() {
    if (!BUILD) return toast('This page carries no build stamp');
    toast('Asking the site…');
    try {
      live = await askLive();
      render();
      if (live.build === BUILD.build) return toast(`Live is ${live.version} — this page is up to date`);
      if (live.build > BUILD.build) return toast(`Live is ${live.version}; this page is ${BUILD.version} — reload to see it`);
      toast(`Live is still ${live.version}; this page is ${BUILD.version}`);
    } catch (err) {
      toast(`Could not reach ${versionUrl} — ${err.message}`);
    }
  }

  /**
   * Watch for the build to land after publishing.
   *
   * A commit is not a deploy: the Action takes about a minute, and "the site
   * rebuilds in about a minute" was the whole of what the editor could tell
   * you. Poll until the number moves past the one this page was built from,
   * then say so. Bounded, because a failed Action must not leave this running
   * for the life of the tab — and because a silence that goes on forever is
   * indistinguishable from one that is about to end.
   */
  let watching = null;
  function watchForDeploy() {
    if (!BUILD) return;
    clearInterval(watching);
    const from = BUILD.build;
    const until = Date.now() + 5 * 60 * 1000;
    watching = setInterval(async () => {
      try {
        const now = await askLive();
        live = now;
        render();
        if (now.build > from) {
          clearInterval(watching); watching = null;
          toast(`Live now — ${now.version} is up`);
        } else if (Date.now() > until) {
          clearInterval(watching); watching = null;
          toast(`Still ${now.version} after five minutes — check the Actions tab`);
        }
      } catch {
        if (Date.now() > until) { clearInterval(watching); watching = null; }
      }
    }, 15000);
  }

  /* ---- files waiting to be committed that are not images: new pages ---- */
  const files = new Map();   // path -> text
  const addFile = (path, text) => { files.set(path, text); render(); };

  function register(name, api) {
    editors.set(name, api);
    /* The page wins by default, not whichever grid's script happened to run
       first. You opened a page to work on it; the header and the footer are
       around it. Registration order used to decide this and it moved when the
       markup did, which is no way to pick. */
    if (!activeName || (editors.get(activeName)?.isChrome && !api.isChrome)) activeName = name;
    markBoards();
    render();
  }
  /** The active board wears the highlight, because there is no tab to wear it. */
  const markBoards = () => {
    for (const [n, e] of editors) e.markActive?.(n === activeName);
  };
  function unregister(name) {
    editors.delete(name);
    if (activeName === name) activeName = editors.keys().next().value ?? null;
    render();
  }
  function setActive(name) {
    if (name === activeName || !editors.has(name)) return;
    activeName = name;
    closeMenu();
    markBoards();
    render();
  }

  /** Grid names in the order they appear on the page, not the order they mounted in. */
  function orderedNames() {
    return [...editors.entries()]
      .sort(([, a], [, b]) => {
        if (!a.root || !b.root) return 0;
        const rel = a.root.compareDocumentPosition(b.root);
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      })
      .map(([n]) => n);
  }

  /** Everything that would go in a commit right now. */
  function gather() {
    const out = [];
    for (const [n, e] of editors) {
      if (e.isDirty()) out.push({ path: pathFor(n), text: JSON.stringify(e.getLayout(), null, 2) + '\n' });
      for (const { path, base64 } of e.getPending().values()) out.push({ path, base64 });
    }
    for (const [path, text] of files) out.push({ path, text });
    if (lookDirty()) out.push({ path: LOOK_PATH, text: JSON.stringify(look, null, 2) + '\n' });
    if (worksDirty()) out.push({ path: WORKS_PATH, text: JSON.stringify(worksNow, null, 2) + '\n' });
    return out;
  }

  function render() {
    const a = active();
    bar.hidden = !a;
    if (!a) return;
    const d = a.getDevice();
    const names = orderedNames();
    const waiting = gather();
    const images = waiting.filter((f) => f.base64).length;
    // The two site-wide files are counted by name, not as layouts — otherwise
    // changing only the catalogue reported "1 layout · works waiting", which
    // names a file that has not changed and would send you looking for it.
    const SITE_FILES = new Set([LOOK_PATH, WORKS_PATH]);
    const layouts = waiting.filter((f) => f.text && !SITE_FILES.has(f.path)).length;
    bar.innerHTML = `
      <button class="ag-lock${isLocked ? ' on' : ''}" data-bar="lock"
        title="${isLocked ? 'Locked — the site as a visitor sees it. Press to arrange.' : 'Unlocked — arranging. Press to see the site as it is.'}"
        aria-pressed="${isLocked}">${isLocked ? '🔒' : '🔓'}</button>
      <span class="ag-where">${escapeAttr(activeName)}${d === 'narrow' ? ' · narrow' : ''}</span>
      <span class="ag-hint">${isLocked
        ? 'locked · press the padlock to arrange'
        : 'hold or drag bare board to add · hold a tile for its menu · arrows nudge · E edits'}</span>
      ${waiting.length ? `<span class="ag-pending" title="Not committed until you publish">${[
        layouts ? `${layouts} layout${layouts > 1 ? 's' : ''}` : '',
        images ? `${images} image${images > 1 ? 's' : ''}` : '',
        lookDirty() ? 'look' : '',
        worksDirty() ? 'works' : '',
      ].filter(Boolean).join(' · ')} waiting</span>` : ''}
      <button data-bar="pages" title="Every page on the site">Pages</button>
      <button data-bar="board" title="This board's grid">Board</button>
      <button data-bar="works" title="Everything you have made">Works</button>
      <button data-bar="look" title="The site's look">Look</button>
      ${BUILD ? `<button class="ag-version${live && live.build > BUILD.build ? ' ag-behind' : ''}" data-bar="version"
        title="Build ${escapeAttr(BUILD.version)} · ${escapeAttr(BUILD.sha)}${live ? ` · live is ${escapeAttr(live.version)}` : ''} — press to ask the site what is live"
        >v${escapeAttr(BUILD.version)}${live && live.build > BUILD.build ? ' ↑' : ''}</button>` : ''}
      <button data-bar="undo" title="⌘Z">Undo</button>
      <button data-bar="redo" title="⌘⇧Z">Redo</button>
      <button data-bar="publish" class="ag-publish"${waiting.length ? '' : ' disabled'}>Publish…</button>
      <button data-bar="leave" class="ag-leave" title="Leave edit mode and see the site as a visitor does">Done</button>
    `;
  }

  /* ---- the look panel ---- */

  function openLook() {
    const swatch = (key, label, value) =>
      `<label>${label}<input type="color" data-look="${key}" value="${escapeAttr(value)}" /></label>`;
    openMenu(window.innerWidth / 2 - 170, window.innerHeight / 2 - 190, `
      <div class="ag-menu-title">Look</div>
      <div class="ag-menu-note">The whole site is dressed in these. Every face and the chrome derive their tints from them.</div>
      <div class="ag-menu-swatches">
        ${swatch('bg', 'Page', look.bg)}
        ${swatch('ink', 'Ink', look.ink)}
        ${swatch('accent', 'Accent', look.accent)}
        ${swatch('board.0', 'Board', look.board[0])}
        ${swatch('board.1', 'Board alt', look.board[1])}
      </div>
      <label class="ag-menu-row">Type
        <select data-look="font">
          <option value="serif"${look.font === 'serif' ? ' selected' : ''}>Book face (EB Garamond)</option>
          <option value="display"${look.font === 'display' ? ' selected' : ''}>Display face (Amatic SC)</option>
        </select>
      </label>
      <label class="ag-menu-check"><input type="checkbox" data-look="tilt"${look.tilt ? ' checked' : ''} /> Pinned — every tile leans a little</label>
      <div class="ag-menu-note">Saved to <code>${LOOK_PATH}</code> when you publish.</div>
    `, null);
    menu.addEventListener('input', onLookInput);
    menu.addEventListener('change', onLookInput);
  }
  function onLookInput(e) {
    const t = e.target.closest('[data-look]');
    if (!t) return;
    const key = t.dataset.look;
    const patch = {};
    if (key.startsWith('board.')) {
      const board = [...look.board]; board[+key.slice(6)] = t.value; patch.board = board;
    } else if (key === 'tilt') patch.tilt = t.checked;
    else patch[key] = t.value;
    setLook(patch);
  }

  /* ---- the board: this grid's own geometry ---- */

  /**
   * How big a cell is, said in the only unit that means anything: how many fit
   * across. The board fills its container, so more columns is a finer grid and
   * a smaller piece — and the px figure is what that works out to right now.
   */
  function openBoard() {
    const a = active();
    if (!a) return;
    const b = a.board();
    /* A board's height is stored per device, and this panel only ever offered
       the desk one — so on a phone the field said `rows`, wrote `rows`, and
       the narrow height it was showing you could not be set at all. It edits
       whichever height belongs to the board in front of you. */
    const narrow = a.getDevice() === 'narrow';
    const heightKey = narrow ? 'narrowRows' : 'rows';
    const where = narrow ? 'narrow' : 'desk';
    const px = (cols) => {
      const g = a.root.querySelector('.ag-grid');
      const w = g ? g.getBoundingClientRect().width : 0;
      return w ? Math.round((w - (cols - 1) * b.gap) / cols) : 0;
    };
    // How big a piece is depends on which board is on screen, so the figure
    // has to follow the device rather than always quoting the desk one.
    const piece = px(narrow ? b.narrowColumns : b.columns);
    openMenu(window.innerWidth / 2 - 170, window.innerHeight / 2 - 200, `
      <div class="ag-menu-title">Board · ${activeName}</div>
      <div class="ag-menu-note">
        The grid is rigid and its cells are square. It fills the width it is
        given, so the column count is how big one piece is.
      </div>
      <label class="ag-menu-field">Columns across (desk)${narrow ? '' : ` — ${piece}px a piece`}
        <input data-board="columns" type="number" min="3" max="60" value="${b.columns}" />
      </label>
      <label class="ag-menu-field">Columns across (narrow)${narrow ? ` — ${piece}px a piece` : ''}
        <input data-board="narrowColumns" type="number" min="3" max="30" value="${b.narrowColumns}" />
      </label>
      <label class="ag-menu-field">Gap between cells (px) — 0 is a plain grid
        <input data-board="gap" type="number" min="0" max="40" value="${b.gap}" />
      </label>
      <label class="ag-menu-field">Height in cells (${where}) — blank means as tall as it needs
        <input data-board="${heightKey}" type="number" min="1" max="40" value="${b[heightKey] ?? ''}" />
      </label>
      <label class="ag-menu-check">
        <input data-board="sticky" type="checkbox"${b.sticky ? ' checked' : ''} />
        Floating — follows you as you scroll
      </label>
      ${a.isChrome ? '' : `
      <div class="ag-menu-sub">This page, to a search engine and a shared link</div>
      <label class="ag-menu-field">Title
        <input data-board="title" type="text" value="${escapeAttr(b.title)}" />
      </label>
      <label class="ag-menu-field">Description — one or two sentences; what a search result shows under the title
        <textarea data-board="description" rows="2">${escapeAttr(b.description)}</textarea>
      </label>
      <label class="ag-menu-field">Picture for a shared link — an asset: key, a media: file, or a URL
        <input data-board="image" type="text" value="${escapeAttr(b.image)}" />
      </label>`}
      <div class="ag-menu-actions">
        <button class="ag-menu-btn" data-act="board-apply">Apply</button>
        <button class="ag-menu-btn" data-act="tidy">Tidy</button>
        <button class="ag-menu-btn" data-act="copy">Copy JSON</button>
      </div>
      <div class="ag-menu-note">
        <b>Tidy</b> repacks this board top to bottom in reading order, growing
        downward. Nothing moves on its own — this is the deliberate version.
        <b>Copy JSON</b> puts this board's file on the clipboard, which is the
        middle of the three ways to save: this browser, the clipboard, Publish.
      </div>
    `, (act, _v, menuEl) => {
      if (act === 'tidy') return a.tidy();
      if (act === 'copy') return copyJson(a);
      if (act !== 'board-apply') return;
      const num = (k) => {
        const el = menuEl.querySelector(`[data-board="${k}"]`);
        const raw = el ? el.value.trim() : '';
        return raw === '' ? null : Number(raw);
      };
      const text = (k) => menuEl.querySelector(`[data-board="${k}"]`)?.value.trim() ?? null;
      a.setBoard({
        columns: num('columns'), narrowColumns: num('narrowColumns'), gap: num('gap'),
        [heightKey]: num(heightKey),
        sticky: menuEl.querySelector('[data-board="sticky"]').checked,
        ...(a.isChrome ? {} : { title: text('title'), description: text('description'), image: text('image') }),
      });
    });
  }

  /**
   * The middle of the three ways to save: the file itself, on the clipboard.
   *
   * localStorage keeps work in progress, Publish commits it, and this is what
   * you use when the change should be looked at before it goes anywhere — it
   * is the file exactly as Publish would write it.
   */
  async function copyJson(a) {
    const text = JSON.stringify(a.getLayout(), null, 2) + '\n';
    try {
      await navigator.clipboard.writeText(text);
      toast(`${pathFor(activeName)} copied — paste it wherever it needs looking at`);
    } catch {
      // A clipboard write needs permission and a secure origin, and neither is
      // guaranteed. Falling back to the console beats losing the file.
      console.info(text);
      toast('Could not reach the clipboard — the JSON is in the console');
    }
  }

  /* ---- the pages: a working list, not the site's navigation ---- */

  /**
   * Bureau's desks do not come over. A website has PAGES, and how you get
   * between them for a visitor is whatever you built out of objects and menus.
   * This is only the working list — every layout file there is, so you can go
   * and edit one without hunting for its URL.
   */
  function openPages() {
    const here = location.pathname.replace(/\/$/, '');
    const rows = pageList.map((p) => {
      const at = p.href.replace(/\/$/, '') === here;
      // `href` arrives already resolved through url() — see LayoutEditor.astro.
      // A bare "/links" here is the deploy-subpath 404 that made this panel
      // look empty and broken, and it is hard rule 2.
      const sep = p.href.includes('?') ? '&' : '?';
      return `<a class="ag-menu-btn" href="${escapeAttr(p.href)}${sep}edit=1"${at ? ' aria-current="true"' : ''}>${escapeAttr(p.title)}
        <small>${escapeAttr(p.path)}${p.grid ? ' · a board' : ' · written by hand'}${at ? ' · you are here' : ''}</small></a>`;
    }).join('');
    /* A page made in this session is not on the site until it is published, so
       it is listed but not offered as a link — following it would 404, which is
       exactly the complaint this panel started with. */
    const waiting = [...files.keys()]
      .map((path) => path.match(/^src\/data\/layouts\/(.+)\.json$/)?.[1])
      .filter(Boolean)
      .map((n) => `<div class="ag-menu-btn" aria-disabled="true">${escapeAttr(n)}<small>/${escapeAttr(n)} · after you publish</small></div>`)
      .join('');
    openMenu(window.innerWidth / 2 - 170, 80, `
      <div class="ag-menu-title">Pages</div>
      <div class="ag-menu-kinds ag-menu-pages">${rows || '<div class="ag-menu-note">No pages found.</div>'}${waiting}</div>
      <button class="ag-menu-btn ag-menu-new" data-act="new-page">New page…<small>Writes a layout file; the next build makes the page</small></button>
      <div class="ag-menu-note">
        Every page there is, editing carried with you. A <b>board</b> is a page
        made of objects; the rest are written by hand and still have their
        header and footer to arrange. What a visitor navigates by is whatever
        you put on the boards.
      </div>
    `, (act) => { if (act === 'new-page') newPage(); });
  }

  /**
   * Make a page that is not behind a drawer.
   *
   * A drawer makes a page, and that was the ONLY way to make one — which is
   * backwards: a drawer is a way *to* a page, not the only reason to have one.
   * This writes the same empty layout file, pending until Publish, and leaves
   * you to put a way there on whichever board should carry it.
   */
  function newPage() {
    const title = window.prompt('Name the page — it becomes an address:', '');
    if (!title) return;
    const slug = slugify(title);
    if (!slug) return toast('That name has no letters in it');
    if (pageList.some((p) => p.name === slug) || files.has(pathFor(slug))) {
      return toast(`There is already a page at /${slug}`);
    }
    addFile(pathFor(slug), JSON.stringify(newLayout(title), null, 2) + '\n');
    toast(`/${slug} exists once you publish — put something on it then`);
  }

  /* ---- publishing ---- */

  function openPublish() {
    const waiting = gather();
    if (!waiting.length) return toast('Nothing has changed');
    let saved = '';
    try { saved = localStorage.getItem(TOKEN_KEY) || ''; } catch { /* ignore */ }
    openMenu(window.innerWidth / 2 - 170, window.innerHeight / 2 - 190, `
      <div class="ag-menu-title">Publish</div>
      <div class="ag-menu-note">
        One commit to <b>${TARGET.owner}/${TARGET.repo}</b> on <b>${TARGET.branch}</b>, which
        rebuilds the public site in about a minute:
        <ul class="ag-menu-list">${waiting.map((f) => `<li><code>${escapeAttr(f.path)}</code></li>`).join('')}</ul>
      </div>
      <label class="ag-menu-field">Commit message
        <input data-pub="message" type="text" placeholder="Arrange the site" />
      </label>
      <label class="ag-menu-field">GitHub token
        <input data-pub="token" type="password" autocomplete="off"
               placeholder="${saved ? 'using the saved token' : 'github_pat_…'}" />
      </label>
      <label class="ag-menu-check">
        <input data-pub="remember" type="checkbox"${saved ? ' checked' : ''} />
        Keep this token in this browser
      </label>
      <div class="ag-menu-note">
        Use a <b>fine-grained</b> token limited to this repository with
        <b>Contents: read and write</b>, and give it a short expiry. Stored in
        this browser, so anything on this origin could read it.
      </div>
      <div class="ag-menu-actions">
        <button class="ag-menu-btn" data-pub="go">Publish</button>
        ${saved ? '<button class="ag-menu-btn" data-pub="forget">Forget token</button>' : ''}
      </div>
    `, null);
    menu.querySelector('[data-pub="message"]')?.focus();
    menu.addEventListener('click', onPublishClick);
  }

  function onPublishClick(e) {
    const act = e.target.closest('[data-pub]')?.dataset.pub;
    if (act === 'forget') {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      closeMenu();
      return toast('Token forgotten');
    }
    if (act !== 'go') return;
    let saved = '';
    try { saved = localStorage.getItem(TOKEN_KEY) || ''; } catch { /* ignore */ }
    const token = menu.querySelector('[data-pub="token"]').value.trim() || saved;
    const message = menu.querySelector('[data-pub="message"]').value.trim();
    const remember = menu.querySelector('[data-pub="remember"]').checked;
    if (!token) return toast('A token is needed to publish');
    closeMenu();
    doPublish({ token, message, remember });
  }

  async function doPublish({ token, message, remember }) {
    for (const [n, e] of editors) {
      const problems = validateLayout(e.getLayout(), n);
      if (problems.length) { toast(`${n} is invalid — fix it before publishing`); console.error(problems.join('\n')); return; }
    }
    const waiting = gather();
    if (!waiting.length) return toast('Nothing has changed');
    busy(true);
    try {
      const { url } = await publishFiles({
        token, files: waiting,
        message: message || `Arrange the site from the in-page editor (${waiting.length} file${waiting.length > 1 ? 's' : ''})`,
      });
      if (remember) { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ } }
      for (const e of editors.values()) e.afterPublish?.();
      files.clear();
      publishedLook = normalizeLook(look);
      publishedWorks = worksNow;
      try { localStorage.removeItem(LOOK_KEY); } catch { /* ignore */ }
      try { localStorage.removeItem(WORKS_KEY); } catch { /* ignore */ }
      published(url);
    } catch (err) {
      // Never log the error object wholesale — the request carried the token.
      toast(err.message || 'Publish failed');
    } finally {
      busy(false);
    }
  }

  function busy(on) {
    const btn = bar.querySelector('.ag-publish');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Publishing…' : 'Publish…'; }
  }

  function published(url) {
    toast('Published — watching for it to go live');
    watchForDeploy();
    render();
    if (!url) return;
    const link = document.createElement('a');
    link.className = 'ag-commit';
    link.href = url; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = 'view commit';
    bar.appendChild(link);
    setTimeout(() => link.remove(), 20000);
  }

  bar.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-bar]')?.dataset.bar;
    if (act === 'lock') return setLocked(!isLocked);
    if (act === 'look') return openLook();
    if (act === 'pages') return openPages();
    if (act === 'board') return openBoard();
    if (act === 'works') return openWorks();
    if (act === 'publish') return openPublish();
    if (act === 'version') return checkLive();
    // The way out. Anything not yet published is still in this browser and is
    // still here the next time you come in — the beforeunload guard below is
    // for a picked image, which is the one thing that only lives in this tab.
    if (act === 'leave') return leaveEdit();
    const a = active();
    if (!a) return;
    if (act === 'undo') return a.undo();
    if (act === 'redo') return a.redo();
  });

  let onPick = null;
  /**
   * @param {number|null} x  null centres it — which is what the object editor
   *   wants: it is a panel you work in, not a menu that belongs to the pixel
   *   you pressed.
   */
  function openMenu(x, y, html, handler, opts = {}) {
    // Every panel gets a way out, built in here rather than left to each
    // caller to remember. A phone has no Escape, and a panel can cover most of
    // the screen, so "tap outside" is not a way out you can rely on.
    menu.innerHTML =
      `<button class="ag-menu-close" data-menu="close" title="Close" aria-label="Close">✕</button>` + html;
    menu.classList.toggle('ag-menu-wide', !!opts.wide);
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    // The bar owns the bottom of the screen — on a phone that is ~90px of it —
    // so a panel clamped only to the window put its last row underneath the bar
    // and out of reach. Which row that was depended on how tall the panel
    // happened to be, so it was the picker's "Nothing, thanks" as often as not.
    const floor = window.innerHeight - (bar.getBoundingClientRect().height || 0) - 8;
    const wantX = x == null ? (window.innerWidth - r.width) / 2 : x;
    const wantY = y == null ? Math.max(8, (floor - r.height) / 2) : y;
    menu.style.left = Math.max(8, Math.min(wantX, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(wantY, floor - r.height)) + 'px';
    onPick = handler;
  }
  const closeMenu = () => {
    menu.hidden = true;
    onPick = null;
    menu.removeEventListener('click', onPublishClick);
    menu.removeEventListener('input', onLookInput);
    menu.removeEventListener('change', onLookInput);
  };

  /* Actions that manage the panel themselves and must not have it shut under
     them: "Choose an image…" opens a file picker, and the two that add or drop
     a row of a holder are editing the panel in place. */
  const KEEP_OPEN = new Set([
    'pick', 'item-add', 'item-del', 'work-add', 'work-del',
    // The object editor rebuilds itself after these, because a different kind
    // or a different attribute list is a different set of fields. Closing it
    // first would flash the panel away and back for every tick.
    'kind', 'attr', 'face', 'flow',
    // These OPEN a panel of their own. Closing "the menu" afterwards would shut
    // the very thing that was just asked for — the object editor opened and
    // vanished in the same frame.
    'edit',
    // Apply is not "done": a catalogue of forty is typed in over a while, and
    // an object usually wants a second change after the first. Done closes.
    'fields', 'works-apply',
  ]);
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-menu="close"]')) return closeMenu();
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    // A row's × is bookkeeping inside the panel, not a change to the object —
    // nothing a holder holds is committed until Apply.
    if (btn.dataset.act === 'item-del') { btn.closest('[data-item-row]')?.remove(); return; }
    // The menu element goes with the action: a fields panel has to read its own
    // inputs, and it must do so BEFORE closeMenu() empties them.
    onPick?.(btn.dataset.act, undefined, menu);
    if (!KEEP_OPEN.has(btn.dataset.act)) closeMenu();
  });
  menu.addEventListener('change', (e) => {
    // Ticking what an object carries changes what it IS, so it lands at once
    // and the panel redraws around it.
    const box = e.target.closest('input[type="checkbox"][data-attr]');
    if (box) return onPick?.('attr', box.dataset.attr, menu);
    // A select that is a FIELD belongs to the Apply button, not to the menu's
    // own action handler — reading it here would close the panel mid-edit.
    const sel = e.target.closest('select[data-act]:not([data-field])');
    if (!sel) return;
    onPick?.(sel.dataset.act, sel.value, menu);
    if (!KEEP_OPEN.has(sel.dataset.act)) closeMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(); }
  });

  // A picked image or a new page lives in this tab until Publish. Leaving with
  // one unsaved loses the file itself, not just a position, so it is worth a
  // question.
  window.addEventListener('beforeunload', (e) => {
    const unsaved = [...editors.values()].some((x) => x.getPending().size) || files.size;
    if (unsaved) { e.preventDefault(); e.returnValue = ''; }
  });

  render();
  return {
    register, unregister, setActive, render, toast, busy, published,
    activeName: () => activeName,
    // Where the bar begins, so a drag's edge pan knows where the screen ends.
    barTop: () => (bar.hidden ? window.innerHeight : bar.getBoundingClientRect().top),
    locked: () => isLocked, setLocked,
    select, selectedOn, selectionOn, dropSelection,
    look: () => look, setLook,
    // One catalogue for every board on the page, so a feed in the header and a
    // feed on the page can never disagree about what has been made.
    works: () => worksNow,
    addFile,
    menu: openMenu, closeMenu,
  };
}
