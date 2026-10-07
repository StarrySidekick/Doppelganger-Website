/**
 * Draws a low-poly model into a canvas, and keeps it turning.
 *
 * WebGL, with no library: one shader, three attributes, a depth buffer. The
 * depth buffer is the reason it is WebGL and not a 2D canvas — the parts of a
 * model pass through each other (a stem goes INTO a note head), and a 2D
 * painter sorting whole triangles gets that wrong in exactly the places the
 * eye goes to.
 *
 * The N64 look is three decisions, all of them the model's own fields:
 * few polygons (the parts), light worked out per corner rather than per pixel
 * (Gouraud, which is what `shading: smooth` shows off), and a small frame
 * scaled up with hard edges (`pixel`) — the console drew 320 pixels across a
 * television.
 *
 * Browser only. The geometry is model3d.js, which is pure.
 */
import { buildMesh, cameraFor, normalizeModel } from './model3d.js';

const VS = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol; attribute float aPart;
uniform mat4 uMvp; uniform mat3 uNorm; uniform vec3 uLight;
uniform float uPick; uniform float uSel;
varying vec3 vCol;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  if (uPick > 0.5) {
    // Picking: the part number, as a colour. 0 means "nothing".
    float id = aPart + 1.0;
    vCol = vec3(mod(id, 256.0), floor(id / 256.0), 0.0) / 255.0;
    return;
  }
  vec3 n = normalize(uNorm * aNorm);
  float lit = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.0) * 0.18;
  vec3 c = aCol * (0.42 + 0.68 * lit) + rim;
  if (abs(aPart - uSel) < 0.5) c = mix(c, vec3(1.0, 0.85, 0.45), 0.35);
  vCol = c;
}`;
const FS = `
precision mediump float;
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader did not compile');
  return s;
}

/**
 * Put a model in a canvas. Returns a handle: `update(model)` redraws it with
 * new parts, `view` is the turn the viewer is at (the editor drives it),
 * `pick(x, y)` says which part is under a point, `destroy()` lets it go.
 *
 * `interactive` lets a visitor grab it and turn it by hand; `auto` keeps it
 * spinning at the model's own speed.
 */
export function mountModel(canvas, model, { interactive = true, auto = true, selected = -1 } = {}) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) {
    canvas.dataset.noGl = '';
    return { update() {}, pick: () => -1, destroy() {}, view: {} };
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = (n) => gl.getAttribLocation(prog, n);
  const uni = (n) => gl.getUniformLocation(prog, n);
  const bufs = {};
  const attrib = (name, size) => {
    bufs[name] = gl.createBuffer();
    const l = loc(name);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]);
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
  };
  attrib('aPos', 3); attrib('aNorm', 3); attrib('aCol', 3); attrib('aPart', 1);
  gl.enable(gl.DEPTH_TEST);
  // Both sides: a part squashed flat, or opened up by a low segment count,
  // should still read as solid from behind.
  gl.disable(gl.CULL_FACE);

  let m = normalizeModel(model);
  let mesh = null;
  const view = { angle: 0, pitch: 0, zoom: 1, selected, auto };
  const upload = () => {
    mesh = buildMesh(m);
    const put = (name, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); };
    put('aPos', mesh.positions); put('aNorm', mesh.normals); put('aCol', mesh.colors); put('aPart', mesh.part);
  };
  upload();

  /* A small frame, drawn big. `pixel` is how many screen pixels one rendered
     pixel covers; at 1 it is as sharp as the screen allows. */
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const px = Math.max(1, m.pixel || 1);
    const scale = px <= 1 ? (window.devicePixelRatio || 1) : 1 / px;
    const w = Math.max(8, Math.round(r.width * scale)), h = Math.max(8, Math.round(r.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };

  const light = (() => { const v = [-0.45, 0.65, 0.62]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
  function draw(pick = false) {
    size();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!mesh.count) return;
    const cam = cameraFor(mesh, { angle: view.angle, tilt: m.tilt, pitch: view.pitch, aspect: canvas.width / canvas.height, zoom: m.zoom * view.zoom });
    gl.uniformMatrix4fv(uni('uMvp'), false, new Float32Array(cam.mvp));
    gl.uniformMatrix3fv(uni('uNorm'), false, new Float32Array(cam.normal));
    gl.uniform3fv(uni('uLight'), light);
    gl.uniform1f(uni('uPick'), pick ? 1 : 0);
    gl.uniform1f(uni('uSel'), view.selected);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  // Turning. Paused off-screen, and for anyone who has asked for less motion.
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let last = 0, raf = 0, onScreen = true, held = false, alive = true;
  const frame = (t) => {
    raf = 0;
    if (!alive || !canvas.isConnected) return destroy();
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    if (view.auto && !held && !still) view.angle = (view.angle + (m.spin || 0) * dt) % 360;
    draw();
    if (onScreen && view.auto && !still && m.spin) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) kick(); })
    : null;
  io?.observe(canvas);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { draw(); }) : null;
  ro?.observe(canvas);

  /* A visitor can take hold of it and turn it. Side to side only, so a
     vertical swipe over it on a phone still scrolls the page (touch-action:
     pan-y in faces.css). While the board is unlocked the tile is something to
     pick up, not to turn, so it keeps its hands off. */
  let from = null;
  const down = (e) => {
    if (!interactive || document.documentElement.classList.contains('ag-unlocked')) return;
    from = { x: e.clientX, angle: view.angle, id: e.pointerId };
    held = true;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!from || e.pointerId !== from.id) return;
    view.angle = from.angle + (e.clientX - from.x) * 0.8;
    draw();
  };
  const up = (e) => { if (from && e.pointerId === from.id) { from = null; held = false; kick(); } };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function destroy() {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    io?.disconnect(); ro?.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
  }

  kick();
  return {
    view,
    get mesh() { return mesh; },
    update(next) { m = normalizeModel(next); upload(); draw(); kick(); },
    redraw() { draw(); },
    play() { kick(); },
    /** Which part is under a point on the canvas, in CSS pixels; -1 for none. */
    pick(x, y) {
      draw(true);
      const r = canvas.getBoundingClientRect();
      const px = new Uint8Array(4);
      gl.readPixels(Math.floor((x / r.width) * canvas.width), Math.floor((1 - y / r.height) * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      draw();
      const id = px[0] + px[1] * 256;
      return id ? id - 1 : -1;
    },
    destroy,
  };
}

/**
 * Wake every model canvas on the page, now and whenever one is added — the
 * editor redraws tiles by replacing their insides, so a canvas can arrive at
 * any time. The model travels on the canvas itself as JSON.
 */
export function wakeModels(root = document) {
  const wake = (c) => {
    if (c.__model) return;
    try { c.__model = mountModel(c, JSON.parse(c.dataset.model || '{}')); } catch { /* a broken model draws nothing */ }
  };
  root.querySelectorAll('canvas[data-model]').forEach(wake);
  new MutationObserver((list) => {
    for (const r of list) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.('canvas[data-model]')) wake(n);
      n.querySelectorAll?.('canvas[data-model]').forEach(wake);
    }
  }).observe(root.body ?? root, { childList: true, subtree: true });
}
