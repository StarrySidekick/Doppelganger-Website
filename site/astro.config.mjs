import { defineConfig } from 'astro/config';
import digidesk from 'digidesk';

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

  /* The site is built WITH DigiDesk, and this is the whole of what the site
     tells the tool about itself. The tool brings the rest: a page for every
     layout in src/data/layouts, the home page, the board and 3D editors, the
     app's manifest and worker, and the build stamp (`__BUILD__`, the site's
     commit count with DigiDesk's own beside it). See digidesk/index.js. */
  integrations: [
    digidesk({
      // The page every board is put inside: the head, fonts, header, footer.
      shell: './src/layouts/Base.astro',
      // Every picture an `asset:` key names, and the CDN's resizing.
      assets: './src/assets.js',
      // StarrySidekick's own kinds of object: the room for anything the tool
      // does not do. See src/custom/README.md.
      custom: './src/custom/index.js',
      // Where Publish commits. The deploy workflow watches main.
      publish: { owner: 'StarrySidekick', repo: 'Doppelganger-Website', branch: 'main' },
      // This browser's saved work (the token, drafts, the lock) predates the
      // tool's name and is kept under it, so nothing saved is lost.
      storage: 'doppelganger',
      // The installable app.
      app: {
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
        // Hold the app's icon on Android and these are offered. iPhone does
        // not show shortcuts; there, the corner dot on every page is the way in.
        shortcuts: [
          { name: 'Edit the site', description: 'Open the home page in edit mode', path: 'index.html?edit=1' },
          { name: '3D editor', description: 'Make a low-poly model', path: 'modeler' },
        ],
        precache: ['favicon.png', 'icon-192.png', 'icon-512.png'],
        // Pictures and fonts: kept, and refreshed behind.
        media: ['images.squarespace-cdn.com', 'static1.squarespace.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
      },
    }),
  ],

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
