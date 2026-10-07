/**
 * The service worker, built into /sw.js under the site's base.
 *
 * Its rules are src/pwa.js. The build's own version names its page cache, so
 * each deploy's worker replaces the last one's pages rather than piling up.
 */
import { serviceWorkerSource } from '../src/pwa.js';
import { app } from 'virtual:digidesk/site';

/* Hosts that must always be the real thing because a tool feature talks to
   them: Publish (GitHub), the player (SoundCloud), the form (Web3Forms). A
   site adds its own in `app.live`. */
const TOOL_LIVE = ['api.github.com', 'soundcloud.com', 'sndcdn.com', 'api.web3forms.com'];

export function GET() {
  const source = serviceWorkerSource({
    base: import.meta.env.BASE_URL,
    version: `${__BUILD__.version}-${__BUILD__.sha}`,
    precache: app.precache ?? [],
    live: [...new Set([...TOOL_LIVE, ...(app.live ?? [])])],
    // Pictures and fonts: kept, and refreshed behind.
    media: app.media ?? [],
  });
  return new Response(source, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' },
  });
}
