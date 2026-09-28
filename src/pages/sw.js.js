/**
 * The service worker, built into /sw.js under the site's base.
 *
 * Its rules are src/lib/pwa.js. The build's own version names its page cache,
 * so each deploy's worker replaces the last one's pages rather than piling up.
 */
import { serviceWorkerSource } from '../lib/pwa.js';

export function GET() {
  const source = serviceWorkerSource({
    base: import.meta.env.BASE_URL,
    version: `${__BUILD__.version}-${__BUILD__.sha}`,
    precache: ['favicon.png', 'icon-192.png', 'icon-512.png'],
    // Must always be the real thing: publishing, music, the contact form.
    live: ['api.github.com', 'soundcloud.com', 'sndcdn.com', 'api.web3forms.com'],
    // Pictures and fonts: kept, and refreshed behind.
    media: ['images.squarespace-cdn.com', 'static1.squarespace.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
  });
  return new Response(source, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
