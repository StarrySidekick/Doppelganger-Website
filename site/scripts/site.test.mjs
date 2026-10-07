/**
 * Tests about THIS website, rather than about the tool.
 *
 * Everything under digidesk/ is general and tested there; these assert facts
 * that are only true of the site built with it: the shipped layout files, the
 * deploy subpath, the catalogue, the links between pages.
 *
 * They live in the site deliberately. The tool may not know about the site's
 * data (hard rule 4), and a test sitting next to the engine that reads the
 * site's own files is the first step towards the engine doing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateLayout, normalizeLayout } from 'digidesk/src/adaptive-grid.js';
import { validateWorks, typesOf, worksOf, queryWorks } from 'digidesk/src/works.js';
import { joinBase } from '../src/assets.js';
import { TOOL_PAGES } from 'digidesk/src/routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const LAYOUT_DIR = 'src/data/layouts';

/* Every page that exists without a layout of its own: the ones the site wrote
   in src/pages, and the ones DigiDesk makes on every site (the home page and
   the two editors). A layout is the other way a page exists. */
const PAGE_FILES = readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.astro'));
const WRITTEN = [...PAGE_FILES.map((f) => f.replace(/\.astro$/, '')), ...TOOL_PAGES];
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
      : layouts[slug] !== undefined || WRITTEN.includes(slug);
    assert.ok(built, `type ${t.id} points at ${t.path}, which no page builds`);
  }
});

test('every link in the footer goes somewhere that exists', () => {
  // The footer is the site map now, so a dead entry there is the most visible
  // 404 the site can have.
  const nav = layouts.footer.elements.find((e) => e.id === 'site-nav');
  const hrefs = [...(nav.body ?? '').matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 1, 'the footer should carry the site map');
  const written = WRITTEN;
  for (const href of hrefs) {
    const slug = href.replace(/^\//, '');
    const ok = slug === '' || written.includes(slug) || layouts[slug] !== undefined;
    assert.ok(ok, `the footer links to ${href}, which no page builds`);
  }
});

/* ---------------- every internal link, not just the footer ----------------

   The footer check above was the site map's, and the site map is not the only
   place a dead link can be. A build of the site as it stands emits seven, and
   every one is a page that is genuinely coming — but nothing distinguished
   "known, planned" from "somebody typed it wrong", and nothing would have
   noticed an eighth.

   So the planned ones are declared, and BOTH directions are checked: a link to
   anything not built and not on this list fails, and an entry on this list that
   has since been built fails too. The second half is what stops the list
   quietly becoming a lie — when /uiux ships, this test tells you to delete the
   line rather than leaving a permanent excuse behind. */

const PLANNED = new Set([
  /* Back, because something links to them again. The home page's UI & UX
     button and the bookcase on /writing were rebuilt as objects from the live
     Squarespace site (September 2026), and both point where Squarespace's did.
     The pages themselves are still parked (INTENT.md): /uiux is 40 images to
     place and the six collections are Markdown on Timothy's machine. */
  'uiux',
  'game-design', 'essays-about-everything', 'expressiveaether', 'short-stories', 'journal', 'poems',
]);

const routeExists = (slug) =>
  slug === ''
  || layouts[slug] !== undefined
  || WRITTEN.includes(slug);

/** Every site-relative href this repo ships, wherever it is written: a layout
    element's body, its `link` field, a holder's items, or a hand-written page. */
const internalLinks = () => {
  const found = [];
  const add = (href, where) => {
    if (typeof href !== 'string' || !href.startsWith('/')) return;
    found.push({ slug: href.split('#')[0].split('?')[0].replace(/^\/|\/$/g, ''), where });
  };
  for (const [name, layout] of Object.entries(layouts)) {
    for (const el of layout.elements ?? []) {
      add(el.link, `${name}:${el.id}`);
      for (const m of String(el.body ?? '').matchAll(/href="([^"]+)"/g)) add(m[1], `${name}:${el.id}`);
      for (const item of el.items ?? []) add(item.link, `${name}:${el.id}`);
    }
  }
  for (const f of PAGE_FILES) {
    const src = read(`src/pages/${f}`);
    /* Three spellings a page can use. A literal href; the url() helper that
       hard rule 2 requires for anything site-relative; and a `slug:` field in
       a data array, which is how /writing lists its six collections — those go
       through url() too, but as `url(c.slug)`, so a scanner looking only for
       url('literal') cannot see them and would miss a typo in the one place
       six links are written at once. */
    for (const m of src.matchAll(/href="(\/[^"{]*)"/g)) add(m[1], `pages/${f}`);
    for (const m of src.matchAll(/url\(\s*['"]([^'"]*)['"]/g)) add('/' + m[1], `pages/${f}`);
    for (const m of src.matchAll(/\bslug:\s*['"]([^'"/]+)['"]/g)) add('/' + m[1], `pages/${f}`);
  }
  return found;
};

test('every internal link goes somewhere that builds, or is a declared plan', () => {
  const bad = internalLinks()
    .filter(({ slug }) => !routeExists(slug) && !PLANNED.has(slug))
    .map(({ slug, where }) => `/${slug} (from ${where})`);
  assert.deepEqual(bad, [], `these links go nowhere and are not on the planned list:\n  ${bad.join('\n  ')}`);
});

test('nothing on the planned list has quietly been built', () => {
  const done = [...PLANNED].filter((slug) => routeExists(slug));
  assert.deepEqual(done, [],
    `these are built now — take them off PLANNED so a real break is not excused: ${done.join(', ')}`);
});

test('every planned page is still actually linked to', () => {
  /* A plan nobody links to is a plan nobody is waiting for. If a link is
     removed, the entry should go with it rather than sitting here forever. */
  const linked = new Set(internalLinks().map((l) => l.slug));
  const orphans = [...PLANNED].filter((slug) => !linked.has(slug));
  assert.deepEqual(orphans, [],
    `PLANNED lists pages nothing links to any more: ${orphans.join(', ')}`);
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
    const written = WRITTEN;
    assert.ok(slug === '' || written.includes(slug) || layouts[slug] !== undefined,
      `work "${w.id}" links to ${w.link}, which no page builds`);
  }
});

test('the everything page, if it carries a feed, really shows everything', () => {
  /* Every page board is empty at the moment, so there may be no feed to check.
     The invariant is about what /works MEANS rather than about it being built:
     the everything list is the one feed that is not narrowed to a section, and
     the check has to be waiting when the page is rebuilt. */
  const feed = layouts.works.elements.find((e) => e.feed);
  if (!feed) return;
  assert.equal(feed.feed.type, undefined, 'the everything list is not narrowed to a section');
  assert.equal(queryWorks(catalogue, feed.feed).total, worksOf(catalogue).length);
});

test('every internal link in a page goes through url()', () => {
  // Hard rule 2. A bare href="/…" in markup breaks on the deploy subpath.
  const files = PAGE_FILES;
  for (const f of files) {
    const src = read(`src/pages/${f}`);
    // Site-relative hrefs written as a literal, ignoring schemes and anchors.
    const bare = [...src.matchAll(/href="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(bare, [], `${f} has a link that skips url(): ${bare.join(', ')}`);
  }
});

test('CI checks out the full history, or every deploy publishes the same wrong number', () => {
  /* actions/checkout defaults to a SHALLOW clone, where `git rev-list --count
     HEAD` answers 1. The version would then be 0.01 on the live site and right
     on every local build — which is the exact failure the version exists to
     catch, so it must not be the version's own bug. */
  const wf = read('../.github/workflows/deploy.yml');
  assert.match(wf, /uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth: 0/,
    'the deploy workflow must check out full history');
});

test('the build stamp reaches a visitor three ways', () => {
  // The head of every page, a file you can curl, and the editor's bar. All
  // three read the one stamp, so they cannot disagree. The last two are the
  // tool's and are asserted in digidesk/test/rules.test.mjs; the head is the
  // site's own shell, so it is asserted here.
  assert.match(read('src/layouts/Base.astro'), /<meta name="build"/);
});

/* ---------------- the shipped layouts (moved from the engine's tests) ---------------- */

const shipped = (name) => normalizeLayout(JSON.parse(
  read(`${LAYOUT_DIR}/${name}.json`)
));

test('no page board carries the corner navigation', () => {
  /* The home icon and the sun live in the header layout. If either comes back
     onto a page board the site has two of it, and because an id is a global
     name it is the header's tile that silently loses its position. */
  for (const name of ['index', 'links', 'works', 'film', 'games', 'writing', 'music', 'art', 'inventions', 'contact']) {
    const ids = shipped(name).elements.map((e) => e.id);
    assert.equal(ids.some((id) => id.startsWith('nav-') || id.startsWith('site-')), false, name);
  }
});

test('the chrome layouts hold the site navigation', () => {
  const header = shipped('header');
  const footer = shipped('footer');
  // The home icon and the sun, as on Squarespace. The wordmark is the home
  // page's own, and the home page goes without the header altogether.
  assert.deepEqual(header.elements.map((e) => e.id), ['site-home', 'site-sun']);
  // Header and footer ids must not collide with each other or with a page's:
  // they end up in one document, where an id is a global name.
  const all = [...header.elements, ...footer.elements, ...shipped('links').elements].map((e) => e.id);
  assert.equal(new Set(all).size, all.length, 'ids are unique across the whole page');

  // Hard rule 2: these are site-relative and only work because the text
  // renderer sends them through url(). Stored bare on purpose.
  assert.match(footer.elements.find((e) => e.id === 'site-nav').body, /href="\/writing"/);
});
