/**
 * In-page editor.
 *
 * Loaded only when the URL carries ?edit=1, so a visitor never pays for it and
 * can never pick a tile up. Once it is mounted there is ONE switch that decides
 * what the page is: **locked** is the site exactly as a visitor sees it, with
 * a bar along the bottom; **unlocked** is the board — a checkerboard under
 * everything, outlines on what can move, and every gesture below live. That
 * is Bureau's lock (its decision 74): not a property of a board but which mode
 * you are in, reading or arranging, one switch for every grid on the page.
 *
 * Interaction, after Bureau:
 *   padlock       lock or unlock everything (or press L)
 *   hold 200ms    pick a tile up
 *   drag          move; ghost shows where it lands, red when refused
 *   corner grip   resize, live, like dragging a window edge
 *   double click  the words become a field where they sit
 *   click a cell  the picker — what you pick lands on that cell
 *   right click   settings for that object: its fields, its face, delete
 *   device tabs   switch between the desk and narrow layouts
 *   gear          the site's look: colours, tilt, type
 *
 * Two things differ from Bureau, both forced by this grid:
 *
 * 1. Rows are minmax(clamp(...), auto) and GROW with content, so there is no
 *    single row height to cache. Track positions are read from the live grid
 *    (getComputedStyle → gridTemplateRows) on every gesture start, and the
 *    checkerboard is real cells placed in the grid rather than a gradient, so
 *    it cannot drift off the truth.
 * 2. The narrow layout is a real stored layout, but an object that has never
 *    been touched at narrow width has no box of its own; it is showing one
 *    derived from its flow. Moving it writes the box down for the first time.
 */
import {
  resolveDevice, boxOk, freeSpot, columnsFor, normalizeLayout, validateLayout, FLOWS,
} from './adaptive-grid.js';
import {
  KINDS, PICKER_KINDS, FACES, K, has, isTyped, isInline, faceOf,
  fieldsOf, getField, setField, renderElement, unsafeHtml, tiltFor, escapeHtml,
} from './elements.js';
import { prepareImage, blobToBase64, mediaPath, mediaRef, ACCEPT } from './media.js';
import { publishFiles, pathFor, TARGET } from './publish.js';
import { tokensFor, normalizeLook, validateLook } from './look.js';

const TOKEN_KEY = 'doppelganger.ghToken';
const LOCK_KEY = 'doppelganger.locked';
const LOOK_KEY = 'doppelganger.look';
const LOOK_PATH = 'src/data/look.json';

/** For putting a stored value back into a form field without breaking out of it. */
const escapeAttr = escapeHtml;

const HOLD_MS = 200;
const NUDGE = 5; // px of movement before a drag counts as a drag

/* ------------------------------------------------------------------ *
 * Track geometry — measured, never assumed
 * ------------------------------------------------------------------ */

/**
 * Where every column and row line sits, in px relative to the grid box.
 * Read fresh at the start of each gesture: rows grow with their content, so
 * yesterday's numbers are not today's.
 */
function tracks(grid) {
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
 * Rows here are minmax(clamp(...), auto) and every one can be a different
 * height — measured on /links they run 18px, 18px, 31.5px … 40.125px. So a
 * drag CANNOT convert pixels to cells by dividing by a step: doing that moved a
 * tile seven rows when the pointer had crossed thirteen. Walk the real edges
 * instead, and only extrapolate past the end of the grid.
 */
function trackAt(edges, px, step) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (px < edges[i + 1]) return i + 1;
  }
  const over = px - edges[edges.length - 1];
  return edges.length + (step > 0 ? Math.max(0, Math.floor(over / step)) : 0);
}

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

/* ------------------------------------------------------------------ *
 * Editor
 * ------------------------------------------------------------------ */

export function mountEditor({
  root, layout: initial, published, name, assets = {}, base = '/', look, onChange,
}) {
  const grid = root.querySelector('.ag-grid');
  if (!grid) throw new Error('mountEditor: no .ag-grid inside root');

  let layout = normalizeLayout(structuredClone(initial));
  // What the build rendered. Publish sends this layout only when it differs.
  let baselineJson = JSON.stringify(normalizeLayout(published ?? initial));
  let device = 'desk';
  let undo = [];
  let G = null;          // the gesture in flight
  let holdTimer = null;
  let editing = null;    // {id, field, node, tile, before} while words are being edited
  let selected = null;   // the tile the settings panel was last opened on

  const el = (id) => grid.querySelector(`#${CSS.escape(id)}`);
  const find = (id) => layout.elements.find((e) => e.id === id);
  const placed = () => resolveDevice(layout, device);
  const boxFor = (id) => {
    const r = placed().find((p) => p.id === id);
    return { col: [r._col, r._span], row: [r._row, r._rowSpan] };
  };

  const chrome = sharedChrome(look);
  const toast = chrome.toast;
  const locked = () => chrome.locked();

  /* ---- previewing an object's inside ---- */

  /**
   * Preview only: it resolves an asset key to its bare URL and skips the
   * srcset, because the sizing helpers live in assets.js and this file is not
   * allowed to import them. The build does the real thing.
   */
  const previewCtx = {
    image: (m) => ({ src: resolvePreview(m.src) }),
    link: (href) => href,
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
    node.style.setProperty('--tilt', tiltFor(item.id).toFixed(2) + 'deg');
    node.classList.toggle('ag-empty', has(item, 'media') && !item.media?.src && !item.body && !item.title);
  }
  function repaintContent(id) {
    const item = find(id);
    const node = el(id);
    if (!item || !node || !isTyped(item)) return;
    node.innerHTML = renderElement(item, previewCtx);
    dressTile(node, item);
    addGrips(node);
  }

  /* ---- applying a layout to the live DOM ---- */

  function paint() {
    for (const r of placed()) {
      const node = el(r.id);
      if (!node) continue;
      node.style.gridColumn = `${r._col} / span ${r._span}`;
      node.style.gridRow = `${r._row} / span ${r._rowSpan}`;
      node.classList.toggle('ag-derived', device === 'narrow' && r._derived);
      node.classList.add('ag-editable');
      node.classList.toggle('ag-text', isInline(r));
      if (isTyped(r)) dressTile(node, r);
      addGrips(node);
    }
    root.dataset.agDevice = device;
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
    const rows = Math.max(last + 5, 8);
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
  }

  function setBox(id, box, { record = true } = {}) {
    const e = find(id);
    if (!e) return;
    if (record) pushUndo({ kind: 'box', id, device, prev: e[device] ? structuredClone(e[device]) : null });
    e[device] = { col: [...box.col], row: [...box.row] };
    commit();
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

  function undoLast() {
    const move = undo.pop();
    if (!move) return toast('Nothing to undo');

    if (move.kind === 'add') {
      const i = layout.elements.findIndex((e) => e.id === move.id);
      if (i >= 0) { layout.elements.splice(i, 1); el(move.id)?.remove(); }
      commit();
      return toast(`Removed ${move.id}`);
    }
    if (move.kind === 'remove') {
      layout.elements.splice(Math.min(move.index, layout.elements.length), 0, move.element);
      mountTile(move.element);
      commit();
      return toast(`Put ${move.element.id} back`);
    }

    const e = find(move.id);
    if (!e) return;
    if (move.kind === 'content') {
      restoreContent(e, move.prev);
      commit();
      repaintContent(move.id);
      return toast(`Undid the change to ${move.id}`);
    }
    if (move.prev) e[move.device] = move.prev; else delete e[move.device];
    const was = device;
    device = move.device;
    commit();
    if (was !== device) toast(`Undone on ${device}`);
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
    pushUndo({ kind: 'content', id, prev });
    commit();
    repaintContent(id);
    return true;
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
  function create(kind, col, row, extra = {}) {
    const def = KINDS[kind];
    if (!def) return;
    const id = uniqueId(kind);
    const cols = columnsFor(layout, device);
    const w = Math.min(def.size[0], cols);
    let box = { col: [Math.min(col, cols - w + 1), w], row: [row, def.size[1]] };
    if (!boxOk(layout, id, box, device)) box = freeSpot(layout, [w, def.size[1]], device, id);

    const item = { id, kind, flow: 'stack', ...extra };
    if (def.body != null && item.body == null && has(item, 'text')) item.body = def.body;
    if (device === 'desk') {
      item.desk = box;
    } else {
      item.narrow = box;
      item.desk = freeSpot(layout, def.size, 'desk', id);
    }
    layout.elements.push(item);
    const problems = validateLayout(layout, name);
    if (problems.length) {
      layout.elements.pop();
      toast(problems[0].replace(/^[^:]+: /, ''));
      return null;
    }
    pushUndo({ kind: 'add', id });
    mountTile(item);
    commit();
    return item;
  }

  function remove(id) {
    const index = layout.elements.findIndex((e) => e.id === id);
    if (index < 0) return;
    const [element] = layout.elements.splice(index, 1);
    pushUndo({ kind: 'remove', index, element });
    el(id)?.remove();
    commit();
    toast(`Deleted ${id} — ⌘Z puts it back`);
  }

  /**
   * A drawer is a page. Making one writes a new empty layout file — pending
   * until Publish, like a picked image — and a tile here that opens it. The
   * dynamic route turns the file into the page on the next build.
   */
  function newDrawer(col, row) {
    const title = window.prompt('Name the drawer — it becomes a page:', '');
    if (!title) return;
    const slug = slugify(title);
    if (!slug) return toast('That name has no letters in it');
    const made = create('drawer', col, row, { title, link: `/${slug}` });
    if (!made) return;
    chrome.addFile(pathFor(slug), JSON.stringify({
      version: 4, columns: 24, rowHeight: 26, gap: 8, reflowBelow: 700, title, elements: [],
    }, null, 2) + '\n');
    toast(`"${title}" opens /${slug} once published`);
  }

  /* ---- the picker ---- */

  function openPicker(col, row, x, y) {
    chrome.menu(x, y, `
      <div class="ag-menu-title">New, at ${col},${row}</div>
      <div class="ag-menu-kinds">
        ${PICKER_KINDS.map((k) => `<button class="ag-menu-btn" data-act="new:${k}">${KINDS[k].label}<small>${KINDS[k].says}</small></button>`).join('')}
      </div>
    `, (act) => {
      const kind = act.startsWith('new:') && act.slice(4);
      if (!kind) return;
      if (kind === 'drawer') return newDrawer(col, row);
      const item = create(kind, col, row);
      if (item && kind === 'image') pickFileFor(item.id);
    });
  }

  function onCellClick(e) {
    if (locked()) return;
    const cell = e.target.closest('.ag-cell');
    if (!cell || !grid.contains(cell)) return;
    if (editing) return endEdit(true);
    openPicker(+cell.dataset.col, +cell.dataset.row, e.clientX, e.clientY);
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
  const firstImageId = () => layout.elements.find((e) => has(e, 'media'))?.id ?? null;

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
    G = {
      type: grip ? 'resize' : 'move',
      id, node, handle: grip?.dataset.rz ?? null,
      armed: !!grip,                          // a grip drags at once, a tile waits
      box: boxFor(id),
      // Measured once, at the start. A live resize changes row heights as it
      // goes; re-reading them mid-gesture would move the ground under the
      // pointer and the tile would chase itself.
      t,
      startCol: trackAt(t.x, e.clientX - rect.left, t.colStep),
      startRow: trackAt(t.y, e.clientY - rect.top, t.rowStep),
      sx: e.clientX, sy: e.clientY,
      moved: false, ok: true, cand: null,
    };
    try { node.setPointerCapture?.(e.pointerId); } catch {}

    if (!G.armed) {
      const mine = G;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (G !== mine) return;
        G.armed = true;
        G.node.classList.add('ag-lifted');
        navigator.vibrate?.(6);
      }, HOLD_MS);
    }
  }

  function onMove(e) {
    if (holdTimer) {
      // Any real movement means it was not a press-and-hold.
      if (Math.abs(e.clientX - G.sx) > 6 || Math.abs(e.clientY - G.sy) > 6) {
        clearTimeout(holdTimer); holdTimer = null;
      }
    }
    if (!G || !G.armed) return;
    const dx = e.clientX - G.sx, dy = e.clientY - G.sy;
    if (!G.moved) {
      if (Math.abs(dx) < NUDGE && Math.abs(dy) < NUDGE) return;
      G.moved = true;
      G.node.classList.add('ag-dragging');
      if (G.type === 'move') {
        G.ghost = document.createElement('div');
        G.ghost.className = 'ag-ghost';
        place(G.ghost, G.box);
        grid.appendChild(G.ghost);
      }
    }

    // Cells crossed, from the real track edges — not dx divided by a step.
    // The rect is re-read so the page can scroll mid-drag.
    const rect = grid.getBoundingClientRect();
    const dcol = trackAt(G.t.x, e.clientX - rect.left, G.t.colStep) - G.startCol;
    const drow = trackAt(G.t.y, e.clientY - rect.top, G.t.rowStep) - G.startRow;
    const box = candidate(G, dcol, drow);
    G.cand = box;
    G.ok = boxOk(layout, G.id, box, device);
    G.node.classList.toggle('ag-invalid', !G.ok);

    if (G.type === 'move') {
      G.node.style.transform = `translate(${dx}px,${dy}px)`;
      G.ghost.className = 'ag-ghost' + (G.ok ? '' : ' ag-bad');
      place(G.ghost, box);
    } else {
      place(G.node, box);                     // live resize
    }
  }

  function onUp() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (!G) return;
    const g = G; G = null;
    g.node.classList.remove('ag-lifted', 'ag-dragging', 'ag-invalid');
    g.node.style.transform = '';
    g.ghost?.remove();

    if (!g.moved) return;                     // it was a click
    if (g.cand && g.ok) {
      const first = device === 'narrow' && !find(g.id).narrow;
      setBox(g.id, g.cand);
      if (first) toast(`${g.id} now has its own narrow position`);
    } else {
      paint();                                // snap back
      toast('No room there');
    }
  }

  function onCancel() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (!G) return;
    G.node.classList.remove('ag-lifted', 'ag-dragging', 'ag-invalid');
    G.node.style.transform = '';
    G.ghost?.remove();
    G = null;
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
    setContent(id, (o) => { o[field] = next; });
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
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return;
    e.preventDefault();
    openSettings(node.id, e.clientX, e.clientY);
  }

  function openSettings(id, x, y) {
    const item = find(id);
    if (!item) return;
    selected = id;
    const hasOwn = device === 'narrow' && !!item.narrow;
    const typed = isTyped(item);
    const fields = typed ? fieldsOf(item).map((f) => `
      <label class="ag-menu-field">${f.label}
        ${f.kind === 'area'
          ? `<textarea data-field="${f.key}" rows="4">${escapeAttr(getField(item, f.key) ?? '')}</textarea>`
          : `<input data-field="${f.key}" type="text" value="${escapeAttr(getField(item, f.key) ?? '')}" />`}
      </label>`).join('') : '';
    const faceRow = typed ? `
      <label class="ag-menu-row">Face
        <select data-act="face">
          ${Object.entries(FACES).map(([k, f]) => `<option value="${k}"${k === faceOf(item) ? ' selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>` : '';

    chrome.menu(x, y, `
      <div class="ag-menu-title">${id} <span class="ag-menu-kind">${K(item).label}</span></div>
      ${fields ? `${fields}<div class="ag-menu-actions"><button class="ag-menu-btn" data-act="fields">Apply</button></div>` : ''}
      ${has(item, 'media') ? '<button class="ag-menu-btn" data-act="pick">Choose an image…</button>' : ''}
      ${isInline(item) ? '<div class="ag-menu-note">Double-click the words in the page to edit them.</div>' : ''}
      ${faceRow}
      <label class="ag-menu-row">Reflow seed
        <select data-act="flow">
          ${FLOWS.map((f) => `<option value="${f}"${f === item.flow ? ' selected' : ''}>${f}</option>`).join('')}
        </select>
      </label>
      <button class="ag-menu-btn" data-act="lock">${item.locked ? 'Unlock' : 'Lock in place'}</button>
      ${device === 'narrow' ? `<button class="ag-menu-btn" data-act="reset"${hasOwn ? '' : ' disabled'}>
        ${hasOwn ? 'Reset to derived position' : 'Position is derived'}
      </button>` : ''}
      ${typed ? '<button class="ag-menu-btn ag-menu-danger" data-act="delete">Delete</button>' : ''}
      <div class="ag-menu-note">${describe(item)}</div>
    `, (act, value, menuEl) => {
      if (act === 'flow') { item.flow = value; commit(); }
      if (act === 'face') { setContent(id, (o) => { o.face = value; }); }
      if (act === 'lock') { item.locked = !item.locked; commit(); }
      if (act === 'reset') { delete item.narrow; commit(); toast(`${id} back to its ${item.flow} rule`); }
      if (act === 'pick') { pickFileFor(id); return; }
      if (act === 'delete') { remove(id); }
      if (act === 'fields') {
        const ok = setContent(id, (o) => {
          for (const f of fieldsOf(o)) {
            const input = menuEl.querySelector(`[data-field="${f.key}"]`);
            if (input) setField(o, f.key, input.value.trim());
          }
        });
        if (ok) toast(`${id} updated`);
      }
    });
  }

  const describe = (item) =>
    device === 'narrow'
      ? (item.narrow
          ? 'Placed by hand on narrow.'
          : `Derived from its <b>${item.flow}</b> rule. Move it to place it by hand.`)
      : `Desk position. Its <b>${item.flow}</b> rule seeds narrow.`;

  /* ---- keyboard ---- */

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
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoLast(); return; }
    if (e.key === 'd' || e.key === 'D') setDevice(device === 'desk' ? 'narrow' : 'desk');
    if (e.key === 'l' || e.key === 'L') chrome.setLocked(!locked());
  }

  function setDevice(next) {
    device = next;
    // Previewing narrow means constraining the container, not the viewport —
    // the grid is driven by container queries, so this is the real thing.
    root.style.maxWidth = next === 'narrow' ? `${layout.reflowBelow - 40}px` : '';
    root.style.marginInline = next === 'narrow' ? 'auto' : '';
    paint();
  }

  /* ---- chrome ---- */

  chrome.register(name, {
    root,
    getDevice: () => device,
    setDevice,
    getLayout: () => layout,
    getPending: () => pending,
    isDirty: () => JSON.stringify(layout) !== baselineJson,
    undo: undoLast,
    pickImage: () => pickFileFor(selected && has(find(selected) ?? {}, 'media') ? selected : firstImageId()),
    onLock: () => { if (editing) endEdit(true); paint(); },
    afterPublish: () => {
      for (const { previewUrl } of pending.values()) URL.revokeObjectURL(previewUrl);
      pending.clear();
      baselineJson = JSON.stringify(layout);
      try { localStorage.removeItem(`doppelganger.layout.${name}`); } catch { /* ignore */ }
    },
  });

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
  grid.addEventListener('click', onCellClick);
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
    setDevice,
    destroy() {
      grid.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      grid.removeEventListener('contextmenu', onContext);
      grid.removeEventListener('dblclick', onDblClick);
      grid.removeEventListener('paste', onPaste);
      grid.removeEventListener('dragover', allowDrop);
      grid.removeEventListener('drop', onDrop);
      grid.removeEventListener('click', onCellClick);
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
export const sharedChrome = (look) => (CHROME ??= buildChrome(look));

function buildChrome(lookInitial) {
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

  /** name -> the editor's api. */
  const editors = new Map();
  let activeName = null;

  let toastTimer = null;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  };

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
    closeMenu();
    for (const e of editors.values()) e.onLock?.(isLocked);
    render();
    toast(isLocked ? 'Locked — this is the site as a visitor sees it' : 'Unlocked — arrange, write, add');
  }
  applyLock();

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

  /* ---- files waiting to be committed that are not images: new pages ---- */
  const files = new Map();   // path -> text
  const addFile = (path, text) => { files.set(path, text); render(); };

  function register(name, api) {
    editors.set(name, api);
    activeName ??= name;
    render();
  }
  function unregister(name) {
    editors.delete(name);
    if (activeName === name) activeName = editors.keys().next().value ?? null;
    render();
  }
  function setActive(name) {
    if (name === activeName || !editors.has(name)) return;
    activeName = name;
    closeMenu();
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
    const layouts = waiting.filter((f) => f.text && f.path !== LOOK_PATH).length;
    bar.innerHTML = `
      <button class="ag-lock${isLocked ? ' on' : ''}" data-bar="lock"
        title="${isLocked ? 'Locked — the site as a visitor sees it. Press to arrange.' : 'Unlocked — arranging. Press to see the site as it is.'}"
        aria-pressed="${isLocked}">${isLocked ? '🔒' : '🔓'}</button>
      ${names.length > 1 ? `<div class="ag-tabs ag-grids" role="group" aria-label="Which grid">
        ${names.map((n) => `<button data-grid="${n}"${n === activeName ? ' aria-current="true"' : ''}>${n}</button>`).join('')}
      </div>` : ''}
      <div class="ag-tabs" role="group" aria-label="Which layout to edit">
        <button data-dev="desk"${d === 'desk' ? ' aria-current="true"' : ''}>Desk</button>
        <button data-dev="narrow"${d === 'narrow' ? ' aria-current="true"' : ''}>Narrow</button>
      </div>
      <span class="ag-hint">${isLocked ? 'locked · press the padlock or L to arrange' : 'click a cell to add · hold to pick up · corners resize · double-click words · right click for settings'}</span>
      ${waiting.length ? `<span class="ag-pending" title="Not committed until you publish">${[
        layouts ? `${layouts} layout${layouts > 1 ? 's' : ''}` : '',
        images ? `${images} image${images > 1 ? 's' : ''}` : '',
        lookDirty() ? 'look' : '',
      ].filter(Boolean).join(' · ')} waiting</span>` : ''}
      <button data-bar="image">Add image…</button>
      <button data-bar="look" title="The site's look">⚙</button>
      <button data-bar="undo">Undo</button>
      <button data-bar="copy">Copy JSON</button>
      <button data-bar="publish" class="ag-publish"${waiting.length ? '' : ' disabled'}>Publish…</button>
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
      try { localStorage.removeItem(LOOK_KEY); } catch { /* ignore */ }
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
    toast('Published — the site rebuilds in about a minute');
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
    const g = e.target.closest('[data-grid]');
    if (g) return setActive(g.dataset.grid);
    const act = e.target.closest('[data-bar]')?.dataset.bar;
    if (act === 'lock') return setLocked(!isLocked);
    if (act === 'look') return openLook();
    if (act === 'publish') return openPublish();
    const a = active();
    if (!a) return;
    const dev = e.target.closest('[data-dev]');
    if (dev) return a.setDevice(dev.dataset.dev);
    if (act === 'undo') return a.undo();
    if (act === 'image') return isLocked ? toast('Unlock first') : a.pickImage();
    if (act === 'copy') {
      const json = JSON.stringify(a.getLayout(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        toast(`${activeName} JSON copied — paste it into src/data/layouts/`);
      } catch {
        window.prompt('Copy this into src/data/layouts/', json);
      }
    }
  });

  let onPick = null;
  function openMenu(x, y, html, handler) {
    menu.innerHTML = html;
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    onPick = handler;
  }
  const closeMenu = () => {
    menu.hidden = true;
    onPick = null;
    menu.removeEventListener('click', onPublishClick);
    menu.removeEventListener('input', onLookInput);
    menu.removeEventListener('change', onLookInput);
  };

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    // The menu element goes with the action: a fields panel has to read its own
    // inputs, and it must do so BEFORE closeMenu() empties them.
    onPick?.(btn.dataset.act, undefined, menu);
    // "Choose an image…" opens a file picker; closing the menu under it would
    // take the panel away before the file has even been chosen.
    if (btn.dataset.act !== 'pick') closeMenu();
  });
  menu.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-act]');
    if (!sel) return;
    onPick?.(sel.dataset.act, sel.value);
    closeMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
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
    locked: () => isLocked, setLocked,
    look: () => look, setLook,
    addFile,
    menu: openMenu, closeMenu,
  };
}
