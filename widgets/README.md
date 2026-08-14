# Widget bench

Self-contained interactive blocks for **Squarespace code blocks**. Squarespace
keeps doing what it is good at — page composition, content, collections, forms,
image hosting — and the interactive pieces are built here, where they can be
version-controlled, tested and looked at before they touch the live site.

Requires **Core / Plus / Advanced** (or a grandfathered Business plan).
JavaScript and iframes in code blocks are a premium feature; the Basic plan
allows HTML and CSS only.

## Using one

```bash
npm run widgets        # build every widget
```

Then open `widgets/dist/index.html` to preview them, and paste the contents of
`widgets/dist/<name>.block.html` into a Squarespace code block.

The `<div>` at the top of a block carries `data-` attributes with real defaults
already filled in. **That div is the part you are meant to edit by hand** —
swap an image URL, change the size. Everything below it is generated and will
be overwritten on the next build.

## Writing one

```
widgets/<name>/meta.json      name, version, description, defaults
widgets/<name>/widget.html    markup, goes inside the shadow root
widgets/<name>/widget.css     styles, go inside the shadow root
widgets/<name>/widget.js      behaviour; receives `host` and `root`
```

`widget.js` runs once per host element as a function body, so a bare `return`
is fine. `host` is the div in the page; `root` is its shadow root.

## Why a shadow root

Everything a widget renders lives inside a shadow root, and that is the whole
reason a build step is worth having:

- **Squarespace's stylesheet cannot reach in.** No `!important` from the theme,
  no `* { box-sizing }`, no surprise margins.
- **The widget's CSS cannot leak out** and break the page around it.
- **Two blocks on one page cannot collide** — not on class names, not on ids,
  not on keyframe names. Ids in a normal page are global; this is the same
  hazard that overwrote a grid layout in `adaptive-grid.js`, and the same one
  that rotated the business card on the wrong axis for months.
- **Custom properties still cross the boundary**, and `@font-face` is
  document-level. So the site's typography and any tokens you choose to expose
  still work — inheritance becomes opt-in instead of an accident.

## What the build guarantees

`npm test` covers these; `scripts/build-widgets.test.mjs` is the file.

- `</script>` inside markup is escaped, so it cannot terminate the block early
  and dump the rest of the widget onto the page as text.
- Every block carries a **provenance header** — name, version, commit sha.
  There is no git on the Squarespace side, so the block has to say where it
  came from.
- Mounting is idempotent. Squarespace 7.1 re-runs inline scripts on ajax
  navigation; a second pass must not build a second shadow root.
- A widget that throws is caught, so it cannot take the page down with it.
- No repo-relative `src`/`href` and no bare `import` — a code block cannot
  reach a file in this repo, so anything not inlined has to be an absolute URL.
- Keyframe names are prefixed `sk…` even though shadow roots scope them.

## The hostile-host preview

`<name>.preview.html` is not a neutral page. It deliberately applies the worst
things a theme can do — a conflicting `spin` keyframe, `img { width: 40px
!important }`, `* { box-sizing: content-box }`, a red wash on `.card` — plus a
probe element that proves the widget is not leaking outward either. If a widget
looks right there, it will look right on the live site.

The browser check lives in the scratchpad, not the repo, because it needs
Playwright and the repo has no dependencies beyond Astro.

## Two Squarespace gotchas

- **The editor preview does not run scripts.** A code block looks inert while
  you are editing the page; check the *published* page. This is exactly why the
  local preview is worth having.
- **Images must be absolute URLs.** Upload to Squarespace and use the CDN URL,
  or inline a small asset as a data URI.
