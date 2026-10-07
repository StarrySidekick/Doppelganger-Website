/**
 * What the tool is told about the site it is building, and nothing else.
 *
 * DigiDesk may not know which site it is inside: that is the website's hard
 * rule 4, and it is what lets the tool leave this repository later without the
 * site coming with it. So every fact it needs about the site (which repository
 * Publish commits to, where in that repository the site lives, what its
 * browser storage is called) arrives here, from the options the site passes
 * to the integration in its astro.config.mjs (see digidesk/index.js).
 *
 * The values reach the browser and the build the same way, through Vite's
 * `define`, so there is one source and no module has to be handed them. Under
 * plain node (the tests) nothing is defined, and the defaults are what a site
 * that said nothing would get: no repository, storage called "digidesk", the
 * site at the root of its repository.
 */

/* global __DIGIDESK__ */
const told = typeof __DIGIDESK__ !== 'undefined' ? __DIGIDESK__ : {};

export const CONFIG = {
  // Prefix for every localStorage key the tool writes. A site that was using
  // the tool before it had a name keeps its old prefix, so a token and a
  // draft saved in a browser are still found after an upgrade.
  storage: 'digidesk',
  // { owner, repo, branch } — where Publish commits. Null means Publish says
  // so rather than guessing a repository.
  publish: null,
  // Where the site sits inside its repository, as a prefix for every path
  // Publish writes ('' at the root, 'site/' in this monorepo).
  root: '',
  ...told,
};

/** A localStorage key, under the site's own prefix. */
export const storeKey = (name) => `${CONFIG.storage}.${name}`;

/** A path in the site's repository, for Publish. `p` is relative to the site. */
export const repoPath = (p) => `${CONFIG.root}${p}`;
