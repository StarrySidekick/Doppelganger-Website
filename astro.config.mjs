import { defineConfig } from 'astro/config';

export default defineConfig({
  // Project Pages are served from a subpath. Both of these come out when this
  // moves to the real domain — that is the only change needed.
  site: 'https://starrysidekick.github.io',
  base: '/doppelganger',

  // Match Squarespace's URL shape exactly so nothing needs redirecting later.
  trailingSlash: 'never',
  build: { format: 'file' },
});
