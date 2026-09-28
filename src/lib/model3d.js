/**
 * Low-poly models, made of parts.
 *
 * A model is a short list of PARTS — a box, a cylinder, a cone, a ring, a
 * ball — each with a colour, a place, a turn and a size. That is the whole
 * modelling language, deliberately: it is how a Nintendo 64 prop was built
 * (a handful of primitives, a few dozen polygons, flat colour), it is small
 * enough to store on the object itself and publish in a layout, and it is
 * something a person can make by hand in a panel with no mouse gymnastics.
 *
 * This file is pure and runs in node and the browser, like elements.js: it
 * turns parts into triangles and does the matrix sums. Drawing them is
 * model-view.js; editing them is model-editor.js. It knows nothing about this
 * website (hard rule 4), which is also what lets the modeller become its own
 * thing later.
 *
 * Units are arbitrary. The viewer fits whatever it is given to its box, so a
 * model is as big as its parts are relative to each other and no bigger.
 */

/* ------------------------------------------------------------------ *
 * The parts a model is made of
 * ------------------------------------------------------------------ */

/**
 * `seg` is how many sides a round thing has. Low is the look: a six-sided
 * cylinder reads as a cylinder and as a polygon at the same time.
 */
export const SHAPES = {
  box:      { label: 'Box' },
  cylinder: { label: 'Cylinder', seg: 6 },
  cone:     { label: 'Cone',     seg: 6 },
  ring:     { label: 'Ring',     seg: 8 },
  ball:     { label: 'Ball',     seg: 6 },
};

export const SHADINGS = { flat: 'Flat — every polygon shows', smooth: 'Smooth — rounded light, N64 style' };

export const LIMITS = { parts: 64, seg: [3, 24], pixel: [1, 8] };

/** A new part of a shape, at the origin, a unit big. */
export function makePart(shape = 'box', over = {}) {
  const p = { shape, pos: [0, 0, 0], rot: [0, 0, 0], size: [1, 1, 1], color: '#d9a441' };
  if (SHAPES[shape]?.seg) p.seg = SHAPES[shape].seg;
  if (shape === 'ring') p.thick = 0.25;
  return { ...p, ...structuredClone(over) };
}

/** Everything a model can say about how it is shown, filled in. */
export const MODEL_DEFAULTS = {
  spin: 45,        // degrees a second about its upright; 0 holds still
  tilt: 12,        // degrees it leans toward you
  pixel: 3,        // screen pixels per rendered pixel — the chunkiness
  shading: 'flat',
  zoom: 1,
};

export function normalizeModel(m = {}) {
  const out = { ...MODEL_DEFAULTS, ...(m ?? {}) };
  out.parts = Array.isArray(m?.parts) ? m.parts.map((p) => makePart(p?.shape, p)) : [];
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;
const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/** Problems with a stored model. Empty means fine. */
export function validateModel(m, at = 'model') {
  const out = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return [`${at} must be an object`];
  if (!Array.isArray(m.parts)) return [`${at}.parts must be a list`];
  if (m.parts.length > LIMITS.parts) out.push(`${at} has ${m.parts.length} parts; the most is ${LIMITS.parts}`);
  m.parts.forEach((p, i) => {
    const w = `${at}.parts[${i}]`;
    if (!p || typeof p !== 'object') { out.push(`${w} must be an object`); return; }
    if (!SHAPES[p.shape]) out.push(`${w}.shape ${JSON.stringify(p.shape)} is not one of ${Object.keys(SHAPES).join(', ')}`);
    for (const k of ['pos', 'rot', 'size']) if (p[k] != null && !vec3(p[k])) out.push(`${w}.${k} must be three numbers`);
    if (vec3(p.size) && !p.size.every((n) => n > 0)) out.push(`${w}.size must be bigger than nothing in every direction`);
    if (p.color != null && !HEX.test(p.color)) out.push(`${w}.color must be a colour like #d9a441`);
    if (p.seg != null && !(Number.isInteger(p.seg) && p.seg >= LIMITS.seg[0] && p.seg <= LIMITS.seg[1])) {
      out.push(`${w}.seg must be a whole number from ${LIMITS.seg[0]} to ${LIMITS.seg[1]}`);
    }
    if (p.thick != null && !(Number.isFinite(p.thick) && p.thick > 0 && p.thick < 1)) out.push(`${w}.thick must be between 0 and 1`);
  });
  for (const k of ['spin', 'tilt']) if (m[k] != null && !Number.isFinite(m[k])) out.push(`${at}.${k} must be a number`);
  if (m.zoom != null && !(Number.isFinite(m.zoom) && m.zoom > 0)) out.push(`${at}.zoom must be a positive number`);
  if (m.pixel != null && !(Number.isFinite(m.pixel) && m.pixel >= LIMITS.pixel[0] && m.pixel <= LIMITS.pixel[1])) {
    out.push(`${at}.pixel must be from ${LIMITS.pixel[0]} to ${LIMITS.pixel[1]}`);
  }
  if (m.shading != null && !SHADINGS[m.shading]) out.push(`${at}.shading must be flat or smooth`);
  return out;
}

/* ------------------------------------------------------------------ *
 * Vectors and matrices — column-major, as WebGL wants them
 * ------------------------------------------------------------------ */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rad = (d) => (d * Math.PI) / 180;

export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const translation = ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const scaling = ([x, y, z]) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
export function rotX(deg) { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
export function rotY(deg) { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
export function rotZ(deg) { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
/** Turn by X, then Y, then Z — the order the three fields are read in. */
export const rotation = ([x, y, z]) => mul(rotZ(z), mul(rotY(y), rotX(x)));
export function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan(rad(fovDeg) / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
export function apply(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
/** The upper-left 3x3 of a rotation, for turning normals. */
export const normalMatrix = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];

/* ------------------------------------------------------------------ *
 * Each shape, as triangles in its own unit box (-0.5 … 0.5)
 * ------------------------------------------------------------------ */

const ring = (n, r, y, phase = 0) => Array.from({ length: n }, (_, i) => {
  const a = phase + (i / n) * Math.PI * 2;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

function boxTris() {
  const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
    .map((p) => p.map((c) => c * 0.5));
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  return quads.flatMap(([a, b, c, d]) => [[v[a], v[b], v[c]], [v[a], v[c], v[d]]]);
}

function columnTris(n, rTop, rBot) {
  // A half-step twist puts a flat face toward the viewer rather than an edge,
  // which is how a low-poly column usually wants to be seen.
  const phase = Math.PI / n;
  const top = ring(n, rTop, 0.5, phase), bot = ring(n, rBot, -0.5, phase);
  const t = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    t.push([bot[i], bot[j], top[j]]);
    if (rTop > 0) t.push([bot[i], top[j], top[i]]);
    if (rTop > 0) t.push([[0, 0.5, 0], top[i], top[j]]);
    t.push([[0, -0.5, 0], bot[j], bot[i]]);
  }
  return t;
}

function ballTris(n) {
  const rows = Math.max(2, Math.round(n / 2));
  const pt = (i, j) => {
    const lat = Math.PI * (i / rows) - Math.PI / 2, lon = (j / n) * Math.PI * 2;
    return [Math.cos(lat) * Math.cos(lon) * 0.5, Math.sin(lat) * 0.5, Math.cos(lat) * Math.sin(lon) * 0.5];
  };
  const t = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < n; j++) {
    const a = pt(i, j), b = pt(i, j + 1), c = pt(i + 1, j + 1), d = pt(i + 1, j);
    if (i > 0) t.push([a, b, c]);
    if (i < rows - 1) t.push([a, c, d]);
  }
  return t;
}

/** A ring standing in the XY plane, facing you: a key's bow. Square-ish tube. */
function ringTris(n, thick) {
  const r = Math.min(0.49, thick / 2), R = 0.5 - r, sides = 4;
  const pt = (u, v) => {
    const a = (u / n) * Math.PI * 2, b = (v / sides) * Math.PI * 2 + Math.PI / 4;
    // A square tube turned 45°: its corners sit at r·√2, so its flat sides
    // are r from the middle and the ring's outer edge lands on its box.
    const w = R + Math.cos(b) * r * Math.SQRT2;
    return [Math.cos(a) * w, Math.sin(a) * w, Math.sin(b) * r * Math.SQRT2];
  };
  const t = [];
  for (let u = 0; u < n; u++) for (let v = 0; v < sides; v++) {
    const a = pt(u, v), b = pt(u + 1, v), c = pt(u + 1, v + 1), d = pt(u, v + 1);
    t.push([a, b, c], [a, c, d]);
  }
  return { tris: t, R };
}

/**
 * Point every triangle outward. Rather than trusting each generator's winding,
 * a triangle is flipped if its normal faces the shape's middle — the origin
 * for a convex shape, the nearest point on the centre circle for a ring. One
 * rule, checked once, and lighting cannot come out inside-out.
 */
function outward(tris, middle) {
  return tris.map((t) => {
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
    const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    return dot(n, sub(c, middle(c))) < 0 ? [t[0], t[2], t[1]] : t;
  });
}

const ORIGIN = () => [0, 0, 0];
/** A part's triangles in its own space, outward-facing. */
export function shapeTris(p) {
  const n = p.seg ?? SHAPES[p.shape]?.seg ?? 6;
  switch (p.shape) {
    case 'box': return outward(boxTris(), ORIGIN);
    case 'cylinder': return outward(columnTris(n, 0.5, 0.5), ORIGIN);
    case 'cone': return outward(columnTris(n, 0, 0.5), ORIGIN);
    case 'ball': return outward(ballTris(n), ORIGIN);
    case 'ring': {
      const { tris, R } = ringTris(n, p.thick ?? 0.25);
      return outward(tris, (c) => { const a = Math.atan2(c[1], c[0]); return [Math.cos(a) * R, Math.sin(a) * R, 0]; });
    }
    default: return [];
  }
}

/** Where a part sits: scaled to its size, turned, then moved. */
export const partMatrix = (p) => mul(translation(p.pos ?? [0, 0, 0]), mul(rotation(p.rot ?? [0, 0, 0]), scaling(p.size ?? [1, 1, 1])));

export const hexRgb = (h) => {
  const s = HEX.test(h) ? h : '#cccccc';
  return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};

/* ------------------------------------------------------------------ *
 * The mesh
 * ------------------------------------------------------------------ */

/**
 * Every part's triangles, in model space, as flat arrays ready for a GPU:
 * three floats of position, normal and colour per corner, and which part each
 * corner belongs to (so the editor can tell what you pressed).
 *
 * Flat shading gives each triangle its own normal, so every polygon shows —
 * the look people mean by "low poly". Smooth averages the normals where a
 * part's corners meet, which is the soft Gouraud light of the actual N64.
 */
export function buildMesh(model) {
  const m = normalizeModel(model);
  const positions = [], normals = [], colors = [], part = [];
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];

  m.parts.forEach((p, pi) => {
    const M = partMatrix(p);
    const rgb = hexRgb(p.color);
    const tris = shapeTris(p).map((t) => t.map((v) => apply(M, v)));
    const faceN = tris.map((t) => norm(cross(sub(t[1], t[0]), sub(t[2], t[0]))));
    let smooth = null;
    if (m.shading === 'smooth') {
      smooth = new Map();
      const key = (v) => v.map((c) => c.toFixed(4)).join(',');
      tris.forEach((t, i) => t.forEach((v) => {
        const k = key(v), s = smooth.get(k) ?? [0, 0, 0];
        smooth.set(k, [s[0] + faceN[i][0], s[1] + faceN[i][1], s[2] + faceN[i][2]]);
      }));
      for (const [k, v] of smooth) smooth.set(k, norm(v));
      smooth.key = key;
    }
    tris.forEach((t, i) => t.forEach((v) => {
      positions.push(...v);
      normals.push(...(smooth ? smooth.get(smooth.key(v)) : faceN[i]));
      colors.push(...rgb);
      part.push(pi);
      lo = lo.map((c, k) => Math.min(c, v[k]));
      hi = hi.map((c, k) => Math.max(c, v[k]));
    }));
  });

  const count = positions.length / 3;
  const center = count ? lo.map((c, k) => (c + hi[k]) / 2) : [0, 0, 0];
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    radius = Math.max(radius, Math.hypot(positions[i] - center[0], positions[i + 1] - center[1], positions[i + 2] - center[2]));
  }
  return { positions, normals, colors, part, count, triangles: count / 3, center, radius: radius || 1 };
}

/**
 * The camera for a mesh: far enough back that the whole thing fits the box
 * however it is turned (its bounding sphere, not its box), then leaned and
 * spun. Returns the matrices the shader wants.
 */
export function cameraFor(mesh, { angle = 0, tilt = 0, pitch = 0, aspect = 1, zoom = 1 } = {}) {
  const fov = 30;
  const fit = mesh.radius / Math.sin(rad(fov / 2));
  const dist = (fit * 1.05) / Math.max(0.05, zoom) / Math.min(1, aspect);
  const model = mul(rotX(tilt + pitch), mul(rotY(angle), translation(mesh.center.map((c) => -c))));
  const view = translation([0, 0, -dist]);
  const proj = perspective(fov, aspect, Math.max(0.01, dist - mesh.radius * 2), dist + mesh.radius * 2);
  return { model, mvp: mul(proj, mul(view, model)), normal: normalMatrix(model) };
}

/* ------------------------------------------------------------------ *
 * Things to start from
 * ------------------------------------------------------------------ */

const GOLD = '#d9a441', GOLD_DARK = '#a8741f';

/**
 * A plain key and the music-note key. The note key is a note whose head is
 * the key's bow and whose stem is the shaft, with the flag replaced by three
 * square teeth — the bit that would turn a lock.
 */
export const PRESETS = {
  key: {
    label: 'Key',
    model: {
      spin: 45, tilt: 12, pixel: 3, shading: 'flat', zoom: 1,
      parts: [
        makePart('ring', { pos: [0, 1.15, 0], size: [1.1, 1.1, 0.24], thick: 0.3, seg: 8, color: GOLD }),
        makePart('cylinder', { pos: [0, 0.52, 0], size: [0.3, 0.14, 0.3], seg: 6, color: GOLD_DARK }),
        makePart('cylinder', { pos: [0, -0.35, 0], size: [0.16, 1.7, 0.16], seg: 6, color: GOLD }),
        makePart('box', { pos: [0.21, -0.95, 0], size: [0.28, 0.14, 0.12], color: GOLD }),
        makePart('box', { pos: [0.17, -1.15, 0], size: [0.2, 0.12, 0.12], color: GOLD }),
        makePart('box', { pos: [0.21, -1.12, 0], size: [0.1, 0.4, 0.12], color: GOLD }),
      ],
    },
  },
  noteKey: {
    label: 'Note key',
    model: {
      spin: 45, tilt: 10, pixel: 3, shading: 'flat', zoom: 1,
      parts: [
        // The note head: a flattened ball, leaning the way a note head does.
        makePart('ball', { pos: [0, -1.05, 0], rot: [0, 0, 28], size: [0.95, 0.66, 0.4], seg: 8, color: GOLD }),
        // The stem, rising from the head's right-hand side: the key's shaft.
        makePart('box', { pos: [0.4, 0.05, 0], size: [0.13, 2.2, 0.13], color: GOLD }),
        // Where the flag would be: three teeth, like the bit of a key.
        makePart('box', { pos: [0.64, 0.95, 0], size: [0.36, 0.2, 0.13], color: GOLD_DARK }),
        makePart('box', { pos: [0.6, 0.62, 0], size: [0.28, 0.2, 0.13], color: GOLD_DARK }),
        makePart('box', { pos: [0.66, 0.29, 0], size: [0.4, 0.2, 0.13], color: GOLD_DARK }),
      ],
    },
  },
  cube: { label: 'A single box', model: { parts: [makePart('box', { color: '#6fb3e0' })] } },
  empty: { label: 'Nothing', model: { parts: [] } },
};
