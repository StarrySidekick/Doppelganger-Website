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
npm test         # layout-engine + widget-build assertions (node --test, no deps)
npm run widgets  # build Squarespace code blocks → widgets/dist/
```

Deploy is automatic: push to `main` → GitHub Actions builds → GitHub Pages.
Live at https://starrysidekick.github.io/doppelganger/

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

**4. Verify visually, not just by build success.** A green build proves nothing
about layout. Screenshot at desktop and mobile widths before claiming done. Two
real bugs shipped past a passing build: the flip card overflowing its grid cell,
and the sun rendering at 100vw.

## Architecture

```
src/lib/adaptive-grid.js   the layout engine — resolve/boxOk/validate/compileCSS
src/lib/layouts.js         loads src/data/layouts/*.json, validates at build time
src/lib/editor.js          the in-page editor, loaded only for ?edit=1
src/lib/publish.js         commits a layout to GitHub from the browser
src/data/layouts/*.json    the layouts themselves — data, so they can be edited
src/lib/assets.js          every remote asset + the url() helper
src/components/AdaptiveGrid.astro
src/components/LayoutEditor.astro
src/components/FlipCard.astro
src/components/SiteChrome.astro    fixed home icon + sun
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

### Editing a layout in the page

`/links?edit=1` mounts the editor onto the real page. It is behind the query
parameter, and behind a dynamic import, so a visitor never downloads it and can
never pick a tile up. Interaction follows bureau:

- **hold 200ms** to pick a tile up — there is no arrange mode, so the hold is
  the only thing keeping an ordinary click from moving something
- **corner grips** resize; there are no edge handles
- **right click** opens that element's settings — flow seed, lock, and on narrow
  a "reset to derived position"
- **Desk / Narrow** tabs switch which layout you are editing; narrow constrains
  the container, which is the real thing because the grid is container-queried
- **⌘Z / Ctrl-Z** undoes, up to 20 moves

Saving has three levels. **localStorage** holds work in progress and survives a
reload. **Copy JSON** gives you the file to paste into `src/data/layouts/`.
**Publish** commits it straight to `main` through the GitHub contents API, which
rebuilds and redeploys — about a minute — and is what makes the public view
change.

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

## Status: paused — Squarespace is the live site

**As of August 2026 this rebuild is parked.** Timothy is making changes on
Squarespace (timothyvlangas.com) for the time being. Reason: the layout editor
covers only `/links`, nothing else on the site is a grid, and content still
can't be edited — so Fluid Engine, whatever its faults, is still the better tool
for actually running the site today.

Do not start rebuild work here unless asked. Site changes go to Squarespace —
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
- The remaining work to replace Squarespace is: convert `/`, `/writing`,
  `/music` to grids; make element *content* editable; build the six blog
  collections; pull the assets local.
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
