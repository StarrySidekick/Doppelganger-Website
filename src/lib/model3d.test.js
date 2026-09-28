/**
 * Low-poly models: the parts, the triangles they make, and the checks a
 * stored model has to pass. Drawing is WebGL and is checked in a browser;
 * everything here is the pure half.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, SHAPES, makePart, normalizeModel, validateModel, buildMesh, shapeTris, cameraFor, apply, rotation, mul, identity,
} from './model3d.js';
import { renderElement, checkElement } from './elements.js';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('every starting model is valid and is low-poly', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.deepEqual(validateModel(p.model), [], name);
    assert.ok(buildMesh(p.model).triangles <= 400, `${name} should stay in N64 territory`);
  }
  // The note key is a note head, a stem, and three teeth where the flag would be.
  const parts = PRESETS.noteKey.model.parts;
  assert.equal(parts[0].shape, 'ball');
  assert.equal(parts.filter((p) => p.shape === 'box').length, 4);
});

test('every convex shape faces outward, so its light is never inside-out', () => {
  for (const shape of ['box', 'cylinder', 'cone', 'ball']) {
    for (const t of shapeTris(makePart(shape))) {
      const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      const c = [0, 1, 2].map((k) => (t[0][k] + t[1][k] + t[2][k]) / 3);
      assert.ok(dot(n, c) > -1e-9, `${shape} has a triangle facing in`);
    }
  }
});

test('a ring stands facing you, and is as big as its box', () => {
  const pts = shapeTris(makePart('ring')).flat();
  const max = (k) => Math.max(...pts.map((p) => Math.abs(p[k])));
  assert.ok(Math.abs(max(0) - 0.5) < 0.02 && Math.abs(max(1) - 0.5) < 0.02, 'it spans the box across and up');
  assert.ok(max(2) < 0.2, 'and is thin toward you');
});

test('a part is scaled, turned and moved in that order', () => {
  const p = makePart('box', { pos: [2, 0, 0], rot: [0, 0, 90], size: [2, 1, 1] });
  const xs = buildMesh({ parts: [p] }).positions.filter((_, i) => i % 3 === 1);
  // Two wide, turned a quarter, then moved: it is two tall.
  assert.ok(Math.abs(Math.max(...xs) - 1) < 1e-9 && Math.abs(Math.min(...xs) + 1) < 1e-9);
  assert.deepEqual(mul(identity(), rotation([0, 0, 0])), identity());
});

test('the camera fits the whole model whatever way it is turned', () => {
  const mesh = buildMesh(PRESETS.key.model);
  for (const angle of [0, 45, 90, 200]) {
    const { mvp } = cameraFor(mesh, { angle, tilt: 12, aspect: 1 });
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const v = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
      const w = mvp[3] * v[0] + mvp[7] * v[1] + mvp[11] * v[2] + mvp[15];
      const [x, y] = apply(mvp, v).map((c) => c / w);
      assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1, `a corner leaves the frame at ${angle}°`);
    }
  }
});

test('a stored model is checked, part by part', () => {
  assert.deepEqual(validateModel({ parts: [] }), []);
  assert.equal(validateModel({ parts: [{ shape: 'teapot' }] }).length, 1);
  assert.equal(validateModel({ parts: [makePart('box', { size: [1, 0, 1] })] }).length, 1);
  assert.equal(validateModel({ parts: [makePart('cylinder', { seg: 200 })] }).length, 1);
  assert.equal(validateModel({ parts: [makePart('box', { color: 'red' })] }).length, 1);
  assert.equal(validateModel({ parts: [], pixel: 40 }).length, 1);
  assert.equal(normalizeModel({ parts: [{ shape: 'ring' }] }).parts[0].thick, 0.25, 'a part arrives complete');
  assert.ok(Object.keys(SHAPES).length >= 5);
});

test('a model object is a canvas carrying its parts, and a bad one fails the build', () => {
  const o = { kind: 'model', model: PRESETS.noteKey.model, title: 'The note key' };
  const html = renderElement(o, { link: (h) => h });
  assert.match(html, /^<canvas class="ob-model" data-model="\{&quot;/);
  assert.match(html, /aria-label="The note key"/);
  assert.doesNotMatch(html, /<script/i);
  assert.deepEqual(checkElement(o), []);
  assert.equal(checkElement({ kind: 'model', model: { parts: [{ shape: 'teapot' }] } }).length, 1);
});
