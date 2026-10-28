# StarrySidekick website: working notes

The project. Read the repository's [`CLAUDE.md`](../CLAUDE.md) first: it says
what lives here and what lives in `digidesk/`, and holds the hard rules.

Self-hosted rebuild of **timothyvlangas.com** (brand: StarrySidekick.com),
replacing a Squarespace 7.1 site. Runs in parallel with Squarespace until it
reaches parity. It is built with DigiDesk, and it is where Timothy may "start
adding crazy stuff": that goes in `src/custom/` (kinds of his own, drawn by
this site's code) or, for a whole page of its own, in `src/pages/`.

**What is the site's, and only the site's:** `astro.config.mjs` (the base, the
redirects, and everything it tells DigiDesk), `src/data/` (every layout, the
look, the catalogue), `src/assets.js`, `src/layouts/Base.astro` (the page
shell: SEO, fonts, header and footer around every page), `src/components/`,
`src/custom/`, `src/pages/404.astro`, `public/`, `widgets/`, and
`scripts/site.test.mjs`. Everything else a page is made of is DigiDesk's, and
a change to how the board, the editor or an object works is a change to the
tool, not to the site.

**This is what is being built now (2026-10-28).** The tool is parked;
`INTENT.md` at the root has Timothy's page list in his words and where each
page stands.

## The site's pages (October 2026)

Every page is a board of objects, as before. What changed is what the section
pages are made of: **each thing on them is one object of a kind the site
brings itself** (`src/custom/`), drawn in Timothy's chalk hand, carrying its
own words and links under `data`. To add a film, a game, a record, a piece or
an invention, **duplicate one on its page and change its fields** in the
object editor (hold it, Edit…): nothing to type into a file, and it works
from the phone.

| Page | Layout | Made of | Content came from |
| --- | --- | --- | --- |
| `/` | `index.json` | the live home page's objects; six section buttons; the portrait links to `/about` | the live site |
| `/film` | `film.json` | `film`: a frame of 35mm film per credit | his Backstage crew profile |
| `/games` | `games.json` | `trading-card`: turns over when pressed; Play on the back | itch.io and the live `/uiux` |
| `/music` | `music.json` | `disc` per song, one `turntable`, a `heading` per crate | the SoundCloud playlist the old player used |
| `/inventions` | `inventions.json` | `invention`: a patent sheet | Bureau and DigiDesk, from this repo's own notes |
| `/art` | `art.json` | `art-frame` per picture, a `heading` per room; press opens a lightbox | the 40 pictures on the live `/uiux` |
| `/writing` | `writing.json` | the bookcase carousel, seven books | the live site |
| `/about` | `about.json` | the portrait, a heading, a note | his own Backstage "About me", lightly edited |
| `/contact` | `contact.json` | the `form` kind, dressed like live in `Base.astro` | the live site |
| `/links` | `links.json` | the live pieces, in labelled groups | the live site |

`/uiux` was a Squarespace page and is now a redirect to `/art`, where its
pictures hang (`astro.config.mjs`). `/works` (the catalogue's everything page)
is still built and still empty, and nothing links to it.

### The kinds, and what to know about each

The contract for a kind is `src/custom/README.md`. All of them stand down while
the board is unlocked (`arranging()` in `parts.js`), so a press arranges
rather than flips, plays or opens; locked, they behave as a visitor's do.

- **`sketch.js` is his hand.** Seeded wobbly lines, torn-paper squares, hand
  circles, his curling vines, and the **boil**: every drawing traced three
  times, 200ms a frame, which is the rhythm of every GIF on the Squarespace
  site (measured: 3 frames, 200ms each). Seeded so a rebuild draws the same
  thing. `sketch.css` turns the frames over; the same rules are inside every
  placeholder SVG, and a test holds the two copies together.
- **`film`** is a strip frame. Desk: two columns. Phone: one, taller. With no
  picture it draws a clapperboard.
- **`trading-card`** turns on a press (or Enter), and the face turned away is
  `inert` so Tab cannot reach it. His holo picture is the foil, in a
  light-only blend, and follows a mouse. Art is the object's own picture.
- **`disc` and `turntable` share `player.js`**, one player for the page, so
  one record plays at a time and the next on the page follows when one ends.
  **SoundCloud's widget can only play, pause, seek and set the volume.** So the
  manipulations are built on seeking: tap the grooves to drop the needle (outer
  edge is the start, the label's edge the end), hold the record and turn it to
  scratch (one turn is 1.8s, 33⅓ rpm; the sound stops under your hand), loop,
  back and forward. **Speed (33/45/78, pitch with it) needs a record whose
  song is a file** (`data.audio`, an address of an mp3 hosted somewhere other
  than this repository); the buttons hide otherwise. Measure the record off
  the platter, never the record: it is rotated, and a rotated square's box is
  up to 1.41 times wider (that bug was caught by driving it).
- **`art-frame`** fits the picture whole. Its lightbox is one per page, hung
  off `<html>` (the sun's filter on `<body>` would otherwise make it open at
  the top of the page, the corner dot's bug), walks every frame in reading
  order, takes Escape, arrows and a swipe, and keeps Tab inside itself. It
  asks the CDN for the picture at 1500 wide.
- **`invention`** is a patent sheet with a rubber stamp for its status.

### Placeholder art

`npm run placeholders` (`scripts/placeholder-art.mjs`) draws every picture that
Timothy has not drawn yet into `public/media/placeholder/`: the Films,
Inventions and Art buttons, the Interactive Novels cover (an overlay of the
bookcase like his six, tinting the game controller and book on top of the
case), the itch.io icon and a "Coming soon" sign. Words are drawn with **EMS
Elfin**, a single-stroke pen-plotter font from the `hersheytext` package
(OFL), because his letters are single strokes and an SVG shown as a picture
cannot load a web font anyway. Each is named in `src/assets.js` under
`LOCAL`; **to replace one with his drawing, put his file in `public/media/`
and change that line.** `LOCAL` uses getters because `url()` needs the
bundler's base and the tests run in plain node.

### Tests that hold this together

`npm test` registers the site's kinds the way the build does (and stubs their
stylesheets with `scripts/no-css.mjs`, since node cannot import CSS), so every
board's objects are validated, and checks: every custom object draws, the two
copies of the boil agree, every placeholder file exists, the home page goes to
every section and the portrait to About, and `/uiux` still lands.

### Traps

- **The Works panel drops fields it does not show.** It rebuilds each work
  from its six inputs, so a `media` (or anything else) on a work in
  `works.json` is deleted by the next Apply. Nothing shown uses the catalogue
  now, which is why it was left; fix `readWorks()` in `digidesk/src/editor.js`
  before anything depends on it.
- **A container query cannot style its own container.** `@container x (…)`
  reaches what is inside `x`. The turntable's phone layout did nothing until
  its grid moved to an inner element (`.ss-deck-in`).
- **The board is rigid.** A note longer than its box clips, on a phone
  especially (About's words needed 46 rows there). Give a box room.

### The Squarespace pieces, as objects (September 2026)

The live site was measured in a real browser at 1440 and 390 wide and rebuilt
on the boards: `/`, `/links`, `/writing`, `/music`, `/contact`, plus the
header. Everything it was made of that had no object is now a general piece
of the tool rather than site code:

- **Faces `cutout` and `lettering`.** A cut-out fits a picture whole inside
  its box, never cropped, nothing behind it — how a Squarespace image block
  drew every GIF here. Lettering is words in the display face, centred.
- **`media.over`** — a second picture laid over the first. The bookcase's
  books are an animated layer over a still shelf.
- **`arrange: 'carousel'`** — a holder shows one item at a time over its own
  picture, with back / Go / forward keys (`controls: {prev, go, next}`). An
  item with `area: [left, top, width, height]` in percent of the picture is a
  hotspot: point at it and it shows, press it and you go. That is /writing.
- **`onclick: 'shuffle'`** — the sun. A press tints the whole page at random,
  a three-second hold puts it back, remembered per page. Never while editing:
  a filter on `<body>` would make body the containing block of the fixed bar.
- **Form fields `first` and `last`**, drawn side by side.
- **`header: false` on a page's layout** hides the site header — Squarespace's
  home page did (its custom CSS says `body.homepage #header{display:none}`)
  and drew its own sun. A tick in the Board panel.

**The page boards are 48 columns on a desk and 16 on a phone**, and so are the
header and footer (a test holds header and footer to the same count). At 1440
that is a 28.8px cell, fine enough that a box measured off the live site lands
within about 15px of where it was; 24 columns could only hit every 58px. The
footer was doubled exactly, so it looks as it did.

**What still differs, knowingly:** the bookcase starts under our header rather
than tucked up behind it, so it sits ~86px lower; the contact form wears the
tool's dark fields, not Squarespace's white ones, and has no Web3Forms key yet;
the footer exists here and not there; the home page's hidden lower section
(cassette, a second card, "Dark Piano") is not rebuilt because a visitor never
sees it; Spotify on /links is left out because it sat hidden under the QR code.

## History: the editor came first (September 2026)

Kept for the decisions in it; the direction it describes is superseded by
`INTENT.md` (2026-10-28).

**The rebuild is active again, and the order changed.** It was parked in August
because content couldn't be edited; that is the thing now being fixed. See
`docs/SCOPE.md` for the full plan — the short version:

- Everything except large media can be built **on GitHub Pages as it stands**.
  No server, no auth, no hosting move. So the migration is deferred and the
  editor comes first.
- Edit mode is the "admin mode", and it is deliberately not access control. The
  corner target and `?edit=1` are both things anyone can find, and that is fine
  because **saving needs a token that only ever exists in Timothy's browser** —
  a stranger can rearrange tiles in their own session and change nothing for
  anyone.
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
  settings panel — and it is the only kind of content the site has: every page
  is a board and every page's boards are empty, so there is no markup left to
  convert. See **Current state**.
- **Header, footer and image upload are done.** Chrome is two layouts on every
  page; images are picked or dropped in the editor and committed with the
  layout.
- **The object model is Bureau's, and the editor is a desk.** Lock, checkerboard,
  a picker that makes notes, images, buttons and drawers, faces, and a look
  panel. A drawer makes a page. This is the point at which the thing under
  DigiDesk (`digidesk/`) stopped being "the editor for this site" and became the tool.
- **There is a catalogue, and a feed is a query.** September 2026: `works.json`,
  the `feed` attribute and the `works` kind, tag chips live for a visitor, and a
  Works panel that publishes with everything else. The six sections and the
  everything page are built on it.
- **A hold opens a menu of things to do; Edit… opens the object editor.** Which
  is also where a kind can be changed and an attribute ticked — the combination
  the model was built for, finally reachable.
- **The board is a plain grid, a holder can be filled, and a page can be made
  without a drawer.** September 2026: the gap defaults to 0 and is per-board;
  `items` is a field; Pages lists every route and its links work; selection and
  the arrow keys; Duplicate; Copy JSON is back; the height field follows the
  device. Two live bugs went with them — `url('')` pointing at a 404, and
  `/editor` emitting duplicate ids.
- **The gesture layer is Bureau's, ported from source.** September 2026, the
  second pass: `clearGestureState()` as the one teardown; a gesture with one
  owner; no `touch-action`, a `dragArmed()` predicate instead; the sketch from
  arithmetic; one selection for the page; the lasso; group drag; `decor`; the
  undo toast; the edge pan; keyboard walking; redo; the throw; `paint()`
  asserting the whole board from the model. Group into a holder and drop into
  one (Bureau's gather); a `form` kind that emails you; a page's own title,
  description and share picture in the Board panel. Five Playwright harnesses
  in the session scratchpad drove every one of these in a real browser before
  it was committed — there is no editor test that presses anything in the
  repo, and there should be; `scripts/` is the place.
- **Every page is a board, and every board is empty.** September 2026: the
  four hand-written pages carried over from Squarespace were removed and the
  page layouts cleared, so the whole site is rebuilt from the picker. That is
  the state to expect — see **Current state**.
- The remaining work to replace Squarespace is: fill the boards; build the six
  blog collections; pull the assets local.
- **The asset dependency is no longer urgent.** Every image still comes from
  Squarespace's CDN, and the `?format=` resizing that took the homepage from
  15.3 MB to 0.7 MB depends on it. While the subscription continues that is
  fine. It only becomes a deadline if cancelling — pull assets into `/public`
  and repoint `assets.js` *before* the renewal date, not after.

## Current state (October 2026)

Every page in the table above is built and carries content. What is not done
is in `INTENT.md` under "What is next": his genre principles for the crates,
his words and titles for the art, the collection pages behind the bookcase,
the contact form's key, his drawings for the placeholders, and a check on the
iPhone itself (only an iPhone-sized Chromium was available; WebKit was not).

**No URL changed** (hard rule 3). The build emits `/`, `/film`, `/games`,
`/music`, `/inventions`, `/art`, `/writing`, `/about`, `/links`, `/contact`,
`/works`, `/editor`, `/modeler`, `/404` and the redirects `/contact-1` and
`/uiux`. `/about` is new. `/` is the one route the dynamic route cannot make;
the tool makes it from `layouts/index.json` (`digidesk/routes/home.astro`), so
the site has no `index.astro`, and writing one would take `/` back.

The live site's other addresses, which the domain move must keep: the six
writing collections and their posts, `/home`, `/secret-poem-1`,
`/hello-hypixel-studios`, `/becauseimeanit26` and `/physics-test`. Taken from
its sitemap, 2026-10-28.

`FlipCard.astro` is kept but nothing renders it; the business card on /links
is the tool's `card` kind.

## Decisions already made — don't relitigate

- **Font: EB Garamond**, not Adobe Garamond Pro. Adobe Fonts cannot be self-hosted
  and stops working when the Squarespace subscription ends. Timothy accepted a
  close match. Amatic SC (display face) is OFL and self-hostable.
- **Assets still load from Squarespace's CDN**, via `src/assets.js`. This is
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
- **Contact form uses Web3Forms** (250/mo free, static-friendly). It is now an
  OBJECT — the `form` kind, carrying the `form` attribute: `{key, fields,
  button}`, drawn from the picker onto any board, its fields chosen from name,
  email, subject and message. `interact.js` sends it with fetch so a visitor
  stays on the page, and a browser with no script still gets the plain POST.
  **With no key the button is disabled and the form says so** — a form that
  looks live and drops every message is the worst thing a contact page can
  do. The key is public by design (it is in the page for anyone to read), so
  it is data like everything else and travels in the layout. The hand-written
  `/contact` still stands with its placeholder key; drop a form object on a
  board and give it the real key when there is one.
- **Hosting stays GitHub Pages for now.** Cloudflare was considered and rejected
  for the moment — Cloudflare has de-prioritised Pages in favour of Workers, and
  the unmetered-bandwidth advantage solves a problem this site doesn't have.
  Revisit only if serverless functions are needed.

## Config gotchas

`astro.config.mjs` sets `site` and `base` for project-Pages hosting. **Both come
out when this moves to the real domain — that is the only change required.**
`base` is a `const` at the top of that file because the redirects map needs it
too.

**The CSS minifier drops `-webkit-` prefixes it thinks the target does not
need, and it dropped every `-webkit-user-select`.** Safari only took
`user-select` unprefixed in 17, so on an older iPhone the entire "holding a tile
must not select text" ruleset silently did nothing and only the JS guards were
working. `vite.build.cssTarget` names Safari 14 to keep them; it is set by
DigiDesk's integration (`digidesk/index.js`), since the rules are the editor's. Nothing else about the output changes — `color-mix`, which the look
depends on, is emitted as written.

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
