/**
 * A film credit: one film, and what Timothy did on it.
 *
 * Drawn as a frame of 35mm film, sprocket holes along both edges, so a column
 * of them on the Films page reads as strips laid on a lightbox. One object
 * per film, on purpose: to add a film you duplicate one and change its
 * fields, from the phone, with no file to edit.
 *
 * The still or poster is the object's own picture (the tool's `media`
 * attribute, so the editor's picture field and upload work on it). With none,
 * a clapperboard is drawn in its place.
 */
import './film.css';
import { boil, box, line, stroke, rng } from './sketch.js';
import { esc, pic, linkAttrs, listOf, uid } from './parts.js';

/** One row of hand-drawn sprocket holes, as an SVG pattern that repeats across any width. */
function sprockets(o, edge) {
  const id = (i) => uid(o, `holes-${edge}-${i}`);
  let defs = '', rows = '';
  for (let i = 0; i < 3; i++) {
    const r = rng(`${o.id}:${edge}:${i}`);
    defs += `<pattern id="${id(i)}" width="30" height="22" patternUnits="userSpaceOnUse">`
      + stroke(box(9, 6, 12, 10, r, { wander: 0.5, overshoot: 0.6 }), 1.4) + '</pattern>';
    rows += `<g><rect width="100%" height="100%" fill="url(#${id(i)})"/></g>`;
  }
  return `<svg class="ss-film-holes ss-film-holes-${edge}" aria-hidden="true"><defs>${defs}</defs><g class="ss-boil">${rows}</g></svg>`;
}

/** A clapperboard, for a film with no picture yet. */
function clapper(o) {
  return `<svg class="ss-film-clap" viewBox="0 0 200 300" aria-hidden="true">${boil(`clap:${o.id}`, (r) => {
    let d = box(30, 130, 140, 110, r) + line(30, 160, 170, 160, r);
    // The hinged sticks, raised, with their stripes.
    d += line(30, 128, 168, 92, r) + line(34, 112, 172, 76, r) + line(30, 128, 34, 112, r) + line(168, 92, 172, 76, r);
    for (let k = 0; k < 4; k++) d += line(60 + k * 30, 120 - k * 8, 72 + k * 30, 102 - k * 8, r, { wander: 0.3 });
    for (let k = 0; k < 3; k++) d += line(46, 182 + k * 18, 120 - k * 14, 182 + k * 18, r, { wander: 0.4 });
    return stroke(d, 2.4);
  })}</svg>`;
}

export const film = {
  label: 'Film credit',
  says: 'A film you worked on, and what you did on it',
  size: [30, 7],
  attrs: ['media'],
  fields: [
    { key: 'data.title', label: 'Title', kind: 'text' },
    { key: 'data.year', label: 'Year', kind: 'number' },
    { key: 'data.roles', label: 'What I did (commas between)', kind: 'list' },
    { key: 'data.form', label: 'What it is (feature, short, web series…)', kind: 'text' },
    { key: 'data.with', label: 'Who for (director or studio)', kind: 'text' },
    { key: 'data.about', label: 'A line about it', kind: 'area' },
    { key: 'data.watch', label: 'Where to watch it (an address, optional)', kind: 'text' },
  ],
  data: { title: 'A film', year: 2026, roles: ['Sound mixer'], form: 'Short film' },

  render(o, ctx) {
    const d = o.data ?? {};
    const roles = listOf(d.roles);
    const meta = [d.form, d.with].filter(Boolean).map(esc).join(' · ');
    const poster = pic(o, ctx, { cls: 'ss-film-pic', alt: o.media?.alt ?? `A still from ${d.title ?? 'the film'}`, sizes: '(max-width: 700px) 30vw, 180px' })
      || clapper(o);
    const watch = d.watch ? `<a class="ss-film-watch" ${linkAttrs(ctx, d.watch)}>Watch</a>` : '';
    return `<article class="ss-film">
      ${sprockets(o, 'top')}
      <div class="ss-film-frame">
        <div class="ss-film-poster">${poster}</div>
        <div class="ss-film-words">
          <h3 class="ss-film-title">${esc(d.title ?? 'Untitled')}</h3>
          ${meta ? `<p class="ss-film-meta">${meta}</p>` : ''}
          ${roles.length ? `<p class="ss-film-roles"><span class="sr-only">What I did: </span>${roles.map(esc).join('<span aria-hidden="true"> · </span>')}</p>` : ''}
          ${d.about ? `<p class="ss-film-about">${esc(d.about)}</p>` : ''}
          ${watch}
        </div>
        ${d.year ? `<p class="ss-film-year">${esc(d.year)}</p>` : ''}
      </div>
      ${sprockets(o, 'bottom')}
    </article>`;
  },

  check(o) {
    return o.data?.watch && !/^(https?:\/\/|\/)/.test(o.data.watch) ? [`${o.id}: data.watch should be an address`] : [];
  },
};
