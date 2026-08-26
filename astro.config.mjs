import { defineConfig } from 'astro/config';

// The deploy subpath, in one place. Both `site` and `base` come out when this
// moves to the real domain — that is the only change needed.
const base = '/Doppelganger-Website';

export default defineConfig({
  // Project Pages are served from a subpath.
  site: 'https://starrysidekick.github.io',
  base,

  // Match Squarespace's URL shape exactly so nothing needs redirecting later.
  trailingSlash: 'never',
  build: { format: 'file' },

  redirects: {
    // Squarespace's contact page is /contact-1 — the "-1" is an artifact of the
    // original slug being taken, and not worth inheriting. The new page is
    // /contact and this keeps the old URL working, so an inbound link from
    // anywhere still lands. Emitted as a static redirect page; no server needed.
    //
    // The destination needs `base` spelled out: Astro applies base to the route
    // it generates but NOT to the target, so a bare '/contact' would send
    // visitors to the domain root and 404 — the exact bug hard rule 2 is about.
    '/contact-1': `${base}/contact`,
  },
});
