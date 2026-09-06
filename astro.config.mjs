import { defineConfig } from 'astro/config';
import { buildInfo } from './scripts/version.mjs';

/* Which build this is, derived from the commit count rather than written down
   — see scripts/version.mjs. Read once, here, and handed to the pages through
   `__BUILD__` so every place that shows it is showing the same one. */
const BUILD = buildInfo();

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

  // The CSS minifier drops a -webkit- prefix it thinks the target does not need,
  // and it dropped every -webkit-user-select in the editor's touch rules —
  // which Safari needed unprefixed only from 17. On an older iPhone that left
  // the whole "holding a tile must not select text" ruleset doing nothing.
  // Naming Safari 14 keeps the prefixes; nothing else about the output changes.
  vite: {
    build: { cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'] },
    // Replaced at build time, so the number in the page cannot disagree with
    // the commit it was built from.
    define: { __BUILD__: JSON.stringify(BUILD) },
  },

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
