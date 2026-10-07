/**
 * Names the tool gives pages and boards, shared by its routes and its editor.
 * Plain data, so node, the build and the browser can all read it.
 */

/** Layouts that are a site's chrome rather than a page: around every page, never one. */
export const CHROME_LAYOUTS = ['header', 'footer'];

/**
 * Pages the tool makes on every site (see TOOL_ROUTES in index.js): the home
 * page, from the `index` layout, and the two editors. Listed so the Pages
 * panel offers them and the board route does not make a second one.
 */
export const TOOL_PAGES = ['index', 'editor', 'modeler'];
