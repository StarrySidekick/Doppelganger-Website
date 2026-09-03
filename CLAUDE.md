# doppelganger

Self-hosted rebuild of **timothyvlangas.com** (brand: StarrySidekick.com), replacing
a Squarespace 7.1 site. Runs in parallel with Squarespace until it reaches parity.

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
src/lib/elements.js        the element type registry — what a tile IS and how it renders
src/lib/media.js           picking an image in the browser — resize, alpha, SVG, ceilings
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

`grid-auto-rows` uses `minmax(clamp(...), auto)`. The `auto` is load-bearing:
without it, any element taller than its allotted rows silently overflows and
collides with whatever follows.

**Rows are therefore not a uniform height** — measured on `/links` they run
18px, 18px, 31.5px … 40.125px, because `auto` lets each grow to its content.
Nothing may convert pixels to cells by dividing by an average step. The editor
walks the real track edges from `getComputedStyle().gridTemplateRows`; the first
version divided by a step and dropped a tile seven rows down when the pointer
had crossed thirteen. Guarded by the "no drift" check in the editor test.

**The out-of-repo prototype is retired.** `/editor` does its job now — a board
of labelled placeholders for arranging a layout with no finished page around it,
which is how `/uiux` gets built before `/uiux` exists. It runs the same engine
and the same editor as the live pages, so it cannot drift from them, which is
the whole reason the prototype had to come in. Delete the old copy rather than
keeping it in sync; it predates `minmax`, the scope argument and the two-layout
model.

### An element's content is data too

**Layouts hold content as well as geometry.** An element carries `type` and
`content` alongside its boxes, and `src/lib/elements.js` says what each type
means. This is why the project exists in the shape it does: before it, the
editor could move the email tile but could not change the email, because the
words lived as markup inside `links.astro` where nothing could reach them.

```json
{ "id": "email", "type": "text", "flow": "stack",
  "desk": { "col": [2, 8], "row": [9, 2] },
  "content": { "html": "<a href=\"mailto:…\">Email: …</a>" } }
```

| type | is | edited by |
|---|---|---|
| `slot` | content comes from the page's markup | code |
| `text` | a run of text with links | double-clicking it in the page |
| `image` | an image, optionally linked | the right-click settings panel |
| `html` | a block of markup | the settings panel, as a textarea |

`slot` is the default for an element with no type, and that is deliberate:
every layout written before this keeps rendering from its page untouched, so
pages convert **one element at a time** rather than all at once. `/links` is
converted; `/`, `/writing` and `/music` are not, and nothing forces them to be.

Two things about `slot` worth keeping:

- It is the right answer, not a stopgap, for anything a component renders. The
  flip card has its own holographic shader; a content schema would only get in
  its way. `links.json` writes `"type": "slot"` out in full so it reads as a
  decision rather than a forgotten field.
- A `slot` element carrying `content` fails the build. That combination can only
  mean a dropped or misspelled type, and it would otherwise render nothing at
  all with no complaint.

**Content is checked at build time.** `validateLayout()` runs each element's
content through its type, so a malformed `content` or one carrying a `<script>`,
an `<iframe>`, an inline handler or a `javascript:` URL fails the build. That is
a guard rail against a bad paste, not a security boundary — only someone who can
commit can write it.

**Typed elements render inside `AdaptiveGrid.astro`, so a page's scoped `<style>`
cannot reach them.** Pass a class (`<AdaptiveGrid class="links-grid">`) and hang
the rules off that in an `is:global` block. Bare `#email` in a global block is
the id collision hard rule 0 is about.

**`scopeFor()` hashes geometry only.** Folding content into it would mean fixing
a typo renamed every rule in the compiled CSS.

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
never pick a tile up. Interaction follows bureau:

- **hold 200ms** to pick a tile up — there is no arrange mode, so the hold is
  the only thing keeping an ordinary click from moving something
- **corner grips** resize; there are no edge handles
- **double click** a text element to edit the words in place. Click away keeps
  it, Escape reverts. What contenteditable produces is cleaned down to
  `a/em/strong/b/i/br` before it is stored, so a paste cannot smuggle styled
  spans into the repo
- **right click** opens that element's settings — flow seed, lock, the content
  fields its type declares, and on narrow a "reset to derived position"
- **Desk / Narrow** tabs switch which layout you are editing; narrow constrains
  the container, which is the real thing because the grid is container-queried
- **⌘Z / Ctrl-Z** undoes, up to 20 steps — moves and text edits share one stack

Saving has three levels. **localStorage** holds work in progress and survives a
reload. **Copy JSON** gives you the file to paste into `src/data/layouts/`.
**Publish** commits it straight to `main` and rebuilds the site — about a
minute. It uses the **git data API** (blob, tree, commit, move the ref) rather
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
