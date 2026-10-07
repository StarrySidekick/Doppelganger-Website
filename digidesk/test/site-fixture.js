/**
 * What a site tells the tool, for the tests.
 *
 * Under Vite the site's options arrive as `__DIGIDESK__` (see config.js and
 * index.js). Plain node has no Vite, so a test that needs the tool to have
 * been told something imports this FIRST: ES modules evaluate their imports
 * in order, so the global is in place before config.js reads it.
 */
globalThis.__DIGIDESK__ = {
  storage: 'testsite',
  publish: { owner: 'Someone', repo: 'a-site' },
  root: '',
};
