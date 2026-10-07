/**
 * The words: how a written thing is set.
 *
 * Bureau's words.js (its decision 247), cut to what a page on the web wants.
 * An object's face says what the *tile* is (a note, a card, lettering); these
 * say what is printed on it: the typeface, the ink, the paper behind the
 * words, the weight, the size, the case, the spacing, the alignment. Before
 * this, every word on a board was in the look's face at the face's size, and
 * the only way to set a heading in another face was to write CSS for its id.
 *
 * Where it departs from Bureau, and why:
 *
 * - **The fields live under `o.words`**, not at the top level. Every other
 *   attribute's data is a sub-object here (`fold`, `spin`, `form`), and a
 *   layout is a file people read.
 * - **Two layers, not four:** the object's own answer, then its kind's
 *   (`words` on a kind). Bureau's desk-wide and per-type defaults are
 *   settings a site does not have yet; when it does they go between the two.
 * - **The typefaces include the site's own**: `display` and `body` are the
 *   look's two families (`--font-display`, `--font-body`), so a heading can
 *   be in the site's display face without the tool knowing what that is.
 * - **Inks and papers are any colour**, typed as hex, rather than Bureau's
 *   fixed tins: a website is matched to a brand, not to a desk's stationery.
 * - Bureau's reading-surface keys (page size, layouts, drop capital, margins)
 *   are not here: a website has no reader. The words ARE the page.
 *
 * `wordStyle()` is the one answer, as a class list and custom properties, and
 * both the build (AdaptiveGrid) and the editor (dressTile) put it on the tile.
 * The CSS behind the classes is in styles/faces.css. Pure: node and browser.
 */

/* Its own escape, so this file imports nothing: elements.js imports it. */
const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Typefaces: system stacks, so there is nothing to load, plus the site's two. */
export const FONTS = {
  '':          ['The face\'s', ''],
  display:     ['The site\'s display face', 'var(--font-display, inherit)'],
  body:        ['The site\'s body face', 'var(--font-body, inherit)'],
  serif:       ['Book serif',  "Charter, 'Iowan Old Style', Georgia, serif"],
  garamond:    ['Garamond',    "'EB Garamond', Garamond, 'Apple Garamond', 'Hoefler Text', Georgia, serif"],
  baskerville: ['Baskerville', "Baskerville, 'Baskerville Old Face', 'Libre Baskerville', Georgia, serif"],
  didot:       ['Didot',       "Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', serif"],
  georgia:     ['Georgia',     "Georgia, 'Times New Roman', serif"],
  sans:        ['Plain sans',  "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  helvetica:   ['Helvetica',   "'Helvetica Neue', Helvetica, Arial, sans-serif"],
  avenir:      ['Avenir',      "'Avenir Next', Avenir, 'Century Gothic', sans-serif"],
  futura:      ['Futura',      "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif"],
  gill:        ['Gill Sans',   "'Gill Sans', 'Gill Sans MT', Seravek, Calibri, sans-serif"],
  rounded:     ['Rounded',     "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', sans-serif"],
  condensed:   ['Condensed',   "'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', sans-serif"],
  poster:      ['Poster',      "Impact, Haettenschweiler, 'Arial Black', sans-serif"],
  typewriter:  ['Typewriter',  "'American Typewriter', 'Courier Prime', 'Courier New', monospace"],
  mono:        ['Monospace',   "ui-monospace, Menlo, Consolas, monospace"],
  hand:        ['Handwriting', "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive"],
  marker:      ['Marker',      "'Marker Felt', 'Chalkboard SE', 'Comic Sans MS', fantasy"],
  script:      ['Script',      "'Snell Roundhand', 'Apple Chancery', 'Brush Script MT', cursive"],
};
/* The choices below are lists of [value, name], not objects: an object puts
   keys that look like whole numbers ("300", "2") first whatever order they
   were written in, which would scramble every dropdown. */
export const WEIGHTS = [['', 'The face\'s'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['900', 'Black']];
export const CASES = [['', 'As written'], ['upper', 'Capitals'], ['lower', 'Lower case'], ['caps', 'Small capitals']];
export const TRACKS = [['', 'Normal'], ['tight', 'Tight'], ['open', 'Open'], ['wide', 'Wide'], ['spaced', 'Spaced out']];
const TRACK_EM = { tight: '-0.02em', open: '0.04em', wide: '0.1em', spaced: '0.22em' };
export const ALIGNS = [['', 'The face\'s'], ['left', 'Left'], ['center', 'Centered'], ['right', 'Right'], ['justify', 'Justified']];
export const VALIGNS = [['', 'The face\'s'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']];
export const LEADS = [['', 'Normal'], ['tight', 'Tight'], ['snug', 'Snug'], ['open', 'Open'], ['double', 'Double']];
const LEAD_X = { tight: 1, snug: 1.2, open: 1.6, double: 2 };
/** How much bigger or smaller than the face sets it. Multiplies, so it scales with the board. */
export const SIZES = [['', 'The face\'s'], ['0.7', 'Smaller'], ['0.85', 'Small'], ['1.25', 'Large'], ['1.6', 'Larger'], ['2', 'Twice'], ['3', 'Huge']];
export const HALOS = [['', 'None'], ['soft', 'Soft glow'], ['shadow', 'Drop shadow'], ['outline', 'Outline']];
export const ITALICS = [['', 'Upright'], ['true', 'Italic']];
const FONT_LIST = Object.entries(FONTS).map(([k, [nm]]) => [k, nm]);
/** Is this one of a list's values? */
const among = (list, v) => list.some(([k]) => k === String(v));

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

/** Every key the words own, with the table it chooses from (null for a colour). */
export const WORD_KEYS = {
  font: FONT_LIST, weight: WEIGHTS, italic: ITALICS, case: CASES, size: SIZES, track: TRACKS,
  lead: LEADS, align: ALIGNS, valign: VALIGNS, ink: null, paper: null, halo: HALOS,
};

/** Who is set by the words: anything written, other than raw markup. */
export const isWritten = (o, has, kindOf) => !!o && has(o, 'text') && kindOf(o) !== 'html';

/** One word setting: the object's own, then its kind's, then nothing. */
export function wordOf(o, key, kindWords = null) {
  const own = o?.words?.[key];
  if (own != null && own !== '') return String(own);
  const k = kindWords?.[key];
  return k != null && k !== '' ? String(k) : '';
}

/**
 * The whole answer, as classes and custom properties for the tile. Anything
 * not set adds nothing, so a tile with no words looks exactly as it did.
 */
export function wordStyle(o, kindWords = null) {
  const cls = [];
  const vars = {};
  const w = (k) => wordOf(o, k, kindWords);

  const font = w('font');
  if (font && FONTS[font]) { cls.push('w-font'); vars['--wfam'] = FONTS[font][1]; }
  const weight = w('weight');
  if (weight && among(WEIGHTS, weight)) { cls.push('w-weight'); vars['--wweight'] = weight; }
  if (w('italic') === 'true') cls.push('w-italic');
  const cs = w('case');
  if (cs && among(CASES, cs)) cls.push(`w-case-${cs}`);
  const size = Number(w('size'));
  if (size > 0 && size !== 1) { cls.push('w-size'); vars['--wscale'] = String(size); }
  const tr = w('track');
  if (TRACK_EM[tr]) { cls.push('w-track'); vars['--wtrack'] = TRACK_EM[tr]; }
  const ld = w('lead');
  if (LEAD_X[ld]) { cls.push('w-lead'); vars['--wlead'] = String(LEAD_X[ld]); }
  const al = w('align');
  if (al && among(ALIGNS, al)) cls.push(`w-al-${al}`);
  const va = w('valign');
  if (va && among(VALIGNS, va)) cls.push(`w-v-${va}`);
  const ink = w('ink');
  if (HEX.test(ink)) { cls.push('w-ink'); vars['--wink'] = ink; }
  const paper = w('paper');
  if (paper === 'none') cls.push('w-clear');
  else if (HEX.test(paper)) { cls.push('w-paper'); vars['--wpaper'] = paper; }
  const halo = w('halo');
  if (halo && among(HALOS, halo)) cls.push(`w-halo-${halo}`);

  return { cls, vars };
}

/** The same answer as an attribute string, for markup built as text. */
export function wordAttrs(o, kindWords = null) {
  const { cls, vars } = wordStyle(o, kindWords);
  return {
    cls: cls.join(' '),
    style: Object.entries(vars).map(([k, v]) => `${k}:${escapeHtml(v)}`).join(';'),
  };
}

/** The editor's fields for the words, as the object editor draws any field. */
export function wordFields() {
  const sel = (key, label, options) => ({ key: `words.${key}`, label, kind: 'select', options });
  const col = (key, label, says) => ({ key: `words.${key}`, label, kind: 'text', placeholder: says });
  return [
    sel('font', 'Typeface', FONT_LIST),
    sel('weight', 'Weight', WEIGHTS),
    sel('italic', 'Slant', ITALICS),
    sel('size', 'Size', SIZES),
    sel('case', 'Case', CASES),
    sel('track', 'Letter spacing', TRACKS),
    sel('lead', 'Line spacing', LEADS),
    sel('align', 'Alignment', ALIGNS),
    sel('valign', 'Up and down', VALIGNS),
    col('ink', 'Ink', 'the look\'s, or a color like #2b4c8c'),
    col('paper', 'Paper behind the words', 'the face\'s, "none", or a color like #f3e7c5'),
    sel('halo', 'Halo', HALOS),
  ];
}

/** Problems with an object's words. Empty means fine. */
export function checkWords(o, at = 'element') {
  const out = [];
  if (o?.words == null) return out;
  if (typeof o.words !== 'object' || Array.isArray(o.words)) return [`${at}.words must be an object`];
  for (const [k, v] of Object.entries(o.words)) {
    if (!(k in WORD_KEYS)) { out.push(`${at}.words.${k} is not one of ${Object.keys(WORD_KEYS).join(', ')}`); continue; }
    const table = WORD_KEYS[k];
    const s = String(v);
    if (table && !among(table, s)) out.push(`${at}.words.${k} ${JSON.stringify(v)} is not one of ${table.map(([x]) => x).filter(Boolean).join(', ')}`);
    if (!table && s !== '' && !(k === 'paper' && s === 'none') && !HEX.test(s)) {
      out.push(`${at}.words.${k} must be a hex color like #2b4c8c${k === 'paper' ? ', or "none"' : ''}`);
    }
  }
  return out;
}
