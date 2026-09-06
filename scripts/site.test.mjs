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
  'uiux',                    // 40 images, the largest remaining page
  'journal',                 // the six writing collections, exported to Markdown
  'poems',                   // but not yet in this repo
  'essays-about-everything',
  'short-stories',
  'game-design',
  'expressiveaether',
]);

const routeExists = (slug) =>
  slug === ''
  || layouts[slug] !== undefined
  || readdirSync(join(root, 'src/pages')).includes(`${slug}.astro`);

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
  for (const f of readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.astro'))) {
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

test('the board never declares touch-action, it decides per gesture', () => {
  /* This test used to assert the opposite: that `.ag-unlocked .ag-grid` carried
     `touch-action: pinch-zoom`. That rule was the wrong instrument and it is
     gone. It gave the one finger to the drag, which cost one-finger scrolling
     outright, and on iOS `pinch-zoom` buys two-finger ZOOM rather than
     two-finger PAN on an unzoomed page — so the scrolling it was supposed to
     leave you barely worked either.

     Bureau never sets touch-action on its board (its wire.js). It lets the page
     scroll as a page scrolls and takes the finger only once the hold has landed,
     with a non-passive `touchmove` that preventDefaults while a drag is armed.
     The hold is what makes that legal: the finger has been still, so no native
     scroll has started, and preventDefault can still stop one. */
  const css = read('src/components/LayoutEditor.astro');
  assert.doesNotMatch(css, /\.ag-grid\s*\{[^}]*touch-action/,
    'the board must not declare touch-action — the gesture decides');

  const js = read('src/lib/editor.js');
  assert.match(js, /addEventListener\('touchmove'[\s\S]{0,120}dragArmed\(\)[\s\S]{0,60}preventDefault/,
    'a non-passive touchmove must preventDefault while, and only while, a drag is armed');
  assert.match(js, /\{ passive: false \}/, 'that listener has to be non-passive or it is ignored');
  assert.match(js, /touches\.length > 1[\s\S]{0,40}onCancel\(\)/,
    'two fingers is never a drag — hand the gesture back so the page scrolls');
});

test('a gesture has one owner, and letting go of it takes every mark off', () => {
  /* The stranded-highlight family. Six visual states are poked onto the DOM by
     hand because the editor cannot re-render, and `pointercancel` used to clean
     up two of them — it cleared the tile drag and never touched the sketch, so
     the sketch's ghost stayed on the board and the next press orphaned it.
     A pointercancel fires exactly when a second finger lands. */
  const js = read('src/lib/editor.js');

  assert.match(js, /function clearGestureState\(\)/, 'one teardown, not one per gesture');
  for (const mark of ['ag-lifted', 'ag-dragging', 'ag-invalid', 'ag-drop', 'ag-ghost']) {
    const at = js.indexOf('function clearGestureState()');
    const body = js.slice(at, at + 1800);
    assert.ok(body.includes(mark), `clearGestureState must account for .${mark}`);
  }
  // Both gestures, both timers.
  const body = js.slice(js.indexOf('function clearGestureState()'), js.indexOf('function clearGestureState()') + 1800);
  for (const held of ['holdTimer', 'menuTimer', 'sketch', 'G']) {
    assert.ok(body.includes(held), `clearGestureState must put ${held} down`);
  }

  assert.match(js, /if \(!e\.isPrimary\) return clearGestureState\(\);[\s\S]*if \(!e\.isPrimary\) return clearGestureState\(\);/,
    'both pointerdown handlers must refuse a second finger');
  assert.match(js, /e\.pointerId !== G\.pointerId/, 'only the finger that started a gesture may drive it');
  assert.match(js, /e\.pointerId !== sketch\.pointerId/, 'and the same for the sketch');
});

test('the sketch never asks the DOM where the finger is', () => {
  /* `elementFromPoint(...).closest('.ag-cell')` returned null over any existing
     tile — tiles are z-index 1, cells are 0 — so the ghost froze at the last
     bare square and a box could not be drawn across anything. */
  const js = read('src/lib/editor.js');
  // A call, not the word — the comment explaining why it went is allowed to say it.
  assert.doesNotMatch(js, /elementFromPoint\s*\(/,
    'the checkerboard is a look, not the thing that decides where you pressed');
  assert.match(js, /export function cellAt/, 'the geometry is pure, and tested in editor.test.js');
});

test('iOS long-press must not open the object menu twice', () => {
  // iOS raises contextmenu from the same press that arms the drag, at ~500ms.
  const js = read('src/lib/editor.js');
  const at = js.indexOf('function onContext');
  assert.ok(at > 0);
  assert.match(js.slice(at, at + 500), /if \(dragArmed\(\)\) \{ e\.preventDefault\(\); return; \}/);
});

test('there is one selection for the page, not one per board', () => {
  /* A page mounts three editors. `selected` used to be a variable inside each,
     so pressing a tile in the page and then one in the footer left both wearing
     the accent ring. The chrome holds it now and paints both boards. */
  const js = read('src/lib/editor.js');
  assert.match(js, /select, selectedOn, dropSelection,/, 'the chrome owns the selection');
  assert.match(js, /function paintSelection\(\)/);
  // …and paint() re-asserts it, which is what an undo that re-mounts a tile needs.
  const at = js.indexOf('  function paint() {');
  assert.match(js.slice(at, at + 1500), /paintSelection\(\);/);
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
