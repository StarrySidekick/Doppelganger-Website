/**
 * Drawing in Timothy's hand: white chalk lines on black that never sit still.
 *
 * Every picture on the Squarespace site is a hand drawing with a "boil": three
 * frames, 200ms each, the same drawing traced three times so the line shivers.
 * This draws in that manner from code, so a page piece that has no art of its
 * own yet (a card with no picture, a disc, a frame) still looks like it
 * belongs, and the placeholder buttons (scripts/placeholder-art.mjs) come out
 * of the same functions.
 *
 * Everything is SVG path data, made from a SEEDED random generator: the same
 * name always gives the same wobble. That matters twice. A rebuild must not
 * redraw every placeholder differently (every page would change in git for
 * nothing), and the build and the editor must draw the same thing.
 *
 * Pure: no DOM, so it runs in node at build time and in the browser while
 * editing. Class names are prefixed `ss-` and the one keyframe is `ssBoil`
 * (hard rule 1).
 */

/* ------------------------------------------------------------------ *
 * Randomness you can repeat
 * ------------------------------------------------------------------ */

/** A string or number as a 32-bit seed. */
export function seedOf(s) {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** mulberry32: small, fast, and the same sequence for the same seed. */
export function rng(seed) {
  let a = seedOf(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // A number in [-1, 1): how far to stray, either way.
  next.pm = () => next() * 2 - 1;
  next.range = (lo, hi) => lo + next() * (hi - lo);
  return next;
}

const f = (n) => (Math.round(n * 10) / 10).toString();

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

/**
 * A smooth path through points (Catmull-Rom turned into cubic Béziers), which
 * is how a hand gets from one place to the next: no corners unless asked.
 */
export function through(pts, closed = false) {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(p[1][0])} ${f(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], [x2, y2] = p[i + 1], [x3, y3] = p[i + 2];
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x2)} ${f(y2)}`;
  }
  return closed ? d + 'Z' : d;
}

/** A straight line drawn by hand: a slight bow and a little wander. */
export function line(x1, y1, x2, y2, r, { wander = 1.2, bow = 0.015 } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const steps = Math.max(2, Math.round(len / 40));
  const b = r.pm() * bow * len;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * Math.PI) * b + (i && i < steps ? r.pm() * wander : 0);
    pts.push([x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off]);
  }
  return through(pts);
}

/**
 * The torn-paper square every button on the site sits in: wavy edges, and
 * here and there a little tear where the paper caught.
 */
export function torn(x, y, w, h, r, { wander = 2.4, tears = 3 } = {}) {
  const pts = [];
  const side = (ax, ay, bx, by, n) => {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(4, Math.round(len / 18));
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    const tearAt = new Set();
    for (let k = 0; k < n; k++) tearAt.add(1 + Math.floor(r() * (steps - 2)));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      let off = r.pm() * wander;
      if (tearAt.has(i)) off += r.range(4, 9) * (r() < 0.5 ? 1 : -1);
      pts.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off]);
    }
  };
  const t = () => Math.round(r() * tears);
  side(x, y, x + w, y, t());
  side(x + w, y, x + w, y + h, t());
  side(x + w, y + h, x, y + h, t());
  side(x, y + h, x, y, t());
  return through(pts, true);
}

/** A rectangle drawn by hand, corners nearly meeting. */
export function box(x, y, w, h, r, opts = {}) {
  const j = opts.overshoot ?? 3;
  return [
    line(x - r.range(0, j), y, x + w + r.range(0, j), y + r.pm(), r, opts),
    line(x + w, y - r.range(0, j), x + w + r.pm(), y + h + r.range(0, j), r, opts),
    line(x + w + r.range(0, j), y + h, x - r.range(0, j), y + h + r.pm(), r, opts),
    line(x, y + h + r.range(0, j), x + r.pm(), y - r.range(0, j), r, opts),
  ].join('');
}

/** A circle drawn by hand: not quite round, and the ends overlap a little. */
export function circle(cx, cy, rad, r, { wander = 0.02, overlap = 0.12 } = {}) {
  const steps = Math.max(10, Math.round(rad / 4));
  const start = r() * Math.PI * 2;
  const squash = 1 + r.pm() * 0.04;
  const pts = [];
  for (let i = 0; i <= steps * (1 + overlap); i++) {
    const a = start + (i / steps) * Math.PI * 2;
    const rr = rad * (1 + r.pm() * wander) * (1 + (i / steps) * 0.015);
    pts.push([cx + Math.cos(a) * rr * squash, cy + Math.sin(a) * rr / squash]);
  }
  return through(pts);
}

/* ------------------------------------------------------------------ *
 * His flourishes
 * ------------------------------------------------------------------ */

/**
 * A curl: a stem that starts nearly straight and bends harder and harder
 * until it winds into a tight eye, the shape at the end of every vine on the
 * home page's buttons. `len` is how long the line is, `side` which way it
 * winds (1 or -1), `wind` how many turns the eye makes.
 *
 * The bend grows exponentially along the line (curvature a·e^(b·s)), which
 * is what makes it read as grown rather than drawn with a compass: b fixes
 * how sudden the winding is, and a is solved so the whole line turns through
 * `wind` turns. Returns the points, each with the heading it was going in,
 * so a branch can leave from anywhere along it.
 */
export function curl(x, y, heading, len, side, r, { wind = 1.5, b = 2.8, steps = 56 } = {}) {
  const total = Math.PI * 2 * wind + 0.6;
  const a = (total * b) / (len * (Math.exp(b) - 1));
  const ds = len / steps;
  const pts = [[x, y, heading]];
  let h = heading;
  for (let i = 1; i <= steps; i++) {
    h += side * a * Math.exp((b * i) / steps) * ds;
    x += Math.cos(h) * ds;
    y += Math.sin(h) * ds;
    pts.push([x + r.pm() * 0.35, y + r.pm() * 0.35, h]);
  }
  return pts;
}

/**
 * A vine: a stem that winds up into a curl, with smaller curls leaving it on
 * alternating sides, and (at depth) smaller ones off those. This is the tree
 * under "Music", "Games" and "Writing" on the home page. Returns path data.
 */
export function vine(x, y, heading, len, r, { buds = 3, side = 1, depth = 1, wind = 1.5, b = 2.8 } = {}) {
  const stem = curl(x, y, heading, len, side, r, { wind, b });
  let d = through(stem);
  for (let k = 0; k < buds; k++) {
    // Branches leave the straighter two-thirds of the stem, never the eye.
    const t = 0.18 + (0.5 * (k + 0.5)) / buds + r.pm() * 0.04;
    const [bx, by, bh] = stem[Math.floor(t * (stem.length - 1))];
    const s = k % 2 ? side : -side;
    const sub = len * r.range(0.32, 0.46) * (1 - t * 0.5);
    const h = bh + s * r.range(0.5, 0.9);
    d += depth > 0
      ? vine(bx, by, h, sub, r, { buds: 2, side: s, depth: depth - 1, wind: 1.3, b })
      : through(curl(bx, by, h, sub, s, r, { wind: 1.2, b: Math.min(b, 3.2) }));
  }
  return d;
}

/** An Archimedean spiral, for a record's groove or the eye of a curl. */
export function spiral(cx, cy, outer, inner, turns, r, { wander = 0.4 } = {}) {
  const steps = Math.round(turns * 40);
  const pts = [];
  const start = r() * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const rad = outer + (inner - outer) * t + r.pm() * wander;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return through(pts);
}

/** A four-pointed sparkle, the star scattered across the home page. */
export function sparkle(cx, cy, size, r) {
  const arm = (dx, dy, len) => line(cx, cy, cx + dx * len, cy + dy * len, r, { wander: 0.4, bow: 0.03 });
  return arm(0, -1, size) + arm(0, 1, size * 0.8) + arm(-1, 0, size * 0.45) + arm(1, 0, size * 0.5);
}

/* ------------------------------------------------------------------ *
 * The boil
 * ------------------------------------------------------------------ */

/** How many times a drawing is traced, and for how long each shows. */
export const BOIL = { frames: 3, ms: 200 };

/**
 * Draw a thing three times with three different hands, and stack the frames
 * so the stylesheet below shows one at a time. `draw(r, i)` returns SVG
 * markup for one frame; `seed` keeps it the same drawing every build.
 */
export function boil(seed, draw) {
  let out = '<g class="ss-boil">';
  for (let i = 0; i < BOIL.frames; i++) out += `<g>${draw(rng(`${seed}:${i}`), i)}</g>`;
  return out + '</g>';
}

/**
 * The CSS that turns the frames over. Frame k shows for the k-th 200ms of
 * every 600ms; the negative delays line them up from the first paint, so
 * no frame waits in its hidden "before" state. Anyone who asked the system
 * for less motion gets the first frame, still.
 *
 * Used in two places: the site's stylesheet (sketch.css, for drawings in a
 * page) and inside every placeholder SVG file, where a page's stylesheet
 * cannot reach.
 */
export const BOIL_CSS =
  `.ss-boil>g{visibility:hidden;animation:ssBoil ${BOIL.frames * BOIL.ms}ms step-end infinite}` +
  `.ss-boil>g:nth-child(2){animation-delay:-${2 * BOIL.ms}ms}` +
  `.ss-boil>g:nth-child(3){animation-delay:-${BOIL.ms}ms}` +
  `@keyframes ssBoil{0%{visibility:visible}33.333%{visibility:hidden}}` +
  `@media (prefers-reduced-motion:reduce){.ss-boil>g{animation:none}.ss-boil>g:first-child{visibility:visible}}`;

/** Chalk: the stroke every drawing here is made with. */
export const CHALK = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/** One drawn line as an element, at a given weight. */
export const stroke = (d, w = 2.4, extra = '') => `<path d="${d}" ${CHALK} stroke-width="${w}"${extra} />`;
