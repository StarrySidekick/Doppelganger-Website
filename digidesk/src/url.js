/**
 * Joining a path onto the site's deploy base.
 *
 * This lived in the site's assets.js, and it is not a fact about the site: any
 * site DigiDesk builds may be served from a subpath, and every internal link
 * the tool writes has to go through it (the website's hard rule 2). The base
 * itself is the site's, read from Astro's config through `import.meta.env`.
 */

/**
 * Join a path onto the deploy base.
 *
 * Pure, and exported on its own, so the one rule below can be tested without a
 * bundler: `import.meta.env` does not exist outside Vite.
 *
 * **The site root has no trailing slash.** With `trailingSlash: 'never'` and
 * `build.format: 'file'` the home page is `/Doppelganger-Website` and
 * `/Doppelganger-Website/` is a 404, which is exactly what the header's home
 * icon and the footer's "Home" link were pointing at, because joining an empty
 * path left the base's own slash on the end.
 */
export const joinBase = (base, p) => {
  const joined = ((base ?? '/') + '/' + (p ?? '')).replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
};

/** Prefix an internal path with the deploy base. Required on project Pages. */
export const url = (p) => joinBase(import.meta.env.BASE_URL, p);
