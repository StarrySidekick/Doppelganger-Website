/**
 * The element type registry.
 *
 * A layout used to hold only geometry, and every element's CONTENT lived as
 * markup inside the .astro page. That markup was unreachable: the editor could
 * move the email tile but could not change the email. This is the fix — an
 * element carries a `type` and a `content` object, and this file says what each
 * type means, how it renders, and what an editor may change about it.
 *
 * Two rules hold this file in shape, and both are load-bearing:
 *
 * 1. **It knows nothing about this website.** No import from src/data, none
 *    from assets.js. Rendering that needs a real asset URL asks the caller
 *    through `ctx`. The grid engine plus this registry plus the editor are a
 *    general thing; the moment one of them imports a Squarespace CDN constant,
 *    it stops being one.
 * 2. **It runs in node and in the browser.** The build renders through it and
 *    the editor validates through it, so nothing here may touch the DOM.
 *    Browser-only work (cleaning what contenteditable produces) lives in
 *    editor.js instead.
 *
 * Adding a type is adding an entry here plus, if it needs one, an editor panel.
 * It is not a change to the engine.
 */

/** Types an element may declare. `slot` is the default and the escape hatch. */
export const TYPES = ['slot', 'text', 'image', 'html'];

/**
 * Text that must survive being put inside HTML.
 * Ampersand first, or it would double-escape the entities added after it.
 */
export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Reject the obvious ways stored HTML turns into a script.
 *
 * This is a guard rail, not a security boundary. The only person who can write
 * this content is whoever can commit to the repo, so there is no attacker to
 * defend against — the point is that a paste from a rich-text source can carry
 * an inline handler by accident, and the BUILD should say so loudly rather than
 * shipping it. validateLayout() runs this, so bad content fails the build.
 */
const FORBIDDEN = [
  [/<\s*script/i, 'a <script> tag'],
  [/<\s*iframe/i, 'an <iframe> — use a dedicated element type instead'],
  [/\son\w+\s*=/i, 'an inline event handler (onclick=, onerror=, …)'],
  [/javascript:/i, 'a javascript: URL'],
];

/** @returns {string|null} what is wrong with this HTML, or null if it is fine */
export function unsafeHtml(html) {
  for (const [re, why] of FORBIDDEN) if (re.test(String(html ?? ''))) return why;
  return null;
}

/* ------------------------------------------------------------------ *
 * The types
 * ------------------------------------------------------------------ */

/**
 * Each type declares:
 *   label     what the editor calls it
 *   inline    can its text be edited in place, by double-clicking it?
 *   fields    what the settings panel offers: {key, label, kind}
 *   render    content -> HTML string, or null to mean "the page supplies this"
 *   check     content -> array of problems
 *
 * `render` receives (content, ctx). `ctx.image(content)` resolves an asset to
 * {src, srcset, sizes} and `ctx.link(href)` prefixes an internal path — both are
 * supplied by the caller, per the note at the top about why they aren't imported.
 */
export const ELEMENTS = {
  /**
   * Content comes from the page's own markup.
   *
   * This is the default for an element with no `type`, which is what keeps
   * every layout written before this file existed working untouched. It is also
   * the right answer for anything a component renders — the flip card is a
   * component with its own holographic shader, and dragging that through a
   * content schema would buy nothing.
   */
  slot: {
    label: 'From the page',
    inline: false,
    fields: [],
    render: () => null,
    check: () => [],
  },

  /**
   * A run of text, editable in place. Links and light emphasis allowed.
   * The stored value is HTML because "Email: <a>…</a>" is one phrase, and
   * splitting it into text plus a link would make it two things to edit.
   */
  text: {
    label: 'Text',
    inline: true,
    fields: [],
    render: (c) => c?.html ?? '',
    check: (c) => {
      if (typeof c?.html !== 'string') return ['content.html must be a string'];
      const why = unsafeHtml(c.html);
      return why ? [`content.html contains ${why}`] : [];
    },
  },

  /**
   * An image, optionally wrapped in a link.
   *
   * `src` is either a URL or an asset key the caller resolves, and `href` may be
   * a site-relative path the caller prefixes. Both go through `ctx` rather than
   * being used raw, and that indirection is load-bearing twice over: it keeps
   * the CDN srcset that took the homepage from 15.3 MB to 0.7 MB, and it keeps
   * internal links going through url(), which the deploy subpath requires.
   */
  image: {
    label: 'Image',
    inline: false,
    fields: [
      { key: 'src', label: 'Source', kind: 'text' },
      { key: 'alt', label: 'Alt text', kind: 'text' },
      { key: 'href', label: 'Links to', kind: 'text' },
    ],
    render: (c, ctx = {}) => {
      const r = ctx.image?.(c) ?? { src: c.src };
      const href = ctx.link?.(c.href) ?? c.href;
      // Inside a labelled link the image is decorative: giving both the anchor
      // and the img the same name makes a screen reader announce it twice.
      const alt = href ? '' : (c.alt ?? '');
      const attrs = [
        `src="${escapeHtml(r.src)}"`,
        r.srcset ? `srcset="${escapeHtml(r.srcset)}"` : '',
        r.sizes ? `sizes="${escapeHtml(r.sizes)}"` : '',
        c.width ? `width="${escapeHtml(c.width)}"` : '',
        c.height ? `height="${escapeHtml(c.height)}"` : '',
        `alt="${escapeHtml(alt)}"`,
        // Only a standalone decorative image needs hiding. Inside a link the
        // empty alt already does it, and the anchor carries the name — so
        // adding aria-hidden there is noise that the markup this replaced
        // rightly did not have.
        !href && !c.alt ? 'aria-hidden="true"' : '',
      ].filter(Boolean).join(' ');
      const img = `<img ${attrs} />`;
      if (!href) return img;
      const label = c.alt ? ` aria-label="${escapeHtml(c.alt)}"` : '';
      return `<a href="${escapeHtml(href)}"${label}>${img}</a>`;
    },
    check: (c) => {
      const out = [];
      if (typeof c?.src !== 'string' || !c.src) out.push('content.src must be a non-empty string');
      if (c?.alt != null && typeof c.alt !== 'string') out.push('content.alt must be a string');
      for (const key of ['src', 'href']) {
        const why = c?.[key] && unsafeHtml(c[key]);
        if (why) out.push(`content.${key} contains ${why}`);
      }
      return out;
    },
  },

  /**
   * A block of markup that is more than a sentence — edited in the settings
   * panel as a textarea, never in place, because a stray keystroke inside
   * structural markup is much harder to notice than one inside a sentence.
   */
  html: {
    label: 'HTML block',
    inline: false,
    fields: [{ key: 'html', label: 'Markup', kind: 'area' }],
    render: (c) => c?.html ?? '',
    check: (c) => {
      if (typeof c?.html !== 'string') return ['content.html must be a string'];
      const why = unsafeHtml(c.html);
      return why ? [`content.html contains ${why}`] : [];
    },
  },
};

/** The type an element declares, defaulting to the one that changes nothing. */
export const typeOf = (e) => (e && ELEMENTS[e.type] ? e.type : 'slot');

/** The registry entry for an element. Never undefined. */
export const specOf = (e) => ELEMENTS[typeOf(e)];

/** Does this element's content live in the layout data rather than the page? */
export const isTyped = (e) => typeOf(e) !== 'slot';

/** Can its text be edited by double-clicking it in the page? */
export const isInline = (e) => specOf(e).inline;

/**
 * Render one element's content to HTML, or null when the page supplies it.
 * @param {object} e       the element
 * @param {object} [ctx]   caller-supplied resolvers, e.g. {image(src)}
 */
export function renderElement(e, ctx) {
  const spec = specOf(e);
  return spec.render(e?.content ?? {}, ctx);
}

/** Problems with one element's type and content. Empty array means fine. */
export function checkElement(e, at = 'element') {
  if (e?.type != null && !TYPES.includes(e.type)) {
    return [`${at}.type ${JSON.stringify(e.type)} is not one of ${TYPES.join(', ')}`];
  }
  if (!isTyped(e)) {
    // A slot's content is never rendered, so carrying one is a sign the type
    // was dropped or misspelled — say so instead of silently ignoring it.
    return e?.content ? [`${at} has content but type "slot", so it would never render`] : [];
  }
  return specOf(e).check(e.content ?? {}).map((p) => `${at}.${p.replace(/^content\./, 'content.')}`);
}
