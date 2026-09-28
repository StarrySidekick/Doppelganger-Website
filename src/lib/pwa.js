/**
 * Making a site an app: the manifest, and the service worker.
 *
 * Pure, and knows nothing about this website (hard rule 4) — the site hands
 * in its name, colours, icons and base path, and gets back a manifest object
 * and a service worker's source text. `src/pages/manifest.webmanifest.js` and
 * `src/pages/sw.js.js` are the two endpoints that do the handing.
 *
 * Two facts about a site on a subpath shape everything here:
 *
 * 1. **A service worker controls only addresses BELOW its own folder.** The
 *    worker at `/base/sw.js` covers `/base/…`, and `/base` itself — the home
 *    page, under `trailingSlash: 'never'` — is not below it. So the app starts
 *    at `/base/index.html`, which is the same page (build.format 'file' writes
 *    it) at an address the worker can see. On a root domain this collapses to
 *    `/` and the problem goes away.
 * 2. **The scope is written without its trailing slash** so that `/base` is
 *    inside the app too: tapping Home in the app must not throw you out into
 *    the browser. The worker still cannot cache `/base` itself, which is why
 *    the home page is precached by its `index.html` address instead.
 */

/** `/base/` with exactly one slash each side, or `/`. */
export const folderOf = (base) => ('/' + String(base ?? '/').replace(/^\/+|\/+$/g, '') + '/').replace(/^\/\/$/, '/');

/** Where the app opens. Inside the worker's folder, always. */
export const startOf = (base) => (folderOf(base) === '/' ? '/' : folderOf(base) + 'index.html');

/**
 * The web app manifest. `shortcuts` are `{name, path, description}` with paths
 * relative to the site ("index.html?edit=1"), and they show on Android when
 * the app's icon is held.
 */
export function manifestFor({ base = '/', name, short, description = '', background = '#000000', theme = '#000000', icons = [], shortcuts = [] }) {
  const folder = folderOf(base);
  const scope = folder === '/' ? '/' : folder.slice(0, -1);
  return {
    name,
    short_name: short ?? name,
    description,
    id: startOf(base),
    start_url: startOf(base),
    scope,
    display: 'standalone',
    orientation: 'any',
    background_color: background,
    theme_color: theme,
    icons: icons.map((i) => ({ ...i, src: folder + i.src.replace(/^\/+/, '') })),
    shortcuts: shortcuts.map((s) => ({
      name: s.name,
      ...(s.description ? { description: s.description } : {}),
      url: folder + s.path.replace(/^\/+/, ''),
      icons: icons.filter((i) => i.sizes === '192x192').map((i) => ({ ...i, src: folder + i.src.replace(/^\/+/, '') })),
    })),
  };
}

/**
 * The service worker, as source text. Its rules, in order:
 *
 * - **Only GETs, and never the hosts that must be live**: the GitHub API that
 *   Publish talks to, SoundCloud, the form service. Those pass straight by.
 * - **`version.json` is never cached.** It is how the editor asks what is live.
 * - **A page is network-first.** A publish rebuilds the site; an app that
 *   served yesterday's page from its cache would hide that. The cache is the
 *   offline fallback, and the home page is the fallback of last resort.
 * - **`/_astro/` is cache-first.** Those files carry a hash in their name, so a
 *   name never means two different files.
 * - **Pictures and fonts are stale-while-revalidate**: shown from the cache at
 *   once, refreshed behind. They are most of the weight and change least.
 *
 * The version names the cache, so a new build's worker clears the old pages.
 */
export function serviceWorkerSource({ base = '/', version = 'dev', precache = [], live = [], media = [] }) {
  const folder = folderOf(base);
  const cfg = {
    folder,
    start: startOf(base),
    pages: `pages-${version}`,
    precache: [...new Set([startOf(base), ...precache.map((p) => folder + p.replace(/^\/+/, ''))])],
    live,
    media,
  };
  return `/* Generated from src/lib/pwa.js at build ${version}. */
const C = ${JSON.stringify(cfg)};
const STATIC = 'static-v1', MEDIA = 'media-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(C.pages).then((c) => c.addAll(C.precache)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pages-') && k !== C.pages).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const hostIn = (url, list) => list.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

async function networkFirst(req) {
  const cache = await caches.open(C.pages);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match(C.start)) || Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (hostIn(url, C.live)) return;
  const here = url.origin === self.location.origin;
  if (here && !url.pathname.startsWith(C.folder)) return;
  if (here && url.pathname.endsWith('/version.json')) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  if (here && url.pathname.startsWith(C.folder + '_astro/')) return e.respondWith(cacheFirst(req));
  if (here) return e.respondWith(staleWhileRevalidate(req, STATIC));
  if (hostIn(url, C.media)) return e.respondWith(staleWhileRevalidate(req, MEDIA));
});
`;
}
