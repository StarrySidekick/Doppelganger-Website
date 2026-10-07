/**
 * The web app manifest: what makes the site installable as an app.
 *
 * Its shape is src/pwa.js; the site's own facts (its name, colours, icons and
 * shortcuts) are the `app` option it passes to digidesk() in astro.config.mjs.
 * The base path comes from the build, so moving to a real domain (base '/')
 * needs nothing changed here.
 */
import { manifestFor } from '../src/pwa.js';
import { app } from 'virtual:digidesk/site';

export function GET() {
  const manifest = manifestFor({ base: import.meta.env.BASE_URL, ...app });
  return new Response(JSON.stringify(manifest, null, 2) + '\n', {
    headers: { 'content-type': 'application/manifest+json; charset=utf-8' },
  });
}
