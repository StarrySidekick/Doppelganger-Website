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
src/lib/adaptive-grid.js   resolve() + compileCSS() — the layout engine
src/lib/assets.js          every remote asset + the url() helper
src/components/AdaptiveGrid.astro
src/components/FlipCard.astro
src/components/SiteChrome.astro    fixed home icon + sun
src/layouts/Base.astro     SEO, fonts, global tokens
src/pages/                 one file per route
```

### The Adaptive Grid

A replacement for Squarespace's Fluid Engine, and the reason this project exists.

Fluid Engine stores **two hand-maintained layouts** (desktop and mobile). This
stores **one**, plus a per-element rule for what to do when space runs out:

| flow | behaviour when narrow |
|---|---|
| `pin` | holds its edge, never joins the stack — corner nav |
| `keep` | centres and scales |
| `full` | spans the full width |
| `stack` | drops into a single inset column |

`resolve(layout, width)` derives the narrow layout. `compileCSS()` emits real CSS
Grid using **container queries and `cqi` units**, not media queries — so a layout
works inside any container, not just at the viewport.

`grid-auto-rows` uses `minmax(clamp(...), auto)`. The `auto` is load-bearing:
without it, any element taller than its allotted rows silently overflows and
collides with whatever follows.

A standalone visual editor prototype exists outside this repo and shares the same
`resolve()` logic deliberately — editor and site must never disagree about what a
layout means. **That prototype still has the pre-`minmax` bug.**

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
