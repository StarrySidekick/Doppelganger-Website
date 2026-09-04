/**
 * Tests about THIS website, rather than about the tool.
 *
 * Everything under src/lib is general and tested there; these assert facts that
 * are only true of the site built with it — the shipped layout files, the
 * deploy subpath, and two things CLAUDE.md says are asserted somewhere and,
 * until now, were not asserted anywhere.
 *
 * They live in scripts/ deliberately. src/lib may not know about src/data
 * (hard rule 4), and a test file sitting next to the engine that reads the
 * site's own data is the first step towards the engine doing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateLayout, normalizeLayout } from '../src/lib/adaptive-grid.js';
import { validateWorks, typesOf, worksOf, queryWorks } from '../src/lib/works.js';
import { joinBase } from '../src/lib/assets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const LAYOUT_DIR = 'src/data/layouts';
const names = readdirSync(join(root, LAYOUT_DIR))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const layouts = Object.fromEntries(
  names.map((n) => [n, normalizeLayout(JSON.parse(read(`${LAYOUT_DIR}/${n}.json`)))]),
);

/* ---------------- the deploy subpath ---------------- */

test('the site root carries no trailing slash', () => {
  // astro.config.mjs sets trailingSlash: 'never' and build.format: 'file', so
  // /Doppelganger-Website/ is a 404 and /Doppelganger-Website is the home page.
  // Joining an empty path used to leave the base's own slash on the end, which
  // is what the header's home icon and the footer's "Home" link both pointed
  // at. Hard rule 2, failing inside the helper written to enforce it.
  assert.equal(joinBase('/Doppelganger-Website', ''), '/Doppelganger-Website');
  assert.equal(joinBase('/Doppelganger-Website/', ''), '/Doppelganger-Website');
  assert.equal(joinBase('/Doppelganger-Website', 'links'), '/Doppelganger-Website/links');
  assert.equal(joinBase('/Doppelganger-Website/', '/links'), '/Doppelganger-Website/links');
  assert.equal(joinBase('/Doppelganger-Website', 'favicon.png'), '/Doppelganger-Website/favicon.png');
});

test('with no base, the root is still "/"', () => {
  // The one change the domain move requires is dropping `base`. The root has to
  // survive that as "/" rather than becoming the empty string.
  assert.equal(joinBase('/', ''), '/');
  assert.equal(joinBase('/', 'links'), '/links');
  assert.equal(joinBase(undefined, ''), '/');
});

test('the redirect target spells out the base', () => {
  // Astro applies `base` to the route it generates but NOT to the destination,
  // so a bare '/contact' sends visitors to the domain root.
  const config = read('astro.config.mjs');
  assert.match(config, /'\/contact-1':\s*`\$\{base\}\/contact`/);
});

/* ---------------- the shipped layouts ---------------- */

test('every shipped layout is valid', () => {
  const problems = Object.entries(layouts).flatMap(([n, l]) => validateLayout(l, n));
  assert.deepEqual(problems, []);
});

test('header, footer and every page share no element id', () => {
  /* Ids are GLOBAL across a document, not per grid — header, page and footer
     all render into one page, so a repeated id means one rule wins and the
     other tile silently loses its position. That is hard rule 0 seen from the
     document's side, and CLAUDE.md has claimed this test exists for a while. */
  const seen = new Map();
  for (const [name, l] of Object.entries(layouts)) {
    for (const e of l.elements) {
      const already = seen.get(e.id);
      assert.equal(
        already, undefined,
        `id "${e.id}" is in both ${already} and ${name}; they render into one document`,
      );
      seen.set(e.id, name);
    }
  }
});

test('the boards a page stacks share one geometry', () => {
  // Header, page and footer are three grids and only read as one board if
  // their columns line up — same column count, and the same gutter, which is
  // --site-gutter on :root.
  assert.equal(layouts.header.columns, layouts.footer.columns);
  assert.equal(layouts.header.narrowColumns, layouts.footer.narrowColumns);
  assert.match(read('src/layouts/Base.astro'), /--site-gutter:/);
});

test('a board is continuous unless it says otherwise', () => {
  // Bureau's board is a plain grid: cells touch. A gap is dressing one board
  // may ask for, in the Board panel, and is not what a layout starts with.
  for (const [n, l] of Object.entries(layouts)) {
    assert.equal(l.gap, 0, `${n} should start with no gap between its cells`);
  }
});

/* ---------------- the catalogue ---------------- */

const catalogue = JSON.parse(read('src/data/works.json'));

test('the catalogue is valid', () => {
  assert.deepEqual(validateWorks(catalogue), []);
});

test('every section with a page has one, and every page a section', () => {
  /* A section whose path 404s is worse than a section with no page at all —
     the footer links to it and a visitor lands on nothing. */
  for (const t of typesOf(catalogue)) {
    if (!t.path) continue;
    const slug = t.path.replace(/^\//, '');
    const built = slug === ''
      ? true
      : layouts[slug] !== undefined || readdirSync(join(root, 'src/pages')).includes(`${slug}.astro`);
    assert.ok(built, `type ${t.id} points at ${t.path}, which no page builds`);
  }
});

test('every link in the footer goes somewhere that exists', () => {
  // The footer is the site map now, so a dead entry there is the most visible
  // 404 the site can have.
  const nav = layouts.footer.elements.find((e) => e.id === 'site-nav');
  const hrefs = [...(nav.body ?? '').matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 1, 'the footer should carry the site map');
  const written = readdirSync(join(root, 'src/pages')).map((f) => f.replace(/\.astro$/, ''));
  for (const href of hrefs) {
    const slug = href.replace(/^\//, '');
    const ok = slug === '' || written.includes(slug) || layouts[slug] !== undefined;
    assert.ok(ok, `the footer links to ${href}, which no page builds`);
  }
});

test('a feed on a section page asks for that section', () => {
  /* The page and the catalogue have to agree about the section id, and nothing
     else checks that they do — a typo would render an empty page that looks
     exactly like a section with nothing in it yet. */
  const known = new Set(typesOf(catalogue).map((t) => t.id));
  for (const [name, l] of Object.entries(layouts)) {
    for (const e of l.elements) {
      if (!e.feed?.type) continue;
      assert.ok(known.has(e.feed.type), `${name}: ${e.id} feeds on "${e.feed.type}", which is not a section`);
    }
  }
});

test('every work the catalogue points at this site is a real page', () => {
  for (const w of worksOf(catalogue)) {
    if (!w.link?.startsWith('/')) continue;
    const slug = w.link.replace(/^\//, '');
    const written = readdirSync(join(root, 'src/pages')).map((f) => f.replace(/\.astro$/, ''));
    assert.ok(slug === '' || written.includes(slug) || layouts[slug] !== undefined,
      `work "${w.id}" links to ${w.link}, which no page builds`);
  }
});

test('the everything page really shows everything', () => {
  const feed = layouts.works.elements.find((e) => e.feed);
  assert.ok(feed, '/works needs a feed');
  assert.equal(feed.feed.type, undefined, 'the everything list is not narrowed to a section');
  assert.equal(queryWorks(catalogue, feed.feed).total, worksOf(catalogue).length);
});

/* ---------------- the editor's own rules ---------------- */

test('a one-finger drag belongs to the drag only while unlocked', () => {
  /* `touch-action: pinch-zoom` is what lets a tile be picked up with one
     finger on a phone, and it costs one-finger scrolling — so it must apply
     ONLY while arranging. Locked, the site scrolls exactly as a visitor
     expects. CLAUDE.md says a test asserts this; this is it. */
  const css = read('src/components/LayoutEditor.astro');
  assert.match(css, /\.ag-unlocked \.ag-grid \{ touch-action: pinch-zoom; \}/);
  assert.doesNotMatch(css, /^\s*\.ag-grid \{ touch-action: pinch-zoom/m);
});

test('every internal link in a page goes through url()', () => {
  // Hard rule 2. A bare href="/…" in markup breaks on the deploy subpath.
  const files = readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.astro'));
  for (const f of files) {
    const src = read(`src/pages/${f}`);
    // Site-relative hrefs written as a literal, ignoring schemes and anchors.
    const bare = [...src.matchAll(/href="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(bare, [], `${f} has a link that skips url(): ${bare.join(', ')}`);
  }
});
