/**
 * A record: one song, drawn as a vinyl disc in chalk with a coloured label.
 *
 * Press it and it plays, on the turntable if the page has one (the record on
 * the shelf goes pale, the way a sleeve does when its record is out), or
 * spinning where it sits if not. Press it again and it pauses. Every record
 * on a page shares one player (player.js), so one plays at a time, and when
 * one ends the next on the page begins.
 *
 * The music page groups them by genre with headings, the way a crate is
 * sorted: where a record sits IS how it is organised, so re-sorting the
 * collection is moving records on the board.
 */
import './disc.css';
import { boil, circle, spiral, stroke, through } from './sketch.js';
import { esc, arranging } from './parts.js';
import { subscribe, play, toggle, trackOf, clock } from './player.js';

/**
 * A record, in a 200 x 200 box: the rim, the grooves, a shine across them,
 * the label and the hole. The label takes `--label` from the record it is.
 * Shared with the turntable, which draws the record on its platter the same.
 */
export function recordSvg(seed, cls = 'ss-disc-svg') {
  return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true">`
    + `<circle cx="100" cy="100" r="96" class="ss-disc-vinyl"/>`
    + `<circle cx="100" cy="100" r="33" class="ss-disc-paper"/>`
    + boil(seed, (r) => {
      let d = circle(100, 100, 95, r, { wander: 0.006 });
      for (const g of [86, 76, 66, 57, 48]) d += circle(100, 100, g + r.pm() * 0.8, r, { wander: 0.004, overlap: 0.05 });
      d += circle(100, 100, 33, r, { wander: 0.01 });
      // The shine: two short arcs where the light catches the grooves.
      const arc = (a0, a1, rad) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * (i / 10); pts.push([100 + Math.cos(a) * rad, 100 + Math.sin(a) * rad]); }
        return through(pts);
      };
      const shine = arc(-2.5, -1.9, 80) + arc(-2.45, -2.0, 70) + arc(0.65, 1.2, 76);
      return stroke(d, 1.3) + stroke(shine, 2.4, ' stroke-opacity="0.45"') + stroke(spiral(100, 100, 26, 7, 1.6, r, { wander: 0.3 }), 1, ' stroke-opacity="0.5"');
    })
    + `<circle cx="100" cy="100" r="3.2" class="ss-disc-hole"/>`
    + '</svg>';
}

export const disc = {
  label: 'Record',
  says: 'A song, as a record you press to play',
  size: [6, 7],
  fields: [
    { key: 'data.title', label: 'Title', kind: 'text' },
    { key: 'data.sound', label: 'SoundCloud address of the track', kind: 'text', placeholder: 'https://soundcloud.com/…' },
    { key: 'data.audio', label: 'Or an audio file’s address (lets the turntable change speed)', kind: 'text' },
    { key: 'data.group', label: 'Which genre it sits with', kind: 'text' },
    { key: 'data.length', label: 'Length in seconds', kind: 'number' },
    { key: 'data.color', label: 'Label colour', kind: 'text', placeholder: '#b8836b' },
    { key: 'data.year', label: 'Year', kind: 'number' },
  ],
  data: { title: 'A song', color: '#b8836b' },

  render(o) {
    const d = o.data ?? {};
    const title = d.title ?? 'A song';
    const color = /^#[0-9a-f]{3,8}$/i.test(d.color ?? '') ? d.color : '#b8836b';
    const len = Number(d.length) ? clock(Number(d.length) * 1000) : '';
    return `<figure class="ss-disc" style="--label:${color}">
      <button class="ss-disc-play" type="button" aria-label="Play ${esc(title)}" aria-pressed="false">
        <span class="ss-disc-record">${recordSvg(`disc:${o.id}`)}</span>
      </button>
      <figcaption class="ss-disc-name">${esc(title)}${len ? ` <span class="ss-disc-len">${len}</span>` : ''}</figcaption>
    </figure>`;
  },

  wake(el, o) {
    const fig = el.querySelector('.ss-disc');
    const btn = el.querySelector('.ss-disc-play');
    if (!fig || !btn) return;
    const track = trackOf(o);
    const title = track.title || 'this record';

    const onClick = () => {
      if (arranging()) return;
      return fig.hasAttribute('data-current') ? toggle() : play(track);
    };
    btn.addEventListener('click', onClick);

    // Which record is on, and whether it is going round. A page with a
    // turntable shows the record there instead of spinning it here.
    const stop = subscribe((s) => {
      const mine = s.id === o.id;
      fig.toggleAttribute('data-current', mine);
      fig.toggleAttribute('data-playing', mine && s.playing);
      fig.toggleAttribute('data-out', mine && !!document.querySelector('.ss-deck'));
      btn.setAttribute('aria-pressed', String(mine && s.playing));
      btn.setAttribute('aria-label', `${mine && s.playing ? 'Pause' : 'Play'} ${title}`);
    });
    return () => { btn.removeEventListener('click', onClick); stop(); };
  },

  check(o) {
    const d = o.data ?? {};
    const out = [];
    if (d.sound && !/^https:\/\/(soundcloud\.com|on\.soundcloud\.com|api\.soundcloud\.com)\//.test(d.sound)) out.push(`${o.id}: data.sound should be a SoundCloud address`);
    if (d.audio && !/^https?:\/\//.test(d.audio)) out.push(`${o.id}: data.audio should be an address`);
    return out;
  },
};
