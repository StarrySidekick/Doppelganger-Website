/**
 * Layouts as data.
 *
 * They used to be object literals in .astro frontmatter, which meant nothing
 * could edit them — a literal inside a component compiled at build time is not
 * writable. They now live in src/data/layouts/*.json, one file per layout,
 * named by the file. That is the whole point: a layout is a file an editor can
 * eventually read, change and commit.
 *
 * Plain JSON rather than an Astro content collection, deliberately. A future
 * editor writing a file back through the GitHub API needs a predictable path
 * and no schema machinery in the way.
 *
 * Files are discovered, not listed, so adding a layout needs no code change.
 */
import { validateLayout, normalizeLayout } from './adaptive-grid.js';

const modules = import.meta.glob('../data/layouts/*.json', { eager: true });

/**
 * @type {Record<string, object>} every layout, keyed by filename without .json
 * Normalised on load, so a v1 file with a single col/row per element still
 * works — that box becomes the desk box and narrow stays derived from flow.
 */
export const layouts = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.match(/([^/]+)\.json$/)[1],
    normalizeLayout(mod.default ?? mod),
  ])
);

// Fail the build on a malformed layout rather than shipping a broken grid.
// A green build proving nothing about layout is exactly how two bugs shipped
// here before.
const problems = Object.entries(layouts).flatMap(([name, l]) => validateLayout(l, name));
if (problems.length) {
  throw new Error('Invalid layout data:\n  ' + problems.join('\n  '));
}

/** Get a layout by name. Throws rather than rendering an empty grid. */
export function getLayout(name) {
  const layout = layouts[name];
  if (!layout) {
    throw new Error(
      `No layout named "${name}". Available: ${Object.keys(layouts).join(', ') || '(none)'}`
    );
  }
  return layout;
}
