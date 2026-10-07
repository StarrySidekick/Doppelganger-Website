/**
 * A starfield: stars drifting past, in the look's ink on nothing.
 *
 * The example custom kind, kept small on purpose so it reads as a template:
 * `render` draws the static part as a string (node and browser), `wake` starts
 * the moving part in the browser and returns how to stop it.
 */
import './starfield.css';
export const starfield = {
  label: 'Starfield',
  says: 'Stars drifting past',
  size: [8, 6],
  // A custom object's own settings live under `data`, and these are the
  // fields the object editor offers for them.
  fields: [
    { key: 'data.stars', label: 'How many stars', kind: 'number' },
    { key: 'data.speed', label: 'How fast (1 is slow)', kind: 'number' },
  ],
  data: { stars: 90, speed: 1 },

  render(o) {
    const n = Math.round(Number(o.data?.stars) || 90);
    return `<canvas class="ss-starfield" role="img" aria-label="${n} stars drifting past"></canvas>`;
  },

  wake(el, o) {
    const canvas = el.querySelector('canvas');
    const g = canvas?.getContext('2d');
    if (!g) return;
    const count = Math.max(1, Math.min(600, Math.round(Number(o.data?.stars) || 90)));
    const speed = Math.max(0.1, Number(o.data?.speed) || 1);
    // Ink from the look, so a change of colours re-dresses this too.
    const ink = getComputedStyle(el).getPropertyValue('--ink').trim() || '#fff';
    const stars = Array.from({ length: count }, () => ({
      x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8,
    }));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();

    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.round(r.height * devicePixelRatio));
    };
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { width: w, height: h } = canvas;
      g.clearRect(0, 0, w, h);
      g.fillStyle = ink;
      for (const s of stars) {
        if (!still) s.x = (s.x + dt * 0.03 * speed * s.z) % 1;
        g.globalAlpha = 0.25 + 0.75 * s.z;
        const r = Math.max(0.6, 1.6 * s.z) * devicePixelRatio;
        g.fillRect(s.x * w, s.y * h, r, r);
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(() => { size(); if (still) draw(performance.now()); });
    ro.observe(canvas);
    size();
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  },
};
