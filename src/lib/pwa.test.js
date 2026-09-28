/**
 * The app half of the site: its manifest and its service worker, on a
 * subpath (staging) and at a root domain (after the move).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderOf, startOf, manifestFor, serviceWorkerSource } from './pwa.js';

const inScope = (scope, path) => path.startsWith(scope);

test('the app opens inside the worker\'s folder, on a subpath and at a root', () => {
  assert.equal(folderOf('/Doppelganger-Website'), '/Doppelganger-Website/');
  assert.equal(folderOf('/Doppelganger-Website/'), '/Doppelganger-Website/');
  assert.equal(folderOf('/'), '/');
  // A worker at /base/sw.js controls /base/…, and the bare /base is not below
  // it — so the app starts at the home page's index.html address instead.
  assert.equal(startOf('/Doppelganger-Website'), '/Doppelganger-Website/index.html');
  assert.equal(startOf('/'), '/');
});

test('the manifest keeps home, the start and every shortcut in scope', () => {
  for (const base of ['/Doppelganger-Website', '/']) {
    const m = manifestFor({
      base, name: 'Site', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
      shortcuts: [{ name: 'Edit', path: 'index.html?edit=1' }, { name: '3D', path: '/modeler' }],
    });
    assert.equal(m.display, 'standalone');
    assert.ok(inScope(m.scope, m.start_url), `${base}: start is in scope`);
    // Tapping Home (the bare base, trailingSlash: never) must not leave the app.
    assert.ok(inScope(m.scope, base === '/' ? '/' : base), `${base}: home is in scope`);
    for (const s of m.shortcuts) assert.ok(inScope(m.scope, s.url), `${base}: ${s.url} is in scope`);
    assert.ok(m.icons.every((i) => i.src.startsWith(folderOf(base)) && !i.src.includes('//')));
  }
});

test('the worker leaves the live hosts and the version alone, and names its cache by build', () => {
  const src = serviceWorkerSource({ base: '/Doppelganger-Website', version: '0.55-abc', live: ['api.github.com'], media: ['static1.squarespace.com'] });
  assert.match(src, /"pages":"pages-0\.55-abc"/);
  assert.match(src, /version\.json'\)\) return;/, 'what is live is always asked of the network');
  assert.match(src, /if \(req\.method !== 'GET'\) return;/, 'a publish is never intercepted');
  assert.match(src, /"live":\["api\.github\.com"\]/);
  assert.match(src, /mode === 'navigate'\) return e\.respondWith\(networkFirst/, 'pages are network-first, so a publish shows');
  // It must parse as JavaScript.
  assert.doesNotThrow(() => new Function('self', 'caches', 'fetch', 'Response', src));
});
