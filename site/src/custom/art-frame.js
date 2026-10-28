/**
 * A framed piece: one picture, hung in a drawn frame with a placard under it.
 *
 * The Art page is a gallery wall of these, grouped into rooms by headings
 * (paintings, drawings, style guides, UI, graphics), and like everything on
 * a board, where a piece hangs is how it is organised. Press one and it
 * opens large over the page; from there the arrows (or a swipe) walk the
 * whole wall in the order it is read, and Escape puts it back.
 *
 * The picture is the object's own (the tool's `media` attribute), never
 * cropped: a frame fits the picture whole, the way every picture on the
 * Squarespace site was drawn.
 */
import './art-frame.css';
import { boil, box, stroke } from './sketch.js';
import { esc, pic, arranging } from './parts.js';

const frame = (seed) => `<svg class="ss-draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${boil(seed, (r) =>
  stroke(box(1.2, 1.2, 97.6, 97.6, r, { wander: 0.25, overshoot: 0.8 }) + box(4.2, 4.2, 91.6, 91.6, r, { wander: 0.2, overshoot: 0.5 }), 1.6, ' vector-effect="non-scaling-stroke"'))}</svg>`;

/* ------------------------------------------------------------------ *
 * The lightbox: one for the page, made the first time a piece is opened
 * ------------------------------------------------------------------ */

let box_ = null;
let walk = [];
let at = 0;
let opener = null;

/** Every framed piece on the page, in reading order: rows top to bottom, then left to right. */
function wall() {
  return [...document.querySelectorAll('.ss-art-frame')]
    .map((el) => ({ el, b: el.getBoundingClientRect() }))
    .sort((p, q) => (Math.abs(p.b.top - q.b.top) > 12 ? p.b.top - q.b.top : p.b.left - q.b.left))
    .map(({ el }) => el);
}

function show(i) {
  if (!walk.length) return;
  at = (i + walk.length) % walk.length;
  const el = walk[at];
  const img = el.querySelector('.ss-art-frame-pic');
  const big = box_.querySelector('.ss-art-frame-big');
  big.src = el.dataset.full || img?.currentSrc || img?.src || '';
  big.alt = img?.alt || '';
  box_.querySelector('.ss-art-frame-cap').innerHTML = el.querySelector('.ss-art-frame-card')?.innerHTML ?? '';
  box_.querySelector('.ss-art-frame-count').textContent = `${at + 1} of ${walk.length}`;
}

function open(el) {
  if (!box_) {
    box_ = document.createElement('div');
    box_.className = 'ss-art-frame-box';
    box_.setAttribute('role', 'dialog');
    box_.setAttribute('aria-modal', 'true');
    box_.setAttribute('aria-label', 'A piece, large');
    box_.innerHTML = `<button class="ss-art-frame-x" type="button" aria-label="Close">×</button>
      <button class="ss-art-frame-step" type="button" data-by="-1" aria-label="The piece before">‹</button>
      <figure class="ss-art-frame-fig"><img class="ss-art-frame-big" alt="" /><figcaption class="ss-art-frame-cap"></figcaption></figure>
      <button class="ss-art-frame-step" type="button" data-by="1" aria-label="The piece after">›</button>
      <p class="ss-art-frame-count" aria-live="polite"></p>`;
    box_.addEventListener('click', (e) => {
      const step = e.target.closest('[data-by]');
      if (step) return show(at + Number(step.dataset.by));
      if (e.target.closest('.ss-art-frame-x') || e.target === box_) close();
    });
    // A swipe across the picture walks the wall.
    let x0 = null;
    box_.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    box_.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    });
    /* On <html>, not <body>: the sun's shuffle puts a filter on body, and a
       filtered element becomes the box every fixed thing inside it is
       placed against, so the lightbox would open at the top of the PAGE.
       The editor's corner dot hangs off <html> for the same reason. */
    document.documentElement.append(box_);
  }
  opener = el;
  walk = wall();
  show(Math.max(0, walk.indexOf(el)));
  box_.hidden = false;
  document.documentElement.classList.add('ss-art-frame-open');
  document.addEventListener('keydown', onKey, true);
  box_.querySelector('.ss-art-frame-x').focus({ preventScroll: true });
}

function close() {
  if (!box_ || box_.hidden) return;
  box_.hidden = true;
  document.documentElement.classList.remove('ss-art-frame-open');
  document.removeEventListener('keydown', onKey, true);
  opener?.querySelector('button')?.focus({ preventScroll: true });
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
  else if (e.key === 'Tab') {
    // Keep the keyboard inside the dialog while it is open.
    const keys = [...box_.querySelectorAll('button')];
    const i = keys.indexOf(document.activeElement);
    e.preventDefault();
    keys[(i + (e.shiftKey ? -1 : 1) + keys.length) % keys.length].focus();
  }
}

export const artFrame = {
  label: 'Framed piece',
  says: 'A picture hung in a frame, that opens large',
  size: [8, 9],
  attrs: ['media'],
  fields: [
    { key: 'data.title', label: 'Title', kind: 'text' },
    { key: 'data.project', label: 'What it was for', kind: 'text' },
    { key: 'data.medium', label: 'Made with (pencil, Procreate, Figma…)', kind: 'text' },
    { key: 'data.year', label: 'Year', kind: 'number' },
    { key: 'data.about', label: 'A line about it, shown when it opens', kind: 'area' },
  ],
  data: { title: 'A piece' },

  render(o, ctx) {
    const d = o.data ?? {};
    const title = d.title ?? 'A piece';
    const art = pic(o, ctx, { cls: 'ss-art-frame-pic', alt: o.media?.alt ?? title, sizes: '(max-width: 700px) 45vw, 260px' });
    // The lightbox's copy: the same picture asked for at 1500 wide, which the
    // CDN makes on request (and our own files simply are).
    const full = o.media?.src ? ctx.image?.({ ...o.media, widths: [1500] })?.src ?? '' : '';
    const sub = [d.project, d.medium, d.year].filter(Boolean).map(esc).join(' · ');
    return `<figure class="ss-art-frame"${full ? ` data-full="${esc(full)}"` : ''}>
      <button class="ss-art-frame-open-key" type="button" aria-label="Open ${esc(title)} large"${art ? '' : ' disabled'}>
        ${frame(`frame:${o.id}`)}
        <span class="ss-art-frame-mat">${art || '<span class="ss-art-frame-empty">A picture goes here</span>'}</span>
      </button>
      <figcaption class="ss-art-frame-card"><span class="ss-art-frame-title">${esc(title)}</span>${sub ? `<span class="ss-art-frame-sub">${sub}</span>` : ''}${d.about ? `<span class="ss-art-frame-about">${esc(d.about)}</span>` : ''}</figcaption>
    </figure>`;
  },

  wake(el) {
    const fig = el.querySelector('.ss-art-frame');
    const key = el.querySelector('.ss-art-frame-open-key');
    if (!fig || !key) return;
    const onClick = () => { if (!arranging()) open(fig); };
    key.addEventListener('click', onClick);
    return () => {
      key.removeEventListener('click', onClick);
      if (opener === fig) close();
    };
  },
};
