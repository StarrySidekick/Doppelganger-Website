/**
 * Kinds a site brings with it: the room for anything the tool does not do.
 *
 * DigiDesk's kinds (note, image, drawer, player…) are general, and a website
 * will always want something they are not. Before this the only ways to get it
 * were the `html` kind, which is markup and can never run a script, or a
 * hand-written page, which nothing on a board can be. A custom kind is the
 * third way: an object like any other (held, moved, resized, picked from the
 * picker, published in the layout) whose drawing is the site's own code.
 *
 * It is Bureau's rule that kinds are named presets anyone can invent (its
 * SYSTEM.md §5), taken one step further: a kind invented here may also bring
 * the code that draws it.
 *
 * A site declares them in the module it names as `custom` in its
 * astro.config.mjs (`digidesk({ custom: './src/custom/index.js' })`):
 *
 *   export const kinds = {
 *     starfield: {
 *       label: 'Starfield', says: 'Stars drifting past',
 *       size: [8, 6],                         // cells, as every kind's
 *       fields: [{ key: 'data.stars', label: 'How many stars', kind: 'number' }],
 *       data: { stars: 80 },                  // what a new one starts with
 *       render: (o, ctx) => `<canvas></canvas>`,   // HTML; node AND browser
 *       wake: (el, o) => { …; return () => stop() },  // browser only, optional
 *     },
 *   };
 *
 * Four rules, all of them load-bearing:
 *
 * 1. **A custom object's own data lives under `data`.** Every other top-level
 *    field means something to the tool (body, media, link…), and a site field
 *    that happened to share a name would be read as the tool's.
 * 2. **`render` runs in node at build time and in the browser while editing**,
 *    so it may not touch the DOM; it returns a string. Its output is NOT run
 *    through the guard rail the `html` kind is: it is code the site wrote, not
 *    data someone pasted.
 * 3. **`wake` is the only place a script runs.** HTML set as innerHTML never
 *    runs a <script>, so anything live (a canvas, a timer, a fetch) starts in
 *    wake. It is called once per drawn element, on a visitor's page and in the
 *    editor alike, and whatever function it returns is called when that
 *    element leaves the page, because the editor redraws a tile by replacing
 *    it, and an interval left running on a detached node runs forever.
 * 4. **This file is small and imports nothing**, because the visitor's page
 *    loads it (to wake things) and must not pay for the whole object model.
 *    elements.js listens here for kinds, rather than this file writing into
 *    elements.js.
 */

/** Every kind the site has registered, by name. */
export const CUSTOM = {};

const listeners = [];

/**
 * Hear about every kind registered, including the ones registered before you
 * asked. Module evaluation order decides which runs first, and it should not
 * have to matter.
 */
export function onCustom(fn) {
  listeners.push(fn);
  for (const [name, def] of Object.entries(CUSTOM)) fn(name, def);
}

/** A name a kind may have: the same rule as an element id, since it becomes a class. */
const NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Register the kinds a site's custom module exports. Called by the generated
 * `virtual:digidesk/custom` module (see index.js), so a site never calls it.
 * A second registration of the same name replaces the first, which is what a
 * hot reload is.
 */
export function registerCustom(mod = {}) {
  const kinds = mod.kinds ?? {};
  for (const [name, raw] of Object.entries(kinds)) {
    if (!NAME.test(name)) throw new Error(`Custom kind "${name}": a name is lower case letters, digits and dashes, starting with a letter`);
    if (typeof raw?.render !== 'function') throw new Error(`Custom kind "${name}" has no render(o, ctx) function`);
    const def = {
      label: raw.label ?? name,
      says: raw.says ?? 'Drawn by this site\'s own code',
      size: Array.isArray(raw.size) ? raw.size : [6, 4],
      face: raw.face ?? 'none',
      attrs: raw.attrs ?? [],
      fields: raw.fields ?? [],
      data: raw.data ?? {},
      picker: raw.picker !== false,
      render: raw.render,
      wake: typeof raw.wake === 'function' ? raw.wake : null,
      check: typeof raw.check === 'function' ? raw.check : null,
    };
    // Listeners first: one that refuses the kind (elements.js refuses a
    // built-in's name) must leave nothing half-registered behind.
    for (const fn of listeners) fn(name, def);
    CUSTOM[name] = def;
  }
}

/** Is this the name of a kind the site brought? */
export const isCustomKind = (kind) => Object.hasOwn(CUSTOM, kind);

/* ------------------------------------------------------------------ *
 * Waking, in the browser
 * ------------------------------------------------------------------ */

const stops = new WeakMap();

/** Wake every drawn custom object under `root` that has not been woken yet. */
export function wakeCustom(root = document) {
  for (const el of root.querySelectorAll('[data-custom]:not([data-woke])')) {
    const def = CUSTOM[el.dataset.custom];
    if (!def?.wake) continue;
    el.dataset.woke = '';
    let o = {};
    try { o = JSON.parse(el.dataset.o || '{}'); } catch { /* wake it with nothing */ }
    try {
      const stop = def.wake(el, o);
      if (typeof stop === 'function') stops.set(el, stop);
    } catch (err) {
      // One kind's bug must not take the page's other scripts down with it.
      console.error(`[digidesk] custom kind "${el.dataset.custom}" failed to wake`, err);
    }
  }
}

/** Stop everything a removed node had woken, itself included. */
function stopUnder(node) {
  if (node.nodeType !== 1) return;
  const all = node.matches('[data-custom]') ? [node] : [];
  all.push(...node.querySelectorAll('[data-custom]'));
  for (const el of all) {
    const stop = stops.get(el);
    if (!stop) continue;
    stops.delete(el);
    try { stop(); } catch (err) { console.error('[digidesk] a custom kind failed to stop', err); }
  }
}

/**
 * Keep waking: now, and whenever the editor draws one. One observer for the
 * page, the same way interact.js wakes a 3D model the editor puts down.
 */
export function watchCustom(root = document) {
  wakeCustom(root);
  const mo = new MutationObserver((records) => {
    let added = false;
    for (const r of records) {
      for (const n of r.removedNodes) stopUnder(n);
      if (r.addedNodes.length) added = true;
    }
    if (added) wakeCustom(root);
  });
  mo.observe(root.body ?? root, { childList: true, subtree: true });
  return mo;
}
