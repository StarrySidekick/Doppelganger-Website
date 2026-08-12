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
npm test         # layout-engine assertions (node --test, no deps)
```

Deploy is automatic: push to `main` → GitHub Actions builds → GitHub Pages.
Live at https://starrysidekick.github.io/doppelganger/

## Hard rules

**0. Element ids in a grid are global, exactly like keyframe names.** `compileCSS()`
now *requires* a scope and throws without one. Two unscoped grids on one page
used to overwrite each other's column count and every shared id — the second
won, the first silently lost its layout, and the build stayed green.
`AdaptiveGrid.astro` derives the scope from the layout via `scopeFor()`.
**The editor prototype must pass a scope too, or it will throw.**

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
src/data/layouts/*.json    the layouts themselves — data, so they can be edited
src/lib/assets.js          every remote asset + the url() helper
src/components/AdaptiveGrid.astro
src/components/LayoutEditor.astro
src/components/FlipCard.astro
src/components/SiteChrome.astro    fixed home icon + sun
src/layouts/Base.astro     SEO, fonts, global tokens
src/pages/                 one file per route
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

A standalone visual editor prototype exists outside this repo and shares this
engine deliberately — editor and site must never disagree about what a layout
means. **It still has the pre-`minmax` bug, and it now also predates the scope
argument and the two-layout model.** Folding it into this repo is overdue.

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

Saving is `localStorage` plus **Copy JSON**, which you paste into
`src/data/layouts/`. It is this browser only until it is committed — writing
back to the repo so the public view changes is the next step, not built yet.

While editing, clicks on links inside the grid are suppressed. Half the tiles
on `/links` are anchors, and without that, moving the home icon also navigates
home and takes the editor and the arrangement with it.

## Current state

Built and live: `/` (home), `/links`, `/writing`, `/music`, `/contact`.

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

## Poetry content — read before importing posts

Squarespace stores each line of a poem as its own `<p>`, and stanza breaks as
**empty paragraphs**. Turndown and every other HTML-to-Markdown converter drops
empty paragraphs, which silently flattens every poem into one undifferentiated
run of lines. 19 of 25 poems have structure that a naive conversion destroys.

The export script groups lines into stanzas, joining within a stanza using a
markdown hard break (two trailing spaces). Poems carry `format: "verse"` in
frontmatter. If importing content, preserve this.
