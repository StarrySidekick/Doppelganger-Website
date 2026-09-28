/**
 * The 3D editor: a model is a list of parts, and this is where you make one.
 *
 * Deliberately small. A part is a box, cylinder, cone, ring or ball with a
 * colour, a place, a turn and a size — the way a Nintendo 64 prop was put
 * together — and every one of those is a field you can type or nudge. The
 * view is for looking: drag to orbit, wheel to zoom, click a part to pick it.
 * There are no handles to drag in 3D, because dragging a thing in a space you
 * see flat is where every small modeller goes wrong; arrows move the picked
 * part one step at a time instead, the same bargain the board makes.
 *
 * It knows nothing about boards, layouts or this website. It is handed a
 * model and gives one back, so it opens over any page (`openModelEditor`),
 * stands on a page of its own (`mountModelEditor`, which /modeler uses), and
 * can be lifted out as its own thing.
 */
import { SHAPES, SHADINGS, PRESETS, LIMITS, makePart, normalizeModel, validateModel, buildMesh } from './model3d.js';
import { mountModel } from './model-view.js';

const CSS = `
.me-root { display: grid; grid-template-columns: minmax(0, 1fr) 330px; grid-template-rows: auto minmax(0, 1fr);
  height: 100%; background: var(--paper, #000); color: var(--ink, #fff); font: 14px/1.35 system-ui, sans-serif; }
.me-top { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ink, #fff) 18%, transparent); }
.me-top .me-name { font-weight: 600; margin-right: auto; }
.me-view { position: relative; min-height: 0; background:
  radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--ink, #fff) 7%, transparent), transparent 70%); }
.me-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; cursor: grab; touch-action: none; }
.me-view .me-hint { position: absolute; left: 10px; bottom: 8px; opacity: .55; font-size: 12px; pointer-events: none; }
.me-side { overflow: auto; padding: 10px 12px 24px; border-left: 1px solid color-mix(in srgb, var(--ink, #fff) 18%, transparent); }
.me-side h3 { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; opacity: .6; margin: 16px 0 6px; font-weight: 600; }
.me-side h3:first-child { margin-top: 0; }
.me-btn { font: inherit; font-size: 13px; color: inherit; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink, #fff) 22%, transparent); border-radius: 5px; padding: 5px 10px; cursor: pointer; min-height: 32px; }
.me-btn:hover { border-color: var(--accent, #ffd27a); }
.me-btn[disabled] { opacity: .4; cursor: default; }
.me-go { background: var(--accent, #ffd27a); color: #111; border-color: var(--accent, #ffd27a); }
.me-row { display: flex; flex-wrap: wrap; gap: 5px; }
.me-parts { display: grid; gap: 3px; }
.me-part { display: flex; gap: 8px; align-items: center; text-align: left; }
.me-part[aria-current="true"] { border-color: var(--accent, #ffd27a); background: color-mix(in srgb, var(--accent, #ffd27a) 18%, transparent); }
.me-swatch { width: 14px; height: 14px; border-radius: 3px; flex: none; border: 1px solid rgba(255,255,255,.3); }
.me-field { display: grid; grid-template-columns: 76px 1fr; gap: 6px; align-items: center; margin: 5px 0; font-size: 13px; }
.me-trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.me-side input, .me-side select, .me-side textarea { font: inherit; font-size: 13px; color: inherit; min-width: 0;
  background: color-mix(in srgb, var(--ink, #fff) 6%, transparent); border: 1px solid color-mix(in srgb, var(--ink, #fff) 22%, transparent);
  border-radius: 4px; padding: 4px 6px; user-select: text; -webkit-user-select: text; }
.me-side input[type=color] { padding: 0 2px; height: 28px; }
.me-side textarea { width: 100%; min-height: 90px; font: 11px/1.3 ui-monospace, monospace; }
.me-note { font-size: 12px; opacity: .6; margin: 6px 0; }
.me-stat { font-size: 12px; opacity: .6; }
@media (max-width: 760px) {
  .me-root { grid-template-columns: 1fr; grid-template-rows: auto 42vh minmax(0, 1fr); }
  .me-side { border-left: 0; border-top: 1px solid color-mix(in srgb, var(--ink, #fff) 18%, transparent); }
}
.me-overlay { position: fixed; inset: 0; z-index: 100000; }
`;

const round = (n) => Math.round(n * 1000) / 1000;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const label = (p, i) => `${i + 1} · ${SHAPES[p.shape]?.label ?? p.shape}`;

/**
 * Put the editor inside `root`. `model` is where it starts; `onChange` hears
 * every change; `actions` is the buttons along the top right, each
 * `{label, go, run(model)}`. Returns `{ model(), destroy() }`.
 */
export function mountModelEditor(root, { model, title = 'Model', onChange = () => {}, actions = [] } = {}) {
  if (!document.getElementById('me-style')) {
    const st = document.createElement('style');
    st.id = 'me-style'; st.textContent = CSS;
    document.head.append(st);
  }
  let m = normalizeModel(model?.parts ? model : PRESETS.key.model);
  let sel = m.parts.length ? 0 : -1;
  const past = [], future = [];
  const snap = () => JSON.stringify(m);

  root.innerHTML = `<div class="me-root" data-quiet>
    <div class="me-top">
      <span class="me-name">${esc(title)}</span>
      <button class="me-btn" data-do="undo" title="⌘Z">Undo</button>
      <button class="me-btn" data-do="redo" title="⌘⇧Z">Redo</button>
      ${actions.map((a, i) => `<button class="me-btn${a.go ? ' me-go' : ''}" data-action="${i}">${esc(a.label)}</button>`).join('')}
    </div>
    <div class="me-view"><canvas></canvas><div class="me-hint">Drag to look around · wheel to zoom · click a part to pick it · arrows move it</div></div>
    <div class="me-side"></div>
  </div>`;
  const canvas = root.querySelector('canvas');
  const side = root.querySelector('.me-side');
  const view = mountModel(canvas, m, { interactive: false, auto: false, selected: sel });
  view.view.angle = -25;
  view.view.pitch = 8;

  /* ---- changing the model ---- */

  function changed({ rebuild = true, record = true, before = null } = {}) {
    if (record) { past.push(before ?? lastSnap); if (past.length > 60) past.shift(); future.length = 0; }
    lastSnap = snap();
    view.view.selected = sel;
    view.update(m);
    if (rebuild) drawSide();
    else stat();
    onChange(structuredClone(m));
  }
  let lastSnap = snap();

  function restore(json) {
    m = normalizeModel(JSON.parse(json));
    sel = Math.min(sel, m.parts.length - 1);
    lastSnap = snap();
    view.view.selected = sel;
    view.update(m);
    drawSide();
    onChange(structuredClone(m));
  }
  const undo = () => { if (!past.length) return; future.push(snap()); restore(past.pop()); };
  const redo = () => { if (!future.length) return; past.push(snap()); restore(future.pop()); };

  const pick = (i) => { sel = i; view.view.selected = i; view.redraw(); drawSide(); };

  function addPart(shape) {
    const p = makePart(shape);
    // A new part lands beside the one you are on, not inside it.
    if (m.parts[sel]) p.pos = [round(m.parts[sel].pos[0] + 0.6), m.parts[sel].pos[1], m.parts[sel].pos[2]];
    if (m.parts[sel]) p.color = m.parts[sel].color;
    if (m.parts.length >= LIMITS.parts) return;
    m.parts.push(p);
    sel = m.parts.length - 1;
    changed();
  }
  function duplicate() {
    const p = m.parts[sel];
    if (!p || m.parts.length >= LIMITS.parts) return;
    const c = structuredClone(p);
    c.pos = [round(c.pos[0] + 0.2), round(c.pos[1] - 0.2), c.pos[2]];
    m.parts.splice(sel + 1, 0, c);
    sel += 1;
    changed();
  }
  function remove() {
    if (!m.parts[sel]) return;
    m.parts.splice(sel, 1);
    sel = Math.min(sel, m.parts.length - 1);
    changed();
  }
  function nudge(axis, by) {
    const p = m.parts[sel];
    if (!p) return;
    p.pos[axis] = round(p.pos[axis] + by);
    changed();
  }

  /* ---- the side panel ---- */

  const num = (key, v, step, min) =>
    `<input type="number" data-k="${key}" value="${round(v)}" step="${step}"${min != null ? ` min="${min}"` : ''} />`;
  const trio = (key, v, step, min) =>
    `<div class="me-trio">${[0, 1, 2].map((i) => num(`${key}.${i}`, v[i], step, min)).join('')}</div>`;

  function stat() {
    const mesh = buildMesh(m);
    const el = side.querySelector('.me-stat');
    if (el) el.textContent = `${m.parts.length} part${m.parts.length === 1 ? '' : 's'} · ${mesh.triangles} triangles`;
  }

  function drawSide() {
    const p = m.parts[sel];
    side.innerHTML = `
      <h3>Start from</h3>
      <div class="me-row">
        <select data-preset>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
        <button class="me-btn" data-do="preset">Replace with this</button>
      </div>

      <h3>Add a part</h3>
      <div class="me-row">${Object.entries(SHAPES).map(([k, v]) => `<button class="me-btn" data-add="${k}">${v.label}</button>`).join('')}</div>

      <h3>Parts</h3>
      <div class="me-parts">${m.parts.map((q, i) => `<button class="me-btn me-part" data-pick="${i}" aria-current="${i === sel}">
        <span class="me-swatch" style="background:${esc(q.color)}"></span>${esc(label(q, i))}</button>`).join('') || '<div class="me-note">Nothing yet. Add a part.</div>'}</div>
      <div class="me-row" style="margin-top:6px">
        <button class="me-btn" data-do="dup"${p ? '' : ' disabled'}>Duplicate</button>
        <button class="me-btn" data-do="del"${p ? '' : ' disabled'}>Delete</button>
      </div>

      ${p ? `
      <h3>Part ${sel + 1}</h3>
      <label class="me-field">Shape <select data-k="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}"${k === p.shape ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="me-field">Colour <input type="color" data-k="color" value="${esc(p.color)}" /></label>
      ${SHAPES[p.shape]?.seg ? `<label class="me-field">Sides ${num('seg', p.seg ?? SHAPES[p.shape].seg, 1, LIMITS.seg[0])}</label>` : ''}
      ${p.shape === 'ring' ? `<label class="me-field">Thickness ${num('thick', p.thick ?? 0.25, 0.05, 0.05)}</label>` : ''}
      <div class="me-field">Position ${trio('pos', p.pos, 0.05)}</div>
      <div class="me-field">Turn (°) ${trio('rot', p.rot, 15)}</div>
      <div class="me-field">Size ${trio('size', p.size, 0.05, 0.01)}</div>
      <div class="me-note">x is left–right, y is up–down, z is toward you. Arrows move it; PageUp and PageDown move it toward and away.</div>
      ` : ''}

      <h3>How it is shown</h3>
      <label class="me-field">Spins (°/s) ${num('m.spin', m.spin, 5)}</label>
      <label class="me-field">Leans (°) ${num('m.tilt', m.tilt, 2)}</label>
      <label class="me-field">Pixel size <input type="range" data-k="m.pixel" min="${LIMITS.pixel[0]}" max="${LIMITS.pixel[1]}" step="1" value="${m.pixel}" /></label>
      <label class="me-field">Shading <select data-k="m.shading">${Object.entries(SHADINGS).map(([k, v]) => `<option value="${k}"${k === m.shading ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="me-field">Zoom ${num('m.zoom', m.zoom, 0.05, 0.1)}</label>
      <div class="me-row"><button class="me-btn" data-do="turn">${view.view.auto ? 'Stop turning' : 'Preview the turn'}</button></div>
      <p class="me-stat"></p>

      <h3>As JSON</h3>
      <div class="me-note">Copy a model from one place to another, or keep it somewhere safe.</div>
      <textarea data-json spellcheck="false">${esc(JSON.stringify(m))}</textarea>
      <div class="me-row"><button class="me-btn" data-do="copy">Copy</button><button class="me-btn" data-do="load">Load what is typed</button></div>
    `;
    stat();
  }

  /* A typed value lands live; the undo step is taken when the field is left,
     so typing "1.25" is one step and not four. */
  let editStart = null;
  side.addEventListener('focusin', (e) => { if (e.target.matches('[data-k]')) editStart = snap(); });
  side.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    set(k, e.target);
    changed({ rebuild: false, record: false });
    if (k === 'shape' || k === 'color') drawPartsOnly();
  });
  side.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    set(k, e.target);
    const before = editStart ?? lastSnap;
    editStart = snap();
    if (before !== snap()) changed({ rebuild: k === 'shape', before });
  });

  function drawPartsOnly() {
    side.querySelectorAll('[data-pick]').forEach((b) => {
      const q = m.parts[+b.dataset.pick];
      if (!q) return;
      b.querySelector('.me-swatch').style.background = q.color;
      b.lastChild.textContent = label(q, +b.dataset.pick);
    });
  }

  function set(k, el) {
    if (k.startsWith('m.')) {
      const f = k.slice(2);
      m[f] = f === 'shading' ? el.value : Number(el.value);
      if (!Number.isFinite(m[f]) && f !== 'shading') m[f] = 0;
      return;
    }
    const p = m.parts[sel];
    if (!p) return;
    if (k === 'shape') {
      p.shape = el.value;
      if (SHAPES[p.shape]?.seg && p.seg == null) p.seg = SHAPES[p.shape].seg;
      if (p.shape === 'ring' && p.thick == null) p.thick = 0.25;
      return;
    }
    if (k === 'color') { p.color = el.value; return; }
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    if (k === 'seg') { p.seg = Math.max(LIMITS.seg[0], Math.min(LIMITS.seg[1], Math.round(v))); return; }
    if (k === 'thick') { p.thick = Math.max(0.05, Math.min(0.95, v)); return; }
    const [key, i] = k.split('.');
    p[key][+i] = key === 'size' ? Math.max(0.01, v) : v;
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.add) return addPart(t.dataset.add);
    if (t.dataset.pick != null) return pick(+t.dataset.pick);
    if (t.dataset.action != null) return actions[+t.dataset.action]?.run(structuredClone(m));
    switch (t.dataset.do) {
      case 'undo': return undo();
      case 'redo': return redo();
      case 'dup': return duplicate();
      case 'del': return remove();
      case 'preset': {
        const k = side.querySelector('[data-preset]').value;
        m = normalizeModel(structuredClone(PRESETS[k].model));
        sel = m.parts.length ? 0 : -1;
        return changed();
      }
      case 'turn':
        view.view.auto = !view.view.auto;
        view.play();
        return drawSide();
      case 'copy': {
        const text = JSON.stringify(m, null, 1);
        navigator.clipboard?.writeText(text).then(() => { t.textContent = 'Copied'; }, () => { t.textContent = 'Could not reach the clipboard'; });
        return;
      }
      case 'load': {
        try {
          const next = JSON.parse(side.querySelector('[data-json]').value);
          const bad = validateModel(next);
          if (bad.length) { t.textContent = bad[0]; return; }
          m = normalizeModel(next);
          sel = m.parts.length ? 0 : -1;
          changed();
        } catch { t.textContent = 'That is not JSON'; }
        return;
      }
    }
  });

  /* ---- the view: orbit, zoom, pick ---- */

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, a: view.view.angle, p: view.view.pitch, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.view.angle = drag.a + dx * 0.6;
    view.view.pitch = Math.max(-85, Math.min(85, drag.p + dy * 0.4));
    view.redraw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    canvas.style.cursor = '';
    if (!drag.moved) {
      const r = canvas.getBoundingClientRect();
      const hit = view.pick(e.clientX - r.left, e.clientY - r.top);
      if (hit !== sel) pick(hit);
    }
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.view.zoom = Math.max(0.2, Math.min(6, view.view.zoom * Math.exp(-e.deltaY * 0.0015)));
    view.redraw();
  }, { passive: false });

  /* ---- keys ---- */

  /* Taken at the window, in the capture phase, and stopped there: the board
     editor underneath listens for the same keys, and Delete here must delete
     a part, not the tile the whole model lives on. */
  const onKey = (e) => {
    if (!root.isConnected) return;
    e.stopPropagation();
    const typing = e.target.closest?.('input, textarea, select');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
    if (typing) return;
    const step = e.shiftKey ? 0.25 : 0.05;
    const moves = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [1, step], ArrowDown: [1, -step], PageUp: [2, step], PageDown: [2, -step] };
    if (moves[e.key]) { e.preventDefault(); return nudge(...moves[e.key]); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return remove(); }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); return duplicate(); }
    if (e.key === 'Tab' && m.parts.length) {
      e.preventDefault();
      return pick((sel + (e.shiftKey ? -1 : 1) + m.parts.length) % m.parts.length);
    }
  };
  window.addEventListener('keydown', onKey, true);

  drawSide();
  return {
    model: () => structuredClone(m),
    destroy() { window.removeEventListener('keydown', onKey, true); view.destroy(); root.innerHTML = ''; },
  };
}

/**
 * The editor over the whole page, with Done and Cancel. Done hands the model
 * back; Cancel, or Escape with nothing changed, leaves without it.
 */
export function openModelEditor({ model, title = 'Model', onDone = () => {}, onCancel = () => {} } = {}) {
  const shell = document.createElement('div');
  shell.className = 'me-overlay';
  shell.dataset.quiet = '';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', `3D editor — ${title}`);
  document.body.append(shell);
  const start = JSON.stringify(normalizeModel(model?.parts ? model : PRESETS.key.model));
  let ed = null;
  const close = () => { window.removeEventListener('keydown', onEsc, true); ed?.destroy(); shell.remove(); };
  const cancel = () => {
    if (JSON.stringify(ed.model()) !== start && !window.confirm('Leave without keeping the changes to this model?')) return;
    close(); onCancel();
  };
  const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancel(); } };
  window.addEventListener('keydown', onEsc, true);
  ed = mountModelEditor(shell, {
    model, title: `3D editor · ${title}`,
    actions: [
      { label: 'Cancel', run: cancel },
      { label: 'Done', go: true, run: (m) => { close(); onDone(m); } },
    ],
  });
  return { close };
}
