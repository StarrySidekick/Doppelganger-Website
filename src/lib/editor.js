/**
 * In-page layout editor.
 *
 * Loaded only when the URL carries ?edit=1, so a visitor never pays for it and
 * can never pick a tile up. Inside edit mode there is no arrange sub-mode:
 * everything is movable, and a 200ms hold arms the drag — the same bargain
 * bureau makes, and the reason a plain click can still do nothing surprising.
 *
 * Interaction, after bureau:
 *   hold 200ms   pick a tile up
 *   drag         move; ghost shows where it lands, red when refused
 *   corner grip  resize, live, like dragging a window edge
 *   right click  settings for that element
 *   device tabs  switch between the desk and narrow layouts
 *
 * Two things differ from bureau, both forced by this grid:
 *
 * 1. Rows are minmax(clamp(...), auto) and GROW with content, so there is no
 *    single row height to cache. Track positions are read from the live grid
 *    (getComputedStyle → gridTemplateRows) on every gesture start. Bureau's
 *    hardest-won lesson — never assume or round the cell size — applies more
 *    here, not less.
 * 2. The narrow layout is a real stored layout, but an element that has never
 *    been touched at narrow width has no box of its own; it is showing one
 *    derived from its flow. Moving it writes the box down for the first time.
 */
import {
  resolveDevice, boxOk, columnsFor, normalizeLayout, validateLayout, FLOWS,
} from './adaptive-grid.js';
import { publishLayout, TARGET, pathFor } from './publish.js';

const TOKEN_KEY = 'doppelganger.ghToken';

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
 * Editor
 * ------------------------------------------------------------------ */

export function mountEditor({ root, layout: initial, name, onChange }) {
  const grid = root.querySelector('.ag-grid');
  if (!grid) throw new Error('mountEditor: no .ag-grid inside root');

  let layout = normalizeLayout(structuredClone(initial));
  let device = 'desk';
  let undo = [];
  let G = null;          // the gesture in flight
  let holdTimer = null;

  const el = (id) => grid.querySelector(`#${CSS.escape(id)}`);
  const find = (id) => layout.elements.find((e) => e.id === id);
  const placed = () => resolveDevice(layout, device);
  const boxFor = (id) => {
    const r = placed().find((p) => p.id === id);
    return { col: [r._col, r._span], row: [r._row, r._rowSpan] };
  };

  /* ---- applying a layout to the live DOM ---- */

  function paint() {
    for (const r of placed()) {
      const node = el(r.id);
      if (!node) continue;
      node.style.gridColumn = `${r._col} / span ${r._span}`;
      node.style.gridRow = `${r._row} / span ${r._rowSpan}`;
      node.classList.toggle('ag-derived', device === 'narrow' && r._derived);
      node.classList.add('ag-editable');
      if (!node.querySelector('.ag-grip')) addGrips(node);
    }
    root.dataset.agDevice = device;
    chrome.render();
  }

  function addGrips(node) {
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      const g = document.createElement('span');
      g.className = `ag-grip ag-grip-${corner}`;
      g.dataset.rz = corner;
      node.appendChild(g);
    }
  }

  /* ---- mutation ---- */

  function setBox(id, box, { record = true } = {}) {
    const e = find(id);
    if (!e) return;
    if (record) undo.push({ id, device, prev: e[device] ? structuredClone(e[device]) : null });
    if (undo.length > 20) undo.shift();
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
      return;
    }
    paint();
    onChange?.(layout);
  }

  function undoLast() {
    const move = undo.pop();
    if (!move) return toast('Nothing to undo');
    const e = find(move.id);
    if (!e) return;
    if (move.prev) e[move.device] = move.prev; else delete e[move.device];
    const was = device;
    device = move.device;
    commit();
    if (was !== device) toast(`Undone on ${device}`);
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
    if (e.button === 2) return;               // right click is the settings menu
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return;
    const id = node.id;
    const item = find(id);
    if (!item || item.locked) return;

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

  /* ---- right click: settings for one element ---- */

  function onContext(e) {
    const node = e.target.closest('.ag-editable');
    if (!node || !grid.contains(node)) return;
    e.preventDefault();
    openSettings(node.id, e.clientX, e.clientY);
  }

  function openSettings(id, x, y) {
    const item = find(id);
    if (!item) return;
    const hasOwn = device === 'narrow' && !!item.narrow;
    chrome.menu(x, y, `
      <div class="ag-menu-title">${id}</div>
      <label class="ag-menu-row">Reflow seed
        <select data-act="flow">
          ${FLOWS.map((f) => `<option value="${f}"${f === item.flow ? ' selected' : ''}>${f}</option>`).join('')}
        </select>
      </label>
      <button class="ag-menu-btn" data-act="lock">${item.locked ? 'Unlock' : 'Lock in place'}</button>
      ${device === 'narrow' ? `<button class="ag-menu-btn" data-act="reset"${hasOwn ? '' : ' disabled'}>
        ${hasOwn ? 'Reset to derived position' : 'Position is derived'}
      </button>` : ''}
      <div class="ag-menu-note">${describe(item)}</div>
    `, (act, value) => {
      if (act === 'flow') { item.flow = value; commit(); }
      if (act === 'lock') { item.locked = !item.locked; commit(); }
      if (act === 'reset') { delete item.narrow; commit(); toast(`${id} back to its ${item.flow} rule`); }
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
    if (e.key === 'Escape') { chrome.closeMenu(); return; }
    if (e.target.matches('input,textarea,select')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undoLast(); return; }
    if (e.key === 'd' || e.key === 'D') {
      setDevice(device === 'desk' ? 'narrow' : 'desk');
    }
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

  const chrome = buildChrome({
    getDevice: () => device,
    setDevice,
    getLayout: () => layout,
    undo: undoLast,
    name,
    publish: doPublish,
  });
  const toast = chrome.toast;

  /* ---- publishing ---- */

  async function doPublish({ token, message, remember }) {
    const problems = validateLayout(layout, name);
    if (problems.length) {
      toast('Layout is invalid — fix it before publishing');
      console.error(problems.join('\n'));
      return;
    }
    chrome.busy(true);
    try {
      const { url } = await publishLayout({ token, name, layout, message });
      if (remember) {
        try { localStorage.setItem(TOKEN_KEY, token); } catch { /* quota, private mode */ }
      }
      // The committed file is now the source of truth, so the local copy is no
      // longer "unsaved work" — drop it rather than have it shadow the build.
      try { localStorage.removeItem(`doppelganger.layout.${name}`); } catch { /* ignore */ }
      chrome.published(url);
    } catch (err) {
      // Never log the error object wholesale — the request carried the token.
      toast(err.message || 'Publish failed');
    } finally {
      chrome.busy(false);
    }
  }

  grid.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  grid.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKey);
  /* While arranging you are not browsing. Half these tiles are links, and a
     drag ends with a click the browser sends anyway — without this, moving the
     home icon also navigates home and the editor is gone along with the
     arrangement. Suppressing every click inside the grid is simpler than
     tracking which ones followed a drag, and there is nothing in edit mode you
     would want a link to do. */
  grid.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (link && grid.contains(link)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  grid.addEventListener('dragstart', (e) => e.preventDefault());

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
      window.removeEventListener('keydown', onKey);
      chrome.destroy();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Chrome: device tabs, save state, menu, toast
 * ------------------------------------------------------------------ */

function buildChrome({ getDevice, setDevice, getLayout, undo, name, publish }) {
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

  let toastTimer = null;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
  };

  function render() {
    const d = getDevice();
    bar.innerHTML = `
      <div class="ag-tabs" role="group" aria-label="Which layout to edit">
        <button data-dev="desk"${d === 'desk' ? ' aria-current="true"' : ''}>Desk</button>
        <button data-dev="narrow"${d === 'narrow' ? ' aria-current="true"' : ''}>Narrow</button>
      </div>
      <span class="ag-hint">hold to pick up · corners resize · right click for settings</span>
      <button data-bar="undo">Undo</button>
      <button data-bar="copy">Copy JSON</button>
      <button data-bar="publish" class="ag-publish">Publish…</button>
    `;
  }

  /** The publish form. Kept in the menu element so there is only one popup. */
  function openPublish() {
    let saved = '';
    try { saved = localStorage.getItem(TOKEN_KEY) || ''; } catch { /* ignore */ }
    openMenu(window.innerWidth / 2 - 170, window.innerHeight / 2 - 150, `
      <div class="ag-menu-title">Publish ${name}</div>
      <div class="ag-menu-note">
        Commits <code>${pathFor(name)}</code> to
        <b>${TARGET.owner}/${TARGET.repo}</b> on <b>${TARGET.branch}</b>, which
        rebuilds the public site. Takes about a minute.
      </div>
      <label class="ag-menu-field">Commit message
        <input data-pub="message" type="text" placeholder="Rearrange ${name}" />
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
    publish({ token, message, remember });
  }

  function busy(on) {
    const btn = bar.querySelector('.ag-publish');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Publishing…' : 'Publish…'; }
  }

  function published(url) {
    toast('Published — the site rebuilds in about a minute');
    if (!url) return;
    const link = document.createElement('a');
    link.className = 'ag-commit';
    link.href = url; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = 'view commit';
    bar.appendChild(link);
    setTimeout(() => link.remove(), 20000);
  }

  bar.addEventListener('click', async (e) => {
    const dev = e.target.closest('[data-dev]');
    if (dev) return setDevice(dev.dataset.dev);
    const act = e.target.closest('[data-bar]')?.dataset.bar;
    if (act === 'undo') return undo();
    if (act === 'publish') return openPublish();
    if (act === 'copy') {
      const json = JSON.stringify(getLayout(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        toast('Layout JSON copied — paste it into src/data/layouts/');
      } catch {
        // Clipboard needs a secure context and permission; neither is
        // guaranteed. Show the text so the work is never trapped in the page.
        window.prompt('Copy this into src/data/layouts/', json);
      }
    }
  });

  let onPick = null;
  function openMenu(x, y, html, handler) {
    menu.innerHTML = html;
    menu.hidden = false;
    // Keep it on screen.
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    onPick = handler;
  }
  const closeMenu = () => {
    menu.hidden = true;
    onPick = null;
    // The publish form binds its own handler; without this it would stack up
    // another copy every time the form is opened.
    menu.removeEventListener('click', onPublishClick);
  };

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    onPick?.(btn.dataset.act);
    closeMenu();
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

  render();
  return {
    render, toast, menu: openMenu, closeMenu, busy, published,
    destroy() { bar.remove(); menu.remove(); toastEl.remove(); },
  };
}
