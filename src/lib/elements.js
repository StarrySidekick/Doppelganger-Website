/**
 * Objects, attributes, kinds and faces.
 *
 * This is Bureau's model, cut down to what a website needs. Bureau's organising
 * idea is that everything on a grid is one species of thing, an OBJECT, and
 * what an object can do is decided by its ATTRIBUTES — additive, independent,
 * never inferred from a name. A KIND is a named preset of attributes, and a
 * FACE is how the thing draws. See Bureau's docs/SYSTEM.md §1, §5 and §6.
 *
 * Why adopt that rather than keep growing the `type` + `content` model that
 * came before it: a drawer is not a second sort of thing. It is an object that
 * carries `container`, exactly as a linked picture is an object that carries
 * `media` and `link`. One rule — `has(o, attr)` — answers every question, and
 * an object you invent works everywhere immediately.
 *
 * The one place this departs from Bureau, and it is the whole port in one
 * line: **a drawer opens onto a page.** Bureau's drawer opens onto a nested
 * grid inside the app; here `container` + `link` means the object's contents
 * are the page at that path, and its face on this board is the way in. The
 * site map is the container tree. Nothing had to be built for nested grids,
 * because Astro pages already are them.
 *
 * Two rules hold this file in shape, and both are load-bearing:
 *
 * 1. **It knows nothing about this website.** No import from src/data, none
 *    from assets.js. Rendering that needs a real asset URL asks the caller
 *    through `ctx`. Hard rule 4.
 * 2. **It runs in node and in the browser.** The build renders through it and
 *    the editor validates through it, so nothing here may touch the DOM.
 */

/* ------------------------------------------------------------------ *
 * Escaping and the guard rail
 * ------------------------------------------------------------------ */

/** Text that must survive being put inside HTML. Ampersand first. */
export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Reject the obvious ways stored HTML turns into a script.
 *
 * A guard rail, not a security boundary: only someone who can commit can write
 * this content. The point is that a paste from a rich-text source can carry an
 * inline handler by accident, and the BUILD should say so loudly.
 */
const FORBIDDEN = [
  [/<\s*script/i, 'a <script> tag'],
  [/<\s*iframe/i, 'an <iframe> — use a dedicated kind instead'],
  [/\son\w+\s*=/i, 'an inline event handler (onclick=, onerror=, …)'],
  [/javascript:/i, 'a javascript: URL'],
];

/** @returns {string|null} what is wrong with this HTML, or null if it is fine */
export function unsafeHtml(html) {
  for (const [re, why] of FORBIDDEN) if (re.test(String(html ?? ''))) return why;
  return null;
}

/**
 * Send every site-relative href in a block of HTML through the caller's link
 * resolver. Hard rule 2: an internal link has to go through url(), or it
 * breaks on the deploy subpath — and a footer's nav is a run of text with
 * anchors in it, not a field, so it has to be caught here. A single leading
 * slash only; "//example.com" belongs to someone else.
 */
export function rewriteLinks(html, link) {
  if (typeof link !== 'function') return String(html ?? '');
  return String(html ?? '').replace(
    /href="(\/(?!\/)[^"]*)"/g,
    (_, href) => `href="${escapeHtml(link(href))}"`
  );
}

/* ------------------------------------------------------------------ *
 * Attributes — what an object can do
 * ------------------------------------------------------------------ */

/**
 * Each gives the object one capability and, where it needs one, a field.
 * Additive and independent: a note that also carries `link` is a note you can
 * click, and nothing had to be designed for the combination.
 */
export const ATTRS = {
  text:      { label: 'Text',      says: 'A body of words, editable in place',        field: 'body' },
  media:     { label: 'Picture',   says: 'An image',                                  field: 'media' },
  link:      { label: 'Link',      says: 'Points somewhere — a page here, or a web address', field: 'link' },
  container: { label: 'Container', says: 'Opens onto a page of its own — this is what makes a drawer' },
};

/** The attribute names an editor may toggle. `container` is deliberate, not a chip. */
export const USER_ATTRS = ['text', 'media', 'link'];

/* ------------------------------------------------------------------ *
 * Kinds — named presets of attributes
 * ------------------------------------------------------------------ */

/**
 * A kind is a preset, not a category. Changing an object's kind swaps which
 * attributes it has and leaves its data alone. Each states the attributes it
 * carries, the face it wears by default, and the size a new one is born at.
 *
 * `slot` is the odd one out and the escape hatch: its content comes from the
 * page's own markup, which is right for anything a component renders — the
 * flip card has its own shader and a schema would only get in its way. It is
 * also what keeps every layout written before this file rendering untouched.
 */
export const KINDS = {
  slot:   { label: 'From the page', says: 'Rendered by the page itself',           attrs: [],                          face: 'none',    size: [4, 3] },
  note:   { label: 'Note',          says: 'Words on paper',                        attrs: ['text'],                    face: 'note',    size: [6, 4], body: 'A note.' },
  image:  { label: 'Image',         says: 'A picture, which can be a way somewhere', attrs: ['media', 'link'],         face: 'picture', size: [4, 4] },
  button: { label: 'Button',        says: 'A label that goes somewhere',           attrs: ['text', 'link'],            face: 'plaque',  size: [4, 2], body: 'Go' },
  drawer: { label: 'Drawer',        says: 'Opens onto a page of its own',          attrs: ['container', 'media', 'text'], face: 'front', size: [6, 6] },
  html:   { label: 'HTML block',    says: 'A block of markup, edited as markup',   attrs: ['text'],                    face: 'none',    size: [6, 4], body: '' },
};

/** Kinds the picker offers. `slot` is written by code, `html` is a tool. */
export const PICKER_KINDS = ['note', 'image', 'button', 'drawer'];

/* ------------------------------------------------------------------ *
 * Faces — how a thing draws
 * ------------------------------------------------------------------ */

/**
 * A face is a class on the tile and CSS behind it, the way Bureau's SHAPES and
 * FACES are. Every difference between them is stylesheet, so a new face is a
 * CSS block and a label here. See src/styles/faces.css.
 */
export const FACES = {
  none:    { label: 'Plain',        says: 'No dressing; the content as it is' },
  card:    { label: 'Card',         says: 'A rounded card' },
  note:    { label: 'Torn note',    says: 'Paper with a torn bottom edge' },
  picture: { label: 'Picture',      says: 'The image fills the tile' },
  plaque:  { label: 'Plaque',       says: 'A small engraved plate' },
  front:   { label: 'Drawer front', says: 'A drawer front with a pull' },
  spine:   { label: 'Book spine',   says: 'A spine, the name running up it' },
};

/* ------------------------------------------------------------------ *
 * Reading an object
 * ------------------------------------------------------------------ */

/** The kind an object declares, defaulting to the one that changes nothing. */
export const kindOf = (o) => (o && KINDS[o.kind] ? o.kind : 'slot');

/** The kind's entry. Never undefined. */
export const K = (o) => KINDS[kindOf(o)];

/**
 * The attributes an object actually has: its own list if it carries one,
 * otherwise its kind's. Ask this, never `o.kind === 'note'`.
 */
export const attrsOf = (o) => (Array.isArray(o?.attrs) ? o.attrs : K(o).attrs);

/** Does the object carry this attribute? The one question everything asks. */
export const has = (o, attr) => attrsOf(o).includes(attr);

/** The face it wears: per object, then its kind's. */
export const faceOf = (o) => (o?.face && FACES[o.face] ? o.face : K(o).face);

/** Is this thing's content in the layout data rather than the page? */
export const isTyped = (o) => kindOf(o) !== 'slot';

/** Bureau's word for it, kept: a drawer is an object carrying `container`. */
export const isContainer = (o) => has(o, 'container');

/** Can its words be edited in place? Anything that carries text but is not raw markup. */
export const isInline = (o) => has(o, 'text') && kindOf(o) !== 'html';

/**
 * The fields the settings panel offers, derived from the attributes rather
 * than listed per kind — so an invented combination gets its panel for free.
 */
export function fieldsOf(o) {
  const out = [];
  if (has(o, 'media')) {
    out.push({ key: 'media.src', label: 'Picture', kind: 'text' });
    out.push({ key: 'media.alt', label: 'Alt text', kind: 'text' });
  }
  if (has(o, 'link')) out.push({ key: 'link', label: has(o, 'container') ? 'Opens the page' : 'Links to', kind: 'text' });
  if (has(o, 'container') && !has(o, 'link')) out.push({ key: 'link', label: 'Opens the page', kind: 'text' });
  if (has(o, 'text') && kindOf(o) === 'html') out.push({ key: 'body', label: 'Markup', kind: 'area' });
  if (has(o, 'container') || has(o, 'media')) out.push({ key: 'title', label: 'Title', kind: 'text' });
  return out;
}

/** Read a dotted field off an object. */
export function getField(o, key) {
  return key.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
}

/** Write a dotted field onto an object, creating the path. Empty removes it. */
export function setField(o, key, value) {
  const path = key.split('.');
  const last = path.pop();
  let at = o;
  for (const k of path) at = at[k] ??= {};
  if (value == null || value === '') delete at[last]; else at[last] = value;
  // An emptied media object is no media at all.
  if (path[0] === 'media' && o.media && Object.keys(o.media).length === 0) delete o.media;
  return o;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * Render an object's inside to HTML, or null when the page supplies it.
 *
 * Built from the attributes present, not from the kind: a picture is drawn if
 * there is media, words if there is text, and the whole lot becomes a link if
 * there is one. So a drawer with a picture on its front and a caption draws
 * all three without anyone having designed "a drawer with a picture".
 *
 * `ctx.image(media)` resolves an asset to {src, srcset, sizes} and
 * `ctx.link(href)` prefixes an internal path — both supplied by the caller.
 */
/** Does the object go somewhere? A link, or a container — whose link is its page. */
export const goesSomewhere = (o) => !!((has(o, 'link') || has(o, 'container')) && o.link);

export function renderElement(o, ctx = {}) {
  if (!isTyped(o)) return null;
  const parts = [];
  const linked = goesSomewhere(o);

  if (has(o, 'media') && o.media?.src) {
    const r = ctx.image?.(o.media) ?? { src: o.media.src };
    // Inside a labelled link the image is decorative; the anchor carries the
    // name, and naming both makes a screen reader say it twice.
    const alt = linked ? '' : (o.media.alt ?? '');
    const attrs = [
      `src="${escapeHtml(r.src)}"`,
      r.srcset ? `srcset="${escapeHtml(r.srcset)}"` : '',
      r.sizes ? `sizes="${escapeHtml(r.sizes)}"` : '',
      o.media.width ? `width="${escapeHtml(o.media.width)}"` : '',
      o.media.height ? `height="${escapeHtml(o.media.height)}"` : '',
      `alt="${escapeHtml(alt)}"`,
      !linked && !o.media.alt ? 'aria-hidden="true"' : '',
    ].filter(Boolean).join(' ');
    parts.push(`<img class="ob-img" ${attrs} />`);
  }

  if (o.title && (has(o, 'container') || has(o, 'media'))) {
    parts.push(`<span class="ob-title" data-edit="title">${escapeHtml(o.title)}</span>`);
  }

  if (has(o, 'text') && o.body != null) {
    const body = rewriteLinks(o.body, ctx.link);
    parts.push(kindOf(o) === 'html'
      ? body
      : `<div class="ob-body" data-edit="body">${body}</div>`);
  }

  const inner = parts.join('');
  if (linked) {
    const href = ctx.link?.(o.link) ?? o.link;
    const label = o.media?.alt || o.title;
    const aria = label ? ` aria-label="${escapeHtml(label)}"` : '';
    return `<a class="ob-link" href="${escapeHtml(href)}"${aria}>${inner}</a>`;
  }
  return inner;
}

/** Problems with one object's kind, attributes and fields. Empty means fine. */
export function checkElement(o, at = 'element') {
  const out = [];
  if (o?.kind != null && !KINDS[o.kind]) {
    return [`${at}.kind ${JSON.stringify(o.kind)} is not one of ${Object.keys(KINDS).join(', ')}`];
  }
  if (o?.attrs != null) {
    if (!Array.isArray(o.attrs)) out.push(`${at}.attrs must be an array`);
    else for (const a of o.attrs) if (!ATTRS[a]) out.push(`${at}.attrs has unknown attribute ${JSON.stringify(a)}`);
  }
  if (o?.face != null && !FACES[o.face]) out.push(`${at}.face ${JSON.stringify(o.face)} is not one of ${Object.keys(FACES).join(', ')}`);

  if (!isTyped(o)) {
    // A slot draws nothing from data, so carrying fields is a dropped kind.
    for (const k of ['body', 'media', 'link', 'content']) {
      if (o?.[k] != null) out.push(`${at} has ${k} but kind "slot", so it would never render`);
    }
    return out;
  }

  if (has(o, 'text')) {
    if (o.body != null && typeof o.body !== 'string') out.push(`${at}.body must be a string`);
    const why = unsafeHtml(o.body);
    if (why) out.push(`${at}.body contains ${why}`);
  }
  if (has(o, 'media') && o.media != null) {
    if (typeof o.media !== 'object') out.push(`${at}.media must be an object`);
    else {
      if (typeof o.media.src !== 'string' || !o.media.src) out.push(`${at}.media.src must be a non-empty string`);
      const why = unsafeHtml(o.media.src);
      if (why) out.push(`${at}.media.src contains ${why}`);
    }
  }
  if (has(o, 'link') || has(o, 'container')) {
    if (o.link != null && typeof o.link !== 'string') out.push(`${at}.link must be a string`);
    const why = unsafeHtml(o.link);
    if (why) out.push(`${at}.link contains ${why}`);
  }
  if (has(o, 'container') && !o.link) {
    out.push(`${at} is a container with no page to open — set link to a path like "/links"`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Migration from the v3 shape
 * ------------------------------------------------------------------ */

/**
 * The model before this one stored `type` and a `content` bag. Every layout
 * written that way keeps working: this turns it into the object shape on read,
 * and normalizeElement() calls it. It is also idempotent on new data.
 */
export function upgradeElement(e) {
  if (!e || typeof e !== 'object' || e.kind || !e.type) return e;
  const c = e.content ?? {};
  const out = { ...e };
  delete out.type; delete out.content;
  switch (e.type) {
    case 'text':
      out.kind = 'note'; out.body = c.html ?? '';
      // A run of text on a page was not paper before; keep it looking as it did.
      out.face = 'none';
      break;
    case 'html':
      out.kind = 'html'; out.body = c.html ?? '';
      break;
    case 'image': {
      out.kind = 'image';
      const { href, ...media } = c;
      out.media = media;
      if (href) out.link = href;
      out.face = 'none';
      break;
    }
    default:
      out.kind = 'slot';
  }
  return out;
}

/** A stable small hash, for the tilt a pinned tile gets. Bureau decision 75. */
export function tiltFor(id, max = 2.4) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sign = h & 1 ? 1 : -1;
  return sign * (0.6 + ((h >>> 1) % 1000) / 1000 * (max - 0.6));
}
