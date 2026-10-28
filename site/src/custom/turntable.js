/**
 * The turntable: where a record you press goes to be played, and played with.
 *
 * What you can do to the record, and why each works on a SoundCloud song
 * (whose widget can only play, pause, seek and set the volume):
 *
 * - **Drop the needle.** Tap anywhere on the grooves and it plays from there.
 *   The outer edge is the start of the song and the edge of the label is the
 *   end, as on vinyl, so where you tap is when you hear.
 * - **Scratch.** Hold the record and turn it. The sound stops under your
 *   hand, the record goes where you turn it, one turn is 1.8 seconds of song
 *   (33⅓ revolutions a minute), and letting go plays from there.
 * - **The arm** follows the song across the record, so you can see how far
 *   in it is without reading a number.
 * - **Speed: 33, 45, 78.** Only for a record whose song is a file
 *   (`data.audio`), because only a file can be sped up; pitch goes with
 *   speed, as on a real one. Hidden otherwise rather than shown and broken.
 * - **Loop**, **volume**, and **back / forward** to the record before or
 *   after on the page.
 *
 * One per page is the idea; it plays whatever player.js is playing.
 */
import './turntable.css';
import { boil, box, circle, line, through, stroke } from './sketch.js';
import { esc, arranging, still } from './parts.js';
import { recordSvg } from './disc.js';
import {
  subscribe, positionNow, toggle, next, prev, seek, setVolume, setRate, setLoop,
  hold, release, canChangeSpeed, clock,
} from './player.js';

/* The platter's own coordinates (a 400 x 400 box). The record sits on it at
   CX, CY; the grooves run from GROOVE_OUT (the start) to GROOVE_IN (the end). */
const CX = 190, CY = 200, R = 170;
const GROOVE_OUT = 162, GROOVE_IN = 60;
/* The arm hangs from its pivot, ARM long. Swung by ARM_REST it is off the
   record; between ARM_START and ARM_END it rides the grooves. */
const PX = 372, PY = 42, ARM = 290;
const ARM_REST = -2, ARM_START = 15, ARM_END = 38;
/* 33⅓ turns a minute. */
const TURN_MS = 1800;

const plinth = (seed) => `<svg class="ss-draw" viewBox="0 0 400 400" preserveAspectRatio="none" aria-hidden="true">${boil(seed, (r) =>
  stroke(box(4, 4, 392, 392, r, { wander: 0.8, overshoot: 2 }), 1.8))}</svg>`;

/** The platter (drawn) and the arm (drawn, turned by the script). */
const platter = (seed) => `<svg class="ss-deck-platter-svg" viewBox="0 0 400 400" aria-hidden="true">`
  + boil(`${seed}:platter`, (r) => stroke(circle(CX, CY, R + 8, r, { wander: 0.006 }) + circle(CX, CY, R + 14, r, { wander: 0.006 }), 1.6))
  + `<g class="ss-deck-arm" transform="rotate(${ARM_REST} ${PX} ${PY})">`
  + boil(`${seed}:arm`, (r) => {
    let d = circle(PX, PY, 16, r) + circle(PX, PY, 6, r);
    // The arm: two lines a little apart, bending once toward the head.
    d += through([[PX - 3, PY + 16], [PX - 4, PY + 150], [PX - 18, PY + ARM - 24]]);
    d += through([[PX + 3, PY + 16], [PX + 2, PY + 150], [PX - 12, PY + ARM - 22]]);
    d += box(PX - 26, PY + ARM - 26, 16, 26, r, { wander: 0.3, overshoot: 0.6 });
    return stroke(d, 2);
  })
  + '</g></svg>';

/** The loop key: a line that goes round and comes back to where it began. */
const loopGlyph = (seed) => `<svg viewBox="0 0 48 48" aria-hidden="true">${boil(seed, (r) => {
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + 0.5 + (i / 24) * (Math.PI * 2 - 1);
    arc.push([24 + Math.cos(a) * 15 + r.pm() * 0.4, 24 + Math.sin(a) * 15 + r.pm() * 0.4]);
  }
  const [hx, hy] = arc[arc.length - 1];
  return stroke(through(arc) + line(hx, hy, hx + 7, hy - 3, r, { wander: 0.2 }) + line(hx, hy, hx + 1, hy + 7, r, { wander: 0.2 }), 2.8);
})}</svg>`;

export const turntable = {
  label: 'Turntable',
  says: 'Plays the records on the page: drop the needle, scratch, loop',
  size: [20, 13],
  fields: [
    { key: 'data.hint', label: 'The line under it', kind: 'text' },
  ],
  data: { hint: 'Tap the record to drop the needle · hold it and turn to scratch' },

  render(o, ctx) {
    const d = o.data ?? {};
    const img = (key) => ctx.image?.({ src: `asset:${key}` })?.src ?? '';
    const key = (act, label, inner) => `<button class="ss-deck-key" type="button" data-deck="${act}" aria-label="${label}">${inner}</button>`;
    const pic = (src, alt = '') => (src ? `<img src="${esc(src)}" alt="${alt}" />` : '');
    return `<div class="ss-deck" data-idle>
      ${plinth(`deck:${o.id}`)}
      <div class="ss-deck-in">
      <div class="ss-deck-platter">
        ${platter(`deck:${o.id}`)}
        <div class="ss-deck-record" role="slider" tabindex="0" aria-label="The record. Left and right arrows move through the song"
             aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="Nothing playing">
          ${recordSvg(`deck-record:${o.id}`, 'ss-deck-record-svg')}
        </div>
      </div>
      <div class="ss-deck-panel">
        <p class="ss-deck-title" aria-live="polite">Pick a record</p>
        <p class="ss-deck-time"><span data-deck-at>0:00</span> / <span data-deck-dur>0:00</span></p>
        <div class="ss-deck-keys">
          ${key('prev', 'The record before', pic(img('skipLeft')) || '‹‹')}
          <button class="ss-deck-key ss-deck-toggle" type="button" data-deck="toggle" aria-label="Play">
            <img data-deck-face src="${esc(img('play'))}" data-play="${esc(img('play'))}" data-pause="${esc(img('pause'))}" alt="" />
          </button>
          ${key('next', 'The record after', pic(img('skipRight')) || '››')}
          <button class="ss-deck-key ss-deck-loop" type="button" data-deck="loop" aria-pressed="false" aria-label="Play this record over and over">${loopGlyph(`deck-loop:${o.id}`)}</button>
        </div>
        <div class="ss-deck-speed" role="group" aria-label="Speed" hidden>
          <button type="button" data-rate="1" aria-pressed="true">33</button><button type="button" data-rate="1.35" aria-pressed="false">45</button><button type="button" data-rate="2.34" aria-pressed="false">78</button>
        </div>
        <label class="ss-deck-vol"><span>Volume</span> <input type="range" min="0" max="100" value="80" data-deck-vol /></label>
        ${d.hint ? `<p class="ss-deck-hint">${esc(d.hint)}</p>` : ''}
      </div>
      </div>
    </div>`;
  },

  wake(el) {
    const deck = el.querySelector('.ss-deck');
    const rec = el.querySelector('.ss-deck-record');
    const arm = el.querySelector('.ss-deck-arm');
    if (!deck || !rec || !arm) return;
    const title = deck.querySelector('.ss-deck-title');
    const at = deck.querySelector('[data-deck-at]');
    const dur = deck.querySelector('[data-deck-dur]');
    const face = deck.querySelector('[data-deck-face]');
    const toggleKey = deck.querySelector('.ss-deck-toggle');
    const loopKey = deck.querySelector('.ss-deck-loop');
    const speed = deck.querySelector('.ss-deck-speed');
    const vol = deck.querySelector('[data-deck-vol]');

    let s = {};
    let angle = 0;          // the record's turn, in degrees
    let held = null;        // a hand on the record: {id, start, from, pos, moved}
    let raf = 0;

    /* ---- drawing: the record's turn and the arm, from the position ---- */
    const progress = (ms) => (s.dur ? Math.min(1, Math.max(0, ms / s.dur)) : 0);
    const draw = () => {
      raf = 0;
      const ms = held ? held.pos : positionNow();
      if (!held) angle = still() ? 0 : (ms / TURN_MS) * 360;
      rec.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      const on = s.id && !s.loading;
      const swing = on ? ARM_START + (ARM_END - ARM_START) * progress(ms) : ARM_REST;
      arm.setAttribute('transform', `rotate(${swing.toFixed(2)} ${PX} ${PY})`);
      at.textContent = clock(ms);
      rec.setAttribute('aria-valuenow', String(Math.round(ms / 1000)));
      rec.setAttribute('aria-valuetext', s.id ? `${clock(ms)} of ${clock(s.dur)}` : 'Nothing playing');
      // Keep going only while something is moving, and only while it can be seen.
      if ((s.playing || held) && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

    const stop = subscribe((now) => {
      s = { ...now };
      deck.toggleAttribute('data-idle', !s.id);
      deck.toggleAttribute('data-playing', s.playing);
      deck.style.setProperty('--label', s.color || '#b8836b');
      title.textContent = s.id ? (s.loading ? `${s.title}…` : s.title) : 'Pick a record';
      dur.textContent = clock(s.dur);
      rec.setAttribute('aria-valuemax', String(Math.round((s.dur || 0) / 1000)));
      if (face) face.src = (s.playing ? face.dataset.pause : face.dataset.play) || face.src;
      toggleKey?.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
      loopKey?.setAttribute('aria-pressed', String(!!s.loop));
      speed.hidden = !canChangeSpeed();
      for (const b of speed.querySelectorAll('[data-rate]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === s.rate));
      if (vol && document.activeElement !== vol) vol.value = String(s.volume);
      kick();
    });

    /* ---- the keys ---- */
    const onClick = (e) => {
      if (arranging()) return;
      const k = e.target.closest('[data-deck], [data-rate]');
      if (!k) return;
      if (k.dataset.rate) return setRate(Number(k.dataset.rate));
      ({ toggle: () => toggle(), prev, next, loop: () => setLoop(!s.loop) })[k.dataset.deck]?.();
    };
    const onVol = () => setVolume(vol.value);

    /* ---- a hand on the record ---- */
    // Measured off the platter, never the record: the record is turned, and
    // a turned square's box is up to 1.41 times wider than the square, which
    // would put every needle drop in the wrong groove.
    const platterEl = deck.querySelector('.ss-deck-platter');
    const centre = () => {
      const b = platterEl.getBoundingClientRect();
      const scale = b.width / 400;
      return { x: b.left + CX * scale, y: b.top + CY * scale, scale };
    };
    const angleAt = (e, c) => (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    const onDown = (e) => {
      if (arranging() || !s.id || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const c = centre();
      held = { id: e.pointerId, c, start: angleAt(e, c), from: angle, pos: positionNow(), base: positionNow(), moved: 0, x: e.clientX, y: e.clientY };
      rec.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!held || e.pointerId !== held.id) return;
      held.moved = Math.max(held.moved, Math.hypot(e.clientX - held.x, e.clientY - held.y));
      if (held.moved < 6) return;
      if (!held.holding) { hold(); held.holding = true; }
      let turn = angleAt(e, held.c) - held.start;
      // The short way round, so crossing the back of the record is not a jump of a turn.
      turn = ((turn + 540) % 360) - 180;
      held.start += turn;
      angle += turn;
      held.pos = Math.max(0, Math.min(s.dur || Infinity, held.pos + (turn / 360) * TURN_MS));
      kick();
    };
    const onUp = (e) => {
      if (!held || e.pointerId !== held.id) return;
      const h = held;
      held = null;
      if (h.holding) { release(h.pos); return; }
      // A tap: drop the needle where it landed, by how far from the middle.
      const r = Math.hypot(e.clientX - h.c.x, e.clientY - h.c.y) / h.c.scale;
      if (r > R || !s.dur) return;
      const t = (GROOVE_OUT - r) / (GROOVE_OUT - GROOVE_IN);
      if (t < 0 || t > 1) return toggle();          // the label, or the very rim: play / pause
      seek(t * s.dur);
      if (!s.playing) toggle();
    };
    const onCancel = (e) => { if (held && e.pointerId === held.id) { const h = held; held = null; if (h.holding) release(h.pos); } };
    const onKey = (e) => {
      if (!s.id) return;
      const ms = positionNow();
      const by = { ArrowRight: 5000, ArrowUp: 5000, ArrowLeft: -5000, ArrowDown: -5000, PageUp: 30000, PageDown: -30000 }[e.key];
      if (by) { e.preventDefault(); seek(ms + by); }
      else if (e.key === 'Home') { e.preventDefault(); seek(0); }
      else if (e.key === 'End') { e.preventDefault(); seek((s.dur || 0) - 2000); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    };
    const onVisible = () => kick();

    deck.addEventListener('click', onClick);
    vol?.addEventListener('input', onVol);
    rec.addEventListener('pointerdown', onDown);
    rec.addEventListener('pointermove', onMove);
    rec.addEventListener('pointerup', onUp);
    rec.addEventListener('pointercancel', onCancel);
    rec.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      cancelAnimationFrame(raf);
      deck.removeEventListener('click', onClick);
      vol?.removeEventListener('input', onVol);
      rec.removeEventListener('pointerdown', onDown);
      rec.removeEventListener('pointermove', onMove);
      rec.removeEventListener('pointerup', onUp);
      rec.removeEventListener('pointercancel', onCancel);
      rec.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisible);
    };
  },
};
