/**
 * Small pieces every one of the site's kinds uses.
 *
 * Kept apart from DigiDesk on purpose: a visitor's page loads the site's
 * kinds to wake them, and importing the tool's object model for one escape
 * function would make every visitor download the editor's half of it.
 */

/** Text made safe to put inside HTML, attribute or element. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The object's own picture, as an <img>, or nothing. Resolved by the tool's
 * `ctx.image`, so an `asset:` key, a `media:` file and a CDN address all
 * work, and a CDN picture comes at the size it is drawn.
 */
export function pic(o, ctx, { cls = '', alt, sizes, eager = false } = {}) {
  if (!o.media?.src) return '';
  const r = ctx.image?.(o.media) ?? { src: o.media.src };
  if (!r.src) return '';
  const a = alt ?? o.media.alt ?? '';
  return `<img class="${cls}" src="${esc(r.src)}"`
    + (r.srcset ? ` srcset="${esc(r.srcset)}" sizes="${esc(sizes ?? r.sizes ?? '50vw')}"` : '')
    + ` alt="${esc(a)}"${eager ? '' : ' loading="lazy"'} decoding="async" />`;
}

/** Any address as an href: a path on this site goes through the deploy base (hard rule 2). */
export function hrefOf(ctx, link) {
  if (!link) return '';
  return link.startsWith('/') ? (ctx.link?.(link) ?? link) : link;
}

/** The attributes an <a> needs: its own tab for somewhere else, this one for here. */
export const linkAttrs = (ctx, link) =>
  `href="${esc(hrefOf(ctx, link))}"${link.startsWith('/') || link.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}`;

/** A list field, however it arrived: an array, or words with commas between. */
export const listOf = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);

/**
 * Is the board being arranged? While it is, a press belongs to the editor
 * (pick up, move, resize), so nothing here may also flip, play or open.
 * Locked, the editor shows the site exactly as a visitor gets it, and so do
 * these.
 */
export const arranging = () => document.documentElement.classList.contains('ag-unlocked');

/** Somebody asked their system for less motion. */
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** An id that is this object's own, for SVG defs: ids are global to the page (hard rule 0). */
export const uid = (o, part) => `ss-${String(o.id ?? 'x').replace(/[^a-z0-9-]/gi, '')}-${part}`;
