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
 * site map is the container tree, and there are no desks — a website has
 * pages, and pages are what a drawer opens.
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
  fold:      { label: 'Folds',     says: 'Has a folded size and an open size, and toggles between them', field: 'fold' },
  holds:     { label: 'Holds',     says: 'Holds other objects and lays them out by a rule', field: 'items' },
  feed:      { label: 'Feed',      says: 'Shows the works the site knows about, filtered and tagged', field: 'feed' },
  /* Bureau's decision 86, whole. A decoration is not information: it is the
     aspidistra on the bookcase, and it is the one thing on the board allowed
     to OVERLAP — a plant standing in front of a row of books is what a shelf
     looks like, and a grid that refuses it is a spreadsheet. On this site that
     is the sun, the holo, the business card: things that stand on the page
     rather than in it. `boxOk` lets it lie across anything and lets anything
     lie across it; Tidy leaves it where it is; it draws above the rest. */
  decor:     { label: 'Decoration', says: 'Stands on the board rather than in it — may overlap anything, and nothing makes room for it' },
  /* The web layer's first attribute. A form is fields that email you when
     sent, and on a static site that means a form service: Web3Forms, which
     the hand-written /contact already uses. The key is public by design — it
     is in the page for anyone to read — so it is data like everything else. */
  form:      { label: 'Form',      says: 'Fields that email you when sent — needs a free Web3Forms key', field: 'form' },
};

/** The fields a form may ask for, in the order they usually come. */
export const FORM_FIELDS = {
  name:    { label: 'Name',    type: 'text' },
  email:   { label: 'Email',   type: 'email' },
  subject: { label: 'Subject', type: 'text' },
  message: { label: 'Message', type: 'textarea' },
};
export const FORM_ENDPOINT = 'https://api.web3forms.com/submit';
export const formOf = (o) => ({
  key: typeof o?.form?.key === 'string' ? o.form.key : '',
  fields: Array.isArray(o?.form?.fields) && o.form.fields.length ? o.form.fields : ['name', 'email', 'message'],
  button: typeof o?.form?.button === 'string' && o.form.button ? o.form.button : 'Send',
});

/** The attribute names an editor may toggle. `container` is deliberate, not a chip. */
export const USER_ATTRS = ['text', 'media', 'link', 'fold', 'holds', 'feed', 'form', 'decor'];

/** Does it stand above the board rather than take a place on it? */
export const isDecor = (o) => has(o, 'decor');

/* ------------------------------------------------------------------ *
 * What a click does
 * ------------------------------------------------------------------ */

/**
 * Bureau's `clickOf()`, in web verbs. Per object, then its kind's, then a
 * default that asks the object what it *is* rather than what it is called.
 *
 * "Send to page" is the one that gets used constantly, and it is deliberately
 * not the same as "open a link": an internal path goes through the caller's
 * url() resolver (hard rule 2) and an external one does not.
 */
export const CLICKS = {
  none: 'Nothing',
  page: 'Go to a page on this site',
  url:  'Open a web address',
  fold: 'Fold it open and shut',
};

/** What a click on this object does. */
export const clickOf = (o) => {
  const said = o?.onclick ?? K(o).onclick;
  if (said && CLICKS[said]) return said;
  if (has(o, 'fold')) return 'fold';
  if ((has(o, 'link') || has(o, 'container')) && o?.link) {
    return String(o.link).startsWith('/') ? 'page' : 'url';
  }
  return 'none';
};

/* ------------------------------------------------------------------ *
 * How a holder lays out what it holds
 * ------------------------------------------------------------------ */

/**
 * The one place this tool does anything fluid, and it is deliberately fenced
 * into a single tile. The board itself is rigid — nothing on it moves unless
 * you move it — but a holder is a box whose *contents* flow, which is what an
 * accordion, a list of links or a wrapping gallery all are.
 */
export const ARRANGES = {
  stack:     'One under another',
  row:       'Side by side',
  grid:      'A wrapping grid',
  accordion: 'Titles, opening one at a time',
};

export const arrangeOf = (o) => (ARRANGES[o?.arrange] ? o.arrange : 'stack');

/* ------------------------------------------------------------------ *
 * A feed — the works, filtered
 * ------------------------------------------------------------------ */

/**
 * `holds` carries its own things; `feed` draws them from what the site knows
 * it has made. That is the difference between a list you wrote and a list that
 * is true — add a work once and every feed matching it shows it, on every page.
 *
 * This file still knows nothing about the site: a feed is a QUERY, and the
 * caller answers it through `ctx.works(query)`. Hard rule 4, the same way
 * `ctx.image` and `ctx.link` already work.
 */
export const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title:  'By title',
};

export const sortOf = (o) => (SORTS[o?.feed?.sort] ? o.feed.sort : 'newest');

/** The query a feed object is asking. Always an object, always complete. */
export const feedOf = (o) => ({
  type: o?.feed?.type || '',
  tag: o?.feed?.tag || '',
  limit: Number.isFinite(o?.feed?.limit) && o.feed.limit > 0 ? Math.round(o.feed.limit) : 0,
  sort: sortOf(o),
  // Whether a visitor can narrow it further themselves. A section page wants
  // the chips; a short "recent work" strip on the home page does not.
  chips: o?.feed?.chips !== false,
});

/* ------------------------------------------------------------------ *
 * Kinds — named presets of attributes
 * ------------------------------------------------------------------ */

/**
 * A kind is a preset, not a category. Changing an object's kind swaps which
 * attributes it has and leaves its data alone. Each states the attributes it
 * carries, the face it wears by default, and the size a new one is born at —
 * in **cells**, which are square (see adaptive-grid.js).
 *
 * `slot` is the odd one out and the escape hatch: its content comes from the
 * page's own markup, which is right for anything a component renders — the
 * flip card has its own shader and a schema would only get in its way. It is
 * also what keeps every layout written before this file rendering untouched.
 */
export const KINDS = {
  slot:   { label: 'From the page', says: 'Rendered by the page itself',             attrs: [],                            face: 'none',    size: [6, 4] },
  note:   { label: 'Note',          says: 'Words on paper',                          attrs: ['text'],                      face: 'note',    size: [6, 3], body: 'A note.' },
  image:  { label: 'Image',         says: 'A picture, which can be a way somewhere', attrs: ['media', 'link'],             face: 'picture', size: [4, 4] },
  button: { label: 'Button',        says: 'A label that goes somewhere',             attrs: ['text', 'link'],              face: 'plaque',  size: [4, 1], body: 'Go' },
  drawer: { label: 'Drawer',        says: 'Opens onto a page of its own',            attrs: ['container', 'media', 'text'], face: 'front',   size: [5, 4] },
  fold:   { label: 'Fold',          says: 'A title that opens to reveal more',       attrs: ['text', 'fold'],              face: 'card',    size: [6, 1], body: 'What it says when open.', title: 'Open me', fold: { cols: 8, rows: 4 } },
  list:   { label: 'Holder',        says: 'Holds other objects and lays them out',   attrs: ['holds', 'text'],             face: 'card',    size: [6, 5], arrange: 'stack' },
  works:  { label: 'Works',         says: 'The things you have made, filtered by tag', attrs: ['feed', 'text'],              face: 'none',    size: [14, 10] },
  html:   { label: 'HTML block',    says: 'A block of markup, edited as markup',     attrs: ['text'],                      face: 'none',    size: [6, 3], body: '' },
  form:   { label: 'Contact form',  says: 'Fields that email you when sent',         attrs: ['form', 'text'],              face: 'card',    size: [10, 9], form: { key: '', fields: ['name', 'email', 'message'], button: 'Send' } },
};

/** Kinds the picker offers. `slot` is written by code, `html` is a tool. */
export const PICKER_KINDS = ['note', 'image', 'button', 'drawer', 'fold', 'list', 'works', 'form'];

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
  panel:   { label: 'Panel',        says: 'A flat panel with a hairline edge' },
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

/** Does the object go somewhere? A link, or a container — whose link is its page. */
export const goesSomewhere = (o) =>
  !!((has(o, 'link') || has(o, 'container')) && o.link && ['page', 'url'].includes(clickOf(o)));

/** How big it is when folded open, in cells. */
export const foldSpan = (o) => ({
  cols: Math.max(1, Math.round(o?.fold?.cols ?? K(o).fold?.cols ?? 8)),
  rows: Math.max(1, Math.round(o?.fold?.rows ?? K(o).fold?.rows ?? 4)),
});

/** What a holder holds. Always an array. */
export const itemsOf = (o) => (Array.isArray(o?.items) ? o.items : []);

/**
 * One held thing, built from the words someone typed for it.
 *
 * An item is an ordinary object, so it needs a real kind — a `slot` draws
 * nothing from data and carrying fields makes it fail its own check. It gets
 * `note` and an explicit attribute list, which is the model working exactly as
 * intended: what this thing can do is decided by what it was given, not by a
 * name chosen for it.
 */
/**
 * An object on the board, as a thing a holder holds — and back.
 *
 * Bureau's `gather` (its decision 24): two things dropped together become a
 * container holding them. A held thing is the object with its geometry taken
 * off: no box, no flow, no lock, no id, because inside a holder its place is
 * its position in the list. `fromItem` gives it back everything but a box,
 * which the caller finds room for.
 */
const GEOMETRY_KEYS = ['id', 'desk', 'narrow', 'flow', 'locked', 'col', 'row'];
export function toItem(o) {
  const it = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (GEOMETRY_KEYS.includes(k) || v == null) continue;
    it[k] = typeof v === 'object' ? structuredClone(v) : v;
  }
  if (!it.kind) it.kind = 'note';
  return it;
}
export function fromItem(it, id) {
  const o = toItem(it);
  o.id = id;
  o.flow = 'stack';
  return o;
}

export function makeItem({ title = '', body = '', link = '', src = '' } = {}) {
  const attrs = ['text'];
  if (link) attrs.push('link');
  if (src) attrs.push('media');
  const it = { kind: 'note', attrs, face: 'none' };
  if (title) it.title = title;
  if (body) it.body = body;
  if (link) it.link = link;
  if (src) it.media = { src };
  return it;
}

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
  if (has(o, 'container') || has(o, 'link')) {
    out.push({ key: 'link', label: has(o, 'container') ? 'Opens the page' : 'Goes to', kind: 'text' });
  }
  if (has(o, 'text') && kindOf(o) === 'html') out.push({ key: 'body', label: 'Markup', kind: 'area' });
  if (has(o, 'container') || has(o, 'media') || has(o, 'fold') || has(o, 'holds')) {
    out.push({ key: 'title', label: 'Title', kind: 'text' });
  }
  if (has(o, 'fold')) {
    out.push({ key: 'fold.cols', label: 'Open width (cells)', kind: 'number' });
    out.push({ key: 'fold.rows', label: 'Open height (cells)', kind: 'number' });
  }
  if (has(o, 'holds')) {
    out.push({ key: 'arrange', label: 'Lays them out', kind: 'select', options: ARRANGES });
    /* What it holds is a field like any other. It had none, which meant a
       holder could be made from the picker and then never filled — the
       accordion and the gallery were both unreachable from the editor, and the
       only way to put anything in one was to write the JSON by hand. `holds`
       declared `items` as its field all along; this is the field. */
    out.push({ key: 'items', label: 'What it holds', kind: 'items' });
  }
  if (has(o, 'feed')) out.push({ key: 'feed', label: 'Shows', kind: 'feed' });
  if (has(o, 'form')) {
    out.push({ key: 'form.key', label: 'Web3Forms access key', kind: 'text' });
    out.push({ key: 'form.fields', label: 'Asks for (name, email, subject, message)', kind: 'list' });
    out.push({ key: 'form.button', label: 'The button says', kind: 'text' });
  }
  // What a click does is a field like any other, so an invented combination
  // gets it too. Bureau's clickOf(), asked as a question in the panel.
  out.push({ key: 'onclick', label: 'When clicked', kind: 'select', options: { '': `Whatever suits (${clickOf(o)})`, ...CLICKS } });
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
  // An emptied sub-object is no sub-object at all.
  const head = path[0];
  if (head && o[head] && typeof o[head] === 'object' && !Array.isArray(o[head]) && Object.keys(o[head]).length === 0) {
    delete o[head];
  }
  return o;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** The picture, title and words an object shows — its inside, without its shell. */
function inner(o, ctx, { linked = false, depth = 0 } = {}) {
  const parts = [];

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

  if (o.title && (has(o, 'container') || has(o, 'media') || has(o, 'holds') || has(o, 'feed'))) {
    parts.push(`<span class="ob-title" data-edit="title">${escapeHtml(o.title)}</span>`);
  }

  if (has(o, 'holds')) parts.push(renderHolder(o, ctx, depth));
  if (has(o, 'feed')) parts.push(renderFeed(o, ctx));
  if (has(o, 'form')) parts.push(renderForm(o));

  if (has(o, 'text') && o.body != null && !has(o, 'fold')) {
    const body = rewriteLinks(o.body, ctx.link);
    parts.push(kindOf(o) === 'html' ? body : `<div class="ob-body" data-edit="body">${body}</div>`);
  }
  return parts.join('');
}

/**
 * Wrap an object's inside in the anchor that makes it go somewhere.
 *
 * One definition, because two things need it: an object on the board, and a
 * thing inside a holder. A held item that carried a link used to render as
 * plain words — so "a row of links", one of the three things a holder exists
 * for, quietly was not one.
 */
function linkWrap(o, ctx, guts) {
  const href = ctx.link?.(o.link) ?? o.link;
  const label = o.media?.alt || o.title;
  const aria = label ? ` aria-label="${escapeHtml(label)}"` : '';
  // An external address opens in its own tab; an internal one is navigation.
  const ext = clickOf(o) === 'url' ? ' target="_blank" rel="noopener"' : '';
  return `<a class="ob-link" href="${escapeHtml(href)}"${aria}${ext}>${guts}</a>`;
}

/**
 * The works, drawn from whatever the caller says matches the query.
 *
 * `ctx.works(query)` hands back `{items, tags}` with every address already
 * resolved — this file never learns what a work is or where one lives. The
 * chips are plain buttons; `interact.js` makes them narrow the list, so a
 * visitor gets the filter without downloading the editor.
 */
function renderFeed(o, ctx) {
  const q = feedOf(o);
  const got = ctx.works?.(q);
  // No resolver — the editor's own preview, or a page that never wired one up.
  // Say so rather than drawing a convincing empty list.
  if (!got) return `<div class="ob-feed" data-feed><p class="ob-empty">The works are drawn in when the page is built.</p></div>`;

  const items = got.items ?? [];
  const tags = q.chips ? (got.tags ?? []) : [];
  const chips = tags.length ? `<div class="ob-tags" role="group" aria-label="Filter by tag">
      <button class="ob-tag" type="button" data-tag="" aria-pressed="true">All</button>
      ${tags.map((t) => `<button class="ob-tag" type="button" data-tag="${escapeHtml(t)}" aria-pressed="false">${escapeHtml(t)}</button>`).join('')}
    </div>` : '';

  const cards = items.map((w) => {
    const img = w.image?.src
      ? `<img class="ob-work-img" src="${escapeHtml(w.image.src)}"${w.image.srcset ? ` srcset="${escapeHtml(w.image.srcset)}"` : ''} alt="" aria-hidden="true" />`
      : '';
    const meta = [w.typeLabel, w.year].filter(Boolean).join(' · ');
    // Pipe-delimited so a filter is one substring test rather than a parse,
    // and so a tag containing a space still matches exactly.
    const key = `|${(w.tags ?? []).join('|')}|`;
    const body = `${img}
      <span class="ob-work-title">${escapeHtml(w.title ?? 'Untitled')}</span>
      ${meta ? `<span class="ob-work-meta">${escapeHtml(meta)}</span>` : ''}
      ${w.blurb ? `<span class="ob-work-blurb">${escapeHtml(w.blurb)}</span>` : ''}`;
    const ext = w.href && !w.internal ? ' target="_blank" rel="noopener"' : '';
    return w.href
      ? `<a class="ob-work" data-work data-tags="${escapeHtml(key)}" href="${escapeHtml(w.href)}"${ext}>${body}</a>`
      : `<div class="ob-work" data-work data-tags="${escapeHtml(key)}">${body}</div>`;
  }).join('');

  const empty = items.length ? '' :
    `<p class="ob-empty">Nothing here yet. Works are added in the editor, or in <code>src/data/works.json</code>.</p>`;
  return `<div class="ob-feed" data-feed>${chips}<div class="ob-works">${cards}</div>${empty}</div>`;
}

/** What a holder holds, laid out by its rule. One level deep only. */
/**
 * A form that emails you. Posts to Web3Forms as the hand-written /contact
 * does; interact.js sends it with fetch so the visitor stays on the page, and
 * a browser without JS still gets the plain POST. With no key the button is
 * disabled and the form says so — a form that looks live and drops every
 * message on the floor is the worst outcome a contact page can have.
 */
function renderForm(o) {
  const f = formOf(o);
  const ready = !!f.key;
  const controls = f.fields.filter((k) => FORM_FIELDS[k]).map((k) => {
    const d = FORM_FIELDS[k];
    const control = d.type === 'textarea'
      ? `<textarea name="${k}" rows="5" required></textarea>`
      : `<input type="${d.type}" name="${k}" required />`;
    return `<label class="ob-field">${escapeHtml(d.label)} ${control}</label>`;
  }).join('');
  return `<form class="ob-form" action="${FORM_ENDPOINT}" method="POST" data-form${ready ? '' : ' data-unready'}>
    <input type="hidden" name="access_key" value="${escapeHtml(f.key)}" />
    <input type="checkbox" name="botcheck" class="ob-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
    ${controls}
    <button class="ob-send" type="submit"${ready ? '' : ' disabled'}>${escapeHtml(ready ? f.button : `${f.button} (needs a key)`)}</button>
    <p class="ob-sent" hidden>Sent — thank you.</p>
  </form>`;
}

function renderHolder(o, ctx, depth) {
  const items = itemsOf(o);
  const arrange = arrangeOf(o);
  if (!items.length) return `<div class="ob-holds ar-${arrange}" data-arrange="${arrange}"></div>`;
  // Depth 1: a holder inside a holder would be a layout engine, and the board
  // is the layout engine. An item that holds is drawn as its title alone.
  const drawn = items.map((it, i) => {
    const face = faceOf(it);
    const linked = depth === 0 && goesSomewhere(it);
    // A held thing carrying nothing but a title still has to say something,
    // and its title is the only words it has. That is the whole of "a row of
    // links": a label and somewhere to go.
    const guts = depth > 0
      ? escapeHtml(it.title ?? '')
      : (inner(it, ctx, { linked, depth: depth + 1 })
         || `<div class="ob-body">${escapeHtml(it.title ?? '')}</div>`);
    const drawnItem = linked ? linkWrap(it, ctx, guts) : guts;
    if (arrange !== 'accordion') {
      return `<div class="ob-item fc-${face}" data-item="${i}">${drawnItem}</div>`;
    }
    // In an accordion the title is the control that opens the panel, so what
    // the item holds — its words, its picture, its link — is what is inside.
    return `<div class="ob-item fc-${face}" data-item="${i}">
      <button class="ob-tab" type="button" data-acc="${i}" aria-expanded="false">${escapeHtml(it.title ?? `Item ${i + 1}`)}</button>
      <div class="ob-panel" hidden>${depth > 0 ? '' : drawnItem}</div>
    </div>`;
  }).join('');
  return `<div class="ob-holds ar-${arrange}" data-arrange="${arrange}">${drawn}</div>`;
}

/**
 * Render an object's inside to HTML, or null when the page supplies it.
 *
 * Built from the attributes present, not from the kind: a picture is drawn if
 * there is media, words if there is text, a list if it holds things, and the
 * whole lot becomes a link if a click is meant to take you somewhere. So a
 * drawer with a picture on its front and a caption draws all three without
 * anyone having designed "a drawer with a picture".
 *
 * `ctx.image(media)` resolves an asset to {src, srcset, sizes} and
 * `ctx.link(href)` prefixes an internal path — both supplied by the caller.
 */
export function renderElement(o, ctx = {}) {
  if (!isTyped(o)) return null;

  // A fold is a shell of its own: a tab that is always there, and a panel that
  // the click opens. The panel is an OVERLAY, not a resize — see faces.css.
  // Growing the tile would push its neighbours, and on a rigid board nothing
  // moves unless you move it.
  if (has(o, 'fold')) {
    const { cols, rows } = foldSpan(o);
    const body = rewriteLinks(o.body ?? '', ctx.link);
    return `<button class="ob-tab" type="button" data-fold aria-expanded="false"`
      + ` style="--fold-w:${cols};--fold-h:${rows}">`
      + `<span class="ob-title" data-edit="title">${escapeHtml(o.title ?? 'Open')}</span></button>`
      + `<div class="ob-fold" hidden>${inner(o, ctx)}<div class="ob-body" data-edit="body">${body}</div></div>`;
  }

  const linked = goesSomewhere(o);
  const guts = inner(o, ctx, { linked });
  return linked ? linkWrap(o, ctx, guts) : guts;
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
  if (o?.onclick != null && o.onclick !== '' && !CLICKS[o.onclick]) out.push(`${at}.onclick ${JSON.stringify(o.onclick)} is not one of ${Object.keys(CLICKS).join(', ')}`);

  if (!isTyped(o)) {
    // A slot draws nothing from data, so carrying fields is a dropped kind.
    for (const k of ['body', 'media', 'link', 'content', 'items', 'feed', 'form']) {
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
  if (has(o, 'fold') && o.fold != null) {
    for (const k of ['cols', 'rows']) {
      const v = o.fold[k];
      if (v != null && (!Number.isFinite(v) || v < 1)) out.push(`${at}.fold.${k} must be a positive number of cells`);
    }
  }
  if (has(o, 'feed') && o.feed != null) {
    if (typeof o.feed !== 'object' || Array.isArray(o.feed)) out.push(`${at}.feed must be an object`);
    else {
      for (const k of ['type', 'tag']) {
        if (o.feed[k] != null && typeof o.feed[k] !== 'string') out.push(`${at}.feed.${k} must be a string`);
      }
      if (o.feed.limit != null && (!Number.isFinite(o.feed.limit) || o.feed.limit < 1)) {
        out.push(`${at}.feed.limit must be a positive number of works`);
      }
      if (o.feed.sort != null && !SORTS[o.feed.sort]) {
        out.push(`${at}.feed.sort ${JSON.stringify(o.feed.sort)} is not one of ${Object.keys(SORTS).join(', ')}`);
      }
      if (o.feed.chips != null && typeof o.feed.chips !== 'boolean') out.push(`${at}.feed.chips must be true or false`);
    }
  }
  if (has(o, 'holds')) {
    if (o.arrange != null && !ARRANGES[o.arrange]) out.push(`${at}.arrange ${JSON.stringify(o.arrange)} is not one of ${Object.keys(ARRANGES).join(', ')}`);
    if (o.items != null && !Array.isArray(o.items)) out.push(`${at}.items must be an array`);
    else for (const [i, it] of itemsOf(o).entries()) out.push(...checkElement(it, `${at}.items[${i}]`));
  }
  if (has(o, 'form') && o.form != null) {
    if (typeof o.form !== 'object') out.push(`${at}.form must be an object`);
    else {
      if (o.form.key != null && typeof o.form.key !== 'string') out.push(`${at}.form.key must be a string`);
      if (o.form.fields != null) {
        if (!Array.isArray(o.form.fields)) out.push(`${at}.form.fields must be an array`);
        else for (const k of o.form.fields) if (!FORM_FIELDS[k]) out.push(`${at}.form.fields has unknown field ${JSON.stringify(k)} — one of ${Object.keys(FORM_FIELDS).join(', ')}`);
      }
      if (o.form.button != null && typeof o.form.button !== 'string') out.push(`${at}.form.button must be a string`);
    }
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

/* ------------------------------------------------------------------ *
 * Changing what a thing is
 * ------------------------------------------------------------------ */

/**
 * Give an object a different kind, keeping its data.
 *
 * Bureau's rule, and the reason a kind is a preset rather than a category:
 * changing it swaps which attributes the object has and touches nothing it
 * holds. A note told to be a drawer keeps its words; they simply stop being
 * drawn until something gives it `text` back. Nothing is thrown away for a
 * choice you might undo a second later.
 *
 * Any hand-set attribute list goes, because that list was chosen against the
 * old kind — keeping it would mean picking "Image" and getting a note.
 */
export function setKind(o, kind) {
  if (!KINDS[kind]) return o;
  o.kind = kind;
  delete o.attrs;
  // A face chosen for the old kind rarely suits the new one; the kind's own
  // face is the honest default, and the face picker is right there.
  delete o.face;
  // Fill in whatever the new kind cannot do without, and only that.
  for (const k of ['body', 'title', 'fold', 'arrange', 'form']) {
    if (KINDS[kind][k] != null && o[k] == null) o[k] = structuredClone(KINDS[kind][k]);
  }
  /* Nothing is DELETED here, and that is the point of the whole function. A
     field the new kind cannot draw simply stops being drawn; it is still there
     when you change your mind, which is the difference between a preset and a
     conversion. (Making a NEW object is the other case — there, an unusable
     default body should never be written down in the first place.) */
  return o;
}

/**
 * Turn one attribute on or off, writing the list down on the object.
 *
 * The moment you say "this note also carries a picture" the object stops being
 * describable by its kind's preset, so the list becomes its own. That is the
 * model's whole promise kept: an invented combination works everywhere
 * immediately, because everything asks `has()` and nothing asks the name.
 */
export function toggleAttr(o, attr, on) {
  if (!ATTRS[attr]) return o;
  const next = new Set(attrsOf(o));
  if (on) next.add(attr); else next.delete(attr);
  o.attrs = [...next];
  // Back to exactly what the kind says? Then it has nothing of its own to
  // remember, and the file should not carry a list that changes nothing.
  const same = K(o).attrs;
  if (o.attrs.length === same.length && o.attrs.every((a) => same.includes(a))) delete o.attrs;
  // An attribute that is gone takes its field with it, or the object keeps
  // failing a check for something it no longer claims to be.
  if (!on) {
    const field = ATTRS[attr].field;
    if (field && field !== 'items') delete o[field];
    if (attr === 'holds') { delete o.items; delete o.arrange; }
  }
  return o;
}

/** A stable small hash, for the tilt a pinned tile gets. Bureau decision 75. */
export function tiltFor(id, max = 2.4) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sign = h & 1 ? 1 : -1;
  return sign * (0.6 + ((h >>> 1) % 1000) / 1000 * (max - 0.6));
}
