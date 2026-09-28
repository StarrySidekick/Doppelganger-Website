/**
 * The web app manifest: what makes the site installable as an app.
 *
 * Its shape is src/lib/pwa.js; this is where the site's own facts go in.
 * The base path comes from the build, so moving to the real domain (base '/')
 * needs nothing changed here.
 */
import { manifestFor } from '../lib/pwa.js';

export function GET() {
  const manifest = manifestFor({
    base: import.meta.env.BASE_URL,
    name: 'Starry Sidekick',
    short: 'Starry',
    description: 'Timothy Vlangas — film, games, writing, music, art and inventions.',
    background: '#000000',
    theme: '#000000',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Hold the app's icon on Android and these are offered. iPhone does not
    // show shortcuts; there, the corner dot on every page is the way in.
    shortcuts: [
      { name: 'Edit the site', description: 'Open the home page in edit mode', path: 'index.html?edit=1' },
      { name: '3D editor', description: 'Make a low-poly model', path: 'modeler' },
    ],
  });
  return new Response(JSON.stringify(manifest, null, 2) + '\n', {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8' },
  });
}
