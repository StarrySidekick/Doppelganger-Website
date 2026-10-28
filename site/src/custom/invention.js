/**
 * An invention: an app or a thing, drawn as a patent sheet.
 *
 * A rule across the top with the inventor and the name, the figure in the
 * middle (the object's own picture, or a drawn bulb with numbered leader
 * lines, the way a patent drawing labels its parts), FIG. 1 under it, a
 * rubber stamp saying where it stands, and the description at the foot.
 *
 * Inventions are the things that are not games: apps, tools, objects. One
 * object per invention, like the films and the cards.
 */
import './invention.css';
import { boil, box, circle, line, through, curl, stroke } from './sketch.js';
import { esc, pic, linkAttrs } from './parts.js';

const sheet = (seed) => `<svg class="ss-draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${boil(seed, (r) =>
  stroke(box(1, 1, 98, 98, r, { wander: 0.2, overshoot: 0.6 }), 1.4, ' vector-effect="non-scaling-stroke"'))}</svg>`;

/** A bulb, labelled 1 to 3 like a patent drawing, for an invention with no picture yet. */
const figure = (seed) => `<svg class="ss-invention-fig-draw" viewBox="0 0 300 220" aria-hidden="true">${boil(seed, (r) => {
  const cx = 130, cy = 92;
  const glass = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * 0.72 + (i / 40) * Math.PI * 1.56;
    glass.push([cx + Math.cos(a) * 52, cy + Math.sin(a) * 55]);
  }
  glass.push([cx + 22, cy + 66], [cx + 20, cy + 84]);
  glass.unshift([cx - 20, cy + 84], [cx - 22, cy + 66]);
  let d = through(glass);
  for (let k = 0; k < 3; k++) d += line(cx - 21, cy + 88 + k * 8, cx + 21, cy + 88 + k * 8, r, { wander: 0.4 });
  d += through(curl(cx - 6, cy + 66, -Math.PI / 2, 56, 1, r, { wind: 1.3 })) + through(curl(cx + 6, cy + 66, -Math.PI / 2, 56, -1, r, { wind: 1.3 }));
  // Leader lines out to the numbers.
  d += line(cx + 40, cy - 30, 240, 40, r, { wander: 0.3 }) + line(cx + 4, cy + 30, 240, 110, r, { wander: 0.3 }) + line(cx + 22, cy + 96, 240, 180, r, { wander: 0.3 });
  d += circle(252, 40, 9, r) + circle(252, 110, 9, r) + circle(252, 180, 9, r);
  return stroke(d, 1.8);
})}<g class="ss-invention-nums" font-size="12" text-anchor="middle"><text x="252" y="44">1</text><text x="252" y="114">2</text><text x="252" y="184">3</text></g></svg>`;

export const invention = {
  label: 'Invention',
  says: 'An app or a thing you made, as a patent sheet',
  size: [20, 15],
  attrs: ['media'],
  fields: [
    { key: 'data.title', label: 'Name', kind: 'text' },
    { key: 'data.kind', label: 'What it is (app, tool, object…)', kind: 'text' },
    { key: 'data.year', label: 'Year', kind: 'number' },
    { key: 'data.status', label: 'The stamp says (prototype, in use, idea…)', kind: 'text' },
    { key: 'data.about', label: 'What it does', kind: 'area' },
    { key: 'data.link', label: 'Where to see it (an address, optional)', kind: 'text' },
    { key: 'data.linkLabel', label: 'The link says', kind: 'text' },
    { key: 'data.fig', label: 'Under the figure', kind: 'text' },
  ],
  data: { title: 'An invention', kind: 'Object', status: 'Idea', fig: 'FIG. 1' },

  render(o, ctx) {
    const d = o.data ?? {};
    const title = d.title ?? 'An invention';
    const art = pic(o, ctx, { cls: 'ss-invention-pic', alt: o.media?.alt ?? `${title}, the figure`, sizes: '(max-width: 700px) 80vw, 500px' })
      || figure(`invention-fig:${o.id}`);
    const meta = [d.kind, d.year].filter(Boolean).map(esc).join(' · ');
    const link = d.link ? `<a class="ss-invention-link" ${linkAttrs(ctx, d.link)}>${esc(d.linkLabel || 'See it')}</a>` : '';
    return `<article class="ss-invention">
      ${sheet(`invention:${o.id}`)}
      <header class="ss-invention-head"><span>T. Vlangas</span><h3 class="ss-invention-title">${esc(title)}</h3><span>Sheet 1</span></header>
      <div class="ss-invention-fig">
        ${art}
        <p class="ss-invention-figno">${esc(d.fig || 'FIG. 1')}</p>
        ${d.status ? `<p class="ss-invention-stamp">${esc(d.status)}</p>` : ''}
      </div>
      <footer class="ss-invention-foot">
        ${meta ? `<p class="ss-invention-meta">${meta}</p>` : ''}
        ${d.about ? `<p class="ss-invention-about">${esc(d.about)}</p>` : ''}
        ${link}
      </footer>
    </article>`;
  },

  check(o) {
    return o.data?.link && !/^(https?:\/\/|\/)/.test(o.data.link) ? [`${o.id}: data.link should be an address`] : [];
  },
};
