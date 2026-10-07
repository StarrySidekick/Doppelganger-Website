/**
 * DigiDesk, as an Astro integration.
 *
 * An integration is a plugin Astro runs while it builds: it may add pages,
 * change the config and hand modules to the build. This is how the tool and
 * the site it builds are kept two things. The site says what it is, once, in
 * its astro.config.mjs:
 *
 *   import digidesk from 'digidesk';
 *   integrations: [digidesk({
 *     shell: './src/layouts/Base.astro',   // the page every board is put inside
 *     assets: './src/assets.js',           // `asset`, and optionally sized/srcset
 *     custom: './src/custom/index.js',     // the site's own kinds (custom.js)
 *     publish: { owner, repo },            // where the editor commits
 *     storage: 'doppelganger',             // prefix for this browser's saved work
 *     app: { name, short, … },             // the installable app (pwa.js)
 *   })]
 *
 * and the tool brings everything else: a page for every layout, the home page,
 * the standalone board editor and 3D editor, the app's manifest and worker, and
 * the build stamp.
 *
 * **The tool never imports the site; the site is handed to the tool.** That is
 * the website's hard rule 4, which used to be a convention about a folder and
 * is now how the code is wired. The site's files reach the tool's components
 * through three generated modules, and nowhere else:
 *
 *   virtual:digidesk/site    the layouts, the look, the works, the assets and
 *                            which pages the site wrote by hand (build only)
 *   virtual:digidesk/custom  the site's own kinds, registered (build AND browser)
 *   virtual:digidesk/shell   the site's page shell, an .astro component
 *
 * and the few plain facts (repository, storage prefix, where the site sits in
 * its repository) arrive through `define` as `__DIGIDESK__` (see config.js).
 *
 * The conventions a site follows, so there is nothing to configure for them:
 * layouts are `src/data/layouts/*.json`, the look is `src/data/look.json`, the
 * catalogue is `src/data/works.json`, pictures the editor commits go in
 * `public/media/`, and a page the site writes itself in `src/pages/` always
 * wins over the one DigiDesk would have made.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { buildInfo } from './version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const tool = (p) => join(HERE, p);

/**
 * The routes DigiDesk makes. `page` is the file in the site's src/pages that
 * would be the same address; when the site has written it, the site's wins.
 */
export const TOOL_ROUTES = [
  { pattern: '/', entry: 'routes/home.astro', page: 'index.astro' },
  { pattern: '/[...slug]', entry: 'routes/board.astro', page: '[...slug].astro' },
  { pattern: '/editor', entry: 'routes/editor.astro', page: 'editor.astro' },
  { pattern: '/modeler', entry: 'routes/modeler.astro', page: 'modeler.astro' },
  { pattern: '/manifest.webmanifest', entry: 'routes/manifest.js', page: 'manifest.webmanifest.js' },
  { pattern: '/sw.js', entry: 'routes/sw.js', page: 'sw.js.js' },
  { pattern: '/version.json', entry: 'routes/version.js', page: 'version.json.js' },
];

/** Where the site sits inside its git repository, as a path prefix. '' at the root. */
function repoPrefix(root) {
  try {
    const p = execSync('git rev-parse --show-prefix', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    return p ? p.replace(/\/?$/, '/') : '';
  } catch {
    return '';
  }
}

/** The site's own path, made absolute; null when it gave none or the file is not there. */
function sitePath(root, p, what) {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(root, p);
  if (!existsSync(abs)) throw new Error(`digidesk: the ${what} file ${p} does not exist (looked for ${abs})`);
  return abs;
}

/** JSON import of a site data file, or a stand-in when the site has none. */
const dataImport = (root, file, name, fallback) =>
  existsSync(join(root, file))
    ? `export { default as ${name} } from ${JSON.stringify(join(root, file))};`
    : `export const ${name} = ${JSON.stringify(fallback)};`;

export default function digidesk(options = {}) {
  return {
    name: 'digidesk',
    hooks: {
      'astro:config:setup'({ config, command, injectRoute, updateConfig, logger }) {
        const root = fileURLToPath(config.root);
        const shell = sitePath(root, options.shell, 'shell');
        if (!shell) throw new Error('digidesk: a site must name its page shell: digidesk({ shell: "./src/layouts/Base.astro" })');
        const assets = sitePath(root, options.assets, 'assets');
        const custom = sitePath(root, options.custom, 'custom');

        // Every page the site wrote by hand. Each one wins over the page the
        // tool would make at the same address, the way Astro already prefers
        // a static route over a dynamic one.
        for (const { pattern, entry, page } of TOOL_ROUTES) {
          if (existsSync(join(root, 'src/pages', page))) continue;
          injectRoute({ pattern, entrypoint: tool(entry) });
        }

        const BUILD = buildInfo({ cwd: root, tool: HERE });
        if (command === 'build') logger.info(`site ${BUILD.version} · DigiDesk ${BUILD.digidesk.version}`);

        const DIGIDESK = {
          storage: options.storage ?? 'digidesk',
          publish: options.publish ?? null,
          root: repoPrefix(root),
        };

        const VIRTUAL = {
          'virtual:digidesk/site': () => [
            // The site's kinds first: a layout naming one is validated the
            // moment layouts.js is evaluated, and that imports this module.
            `import 'virtual:digidesk/custom';`,
            assets ? `export * as assets from ${JSON.stringify(assets)};` : `export const assets = { asset: {} };`,
            `export const layoutModules = import.meta.glob('/src/data/layouts/*.json', { eager: true });`,
            dataImport(root, 'src/data/look.json', 'look', {}),
            dataImport(root, 'src/data/works.json', 'works', { types: [], works: [] }),
            `export const pageFiles = Object.keys(import.meta.glob('/src/pages/*.astro'));`,
            `export const app = ${JSON.stringify(options.app ?? {})};`,
          ].join('\n'),
          'virtual:digidesk/custom': () => [
            `import { registerCustom } from ${JSON.stringify(tool('src/custom.js'))};`,
            custom ? `import * as mod from ${JSON.stringify(custom)};` : 'const mod = {};',
            `registerCustom(mod);`,
            `export default mod;`,
          ].join('\n'),
        };

        updateConfig({
          vite: {
            plugins: [{
              name: 'digidesk:virtual',
              resolveId(id) {
                if (id === 'virtual:digidesk/shell') return shell;
                if (VIRTUAL[id]) return '\0' + id;
                return null;
              },
              load(id) {
                if (id.startsWith('\0virtual:digidesk/')) return VIRTUAL[id.slice(1)]?.();
                return null;
              },
            }],
            // Replaced at build time, so the number in the page cannot
            // disagree with the commit it was built from.
            define: {
              __BUILD__: JSON.stringify(BUILD),
              __DIGIDESK__: JSON.stringify(DIGIDESK),
            },
            // The CSS minifier drops a -webkit- prefix it thinks the target
            // does not need, and it dropped every -webkit-user-select in the
            // editor's touch rules, which Safari needed unprefixed only from
            // 17. On an older iPhone that left "holding a tile must not
            // select text" doing nothing. Naming Safari 14 keeps them.
            build: { cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'] },
          },
        });
      },
    },
  };
}
