/**
 * Placeholder art, in Timothy's manner, for every page piece that has no
 * drawing of his yet.
 *
 *   npm run placeholders        (from the repository root)
 *
 * Writes SVG files into public/media/placeholder/. Each is a chalk drawing on
 * nothing (transparent, like his GIFs) that boils: three traced frames, 200ms
 * each, exactly the rhythm of every GIF on the Squarespace site. They are
 * named in src/assets.js, so when he draws the real one, his file goes in and
 * one line there changes.
 *
 * Why SVG and not GIF: tens of kilobytes instead of hundreds, sharp at any
 * size, and the boil is three <g> frames turned over by CSS inside the file.
 *
 * Why this font: his letters are single pencil strokes, not filled shapes.
 * EMS Elfin is a single-stroke font made for pen plotters, so every letter is
 * a pen path and can be drawn with the same chalk line as everything else,
 * each point moved a little differently in each frame so the words boil with
 * the drawing. An SVG shown as a picture may not load a web font anyway, so
 * the words had to become paths here regardless. The font is one file,
 * scripts/fonts/EMSElfin.svg (SIL Open Font License; its makers and licence
 * are in its own metadata), taken from the hersheytext package rather than
 * depending on that package and the thirty it brings with it.
 *
 * Seeded, so running this twice writes the same files.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  boil, BOIL_CSS, stroke, torn, vine, circle, line, box, sparkle, through, curl,
} from '../src/custom/sketch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/media/placeholder');
mkdirSync(out, { recursive: true });

/* ------------------------------------------------------------------ *
 * The pen font
 * ------------------------------------------------------------------ */

const fontSvg = readFileSync(join(root, 'scripts/fonts/EMSElfin.svg'), 'utf8');

/** Each glyph as its advance and its strokes, a stroke being a list of points. */
const GLYPHS = {};
for (const m of fontSvg.matchAll(/<glyph unicode="([^"]+)"[^>]*?horiz-adv-x="([\d.]+)"(?:[^>]*?d="([^"]*)")?/g)) {
  const strokes = [];
  for (const part of (m[3] ?? '').split('M').map((s) => s.trim()).filter(Boolean)) {
    const nums = part.replace(/L/g, ' ').trim().split(/\s+/).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length > 1) strokes.push(pts);
  }
  const ch = m[1].replace(/&#x([0-9a-f]+);/i, (_, h) => String.fromCharCode(parseInt(h, 16))).replace('&amp;', '&');
  GLYPHS[ch] = { adv: Number(m[2]), strokes };
}
const CAP = 500;   // the font's cap height, in its own units

/** How wide a word is at a given cap height, before any wobble. */
const widthOf = (text, capH) => [...text].reduce((w, ch) => w + (GLYPHS[ch]?.adv ?? 300), 0) * (capH / CAP);

/**
 * Words drawn in the pen font. Each letter turns and lifts a little on its
 * own and every point strays a little, chosen afresh for each frame. His
 * letters are tall and narrow, so the font is stretched upward. `fit` shrinks
 * a long word to a width rather than letting it run off the paper.
 */
function lettering(text, x, y, capH, r, { align = 'left', fit = Infinity, stretch = 1.2, weight = 3 } = {}) {
  const natural = widthOf(text, capH);
  if (natural > fit) capH *= fit / natural;
  const s = capH / CAP;
  const width = widthOf(text, capH);
  let at = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  let d = '';
  for (const ch of text) {
    const g = GLYPHS[ch] ?? { adv: 300, strokes: [] };
    const turn = (r.pm() * 3 * Math.PI) / 180;
    const lift = r.pm() * capH * 0.03;
    const tall = 1 + r.pm() * 0.06;
    const cx = at + (g.adv * s) / 2, cy = y - capH * 0.5;
    for (const pts of g.strokes) {
      d += through(pts.map(([px, py]) => {
        const X = at + px * s, Y = y - py * s * stretch * tall + lift;
        const dx = X - cx, dy = Y - cy;
        return [
          cx + dx * Math.cos(turn) - dy * Math.sin(turn) + r.pm() * capH * 0.006,
          cy + dx * Math.sin(turn) + dy * Math.cos(turn) + r.pm() * capH * 0.006,
        ];
      }));
    }
    at += g.adv * s;
  }
  return stroke(d, weight);
}

/** His line colour: a warm white, never pure. */
const INK = '#e6e3dc';

/** Path data to whole pixels: a 500px drawing is shown at 150, and a decimal per number doubled the files. */
const whole = (svg) => svg.replace(/ d="([^"]*)"/g, (_, d) => ` d="${d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))}"`);

function write(name, w, h, body, { title }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" color="${INK}" role="img" aria-label="${title}">`
    + `<title>${title}</title><style>${BOIL_CSS}</style>${whole(body)}</svg>\n`;
  writeFileSync(join(out, name), svg);
  console.log(`  ${name}  ${(svg.length / 1024).toFixed(1)} KB`);
}

/* ------------------------------------------------------------------ *
 * The home page's section buttons
 * ------------------------------------------------------------------ */

/**
 * A tree of curls growing up from the bottom of the paper: a few stems, each
 * winding into an eye, with smaller curls off them. The bottom half of every
 * button on the home page.
 */
const tree = (r, x, y, { stems = 3, len = 420, spread = 0.32 } = {}) => {
  let d = '';
  for (let i = 0; i < stems; i++) {
    const k = i - (stems - 1) / 2;
    const side = i % 2 ? 1 : -1;
    d += vine(x + k * 22, y, -Math.PI / 2 + k * spread + r.pm() * 0.05, len * (i === Math.floor(stems / 2) ? 1 : 0.72), r,
      { buds: 3, side, depth: 1, wind: 1.6, b: 5.5 });
  }
  return stroke(d, 2.6);
};

/**
 * A button the way his are made: a torn square, the word big along the top
 * in tall thin letters, and a drawing growing up from the bottom edge.
 */
function button(name, word, motif) {
  const S = 500;
  const body = boil(`button:${name}`, (r) =>
    stroke(torn(10, 12, S - 20, S - 24, r), 3.4)
    + lettering(word, 40, 178, 128, r, { fit: 420, weight: 3.6 })
    + motif(r));
  write(`${name}-button.svg`, S, S, body, { title: word });
}

// Films: a reel, its strip running off and winding up, and curls beside.
button('films', 'Films', (r) => {
  const cx = 338, cy = 318, R = 82;
  let d = circle(cx, cy, R, r) + circle(cx, cy, 13, r);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    d += circle(cx + Math.cos(a) * 47, cy + Math.sin(a) * 47, 17, r);
  }
  // The strip leaves the bottom of the reel and curls up to the left: two
  // edges a strip's width apart, and the sprocket holes between them.
  const edge = curl(cx - 30, cy + R - 8, Math.PI * 0.9, 230, 1, r, { wind: 0.75, b: 3.4 });
  const inner = edge.map(([x, y, h]) => [x + Math.sin(h) * 22, y - Math.cos(h) * 22]);
  d += through(edge) + through(inner);
  for (let i = 6; i < edge.length * 0.62; i += 7) {
    const [x, y, h] = edge[i];
    const mx = x + Math.sin(h) * 11, my = y - Math.cos(h) * 11;
    d += box(mx - 3, my - 3, 6, 6, r, { wander: 0.2, overshoot: 0.4 });
  }
  return stroke(d, 2.6) + tree(r, 110, 490, { stems: 2, len: 280 });
});

// Inventions: a light bulb whose filament is a pair of curls.
button('inventions', 'Inventions', (r) => {
  const cx = 320, cy = 300;
  const glass = [];
  for (let i = 0; i <= 44; i++) {
    const a = Math.PI * 0.72 + (i / 44) * Math.PI * 1.56;
    glass.push([cx + Math.cos(a) * 72 + r.pm(), cy + Math.sin(a) * 76 + r.pm()]);
  }
  glass.push([cx + 30, cy + 92], [cx + 27, cy + 116]);
  glass.unshift([cx - 27, cy + 116], [cx - 30, cy + 92]);
  let d = through(glass);
  for (let k = 0; k < 3; k++) d += line(cx - 29, cy + 122 + k * 11, cx + 29, cy + 122 + k * 11, r, { wander: 0.6 });
  d += line(cx - 12, cy + 158, cx + 12, cy + 158, r, { wander: 0.4 });
  d += through(curl(cx - 9, cy + 92, -Math.PI / 2, 80, 1, r, { wind: 1.4 }));
  d += through(curl(cx + 9, cy + 92, -Math.PI / 2, 80, -1, r, { wind: 1.4 }));
  for (const a of [-2.5, -1.95, -1.2, -0.65]) {
    d += line(cx + Math.cos(a) * 92, cy + Math.sin(a) * 96, cx + Math.cos(a) * 118, cy + Math.sin(a) * 122, r, { wander: 0.3 });
  }
  return stroke(d, 2.6) + tree(r, 126, 490, { stems: 2, len: 330 });
});

// Art: a brush laid across, its paint running off the tip into a curl.
button('art', 'Art', (r) => {
  let d = line(78, 470, 250, 300, r) + line(92, 482, 264, 312, r);
  d += box(250, 276, 32, 32, r, { wander: 0.4 });
  d += through([[282, 284], [310, 258], [324, 236], [318, 266], [296, 298], [276, 308]]);
  d += through(curl(324, 236, -Math.PI / 2.6, 210, -1, r, { wind: 1.7 }));
  d += circle(70, 474, 8, r);
  return stroke(d, 2.6) + tree(r, 372, 490, { stems: 3, len: 360, spread: 0.3 });
});

/* ------------------------------------------------------------------ *
 * The seventh book on the bookcase
 * ------------------------------------------------------------------ */

/**
 * An overlay the size of the bookcase picture (1452 x 1505), like his six
 * covers: it tints one thing on the shelf and letters its name underneath.
 * The thing is the game controller lying beside a book on its side, up on
 * top of the case, which no cover uses. A game and a book is what an
 * interactive novel is.
 */
{
  const W = 1452, H = 1505;
  const body = boil('cover:interactive-novels', (r) => {
    const tint = (pts) => `<path d="${through(pts.map(([x, y]) => [x + r.pm() * 1.5, y + r.pm() * 1.5]), true)}" fill="#a08a4e" fill-opacity="0.78"/>`;
    const pad = tint([[440, 215], [526, 214], [507, 269], [399, 265], [396, 258]]);
    const book = tint([[506, 218], [612, 216], [628, 222], [634, 242], [628, 263], [612, 270], [502, 269], [524, 226]]);
    const label = `<g color="#cfcbc2">${lettering('INTERACTIVE NOVELS', W / 2, 1335, 74, r, { align: 'center', fit: 640, stretch: 1.25, weight: 5 })}</g>`;
    return pad + book + label;
  });
  write('book-interactive-novels.svg', W, H, body, { title: 'Interactive Novels' });
}

/* ------------------------------------------------------------------ *
 * A sign for a page that is coming
 * ------------------------------------------------------------------ */

{
  const W = 600, H = 300;
  const body = boil('sign:soon', (r) =>
    stroke(torn(12, 12, W - 24, H - 24, r, { tears: 2 }), 3.2)
    + lettering('Coming soon', W / 2, 190, 96, r, { align: 'center', fit: 500, weight: 3.4 })
    + stroke(sparkle(60, 64, 28, r) + sparkle(540, 236, 22, r), 2));
  write('coming-soon.svg', W, H, body, { title: 'Coming soon' });
}

/* ------------------------------------------------------------------ *
 * A link icon for itch.io, where the games are played
 * ------------------------------------------------------------------ */

{
  const S = 300;
  const body = boil('icon:itch', (r) => {
    let d = torn(16, 16, S - 32, S - 32, r, { tears: 1, wander: 1.6 });
    const pad = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rx = 92 + Math.cos(a * 2) * 6, ry = 48 + Math.sin(a * 2) * 4;
      pad.push([150 + Math.cos(a) * rx + r.pm() * 0.8, 180 + Math.sin(a) * ry + r.pm() * 0.8]);
    }
    d += through(pad, true);
    d += line(92, 180, 126, 180, r, { wander: 0.3 }) + line(109, 163, 109, 197, r, { wander: 0.3 });
    d += circle(188, 170, 8, r) + circle(206, 192, 8, r);
    return stroke(d, 3.2) + lettering('itch.io', 150, 104, 52, r, { align: 'center', weight: 3.2 });
  });
  write('itch-icon.svg', S, S, body, { title: 'itch.io' });
}

console.log('Placeholders written to public/media/placeholder/');
