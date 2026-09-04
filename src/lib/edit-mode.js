/**
 * The way in and out of edit mode.
 *
 * `?edit=1` was the only door, and it had two problems. You had to type it,
 * which is not a thing to ask of anyone on a phone; and it lives in the URL,
 * so the moment you followed a link — the home icon in the header, the nav in
 * the footer — the next page had no `edit` in its address, the editor never
 * mounted, and the bar vanished with no way back short of editing the address
 * bar again.
 *
 * So editing is a MODE THIS BROWSER IS IN, not a property of one URL:
 *
 *   - `?edit=1` still works and still means "edit", and now also turns the mode
 *     on, so it survives the next link you follow. `?edit=0` turns it off.
 *   - A tiny target in the bottom-left corner of every page is the way in
 *     without touching the address. It is invisible and takes a double press,
 *     until you have been in edit mode once in this browser — after that it is
 *     a faint dot and one press.
 *   - **Done** in the editor's own bar is the way out: it clears the mode and
 *     strips the parameter, so you land on the site exactly as a visitor sees
 *     it.
 *
 * None of this is access control and it is not meant to be — the same as
 * `?edit=1` before it. A stranger who finds the corner can rearrange tiles in
 * their own browser and change nothing for anybody, because publishing needs a
 * token that only ever exists in Timothy's.
 *
 * This file is part of the tool, not the site: it imports nothing, styles
 * itself, and talks to the page through one event.
 */

/**
 * TEMPORARY: show the corner to everyone, not only to a browser that has been
 * in edit mode before, so it can be found the first time. Flip this to `false`
 * to go back to invisible-until-used — the corner then takes a double press
 * until you have been in once, and a visitor sees nothing at all.
 */
export const SHOW_CORNER = true;

/** This browser is in edit mode. */
export const EDIT_FLAG = 'doppelganger.editing';
/** This browser has been in edit mode before, so the corner can show itself. */
export const KNOWN_FLAG = 'doppelganger.editor.known';

/** The page asks for the editor to mount now. */
export const ENTER_EVENT = 'ag:enter-edit';

/* localStorage throws in private browsing and when the quota is full. Wanting
   to edit must never be the thing that takes the page down. */
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
};

/** What `?edit=` says, if it says anything: true, false, or null for absent. */
function fromUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has('edit')) return null;
  const v = (q.get('edit') || '').toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false' || v === 'no');
}

/** Should the editor mount on this page load? The URL wins; the mode decides. */
export const editingNow = () => fromUrl() ?? read(EDIT_FLAG) === 'true';

/** Has this browser ever been in edit mode? */
export const isKnown = () => read(KNOWN_FLAG) === 'true';

/**
 * Turn edit mode on. The parameter goes into the address as well as the flag —
 * not because anything reads it, but so the page can say what state it is in
 * and so the link can be copied to another tab.
 */
export function enterEdit() {
  write(EDIT_FLAG, 'true');
  write(KNOWN_FLAG, 'true');
  const q = new URLSearchParams(location.search);
  if (!q.has('edit')) {
    q.set('edit', '1');
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }
  window.dispatchEvent(new Event(ENTER_EVENT));
}

/**
 * Turn edit mode off and reload as a visitor.
 *
 * A reload rather than an unmount, deliberately: the editor has put a
 * checkerboard, grips, labels and draft tiles into the page, and the honest way
 * to be sure none of it is left over is to ask the browser for the page again.
 * Nothing is lost — drafts live in localStorage and are still there next time.
 */
export function leaveEdit() {
  write(EDIT_FLAG, null);
  const q = new URLSearchParams(location.search);
  q.delete('edit');
  const rest = q.toString();
  location.replace(`${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
}

const STYLE = `
.ag-enter {
  position: fixed; left: 0; bottom: 0; z-index: 90;
  width: 28px; height: 28px;
  margin-bottom: env(safe-area-inset-bottom, 0px);
  padding: 0; border: 0; background: transparent;
  color: var(--ink, #fff);
  opacity: 0; cursor: default;
  transition: opacity .18s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.ag-enter::after {
  content: ''; display: block;
  width: 8px; height: 8px; margin: 10px;
  border-radius: 50%; background: currentColor;
}
/* Invisible until you have been in edit mode in this browser — unless
   SHOW_CORNER is on, which gives every page the visible dot. A visitor
   otherwise sees nothing at all, and a double press is the way in. */
.ag-enter.is-known { opacity: .38; cursor: pointer; }
.ag-enter.is-known:hover, .ag-enter:focus-visible { opacity: .75; }
/* Once the editor is mounted the bar has Done, so the corner steps out. */
.ag-editing .ag-enter { display: none; }
@media (prefers-reduced-motion: reduce) { .ag-enter { transition: none; } }
`;

/**
 * Put the way in on the page. Called by every page, editing or not — it is a
 * button and a stylesheet, and it does nothing else until it is pressed.
 */
export function wireEditEntry() {
  const asked = fromUrl();
  // Following a link with ?edit=1 is asking for the mode, not for one page of
  // it; ?edit=0 is asking to be let out.
  if (asked === true) { write(EDIT_FLAG, 'true'); write(KNOWN_FLAG, 'true'); }
  if (asked === false) write(EDIT_FLAG, null);
  // The bar is already the way out, so there is nothing for the corner to do.
  if (editingNow()) return null;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  // `known` is really "does this press count on its own" — a corner you can see
  // is a corner you press once. While SHOW_CORNER is on, that is everyone.
  const known = isKnown() || SHOW_CORNER;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ag-enter${known ? ' is-known' : ''}`;
  if (known) {
    btn.title = 'Edit this site';
    btn.setAttribute('aria-label', 'Edit this site');
  } else {
    // Nothing to announce to a visitor who has never edited: it is not a
    // control for them, and it is not visible either.
    btn.setAttribute('aria-hidden', 'true');
    btn.tabIndex = -1;
  }

  let presses = 0;
  let timer = null;
  btn.addEventListener('click', () => {
    if (known) return enterEdit();
    presses += 1;
    clearTimeout(timer);
    if (presses >= 2) { presses = 0; return enterEdit(); }
    timer = setTimeout(() => { presses = 0; }, 600);
  });
  document.body.appendChild(btn);

  // And a keyboard way in, for a desk. Not a bare letter: `E` on its own would
  // fire in the middle of writing a word.
  document.addEventListener('keydown', (e) => {
    if (e.key?.toLowerCase() !== 'e' || !e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    enterEdit();
  });

  return btn;
}
