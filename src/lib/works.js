/**
 * The works: everything Timothy has made, and how a feed asks for some of it.
 *
 * This is the second half of the content model. `src/data/layouts/*.json` says
 * what is on a page and where; this says what EXISTS. A work is a thing that
 * was made — a film, a game, a poem, a song, a painting, a tool — and it lives
 * in one place whatever number of pages show it.
 *
 * Two axes, deliberately, because they answer different questions:
 *
 *   **type**  which section it belongs to. One per work, from a closed list,
 *             because a section page has to be able to say "these".
 *   **tags**  everything else true about it — what you did on it (sound design,
 *             score, director), what form it took (poem, essay, painting), what
 *             it was for. Any number, open-ended, because the interesting cuts
 *             are the ones you have not thought of yet.
 *
 * A single work therefore appears on its section page, in the everything list,
 * and under every tag it carries, without being written down more than once.
 * That is the whole point: **add it here and every feed that matches it shows
 * it**, rather than a list per page that quietly goes out of date.
 *
 * As with everything under src/lib, this file knows nothing about this
 * particular website (hard rule 4). It is handed the catalogue and answers
 * questions about it; `AdaptiveGrid.astro` is where the real one is loaded and
 * where an address becomes a URL.
 */

/** A tag is words, and it is compared without caring how it was typed. */
export const tagKey = (t) => String(t ?? '').trim().toLowerCase();

/* ------------------------------------------------------------------ *
 * Reading the catalogue
 * ------------------------------------------------------------------ */

/** The section list, in the order it should be offered. Always an array. */
export function typesOf(catalogue) {
  const types = catalogue?.types;
  if (!types || typeof types !== 'object') return [];
  return Object.entries(types).map(([id, t]) => ({
    id,
    label: t?.label ?? id,
    // Where the section lives. A section without a page is still a valid
    // grouping — the everything list can show it — so this is optional.
    path: t?.path ?? '',
    blurb: t?.blurb ?? '',
    // The tags this section usually uses. Suggestions offered in the editor,
    // never a restriction: a work may carry any tag at all.
    tags: Array.isArray(t?.tags) ? t.tags : [],
  }));
}

/** Every work, tolerant of a missing or malformed list. */
export const worksOf = (catalogue) => (Array.isArray(catalogue?.works) ? catalogue.works : []);

/** A work with every field present, so nothing downstream has to guard. */
export function normalizeWork(w) {
  return {
    id: String(w?.id ?? ''),
    title: String(w?.title ?? ''),
    type: String(w?.type ?? ''),
    tags: (Array.isArray(w?.tags) ? w.tags : []).map((t) => String(t).trim()).filter(Boolean),
    // A year, not a date. Nothing here is sorted finer than that, and a date
    // invites precision the catalogue does not actually have.
    year: Number.isFinite(w?.year) ? w.year : null,
    blurb: String(w?.blurb ?? ''),
    link: String(w?.link ?? ''),
    media: w?.media && typeof w.media === 'object' ? { ...w.media } : null,
  };
}

/* ------------------------------------------------------------------ *
 * Answering a feed
 * ------------------------------------------------------------------ */

const byQuery = (q) => (w) => {
  if (q.type && w.type !== q.type) return false;
  if (q.tag && !w.tags.some((t) => tagKey(t) === tagKey(q.tag))) return false;
  return true;
};

const ORDER = {
  /* A work with no year sorts LAST in both directions, and that is the honest
     answer rather than a convenient one. It is not the newest thing and it is
     not the oldest thing — it has no place on the timeline at all, so it goes
     under the works that do. Sorting it first under "oldest" would be the
     catalogue claiming something the data does not say. */
  newest: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || a.title.localeCompare(b.title),
  oldest: (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.title.localeCompare(b.title),
  title: (a, b) => a.title.localeCompare(b.title),
};

/**
 * The works a feed asks for, and the tags a visitor could narrow them by.
 *
 * The tags come from the RESULT, not from the whole catalogue: a chip that
 * matches nothing on the page in front of you is a dead end, and offering
 * "Painting" on the film page would be one.
 *
 * @param {object} catalogue
 * @param {{type?:string, tag?:string, limit?:number, sort?:string}} query
 * @returns {{items: object[], tags: string[], total: number}}
 */
export function queryWorks(catalogue, query = {}) {
  const all = worksOf(catalogue).map(normalizeWork);
  const matched = all.filter(byQuery(query));
  matched.sort(ORDER[query.sort] ?? ORDER.newest);

  // First spelling wins, so "Score" and "score" are one chip rather than two.
  const tags = new Map();
  for (const w of matched) for (const t of w.tags) if (!tags.has(tagKey(t))) tags.set(tagKey(t), t);

  const limit = Number.isFinite(query.limit) && query.limit > 0 ? query.limit : 0;
  return {
    items: limit ? matched.slice(0, limit) : matched,
    tags: [...tags.values()].sort((a, b) => a.localeCompare(b)),
    total: matched.length,
  };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Check the catalogue. Returns a list of problems, empty if it is fine.
 *
 * Run at build time like `validateLayout()`, for the same reason: this is data
 * an editor writes, so a malformed entry is a real thing that can happen
 * rather than a typo caught in review.
 */
export function validateWorks(catalogue, name = 'works.json') {
  const problems = [];
  const bad = (msg) => problems.push(`${name}: ${msg}`);
  if (!catalogue || typeof catalogue !== 'object') {
    bad('is not an object');
    return problems;
  }
  if (!catalogue.types || typeof catalogue.types !== 'object' || Array.isArray(catalogue.types)) {
    bad('types must be an object of section id -> section');
    return problems;
  }
  const types = typesOf(catalogue);
  for (const t of types) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.id)) bad(`type id ${JSON.stringify(t.id)} should be lowercase letters, digits and dashes`);
    if (!t.label) bad(`type ${t.id} needs a label`);
    if (t.path && !t.path.startsWith('/')) bad(`type ${t.id} path ${JSON.stringify(t.path)} should start with "/"`);
  }
  const known = new Set(types.map((t) => t.id));

  if (!Array.isArray(catalogue.works)) {
    bad('works must be an array');
    return problems;
  }
  const seen = new Set();
  for (const [i, raw] of catalogue.works.entries()) {
    const at = `works[${i}]`;
    if (!raw || typeof raw !== 'object') { bad(`${at} is not an object`); continue; }
    const w = normalizeWork(raw);
    if (!w.id) bad(`${at} needs an id`);
    // The id is how a work is addressed and how the editor tells two apart.
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(w.id)) bad(`${at}.id ${JSON.stringify(w.id)} should be lowercase letters, digits and dashes`);
    else if (seen.has(w.id)) bad(`${at}.id ${JSON.stringify(w.id)} is used twice`);
    else seen.add(w.id);

    if (!w.title) bad(`${at} needs a title`);
    // A work whose type is not a section would be invisible everywhere except
    // the everything list, which is a typo rather than an intention.
    if (!known.has(w.type)) bad(`${at}.type ${JSON.stringify(w.type)} is not one of ${[...known].join(', ')}`);
    if (raw.year != null && !Number.isInteger(raw.year)) bad(`${at}.year must be a whole year, got ${JSON.stringify(raw.year)}`);
    if (raw.tags != null && !Array.isArray(raw.tags)) bad(`${at}.tags must be an array of words`);
    if (w.media && typeof w.media.src !== 'string') bad(`${at}.media.src must be a string`);
  }
  return problems;
}
