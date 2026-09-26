/**
 * The look: the handful of colours the site is dressed in, and everything
 * derived from them.
 *
 * Bureau's rule (its decision 33 and look.js): a style supplies a few hexes
 * and gets a complete set of tokens, so the second, third and fourth tints of
 * a colour agree with the first by construction. Otherwise a theme is forty
 * hand-tuned rgba values and the next one is forty more.
 *
 * Pure. The build reads look.json and emits these on :root; the editor's
 * settings panel writes the same tokens live onto document.documentElement.
 */

export const DEFAULT_LOOK = {
  bg: '#000000',
  ink: '#ffffff',
  accent: '#ffd27a',
  board: ['#0c0c0c', '#161616'],   // the two checkerboard squares, edit mode only
  tilt: false,                     // pinned: every tile leans a degree or two
  font: 'serif',                   // 'serif' | 'display' — the site's two faces
  wiggle: false,                   // a linked picture wiggles under the mouse
  sparks: '',                      // a picture thrown from every click, or none
  cursor: null,                    // [pointer, pointer over something], or the browser's own
};

/**
 * Is this a picture address a stylesheet can use as it stands? A look stores
 * `asset:` keys like any layout does, and only the site knows what those are —
 * so the build resolves them first, and the editor, which cannot, leaves the
 * build's own value alone rather than writing a broken one over it.
 */
const usable = (u) => typeof u === 'string' && /^(https:\/\/|\/)/.test(u);
const cssUrl = (u) => `url("${String(u).replace(/["\\\n]/g, '')}")`;

const lum = (hex) => {
  const h = String(hex).replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => parseInt(c + c, 16))
    : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
};
export const isDark = (hex) => lum(hex) < 0.42;
const mix = (a, p, b) => `color-mix(in srgb, ${a} ${p}%, ${b})`;

/** Fill in anything a stored look leaves out. */
export const normalizeLook = (l = {}) => ({
  ...DEFAULT_LOOK,
  ...l,
  board: Array.isArray(l.board) && l.board.length === 2 ? l.board : DEFAULT_LOOK.board,
});

/**
 * The tokens a look resolves to. `--paper` is the page, `--ink` the words,
 * and the -2/-3 steps walk each toward the other, so one rule serves a
 * midnight desk and a parchment one.
 */
export function tokensFor(look) {
  const l = normalizeLook(look);
  const dark = isDark(l.bg);
  return {
    '--paper':    l.bg,
    '--paper-2':  dark ? mix(l.bg, 88, '#fff') : mix(l.bg, 94, '#000'),
    '--paper-3':  dark ? mix(l.bg, 78, '#fff') : mix(l.bg, 86, '#000'),
    '--ink':      l.ink,
    '--ink-2':    mix(l.ink, 64, l.bg),
    '--ink-3':    mix(l.ink, 40, l.bg),
    '--line':     mix(l.ink, 18, l.bg),
    '--accent':   l.accent,
    '--accent-2': mix(l.accent, 30, l.bg),
    '--board-1':  l.board[0],
    '--board-2':  l.board[1],
    '--body-font': l.font === 'display' ? 'var(--font-display)' : 'var(--font-body)',
    ...(Array.isArray(l.cursor) && usable(l.cursor[0]) ? { '--cursor': `${cssUrl(l.cursor[0])}, auto` } : {}),
    ...(Array.isArray(l.cursor) && usable(l.cursor[1]) ? { '--cursor-over': `${cssUrl(l.cursor[1])}, pointer` } : {}),
  };
}

/**
 * The same look with its picture keys turned into addresses, by the caller's
 * resolver — the site's assets are not this file's business (hard rule 4).
 */
export function resolveLook(look, resolve) {
  const l = normalizeLook(look);
  return {
    ...l,
    sparks: l.sparks ? resolve(l.sparks) : '',
    cursor: Array.isArray(l.cursor) ? l.cursor.map((c) => (c ? resolve(c) : c)) : null,
  };
}

/** One `:root{…}` rule, for the build. */
export const lookCSS = (look) =>
  ':root{' + Object.entries(tokensFor(look)).map(([k, v]) => `${k}:${v}`).join(';') + '}';

/** Problems with a stored look. Empty means fine. */
export function validateLook(look, name = 'look') {
  const out = [];
  const hex = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
  for (const k of ['bg', 'ink', 'accent']) {
    if (look?.[k] != null && !hex.test(look[k])) out.push(`${name}.${k} must be a hex colour, got ${JSON.stringify(look[k])}`);
  }
  if (look?.board != null) {
    if (!Array.isArray(look.board) || look.board.length !== 2 || !look.board.every((c) => hex.test(c))) {
      out.push(`${name}.board must be two hex colours`);
    }
  }
  if (look?.font != null && !['serif', 'display'].includes(look.font)) out.push(`${name}.font must be serif or display`);
  if (look?.wiggle != null && typeof look.wiggle !== 'boolean') out.push(`${name}.wiggle must be true or false`);
  if (look?.sparks != null && typeof look.sparks !== 'string') out.push(`${name}.sparks must be a picture address, or empty`);
  if (look?.cursor != null && (!Array.isArray(look.cursor) || look.cursor.length !== 2 || !look.cursor.every((c) => typeof c === 'string'))) {
    out.push(`${name}.cursor must be two picture addresses: the pointer, and the pointer over something`);
  }
  for (const u of [look?.sparks, ...(Array.isArray(look?.cursor) ? look.cursor : [])]) {
    if (typeof u === 'string' && /javascript:|["<>]/i.test(u)) out.push(`${name} has a picture address that is not one: ${JSON.stringify(u)}`);
  }
  return out;
}
