# doppelganger

Self-hosted rebuild of **timothyvlangas.com** (brand: StarrySidekick.com), replacing
a Squarespace 7.1 site. Runs in parallel with Squarespace until it reaches parity.

**It is also the guinea pig for a tool.** Everything under `src/lib/` — the grid
engine, the object model, the faces, the editor, the look — is a web-design
version of Bureau, working name **DigiDesk**, and this website is the first
thing built with it. Two things live in this repo: the tool, and the site made
with the tool. Hard rule 4 is the seam between them, and it is what lets the
tool be lifted out under its own name later without the site coming with it.

Timothy is a designer — fluent in CSS, new to terminals and git. Explain what a
command does before running it. Don't assume git vocabulary.

## Commands

```bash
npm install
npm run dev      # localhost:4321, hot reload
npm run build    # → dist/
npm run preview  # serve the built output
npm test         # layout engine, element registry, publish, widget build
                 # (node --test, no deps)
npm run widgets  # build Squarespace code blocks → widgets/dist/
```

Deploy is automatic: push to `main` → GitHub Actions builds → GitHub Pages.
Live at https://starrysidekick.github.io/Doppelganger-Website/

## Hard rules

**0. Element ids in a grid are global, exactly like keyframe names.** `compileCSS()`
now *requires* a scope and throws without one. Two unscoped grids on one page
used to overwrite each other's column count and every shared id — the second
won, the first silently lost its layout, and the build stayed green.
`AdaptiveGrid.astro` derives the scope from the layout via `scopeFor()`, so
every caller gets one. Anything new that compiles a layout must pass one too.

**1. Never use a generic `@keyframes` name.** This is not style preference. On
Squarespace, a keyframe named `spin` collided with the platform's own `spin` and
silently rotated the business card on the wrong axis for months. Keyframe names
are not scoped by specificity — the last definition of a name wins outright.
Always prefix: `cardSpinY`, not `spin`. Avoid: spin, fade, pulse, slide, bounce,
shake, float, rotate, grow, blink, scroll, wobble, flip, zoom, wiggle, shimmer,
glow, drift, sparkle.

**2. All internal links must use `url()` from `src/lib/assets.js`.** The site
deploys to a subpath (`/doppelganger`), so a bare `href="/links"` silently breaks
navigation. This has already caused one bug.

**3. Never change a URL path.** Slugs match Squarespace exactly so that when the
real domain moves across, nothing needs redirecting. `trailingSlash: 'never'` and
`build.format: 'file'` exist for this reason. Do not "tidy" a route.

**4. `src/lib/` may not import `assets.js` or anything under `src/data/`.** The
engine, the element registry and the editor are a general thing; the site's own
facts reach them through arguments — `AdaptiveGrid.astro` passes a `ctx` with an
asset resolver, `LayoutEditor.astro` hands the editor an asset map as data. This
costs nothing today and is what keeps the option of lifting the whole thing out
later. Every import that crosses it has to be replaced with an argument instead.

**5. Verify visually, not just by build success.** A green build proves nothing
about layout. Screenshot at desktop and mobile widths before claiming done. Two
real bugs shipped past a passing build: the flip card overflowing its grid cell,
and the sun rendering at 100vw. A third nearly shipped with the v3 content
model: `#email` was `display:flex`, so "Email: " and its `<a>` became separate
flex items and the space between them collapsed — `Email:TimothyVlangas@…`.
Tests, the build and the box geometry all passed. Only the screenshot showed it.

## Architecture

```
src/lib/adaptive-grid.js   the layout engine — resolve/boxOk/validate/compileCSS
src/lib/elements.js        objects, attributes, kinds, faces — Bureau's model, cut to a website
src/lib/look.js            the site's colours and the tokens derived from them
src/lib/interact.js        what a published page does on its own — folds, accordions
src/lib/media.js           picking an image in the browser — resize, alpha, SVG, ceilings
src/styles/faces.css       how each face draws — all of it CSS behind one class
src/data/look.json         the look itself: five colours, the type, pinned or flat
src/pages/[...slug].astro  any layout with no hand-written page is a page anyway
src/lib/layouts.js         loads src/data/layouts/*.json, validates at build time
src/lib/editor.js          the in-page editor, loaded only for ?edit=1
src/lib/publish.js         commits a layout to GitHub from the browser
src/data/layouts/*.json    the layouts themselves — data, so they can be edited
src/lib/assets.js          every remote asset + the url() helper
src/components/AdaptiveGrid.astro
src/components/LayoutEditor.astro
src/components/FlipCard.astro
src/components/SiteChrome.astro    header + footer, both real layouts
src/layouts/Base.astro     SEO, fonts, global tokens
src/pages/                 one file per route
src/pages/editor.astro     standalone layout editor (replaces the prototype)
widgets/<name>/            Squarespace code-block sources — see widgets/README.md
scripts/build-widgets.mjs  builds each widget into one paste-ready blob
```

### The Adaptive Grid

A replacement for Squarespace's Fluid Engine, and the reason this project exists.

**Two stored layouts per element, and `flow` seeds the second one.** An element
holds `desk: {col,row}` and optionally `narrow: {col,row}`. This reverses the
original decision — it used to store one layout and always compute the narrow
one — because computing it gives no way to hand-tune a phone, which was the
point of building an editor at all. Same call bureau makes (its decision 9).

`flow` is now the **seed**, not a runtime rule. An element with no `narrow` box
gets one derived from its flow; the first time the editor moves it at narrow
width, that box is written down and flow stops applying to it.

| flow | where it seeds the element when narrow |
|---|---|
| `pin` | holds its edge, never joins the stack — corner nav |
| `keep` | centres and scales |
| `full` | spans the full width |
| `stack` | drops into a single inset column |

So a page is authored once and refined per device only where it needs it, and a
newly added element still lands somewhere sensible instead of on top of its
neighbours. `narrowColumns` may be coarser than `columns` (it defaults to the
same) — dragging with a thumb across 24 columns is miserable.

- `resolveDevice(layout, device)` places every element for one device.
- `resolve(layout, width)` is the same thing keyed by pixels.
- `deriveNarrow()` is the seed, used only where no stored box exists.
- `boxOk()` **refuses** a move that would overlap or leave the columns, rather
  than shoving a neighbour aside — position is meant to carry meaning.
- `compileCSS()` emits real CSS Grid using **container queries and `cqi` units**,
  not media queries, so a layout works inside any container. That is also what
  lets the editor show a true narrow preview in a pane rather than an iframe.

**The board is RIGID and the cell is SQUARE.** A cell is one column wide and
exactly as tall, derived from the container's own width in `cqi`:

```css
--ag-cell: calc((100cqi - (cols - 1) * gap) / cols);
grid-auto-rows: var(--ag-cell);
```

Rows used to be `minmax(clamp(...), auto)` and grew with their content. That is
gone, deliberately and at Timothy's call: it made every row a different height,
made a tile's size a consequence of its words rather than of what you drew, and
meant the drag maths had to walk measured track edges. Now the board scales with
the window and **nothing on it ever moves or resizes itself.** An object taller
than its box clips. That is the bargain a rigid board makes, and it is the same
one Bureau makes.

Consequences worth knowing:

- **A row span means the same as a column span.** Re-tuning a layout from the
  old model is not a rescale — a box that was 8 rows tall was ~280px and is now
  8 cells, which is much taller. All three shipped layouts were re-cut by hand.
- `rowHeight` is gone from the schema. The cell is derived, so there is nothing
  to state.
- **`rows` fixes a board's height in cells** and `sticky` makes it follow you
  down the page. Both are how the header and footer are sized and pinned, and
  both are fields on the layout rather than CSS to go and find.
- **Nothing reflows on resize.** The whole board scales. When something genuinely
  cannot fit — a coarser grid than an object is wide — `packLayout()` repacks
  top to bottom in reading order and lets the board grow downward. It is never
  automatic: it runs when you change the grid size, or press **Tidy**.

**The out-of-repo prototype is retired.** `/editor` does its job now — a board
of labelled placeholders for arranging a layout with no finished page around it,
which is how `/uiux` gets built before `/uiux` exists. It runs the same engine
and the same editor as the live pages, so it cannot drift from them, which is
the whole reason the prototype had to come in. Delete the old copy rather than
keeping it in sync; it predates `minmax`, the scope argument and the two-layout
model.

### Everything on the grid is an object

**This is Bureau's model, and it is deliberate.** An element used to carry a
`type` and a `content` bag; now it is an **object** carrying **attributes**, and
what it can do is decided by which attributes it has — additive, independent,
never inferred from a name. A **kind** is a named preset of attributes, and a
**face** is how it draws. `src/lib/elements.js` is the registry; Bureau's
`docs/SYSTEM.md` §1, §5 and §6 are the reasoning.

```json
{ "id": "email", "kind": "note", "flow": "stack",
  "desk": { "col": [2, 8], "row": [9, 2] },
  "body": "<a href=\"mailto:…\">Email: …</a>" }
```

| attribute | gives the object | field |
|---|---|---|
| `text` | a body of words, editable in place by double-clicking | `body` |
| `media` | a picture | `media: {src, alt, …}` |
| `link` | goes somewhere — a site path or a web address | `link` |
| `container` | **opens onto a page of its own — this is what makes a drawer** | `link` is the page |
| `fold` | a folded size and an open size, toggled live — this is the dropdown | `fold: {cols, rows}` |
| `holds` | holds other objects and lays them out by a rule | `items`, `arrange` |

| kind | attributes | face | made from the picker |
|---|---|---|---|
| `note` | text | torn note | yes |
| `image` | media, link | picture | yes |
| `button` | text, link | plaque | yes |
| `drawer` | container, media, text | drawer front | yes — **it makes a page** |
| `fold` | text, fold | card | yes — **replaces a dropdown** |
| `list` | holds, text | card | yes — **the accordion / gallery** |
| `html` | text (raw markup) | plain | no, a tool |
| `slot` | — | — | no, written by code |

**What a click does is a field**, `onclick`, asked of every object — Bureau's
`clickOf()`. `page` sends you to a page on this site (through `url()`, hard rule
2), `url` opens a web address in its own tab, `fold` opens and shuts, `none`
does nothing. Left unset it asks the object what it *is*: something with a
`/path` goes there, something that folds folds.

**A fold's box on the grid is its FOLDED size.** Opening draws the panel as an
overlay sized in cells, hanging off the tab. Growing the tile would push its
neighbours, and on a rigid board nothing moves unless you move it.

**A holder is the one fluid thing, fenced into one tile.** `arrange` is `stack`,
`row`, `grid` or `accordion`, and its `items` are ordinary objects rendered by
the same code. The board is rigid; a holder is a box whose *contents* flow,
which is what an accordion, a row of links and a wrapping gallery all are.
`src/lib/interact.js` is the only script a published page carries — one
delegated listener for folds and accordions, so a visitor gets them too.

Ask `has(o, 'media')`, never `o.kind === 'image'`. That rule is the whole reason
an invented combination works everywhere immediately — a note told to carry a
link is a note you can click, and nothing was designed for it.

**A drawer is a page.** This is the one place the port departs from Bureau, and
it is the whole port in a line. Bureau's drawer opens onto a nested grid inside
the app; here `container` + `link: "/game-design"` means the object's contents
are the page at that path, and its face on this board is the way in. The site
map is the container tree. `[...slug].astro` turns any layout file that has no
hand-written page into one, so **New drawer in the editor writes a layout file
and a tile that opens it**, and the next build makes the page. Nothing was
built for nested grids, because Astro pages already are them.

**Faces are CSS.** `fc-<name>` on the tile, and every difference between
`note`, `picture`, `plaque`, `front`, `spine`, `card` and `none` is in
`src/styles/faces.css`. A face never states a colour of its own — it takes
`--paper`, `--ink`, `--accent` and their steps from the look — so a look change
re-dresses every face. A new face is a CSS block and a label in `FACES`.

**`slot` is the default for an element with no kind, and that is deliberate:**
every layout written before this keeps rendering from its page untouched, so
pages convert one object at a time. It is the right answer, not a stopgap, for
anything a component renders — the flip card has its own shader. A slot carrying
fields fails the build: that combination can only mean a dropped kind.

**The v3 shape still reads.** `upgradeElement()` turns `type` + `content` into
the object shape on the way in, idempotently, and `normalizeElement()` calls it.
A file in either shape is the same layout.

**Content is checked at build time.** `validateLayout()` runs each object's
fields through its attributes, so a malformed body, a `<script>`, an inline
handler or a `javascript:` URL fails the build. A guard rail against a bad
paste, not a security boundary — only someone who can commit can write it.

**Typed objects render inside `AdaptiveGrid.astro`, so a page's scoped `<style>`
cannot reach them.** Pass a class (`<AdaptiveGrid class="links-grid">`) and hang
the rules off that in an `is:global` block. **`scopeFor()` hashes geometry
only**, so fixing a typo does not rename every rule in the compiled CSS.

### The look

`src/data/look.json` is the site's dressing: page, ink and accent colours, the
two checkerboard squares, the type face, and whether tiles are pinned (each
leans a degree or two, off a hash of its id — Bureau's decision 75). `look.js`
derives a full token set from those few values the way Bureau's `look.js` does
(its decision 33), so the second and third tints of a colour agree with the
first by construction. `Base.astro` emits them on `:root`; the editor's gear
writes the same tokens live and publishes the file with everything else.

### Header and footer are layouts too

`header.json` and `footer.json` are ordinary layouts, rendered by the same
engine and edited by the same editor. `Base.astro` puts them around every page,
so a page no longer opts in. **This is the lesson from Bureau — everything sits
on the grid, and chrome is not a special case with its own rules.** The payoff
is that the header can be rearranged and the footer reworded without touching
code, and neither needed a line of new engine code to get there.

Consequences worth knowing:

- **Ids are global across the whole document**, not per grid. Header, page and
  footer all render into one page, so `site-*` prefixes keep them apart. A test
  asserts the three layouts have no id in common.
- `/links` no longer carries `nav-home`/`nav-sun`; the header owns them.
- **A site-relative link inside `text` content is rewritten at render** through
  `ctx.link`, so hard rule 2 still holds for a footer nav that is a run of HTML
  rather than a field. A bare `href="/writing"` stored in content is correct and
  becomes `/Doppelganger-Website/writing` on the way out.

### One editor bar, however many grids

Three grids on a page would have meant three floating bars, and an ambiguous
"Publish". So the chrome is a singleton (`sharedChrome()`) that every editor
registers with; the grid you last touched is the one the bar acts on, and the
tabs list grids in **document order**, not the order they mounted in — a page's
own grid registers before the header, so mount order reads wrong.

### Adding an image from the editor

Right-click an image element and choose one, or drop a file straight onto the
tile. The pipeline is Bureau's, ported from `web/js/persist.js` (its decisions
71 and 86), because it had already got the non-obvious parts right:

- **Downscale on import** — 1600px on the long edge.
- **Keep alpha only when there is alpha**, sampled ~20k pixels. Saving a cut-out
  PNG as JPEG puts a box behind it.
- **Never rasterise an SVG.** The source file is the asset.
- **A GIF goes in whole or not at all** — a canvas holds only its first frame,
  and this site is mostly animated GIFs.
- **Refuse loudly, with a number.**

Where it departs from Bureau: Bureau keeps bytes in IndexedDB for one device
with a 60 MB ceiling. This commits them to git, which every clone carries
forever, so the ceiling is **4 MB** and audio and video are not offered at all.

A picked image sits in the tab until Publish, and the bar says so. Publishing
commits the layout and its images as **one commit** — see below.

### Editing a layout in the page

`/links?edit=1` mounts the editor onto the real page. It is behind the query
parameter, and behind a dynamic import, so a visitor never downloads it and can
never pick a tile up.

**There is one lock, and it is which mode you are in.** Bureau's decision 74,
taken whole: **locked** is the site exactly as a visitor sees it with a bar
along the bottom — links work, nothing has an outline, double-click does
nothing; **unlocked** is the board — a checkerboard under everything, outlines
on what moves, every gesture live. The padlock in the bar (or `L`) flips it for
every grid on the page at once. A first visit to `?edit=1` lands unlocked,
because that is what asking for it means; after that it is whatever you left.

**The checkerboard is real cells, not a gradient.** Now that cells are square
and uniform a gradient *would* line up, the way Bureau's does — but a cell is
also a **target**: one `<i class="ag-cell" data-col data-row>` per coordinate is
what makes clicking bare board mean "here", and dragging across it mean "this
big". A gradient cannot be pressed.

Interaction follows bureau:

- **click a bare cell** for the picker — and what you pick lands on that cell
  at its kind's size, or in the first free room
- **drag across bare cells** to sketch a box; the new object takes that size
- **hold 200ms** to pick a tile up — there is no arrange mode, so the hold is
  the only thing keeping an ordinary click from moving something
- **corner grips** resize; there are no edge handles
- **double click** the words and they become a field where they sit — the
  body or the title, never the whole tile, because a drawer front has a picture
  in it too. Click away keeps it, Escape reverts. What contenteditable produces
  is cleaned down to `a/em/strong/b/i/br` before it is stored
- **right click** opens that object's settings — the fields its attributes
  declare, its face, flow seed, lock, delete, and on narrow "reset to derived
  position"
- **the gear** is the look: colours, type, pinned
- **Board** is this grid's own geometry: how many columns across (which is how
  big one piece is), the gap, a fixed height in cells, and floating or set.
  **Tidy** repacks it top to bottom
- **Pages** is the working list of every page there is. Bureau's *desks* do not
  come over — a website has pages, and how a visitor gets between them is
  whatever you build out of objects and menus
- **Desk / Narrow** tabs switch which layout you are editing; narrow constrains
  the container, which is the real thing because the grid is container-queried
- **⌘Z / Ctrl-Z** undoes, up to 20 steps — moves and text edits share one stack

Saving has three levels. **localStorage** holds work in progress and survives a
reload. **Copy JSON** gives you the file to paste into `src/data/layouts/`.
**Publish sends everything at once** — every grid on the page that changed,
every picked image, any page a new drawer made, and the look if it changed — as
**one commit** to `main`, and the site rebuilds in about a minute. It uses the
**git data API** (blob, tree, commit, move the ref) rather
than the contents API, because a layout and the images it references have to
arrive together: one commit, one rebuild, and never a published JSON pointing at
an image that is not there yet. The ref move is not forced, so a push that
landed while you were editing refuses the update instead of being overwritten.

Publishing needs a token, and it is a real credential:

- Use a **fine-grained** token limited to this one repo, **Contents: read and
  write**, nothing else, short expiry. Not a classic token.
- "Keep this token in this browser" puts it in `localStorage`. Anything running
  on the origin could read it. Use **Forget token** when you're done.
- `publish.js` never logs it, never puts it in a URL or a commit; it goes in the
  `Authorization` header and nowhere else. There are tests asserting exactly
  that — keep them passing.
- Publishing clears the local draft, because the repo is the truth again.

While editing, clicks on links inside the grid are suppressed. Half the tiles
on `/links` are anchors, and without that, moving the home icon also navigates
home and takes the editor and the arrangement with it.

## Status: restarted, September 2026 — editor first, migration later

**The rebuild is active again, and the order changed.** It was parked in August
because content couldn't be edited; that is the thing now being fixed. See
`docs/SCOPE.md` for the full plan — the short version:

- Everything except large media can be built **on GitHub Pages as it stands**.
  No server, no auth, no hosting move. So the migration is deferred and the
  editor comes first.
- `?edit=1` is the "admin mode", and it is deliberately not access control. It
  is a URL anyone can type, and that is fine because **saving needs a token that
  only ever exists in Timothy's browser** — a stranger can rearrange tiles in
  their own session and change nothing for anyone.
- Media splits: images can be committed to the repo, **audio and video cannot**.
  Git history is append-only, so a few dozen songs committed once is a few dozen
  songs in every clone forever. They keep being embedded (SoundCloud, YouTube)
  until object storage exists.
- The domain is the one thing that does **not** wait, and it is not a rebuild
  task. Both domains are registered by *Squarespace Domains LLC* and renew
  **8 December 2026**. Until they are transferred out, cancelling Squarespace
  and keeping the address are the same decision. See `docs/SCOPE.md` §0.

Squarespace is still the live site meanwhile, and site changes still go there —
use the `squarespace-ops` skill, which encodes the admin flow and a save-button
hazard that silently discards work.

**Interactive pieces are built in `widgets/` and pasted into Squarespace code
blocks.** That is the active way of working now: Squarespace does page
composition and content, this repo builds the self-contained blocks, and each
one gets previewed in a deliberately hostile page before it goes near the live
site. See `widgets/README.md`. Requires Core or above — JS in code blocks is a
premium feature — and Timothy is on a grandfathered Business plan, so it is
available.

What's already done, so it isn't rediscovered:

- Saving **is** solved. The editor publishes to `main` through the GitHub
  contents API and the site rebuilds; 28 assertions cover it. The gap is
  breadth, not persistence.
- Element **content** is now editable too — text in place, image fields in the
  settings panel — but only on `/links`, which is the one page converted to the
  typed model. Converting another page is the same shape of work, one element
  at a time.
- **Header, footer and image upload are done.** Chrome is two layouts on every
  page; images are picked or dropped in the editor and committed with the
  layout.
- **The object model is Bureau's, and the editor is a desk.** Lock, checkerboard,
  a picker that makes notes, images, buttons and drawers, faces, and a look
  panel. A drawer makes a page. This is the point at which the thing under
  `src/lib/` stopped being "the editor for this site" and became the tool.
- The remaining work to replace Squarespace is: convert `/`, `/writing`,
  `/music` to grids and to typed content; build the six blog collections; pull
  the assets local.
- **The asset dependency is no longer urgent.** Every image still comes from
  Squarespace's CDN, and the `?format=` resizing that took the homepage from
  15.3 MB to 0.7 MB depends on it. While the subscription continues that is
  fine. It only becomes a deadline if cancelling — pull assets into `/public`
  and repoint `assets.js` *before* the renewal date, not after.

## Current state

Built and live: `/` (home), `/links`, `/writing`, `/music`, `/contact`,
`/editor` (the standalone layout editor, noindex). `/contact-1` redirects to
`/contact` — that is Squarespace's slug for the page, kept working so inbound
links survive the cutover.

Not built yet:
- `/uiux` — 40 images, the largest remaining page
- Blog collections — `journal`, `poems` (25 real posts), `essays-about-everything`,
  `short-stories`, `game-design`, `expressiveaether`. Six, not five; all six
  slugs verified live on Squarespace. Content is exported to Markdown but lives
  on Timothy's machine, not in this repo yet.

Until those exist, `/uiux` and the six collection links are live 404s. They land
on `src/pages/404.astro`, which explains the situation and offers a way back.

## Decisions already made — don't relitigate

- **Font: EB Garamond**, not Adobe Garamond Pro. Adobe Fonts cannot be self-hosted
  and stops working when the Squarespace subscription ends. Timothy accepted a
  close match. Amatic SC (display face) is OFL and self-hostable.
- **Assets still load from Squarespace's CDN**, via `src/lib/assets.js`. This is
  deliberate so pages render truthfully today. When they move into `/public`,
  that one file is the only thing that changes.
- **Ask the CDN for the size you actually render.** `images.squarespace-cdn.com`
  honours `?format=<width>w` and keeps every frame of an animated GIF; use
  `sized()` / `srcset()` from `assets.js` rather than a bare URL. The originals
  are huge — the persona is 2057x2519 and 9 MB but never renders wider than
  300px, which made the homepage 15.3 MB. `static1.squarespace.com` ignores the
  parameter, so the helpers leave those URLs alone (business cards, sun, holo).
- **Missing assets render as visible dashed placeholders** (4 of 5 social icons)
  rather than silently vanishing. Don't remove the slots. The sun is *not*
  missing — it is a real 26 KB GIF and `/links` now shows it like every other
  page does.
- **The favicon is the one local asset**, generated from the first frame of
  Sun.gif into `/public`. Everything else still comes from the CDN.
- **Contact form uses Web3Forms** (250/mo free, static-friendly). The access key
  is still a placeholder and the submit button is disabled until it's real.
- **Hosting stays GitHub Pages for now.** Cloudflare was considered and rejected
  for the moment — Cloudflare has de-prioritised Pages in favour of Workers, and
  the unmetered-bandwidth advantage solves a problem this site doesn't have.
  Revisit only if serverless functions are needed.

## Config gotchas

`astro.config.mjs` sets `site` and `base` for project-Pages hosting. **Both come
out when this moves to the real domain — that is the only change required.**
`base` is a `const` at the top of that file because the redirects map needs it
too.

**A redirect target must spell out the base.** Astro applies `base` to the route
it generates but *not* to the destination, so `'/contact-1': '/contact'` builds
a page that sends visitors to the domain root and 404s. Same trap as hard rule
2, in the one place `url()` can't help.

## Poetry content — read before importing posts

Squarespace stores each line of a poem as its own `<p>`, and stanza breaks as
**empty paragraphs**. Turndown and every other HTML-to-Markdown converter drops
empty paragraphs, which silently flattens every poem into one undifferentiated
run of lines. 19 of 25 poems have structure that a naive conversion destroys.

The export script groups lines into stanzas, joining within a stanza using a
markdown hard break (two trailing spaces). Poems carry `format: "verse"` in
frontmatter. If importing content, preserve this.
