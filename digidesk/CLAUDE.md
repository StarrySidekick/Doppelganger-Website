# DigiDesk: working notes

The tool. Read the repository's [`CLAUDE.md`](../CLAUDE.md) first: it says
what lives here and what lives in `site/`, and holds the hard rules that apply
to both (hard rule 4 is the seam: **nothing here may know which site it is
building**).

DigiDesk is a website builder where everything sits on a grid. It is Bureau's
model (objects, attributes, kinds, faces, one lock, gestures ported from
source) plus what a website needs (pages instead of desks, Astro rendering the
published page, saving as a commit). StarrySidekick, in `site/`, is the first
site built with it and is how it is tested in the real world, but nothing here
is about that site.

## The shape of the tool

| Where | What |
| --- | --- |
| `index.js` | **The integration.** Reads the site's options, injects the routes, generates the three virtual modules, defines `__BUILD__` and `__DIGIDESK__`, sets the CSS target Safari needs. |
| `src/config.js` | What the site told the tool (`CONFIG`): storage prefix, publish target, where the site sits in its repository. `storeKey()` and `repoPath()` are how every localStorage key and every published path is made. |
| `src/site.js` | The site at build time, as data: layouts, the checked look, `resolveRef()` for `asset:`/`media:`, `pageOf()` for a board's title and share picture. Build only; the one module that knows a site exists. |
| `src/custom.js` | **A site's own kinds**: the registry, `registerCustom()`, and waking them in the browser. Imports nothing, because visitors load it. |
| `src/url.js` | `joinBase()` and `url()`: hard rule 2. |
| `src/words.js` | **The words** (Bureau 247): how a written thing is set, stored under `o.words`, drawn by `wordStyle()` as `w-*` classes and custom properties on the tile. Imports nothing. |
| `src/routes.js` | Names shared by routes and editor: `CHROME_LAYOUTS`, `TOOL_PAGES`. |
| `components/Head.astro`, `Scripts.astro` | What a site's shell puts in `<head>` and at the end of `<body>`. The shell is the site's; these are the tool's part of it. |
| `routes/` | Pages the tool makes on every site: a board per layout, home, `/editor`, `/modeler`, manifest, worker, `/version.json`. |
| everything else in `src/` | The engine (`adaptive-grid.js`), the object model (`elements.js`), the editor (`editor.js`, `edit-mode.js`, `publish.js`, `media.js`), the catalogue (`works.js`), the look (`look.js`), what a published page does (`interact.js`), 3D (`model3d.js`, `model-view.js`, `model-editor.js`), the app (`pwa.js`). |

**The three generated modules** are the only way the site's files reach the
tool, and `test/boundary.test.mjs` holds it to that:

- `virtual:digidesk/site`: the layouts (glob of `/src/data/layouts/*.json`),
  `look.json`, `works.json`, the assets module, which pages the site wrote, the
  `app` options. Build only.
- `virtual:digidesk/custom`: imports the site's custom module and registers it.
  Build and browser: the editor imports it before itself, and `Scripts.astro`
  imports it on a page that has a custom object.
- `virtual:digidesk/shell`: the site's page shell, so the tool's routes are
  dressed as the site's pages.

**Conventions a site follows** (so there is nothing to configure): layouts in
`src/data/layouts/`, the look in `src/data/look.json`, the catalogue in
`src/data/works.json`, editor-committed pictures in `public/media/`. The shell
takes `title`, `path`, `description`, `image`, `header`, `noindex`.

**Under plain node** (the tests) nothing is defined: `CONFIG` falls back to its
defaults, and a test that needs the tool told something imports
`test/site-fixture.js` first. Nothing in `src/` may import a virtual module
except `site.js` and `layouts.js`, which only the build loads.

## What came from Bureau, and what is next

`docs/BUREAU-PORT.md` is the inventory of Bureau since the port (decisions
~150 to 311): what is ported, the order to build the rest, and what stays
Bureau's. Read it before porting anything, and update it when you do.

## Custom kinds

The room for anything the tool does not do. A site exports `kinds` from the
module it names as `custom`; each kind has `label`, `says`, `size`, `fields`,
`data` (defaults), `render(o, ctx)` and optionally `wake(el, o)`, `check(o)`,
`face`, `attrs`, `picker`. The full contract is the comment at the top of
`src/custom.js`; the site-facing version is `site/src/custom/README.md`.

What the tool does with one: `elements.js` hears it through `onCustom()` and
adds it to `KINDS` (carrying the structural `custom` attribute) and, unless it
says otherwise, to `PICKER_KINDS`. `renderElement()` draws it inside
`<div class="ob-custom" data-custom data-o>`, so the browser can wake it with
no lookup; `fieldsOf()` offers its fields; `checkElement()` runs its `check`
and fails a layout that names a kind nobody registered; `setKind()` and the
editor's `create()` start a new one with a copy of its `data`. In the browser
`watchCustom()` wakes each drawn one once and calls the function `wake`
returned when the node leaves the page, because the editor redraws a tile by
replacing it.

Its own data lives under `o.data`, never at the top level, where every name
means something to the tool. A site may not reuse a built-in kind's name.

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

**The board is RIGID, the cell is SQUARE, and by default the cells TOUCH.** A
cell is one column wide and exactly as tall, derived from the container's own
width in `cqi`:

```css
--ag-cell: calc((100cqi - (cols - 1) * gap) / cols);
grid-auto-rows: var(--ag-cell);
```

**`gap` defaults to 0 and every shipped board is 0.** A board is a plain
continuous grid, the way Bureau's is; the space between pieces is dressing one
board may ask for, in the Board panel, not something a layout has to state. It
used to be 8 everywhere, which read on screen as a field of separated squares
rather than a grid. Two things had to change together: the default, and
`validateLayout()`, which checked `gap` with the same `> 0` rule as the column
count — so **zero, the one value that matters, failed validation and the Board
panel silently refused the change.** Gap is now `>= 0`, `normalizeLayout()`
defaults it, and a negative gap is still refused. A tile outline is drawn
*inside* its box (`outline-offset: -1px`) for the same reason: offset outward,
two touching tiles shared one doubled line.

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
**face** is how it draws. `src/elements.js` is the registry; Bureau's
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
| `feed` | **shows the works, filtered** — a list that is true rather than one you wrote | `feed: {type, tag, sort, limit, chips}` |
| `spin` | two sides turning on their own; the object's picture is the front | `spin: {back, sheen, seconds}` |
| `sound` | plays a SoundCloud track or playlist through their widget, hidden, driven by the object's own buttons. **The iframe is never stored or pre-rendered** — `interact.js` makes it on a page that has a player, and `sound.src` must be a SoundCloud address, because it becomes an iframe src | `sound: {src, title, play, pause, prev, next}` |
| `model` | **a low-poly 3D model, turning on its own** — a list of parts (box, cylinder, cone, ring, ball), each with a colour, place, turn and size. Stored on the object; drawn by WebGL | `model: {parts, spin, tilt, pixel, shading, zoom}` |
| `decor` | **stands on the board rather than in it** — the one thing allowed to overlap, and nothing makes room for it (Bureau's decision 86). The sun, the holo, the business card. `boxOk` and `validateLayout` let it lie across anything and anything across it; Tidy leaves it where it stands; it draws at `z-index: 2`, unclipped | — |

| kind | attributes | face | made from the picker |
|---|---|---|---|
| `note` | text | torn note | yes |
| `image` | media, link | picture | yes |
| `button` | text, link | plaque | yes |
| `drawer` | container, media, text | drawer front | yes — **it makes a page** |
| `fold` | text, fold | card | yes — **replaces a dropdown** |
| `list` | holds, text | card | yes — **the accordion / gallery** |
| `works` | feed, text | plain | yes — **a section page, or a strip of recent work** |
| `html` | text (raw markup) | plain | no, a tool |
| `form` | form, text | card | yes — **fields that email you.** The web layer's first kind |
| `card` | media, spin | plain | yes — **the business card**: front, back, a shimmer, turning on its own |
| `model` | model | plain | yes — **the N64 key**: opens the 3D editor |
| `player` | sound | plain | yes — **a SoundCloud playlist with buttons of your own**, the /music player |
| `heading` | text, heading | lettering | yes — **starts a section**: a real `<h2>`, its tile's id its anchor (Bureau 304) |
| `contents` | contents | card | yes — **the board's headings, each a link to it**, read off the board by `sectionsOf()` |
| *a site's own* | custom, … | its own | yes — **a custom kind** (see *Custom kinds* above) |
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
the same code. **`items` is a field in the settings panel** — a row per thing,
with a title, its words, somewhere to go and a picture, added and dropped in
the panel and committed on Apply. Before that a holder could be made from the
picker and never filled, so the accordion and the gallery were both
unreachable from the editor and the only way in was to write the JSON by hand.
`makeItem()` builds one from what it was handed: attributes follow the fields
given, and an item carries a real `kind`, because a `slot` draws nothing from
data and one holding fields fails its own check. **A held thing that goes
somewhere is a real link**, through `ctx.link` like any other — that is what
makes "a row of links" one of the three things a holder is for, and it was
rendering as plain words until the anchor was lifted out of `renderElement()`
into `linkWrap()` and shared. The board is rigid; a holder is a box whose *contents* flow,
which is what an accordion, a row of links and a wrapping gallery all are.
`src/interact.js` is the only script a published page carries — one
delegated listener for folds and accordions, so a visitor gets them too.

Ask `has(o, 'media')`, never `o.kind === 'image'`. That rule is the whole reason
an invented combination works everywhere immediately — a note told to carry a
link is a note you can click, and nothing was designed for it. **And it is now
reachable**: the object editor has a tick per attribute, so a note that also
carries a picture can actually be made. `USER_ATTRS` declared that since the
port and nothing ever showed it.

### The works — what exists, as opposed to what is on a page

`the site's `src/data/layouts/`*.json` says what is on a page and where. **`src/data/works.json`
says what EXISTS**, and it is the other half of the content model. A work — a
film, a game, a poem, a song, a painting, a tool — is written down once and
appears wherever it belongs.

Two axes, because they answer different questions:

- **`type`** is the section it lives in: `film`, `games`, `writing`, `music`,
  `art`, `inventions`. One per work, from a closed list, because a section page
  has to be able to say "these". A type carries a `label`, its `path`, and the
  tags it usually uses.
- **`tags`** is everything else true about it — what the credit was (sound
  design, score, director), what form it took (poem, essay, painting), what it
  was for. Any number, open-ended, because the interesting cuts are the ones you
  have not thought of yet.

So a work appears on its section page, in the everything list, and under every
tag it carries, **without being written down more than once**. That is the whole
point, and the reason not to keep a list per page: a list per page goes out of
date the moment you make something.

**A `feed` is a QUERY, not a list.** `{type, tag, sort, limit, chips}`, answered
by `ctx.works(query)` — so `elements.js` never learns what a work is or where
the catalogue lives, exactly as with `ctx.image` and `ctx.link` (hard rule 4).
`src/works.js` is the pure half: `queryWorks()`, `validateWorks()`, and no
import of anything site-specific. `AdaptiveGrid.astro` is the one place the real
catalogue is loaded and an address becomes a URL.

Consequences worth knowing:

- **The chips a visitor sees come from the RESULT, not the catalogue.** A chip
  that matches nothing on the page in front of you is a dead end, and the film
  page must never offer "Painting".
- **A work with no year sorts last in BOTH directions.** It is not the newest
  thing and not the oldest; it has no place on the timeline. Sorting it first
  under "oldest" would claim a date the catalogue does not have.
- **Filtering is one tag at a time**, in `interact.js`, so a visitor gets it
  without downloading the editor. Two tags at once reliably produces an empty
  page and no idea why. `data-tags` is pipe-delimited so a filter matches a
  whole tag: "Score" must not match "Scorekeeper".
- **The catalogue is edited in the bar's `Works` panel** and publishes in the
  same commit as everything else, like the look. A feed on the page redraws the
  moment the catalogue changes — no rebuild.
- `scripts/site.test.mjs` checks the two halves agree: every feed's `type` is a
  real section, every section's `path` is a page that builds, and every footer
  link goes somewhere.

**A drawer is a page.** This is the one place the port departs from Bureau, and
it is the whole port in a line. Bureau's drawer opens onto a nested grid inside
the app; here `container` + `link: "/game-design"` means the object's contents
are the page at that path, and its face on this board is the way in. The site
map is the container tree. `routes/board.astro` turns any layout file that has no
hand-written page into one, so **New drawer in the editor writes a layout file
and a tile that opens it**, and the next build makes the page. Nothing was
built for nested grids, because Astro pages already are them.

**Faces are CSS.** `fc-<name>` on the tile, and every difference between
`note`, `picture`, `plaque`, `front`, `spine`, `card` and `none` is in
`styles/faces.css`. A face never states a colour of its own — it takes
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

### 3D models — the N64 key (September 2026)

A `model` object draws a low-poly model in a canvas and turns it; a visitor
can grab it and turn it by hand (side to side only, so a vertical swipe on a
phone still scrolls). Three files, split so the modeller can leave later as
its own thing:

- **`model3d.js` is pure** — node and browser. A model is a short list of
  PARTS, and that is the whole modelling language, deliberately: it is how an
  N64 prop was built, it is small enough to live on the object and publish in
  a layout, and it can be made in a panel with no 3D mouse gymnastics. Every
  triangle is turned outward by one rule (`outward()`), not by trusting each
  shape's winding, so light cannot come out inside-out. The camera fits the
  model's bounding SPHERE, so it never leaves the frame however it turns —
  there is a test that turns it and checks every corner.
- **`model-view.js` is WebGL with no library**, because the parts pass
  through each other (a stem into a note head) and only a depth buffer gets
  that right. The look is three of the model's own fields: few polygons,
  `shading` (flat shows every polygon; smooth is the soft Gouraud light of
  the real console) and `pixel` — a small frame scaled up with hard edges,
  the way the N64 drew 320 pixels across a television. The build does no 3D:
  the page carries a canvas and the parts as JSON, and `interact.js` fetches
  the renderer only on a page that has one. Paused off-screen; still for
  anyone who asked for reduced motion.
- **`model-editor.js` knows nothing about boards.** Handed a model, gives one
  back. **Edit the model…** in a tile's menu opens it over the page; `/modeler`
  stands it on a page of its own (noindex, draft kept in the browser). Drag to
  orbit, wheel to zoom, click a part to pick it (a colour-per-part render read
  back from the GPU, never a guess from the DOM). **There are no 3D drag
  handles**: dragging a thing in a space you see flat is where small modellers
  go wrong, so arrows move the picked part a step, PageUp/PageDown toward and
  away — the board's own bargain. Keys are taken at the window in the capture
  phase and stopped there, **because Delete in the 3D editor must delete a
  part and not the tile the model lives on.** Undo is its own stack; Done is
  one undo step on the board.
- **Every number is a slider and a number box**, the same field twice: the
  slider for a thumb, the box for exactly "0.4". Axes are coloured X red, Y
  green, Z blue, as in every 3D program. A slider's range widens to take a
  value already outside it, so it never quietly clamps a model. **The undo
  "before" is taken on pointerdown, not only on focus**: an iPhone often
  never focuses a slider, and a drag writes its value live, so without that
  a whole drag left nothing to undo.

Presets: **Note key** (first, and what a new model object starts as — it was
the plain key until Timothy found the picker handing him the wrong one) and
**Key** — a note whose head is the bow, whose stem
is the shaft, and whose flag is three teeth. Both under 150 triangles.

### The site is an app (PWA, September 2026)

Installable, full screen from the home screen, and the pages you have opened
work offline. `src/pwa.js` is pure and site-blind (hard rule 4); the two
endpoints hand it the name, icons, colours and base, so moving to the real
domain changes nothing here.

- **A worker controls only addresses BELOW its own folder**, and GitHub Pages
  cannot send the header that widens that. `/Doppelganger-Website/sw.js`
  covers `/Doppelganger-Website/…` but not the bare `/Doppelganger-Website`
  — which is the home page, because `trailingSlash: 'never'`. So the app
  starts at **`/Doppelganger-Website/index.html`**, the same page
  (`build.format: 'file'` writes it) at an address the worker can see. The
  manifest's scope is written WITHOUT its trailing slash so tapping Home does
  not throw you out into the browser. At a root domain all of this collapses
  to `/`. Tests hold both cases.
- **Pages are network-first**, so a publish shows the moment it has built;
  the cache is the offline fallback, and the home page the last resort.
  `/_astro/` (hashed names) is cache-first; pictures and fonts are
  stale-while-revalidate. **Never cached or intercepted:** anything not a GET,
  `version.json` (it is how the editor asks what is live), GitHub's API
  (Publish), SoundCloud, Web3Forms. The page cache is named for the build, so a
  new deploy's worker drops the old pages.
- **Registered only in a real build**, never under `npm run dev`.
- **Icons** are the sun drawn on black (`public/icon-*.png`), with a padded
  maskable one for Android's round crop. The sun is 128px at source, so the
  512 is soft; it is shown at 60–180px.
- **Shortcuts** (Android, hold the icon): Edit the site, 3D editor. iPhone has
  none; **the corner dot is the way into edit mode in the app**, because a
  full-screen app has no address bar to type `?edit=1` into.
- **The corner dot hangs off `<html>`, not `<body>`.** The sun's shuffle puts
  a filter on body, and a filtered element becomes the containing block for
  everything `position: fixed` inside it — so the dot dropped to the bottom
  of the PAGE, off-screen, on every page that had been tinted, and the tint
  is remembered. In the app, where the dot is the only way in, that was "I
  can't see the dot". It is also 44px now, set in from the rounded screen
  corner and above the home indicator, and brighter in `display-mode:
  standalone`. A test holds where it hangs.

Checked in Chromium: installable with no errors in a normal profile, the
worker controls `index.html`, and with the server actually stopped the
visited pages still open (emulated offline in Playwright does not reach a
service worker's own fetches, so it proves nothing — stop the server).

### The look

`src/data/look.json` is the site's dressing: page, ink and accent colours, the
two checkerboard squares, the type face, and whether tiles are pinned (each
leans a degree or two, off a hash of its id — Bureau's decision 75). `look.js`
derives a full token set from those few values the way Bureau's `look.js` does
(its decision 33), so the second and third tints of a colour agree with the
first by construction. `Base.astro` emits them on `:root`; the editor's gear
writes the same tokens live and publishes the file with everything else.

Three more fields carry the Squarespace site's manner: **`wiggle`** (a linked
picture wiggles under a mouse), **`sparks`** (a picture thrown five at a time
from every click — the star) and **`cursor`** (`[pointer, pointer over a
link]`). The pictures are `asset:` keys; `resolveLook()` turns them into
addresses in `Base.astro`, because `look.js` may not know the site's assets
(hard rule 4). The editor cannot resolve them, so `tokensFor()` only emits a
cursor token for a real address and the build's own value stands. None of the
three apply while the board is unlocked.

### Header and footer are layouts too

`header.json` and `footer.json` are ordinary layouts, rendered by the same
engine and edited by the same editor. `Base.astro` puts them around every page,
so a page no longer opts in. **This is the lesson from Bureau — everything sits
on the grid, and chrome is not a special case with its own rules.** The payoff
is that the header can be rearranged and the footer reworded without touching
code, and neither needed a line of new engine code to get there.

Consequences worth knowing:

- **Ids are global across the whole document**, not per grid. Header, page and
  footer all render into one page, so `site-*` prefixes keep them apart.
  `scripts/site.test.mjs` asserts no two shipped layouts share an id — that
  test was claimed here for a while before it existed, and the same hazard from
  the other direction had `/editor` drawing a placeholder *and* the real object
  under one id, so the footer's nav rendered twice on top of itself.
- `/links` no longer carries `nav-home`/`nav-sun`; the header owns them.
- **A site-relative link inside `text` content is rewritten at render** through
  `ctx.link`, so hard rule 2 still holds for a footer nav that is a run of HTML
  rather than a field. A bare `href="/writing"` stored in content is correct and
  becomes `/Doppelganger-Website/writing` on the way out.

### The editor cannot re-render, so there is exactly one place it cleans up

Bureau's decision 8 is "full re-render on every change": every editor state —
selected, lifted, invalid, the drop target — is emitted by the renderer from the
model, so it cannot be left behind. **This editor cannot do that, because the
page is Astro's markup.** So six visual states are poked onto the DOM by hand:
`ag-selected`, `ag-lifted`, `ag-invalid`, `ag-drop`, the drag ghost and the
sketch ghost.

Every exit path was expected to remember all six, and `pointercancel` remembered
two — it cleared the tile drag and never touched the sketch. So the sketch's
ghost stayed in the grid, its timer went on to paint `ag-armed` onto it, and the
next press assigned a fresh sketch and orphaned that node for the life of the
page. **A `pointercancel` fires exactly when a second finger lands**, so every
attempt to two-finger scroll off bare board left an amber box behind — which is
why "highlights get stuck" and "two fingers barely scroll" were one bug reported
from both ends.

`clearGestureState()` is the answer and it is deliberately the *only* teardown:
both gestures, both timers, both ghosts, all four classes, plus a sweep of the
grid for anything still wearing one that we have lost the handle on — because
losing the handle is the whole class of bug. It is wired to `pointercancel`,
`blur`, `visibilitychange`, a second finger, and both pointer-up paths. **Do not
add a seventh piece of hand-managed state without adding it here**, and do not
add a second teardown.

Two more rules follow from the same fact:

- **A gesture has one owner.** `G` and `sketch` each carry the `pointerId` they
  started with, and every later event checks it. Nothing used to, so a second
  touch overwrote them and the *first* finger's release then cleaned up the
  *second* gesture and left the first tile lifted and transformed for good.
- **Never ask the DOM where the finger is.** The sketch used to call
  `document.elementFromPoint` for a `.ag-cell` and give up when there wasn't
  one, which is any time the pointer crossed a tile — tiles are `z-index: 1`,
  cells are `0` — so the ghost froze and a box could not be drawn across
  anything. `cellAt()` and `spanBetween()` do the arithmetic instead; they are
  pure, exported, and tested. **The checkerboard is a look, not the thing that
  decides where you pressed.**

### A phone is the hard case

Three defaults fight an editor on a touch screen, and all three are the browser
being helpful about something else:

- **A one-finger drag scrolls the page**, so a tile can never be picked up.
  This was answered with `touch-action: pinch-zoom` on the grid, and **that was
  the wrong instrument.** It gave the single finger to the drag, which costs
  one-finger scrolling outright; and on iOS `pinch-zoom` buys two-finger *zoom*
  rather than two-finger *pan* on an unzoomed page, so the scrolling it was
  supposed to leave you barely answered either. **Bureau never sets
  `touch-action` on its board.** The board is not a surface that declares what
  gestures it takes; the editor decides per gesture. A non-passive `touchmove`
  calls `preventDefault` while — and only while — `dragArmed()`, and the hold is
  what makes that legal: the finger has been still for 300ms, so no native
  scroll has begun, and `preventDefault` can still stop one from starting. Once
  scrolling is under way the call is ignored, which is also why the hold cannot
  grow much longer than it is. Two fingers cancels any gesture in flight and
  hands the page straight back to the browser. Tests assert all three.
- **Tapping paints a blue highlight box** — `-webkit-tap-highlight-color`.
- **Holding starts a text selection** and iOS adds a callout menu on top, both
  of which fight hold-to-drag. **While unlocked the DOCUMENT is not a selectable
  surface**, and the bar and its panels never are, locked or not. Scoping this
  to `.ag-grid` was not enough and is the bug worth remembering: a selection
  that STARTS outside a tile — on `.ag-root`'s padding, on `.site-main`, on a
  board label, on a word in the bar — runs straight through the tile anyway,
  because `user-select: none` on a child cannot stop a drag that began
  elsewhere. CSS alone is also not enough: `selectstart` and `dragstart` are
  refused at the document while unlocked, and a stale selection is dropped on
  the next press, because once a selection exists the browser extends it under
  the finger and that is exactly what a hold feels like.
- **The exceptions have to out-specify the ban.** `.ag-editing .ag-menu *` is
  two classes and beats a bare `.ag-editing input`, which made every field in
  Board and Publish unselectable the first time this was written. The
  `contenteditable`, `input`, `textarea` and `select` exceptions carry
  `.ag-menu`/`.ag-bar` copies for that reason.

Also: **the bar is the only chrome a phone has.** It goes full-width along the
bottom with a safe-area inset, every button is at least 34px tall, and it lost
six controls (two device tabs, three grid tabs, Add image) to fit. A 24px
button is a miss.

**All three boards share one gutter**, `--site-gutter` on `:root` —
`max(23px, 2vw)`, which is Squarespace's own, measured. Header, page
and footer are separate grids and only read as one board if they are the same
width — otherwise their columns do not line up and their cells are different
sizes, which was most of "the grid looks weird on mobile".

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

**Edit mode is a mode this browser is in, not a property of one URL.** `?edit=1`
still means edit and still works, but it was also the bug: follow any link — the
home icon, the footer nav — and the next page's address had no `edit` in it, the
editor never mounted, and the bar vanished with no way back short of retyping
the address. So:

- **A target in the bottom-left corner of every page** is the way in. `⌘⇧E` /
  `Ctrl-Shift-E` does the same on a desk. **`SHOW_CORNER` in `edit-mode.js` is
  currently `true`, so it is a visible dot on every page**, one press, for
  anyone — that is temporary, so it can be found. Set it to `false` and it goes
  back to invisible and a **double press** until you have been in edit mode once
  in this browser, after which it is a faint dot and one press; a visitor then
  sees nothing and it is not announced to a screen reader.
- **Pressing it mounts the editor where you stand**, with no reload — the page
  in front of you is already the board.
- **`?edit=1` turns the mode ON** as well as opening the editor, so it survives
  the next link. `?edit=0` turns it off.
- **Done in the bar is the way out**: it clears the mode, strips the parameter
  and reloads as a visitor. A reload rather than an unmount, deliberately — the
  editor has put a checkerboard, grips, labels and draft tiles into the page,
  and asking the browser for the page again is the honest way to be sure none of
  it is left over. Nothing is lost; drafts live in localStorage.

None of this is access control and none of it is meant to be, exactly as
`?edit=1` was not. A stranger who finds the corner can rearrange tiles in their
own browser and change nothing for anyone, because publishing needs a token that
only ever exists in Timothy's.

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

- **hold bare board** for the picker — and what you pick lands on that cell at
  its kind's size, or in the first free room. **A quick tap does not**, and that
  is deliberate: one finger belongs to the board while you are arranging, so
  every stray touch, every attempt to scroll with one finger and every tap
  meant to deselect used to land in the picker. A tap now means what it means
  everywhere else — nothing is selected any more. The ghost goes solid amber
  the moment the hold lands, so the board says the picker is coming rather than
  springing it on you
- **drag across bare cells** to sketch a box; the new object takes that size.
  A drawn box is deliberate by nature, so it opens the picker without the hold
- **every panel has a ✕**, from `openMenu`, and **Escape closes whatever is
  open** whichever board is active. A phone has no Escape key, a panel can
  cover most of the screen, and "tap outside" is not a way out you can rely on.
  A panel is also kept clear of the bar, which owns the bottom ~90px of a phone
  — clamping only to the window put a panel's last row underneath it
- **press a tile** to select it — the one the keys act on, ringed in the accent.
  **There is one selection for the page, and the chrome holds it**, exactly as
  Bureau keeps `S.sel` in the model. It was a variable inside each editor, and a
  page mounts three of them, so pressing a tile in the page and then one in the
  footer left *both* wearing the ring. `paint()` also re-asserts the class on
  every commit rather than poking it on at the moment of pressing, so an undo
  that re-mounts a tile cannot leave the selection pointing at a node that no
  longer wears it
- **arrow keys** move the selected tile one cell, **shift+arrows** resize it by
  one, **⌘D** copies it, **Delete** removes it. A drag is right for "roughly
  there" and wrong for "one cell left", which on a 24-column board is a few
  pixels of pointer travel
- **hold to pick a tile up** — 200ms with a mouse, **300ms with a finger**,
  because 200 on glass is inside the window in which the browser is still
  deciding whether you meant to scroll. There is no arrange mode, so the hold is
  the only thing keeping an ordinary click from moving something
- **keep holding without moving** and it becomes the settings panel instead —
  a phone has no right button, and Bureau makes the same bargain. **The gesture
  is not cancelled when the menu appears**: the tile is put back down but stays
  under your finger, so keep holding and move and the menu goes away and you are
  dragging. That is the iPhone home screen's gesture and Bureau's decision 47.
  Cancelling made the hold a dead end — the menu came up and the press was
  finished with, and you had to start again
- **drag a band across tiles** and they are selected — the same drag as the
  sketch, told apart by whether it touched anything. That is Bureau's rubber
  band and it is why there is no "select tool": touch nothing and you are
  drawing the size of a new thing, touch something and you are choosing. The
  band goes solid accent with no fill (`ag-picking`) so it reads as a lasso.
  **Shift+click** toggles one tile in or out; **shift+band** adds; **⌘A** takes
  the lot. A decoration is passed over by a plain band, because it stands in
  front of things and would always be caught first — shift+band picks it up
  deliberately
- **drag any member of a selection and the lot moves**, keeping its shape —
  `G.group`, captured at the press. One ghost per thing in the air, and the
  set lands as a whole or not at all: `boxesOk()` judges it together, and a
  collision *inside* the set is not a collision. It is **one undo step**
  (`kind: 'boxes'`), because it was one thing you did (decision 65)
- **the toast carries its own Undo** — a real button, pinned to the step that
  was on top when the words were written, so a toast still on screen after
  something else has changed does not undo the newer thing. A phone has no ⌘Z,
  and the toasts used to say "⌘Z puts it back" to a device with no ⌘. Bureau's
  `toast(msg, undo)`; here `undoOf(step)` is the closure the editor hands over
- **hold a tile at the top or bottom edge and the page scrolls** under it, faster
  the nearer the edge, with the drag re-applied between pointer events — the
  finger is holding still and the board is what moves. Bureau's `autoPan`. The
  bottom edge is the *bar's* top, since the bar owns that strip. Without this a
  tall board could not be dragged onto below the fold at all, because a native
  scroll is the first thing the hold refuses
- **Tab / shift-Tab** walk the selection in reading order; **⌥+arrows** walk it
  spatially, by Bureau's rule (decision 70): nearest in the direction pressed,
  weighing distance *across* the axis double, so Right from a tall tile finds
  the thing beside it and not the thing three rows down. The plain arrows still
  **nudge**, because that is what every drawing program does with them. With
  nothing selected any of these selects the first tile, so the keyboard can get
  started at all
- **Group (⌘G) and Ungroup (⌘⇧G)** — Bureau's *gather* (decision 24), as a
  website wants it. Select two or more notes, pictures or buttons and Group
  makes ONE holder out of them, taking the room they had between them so the
  board looks the same the moment after; its items are the objects themselves
  with their geometry taken off (`toItem`), and Ungroup gives them back a place
  (`fromItem` + `freeSpot`). **Drop a tile onto a holder and it is filed in**
  — the holder wears the green drop ring and the ghost steps aside, because
  the thing in hand is not landing on the board at all. The aim is the cell
  under the pointer, never `elementFromPoint`. All three are one undo step.
  A holder, a feed and a form cannot be held; a slot is the page
- **corner grips** resize; there are no edge handles
- **double click** the words and they become a field where they sit — the
  body or the title, never the whole tile, because a drawer front has a picture
  in it too. Click away keeps it, Escape reverts. What contenteditable produces
  is cleaned down to `a/em/strong/b/i/br` before it is stored
- **hold, or right click, or Enter** opens the object's **menu**: a short list
  of things to DO — Edit…, choose an image, edit the words, Duplicate, Lock,
  Delete, and on narrow "reset to derived position". It was one panel carrying
  every field and every action at once, which made the common case a hunt
  through a settings sheet and the uncommon case cramped in a 340px column
- **Edit…, or `E`,** opens the **object editor**, and it is where an object is
  changed rather than acted on. Three parts, in the order the model puts them:
  **what it is** (its kind — a preset, so changing it swaps the attributes and
  *keeps the data*), **what it carries** (a tick per attribute — this is the
  combination the whole design is built to allow and had no way of being made),
  and **its fields**, drawn from whatever it ends up carrying. Kind and
  attributes land at once, because both are questions about identity and you
  want to see the answer; the fields wait for Apply, because they are words
  being typed
- **Look** is the site's dressing: colours, type, pinned
- **Works** is the catalogue — one row per thing you have made, its section, its
  tags, its year and where it lives. It is site-wide, like the look, and
  publishes in the same commit. Apply keeps the panel open, because forty works
  are typed in over a while
- **There are no grid tabs either.** Each board wears its own name while
  unlocked — HEADER, FOOTER, the page — and the one you last touched is lit and
  is the one the bar acts on. A page beats chrome as the default, so opening a
  page puts you on the page
- **Board** is this grid's own geometry: how many columns across (which is how
  big one piece is), **the gap between cells**, a fixed height in cells, and
  floating or set. **The height is the one for the board you are looking at** —
  it wrote `rows` even on a phone, so the narrow height it was showing you
  could not be set at all. **Tidy** repacks it top to bottom, **Copy JSON**
  puts this board's file on the clipboard. **The header and footer are sized
  here** — touch one first, since it is the board you last touched that the bar
  acts on. A change recompiles the grid's inline CSS under its existing scope
  class so you see it immediately, rather than waiting for the site to rebuild
- **Board also carries the page**, for a board that is one: its **title**, a
  **description** (what a search result shows under the title, and what a
  shared link says) and a **picture for a shared link** — an `asset:` key, a
  `media:` file or a URL. They are fields on the layout (`title`,
  `description`, `image`), and both routes that render a board hand them to
  the site's shell — `routes/board.astro` for every page, and
  `routes/home.astro` for `/`, which is the one route the dynamic one cannot
  make. Base falls back to the
  site's line and wordmark when a board has none. Header and footer do not
  offer them
- **Pages** is the working list of every page there is, and **a page is a
  ROUTE** — a file in the site's `src/pages`, a page the tool makes
  (`TOOL_PAGES`), or a layout the board route turns into one.
  It used to be built from the layout files alone, which meant it listed
  exactly one page (`/links`) and every hand-written page was missing; and the
  href went out bare, so on the deploy subpath it was a 404. **Hrefs are
  resolved through `url()` in `LayoutEditor.astro` and travel to the editor as
  data**, because `DigiDesk` may not import `assets.js` (hard rule 4). A row
  says whether the page is a board or written by hand. **New page…** writes an
  empty layout file, pending until Publish, so a page no longer has to be born
  behind a drawer. Bureau's *desks* do not come over — a website has pages, and
  how a visitor gets between them is whatever you build out of objects and menus
- **Anywhere you say where something goes, the pages are offered** — a
  `<datalist>` on every `link` field, including a holder's rows. A mistyped
  path is a 404 nothing catches until a visitor finds it
- **There is no device toggle.** Which of the two stored layouts you are
  arranging is decided by the width on screen — narrow the window and you are
  editing narrow, because that is the board in front of you. A ResizeObserver
  watches the container, the grid being container-queried makes it the real
  thing, and the bar says which you are in rather than asking
- **⌘Z / Ctrl-Z** undoes, up to 20 steps — moves and text edits share one stack.
  **⌘⇧Z redoes**, and Redo is in the bar beside Undo. Bureau's decision 65:
  `applyStep()` applies a step backwards AND returns the step that would apply
  it forwards, so redo is the same function pointed the other way rather than
  a second set of cases — every kind of step (box, boxes, content, add, remove,
  group, ungroup, filed) says what its own inverse is. A new move clears the
  redo stack, because keeping it is how a redo comes to reinstate a change on
  top of a board it no longer fits
- **flick a tile off the left, right or top edge and it is thrown away** —
  Bureau's decision 112. Three things have to be true, so it is hard to do by
  accident: fast (past what a careful move ends at — velocity is smoothed, one
  pointer event's worth is noise; and a mouse has to be going nearly twice as
  fast as a thumb, because a mouse crosses a screen far faster than a thumb
  crosses a phone), let go at the very edge or past it, and
  travelling *out* through it. A slow carry to the edge is still a move that
  finds no room. Down is not an edge: below the board is more page, and the
  bar. The toast offers Undo
- **grips show on the selected tile**, not only on hover — a phone has no
  hover, and before this a tile could not be resized by touch at all
- **Done** leaves edit mode altogether, which is a different thing from the
  padlock: locked is still the editor, with a bar; Done is the site

Saving has three levels. **localStorage** holds work in progress and survives a
reload. **Copy JSON**, in the Board panel, gives you the file to paste into
`the site's `src/data/layouts/`` or to hand over for review.
**Publish sends everything at once** — every grid on the page that changed,
every picked image, any page a new drawer made, the look, and the works
catalogue if either changed — as **one commit** to `main`, and the site rebuilds in about a minute. It uses the
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
