/**
 * A trading card: one game, front and back. Press it and it turns over.
 *
 * The front is the card you collect: its name, its art, its type line and a
 * line of flavour, in a drawn frame, with Timothy's own holo picture (the
 * one that shimmers across the business card) catching the light as the
 * pointer moves. The back is the information: what he did on it, what it was
 * made with, where it stands, and the way to play it.
 *
 * One object per game, like the film credits: a new game is a duplicated
 * card with its fields changed. The art is the object's own picture.
 */
import './trading-card.css';
import { boil, box, circle, line, through, curl, sparkle, stroke } from './sketch.js';
import { esc, pic, linkAttrs, listOf, arranging } from './parts.js';

/** The frame a card is printed in: an outer edge, an inner rule, and a curl in each corner. */
const frame = (seed) => `<svg class="ss-draw" viewBox="0 0 250 350" preserveAspectRatio="none" aria-hidden="true">${boil(seed, (r) => {
  let d = box(5, 5, 240, 340, r, { wander: 0.6, overshoot: 1.5 }) + box(13, 13, 224, 324, r, { wander: 0.5, overshoot: 1 });
  for (const [x, y, h, s] of [[13, 13, 0, 1], [237, 13, Math.PI / 2, 1], [237, 337, Math.PI, 1], [13, 337, -Math.PI / 2, 1]]) {
    d += through(curl(x, y, h + Math.PI / 4, 34, s, r, { wind: 1.1, b: 3 }));
  }
  return stroke(d, 1.6);
})}</svg>`;

/** A controller, drawn, for a game whose card has no art yet. */
const noArt = (seed) => `<svg class="ss-trading-card-noart" viewBox="0 0 200 140" aria-hidden="true">${boil(seed, (r) => {
  const pad = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pad.push([100 + Math.cos(a) * (70 + Math.cos(a * 2) * 5) + r.pm() * 0.6, 74 + Math.sin(a) * (38 + Math.sin(a * 2) * 3) + r.pm() * 0.6]);
  }
  let d = through(pad, true) + line(48, 74, 76, 74, r, { wander: 0.3 }) + line(62, 60, 62, 88, r, { wander: 0.3 });
  d += circle(132, 66, 7, r) + circle(148, 84, 7, r) + sparkle(170, 22, 12, r);
  return stroke(d, 2.2);
})}</svg>`;

export const tradingCard = {
  label: 'Trading card',
  says: 'A game, as a card that turns over to show what it is',
  size: [9, 13],
  attrs: ['media'],
  fields: [
    { key: 'data.title', label: 'Name', kind: 'text' },
    { key: 'data.genre', label: 'What kind of game (puzzle, board game…)', kind: 'text' },
    { key: 'data.year', label: 'Year', kind: 'number' },
    { key: 'data.flavor', label: 'A line of flavour, on the front', kind: 'text' },
    { key: 'data.roles', label: 'What I did (commas between)', kind: 'list' },
    { key: 'data.made', label: 'Made with', kind: 'text' },
    { key: 'data.status', label: 'Where it stands (prototype, out now…)', kind: 'text' },
    { key: 'data.about', label: 'About it, on the back', kind: 'area' },
    { key: 'data.play', label: 'Where to play it (an address)', kind: 'text' },
    { key: 'data.playLabel', label: 'The play button says', kind: 'text' },
  ],
  data: { title: 'A game', genre: 'Game', year: 2026, flavor: 'Press to turn over.', roles: ['Design'], status: 'In the works' },

  render(o, ctx) {
    const d = o.data ?? {};
    const title = d.title ?? 'A game';
    const roles = listOf(d.roles);
    const art = pic(o, ctx, { cls: 'ss-trading-card-pic', alt: '', sizes: '(max-width: 700px) 60vw, 260px' }) || noArt(`card-art:${o.id}`);
    const holo = ctx.image?.({ src: 'asset:holo' })?.src ?? '';
    const facts = [
      ['What I did', roles.join(', ')],
      ['Kind', d.genre],
      ['Made with', d.made],
      ['Status', d.status],
    ].filter(([, v]) => v);
    const play = d.play
      ? `<a class="ss-trading-card-play" ${linkAttrs(ctx, d.play)}>${esc(d.playLabel || 'Play')}</a>`
      : '';
    return `<div class="ss-trading-card"${holo ? ` style="--holo:url('${esc(holo)}')"` : ''}>
      <div class="ss-trading-card-inner">
        <button class="ss-trading-card-face ss-trading-card-front" type="button" aria-label="${esc(title)}: turn the card over">
          ${frame(`card-front:${o.id}`)}
          <span class="ss-trading-card-head"><span class="ss-trading-card-name">${esc(title)}</span>${d.year ? `<span class="ss-trading-card-year">${esc(d.year)}</span>` : ''}</span>
          <span class="ss-trading-card-art">${art}</span>
          <span class="ss-trading-card-type">Game${d.genre ? ` — ${esc(d.genre)}` : ''}</span>
          ${d.flavor ? `<span class="ss-trading-card-flavor">${esc(d.flavor)}</span>` : ''}
          <span class="ss-trading-card-holo" aria-hidden="true"></span>
        </button>
        <div class="ss-trading-card-face ss-trading-card-back" inert>
          ${frame(`card-back:${o.id}`)}
          <h3 class="ss-trading-card-name">${esc(title)}</h3>
          <dl class="ss-trading-card-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          ${d.about ? `<p class="ss-trading-card-about">${esc(d.about)}</p>` : ''}
          <span class="ss-trading-card-keys">${play}<button class="ss-trading-card-turn" type="button">Turn back</button></span>
        </div>
      </div>
    </div>`;
  },

  wake(el) {
    const card = el.querySelector('.ss-trading-card');
    if (!card) return;
    const front = card.querySelector('.ss-trading-card-front');
    const back = card.querySelector('.ss-trading-card-back');

    const turn = (keyboard) => {
      const over = card.toggleAttribute('data-over');
      // The face turned away cannot be reached by Tab: it is behind the card.
      front.toggleAttribute('inert', over);
      back.toggleAttribute('inert', !over);
      if (keyboard) (over ? back.querySelector('a, button') : front)?.focus({ preventScroll: true });
    };
    const onClick = (e) => {
      if (arranging()) return;
      if (e.target.closest('a')) return;                   // Play goes where it says
      if (!e.target.closest('.ss-trading-card-front, .ss-trading-card-back')) return;
      // detail is 0 for a click made by the keyboard: then focus follows the card.
      turn(e.detail === 0);
    };

    // The card leans toward a mouse and the holo slides with it. A finger
    // gets the turn and not the lean: a lean that follows a thumb fights it.
    const onMove = (e) => {
      if (e.pointerType !== 'mouse' || arranging()) return;
      const b = card.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width - 0.5;
      const y = (e.clientY - b.top) / b.height - 0.5;
      card.style.setProperty('--lean-x', `${(x * 14).toFixed(2)}deg`);
      card.style.setProperty('--lean-y', `${(-y * 14).toFixed(2)}deg`);
      card.style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--shine-y', `${((y + 0.5) * 100).toFixed(1)}%`);
    };
    const onLeave = () => {
      for (const p of ['--lean-x', '--lean-y', '--shine-x', '--shine-y']) card.style.removeProperty(p);
    };
    card.addEventListener('click', onClick);
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerleave', onLeave);
    return () => {
      card.removeEventListener('click', onClick);
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerleave', onLeave);
    };
  },

  check(o) {
    return o.data?.play && !/^(https?:\/\/|\/)/.test(o.data.play) ? [`${o.id}: data.play should be an address`] : [];
  },
};
