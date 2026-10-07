# DigiDesk and the StarrySidekick website

> **Read [`INTENT.md`](INTENT.md) first.** It records what this project is for
> and what Timothy wants next, in his own words, dated. Where it disagrees with
> these files about *direction* it is newer and wins; where it disagrees about
> *mechanics* (how the code works, what was decided deliberately, the
> invariants) these files win.

**Two separate things live in this repository, in two folders** (Timothy,
2026-10-07: "there is my personal website replication of starrysidekick.com,
which is a project, and then there's the actual tool itself (digidesk), and
those are two separate things"):

| Folder | What it is | Its notes |
| --- | --- | --- |
| `digidesk/` | **The tool.** A website builder where everything sits on a grid: Bureau's object model for the web. The grid engine, objects and kinds, faces, the in-page editor, publishing, the look, 3D models, the app layer. An Astro integration and a package named `digidesk`. | [`digidesk/CLAUDE.md`](digidesk/CLAUDE.md) |
| `site/` | **The project built with it.** A self-hosted rebuild of **timothyvlangas.com** (brand: StarrySidekick.com), replacing a Squarespace 7.1 site. Its layouts, catalogue, look, pictures, page shell and its own custom kinds. | [`site/CLAUDE.md`](site/CLAUDE.md) |

They are in one repository **for now, for ease of use**, and will be split
later (Timothy, 2026-10-07: "let's keep them inside one repo for now for ease
of use then split them later"). Everything below is arranged so that the split
is moving a folder: the tool never imports the site, the site imports the tool
only by its package name, and a test fails the moment either changes.

Timothy is a designer, fluent in CSS, new to terminals and git. Explain what a
command does before running it. Don't assume git vocabulary.

**DigiDesk is Bureau, plus what a website needs, not a reimplementation of
Bureau.** Bureau (`StarrySidekick/Bureau`) is a life-organisation app with a
grid-based, object-based system, and it has already solved most of what an
editor on a phone gets wrong. Where the tool needs a thing Bureau has, **port
it from Bureau's source** rather than re-deriving it from its docs. Bureau
itself stays as it is: it is ported *from*, never changed for DigiDesk.
`digidesk/docs/BUREAU-PORT.md` is the inventory of what has come over and what
is next.

## How the two are wired

npm **workspaces** link the folders: one `npm install` at the root puts a
link to `digidesk/` inside `node_modules/`, and `site/` depends on it as
`"digidesk": "*"`. So the site always builds with the tool exactly as it is in
the same commit.

The site hands itself to the tool in **one place**, `site/astro.config.mjs`:

```js
integrations: [digidesk({
  shell: './src/layouts/Base.astro',   // the page every board is put inside
  assets: './src/assets.js',           // pictures by asset: key
  custom: './src/custom/index.js',     // the site's own kinds
  publish: { owner, repo, branch },    // where the editor commits
  storage: 'doppelganger',             // this browser's saved work
  app: { name, short, icons, … },      // the installable app
})]
```

DigiDesk brings everything else: a page for every layout, the home page, the
board editor (`/editor`) and 3D editor (`/modeler`), the app's manifest and
worker, `/version.json`. A page the site writes in `site/src/pages/` always
wins over the one the tool would make at that address.

**Room for anything the tool does not do** is `site/src/custom/`: kinds the
site brings with it, drawn by the site's own code, that are objects like any
other on a board (see its README and `digidesk/src/custom.js`). The small
version is the `html` object, which is markup and never runs a script. The
biggest version is a hand-written page in `site/src/pages/`.

## Working on one or the other

- **A change to the tool** goes in `digidesk/`, with its tests in
  `digidesk/src/*.test.js` or `digidesk/test/`. Start the commit message with
  `DigiDesk:`. It deploys with the site, because the site builds with the tool
  as it is in that commit.
- **A change to the website** goes in `site/`. Start the commit message with
  `Site:`. Most site changes are made from the editor's Publish button, which
  commits under `site/` for you.
- **A kind that only this site wants** goes in `site/src/custom/`. When it
  turns out to be useful on any site, move it into DigiDesk as a built-in.
- **A change that needs both** is two commits, the tool's first.

Each half has its own number (see *Which build is this*), so "which DigiDesk
is the live site on" and "which site build is live" are separate questions
with separate answers.

## Commands

All from the repository root.

```bash
npm install
npm run dev        # the site at localhost:4321/Doppelganger-Website, hot reload
npm run build      # → site/dist/
npm run preview    # serve the built output
npm test           # both suites: the tool's, then the site's
npm run test:tool  # DigiDesk only (engine, objects, editor rules, the seam)
npm run test:site  # the site's own facts (layouts, catalogue, links, deploy)
npm run widgets    # build Squarespace code blocks → site/widgets/dist/
```

Deploy is automatic: push to `main` → GitHub Actions installs, runs both
suites, builds `site/` → GitHub Pages.
Live at https://starrysidekick.github.io/Doppelganger-Website/

**Which build is this?** The version IS the commit count, as `0.NN`: Bureau's
scheme (its `persist.js`), for its reason: a number chosen by hand says nothing
you can check. The 54th commit is `0.54`; the 100th will be `1.00`. It is
derived at build time by `digidesk/version.mjs`, so there is no number to
forget to bump, and a working tree with uncommitted changes reads `0.54+`.
**There are two numbers**: the site's is every commit in the repository (every
commit can change what is deployed); DigiDesk's is the commits that touched
the tool (`digidesk/`, and `src/lib/` where it lived before), so it moves only
when the tool does. Both reach you three ways:

```bash
curl https://starrysidekick.github.io/Doppelganger-Website/version.json
```

…that (`build` is the site's, `digidesk` the tool's), a `<meta name="build">`
in the head of every page, and the editor's bar (`v0.62 · DD 0.41`).
**Pressing the version in the bar asks the site what is live**; the button goes
amber with an arrow when the site has rebuilt past the page you are looking
at. Publish starts watching on its own and says "Live now" when the deploy
lands.

**`fetch-depth: 0` in `deploy.yml` is load-bearing.** `actions/checkout`
defaults to a shallow clone, where `git rev-list --count HEAD` answers 1, so
every deploy would publish `0.01`. A test asserts it. The same goes for a local
shallow clone: its count is a lie.

## Hard rules

These hold across both folders. Each half's notes have the rest.

**0. Element ids in a grid are global, exactly like keyframe names.**
`compileCSS()` *requires* a scope and throws without one. Two unscoped grids on
one page used to overwrite each other's column count and every shared id.
`AdaptiveGrid.astro` derives the scope from the layout via `scopeFor()`, so
every caller gets one. Anything new that compiles a layout must pass one too.

**1. Never use a generic `@keyframes` name.** On Squarespace, a keyframe named
`spin` collided with the platform's own `spin` and silently rotated the
business card on the wrong axis for months. Keyframe names are not scoped by
specificity: the last definition of a name wins outright. Always prefix:
`cardSpinY`, not `spin`. A custom kind prefixes its classes and keyframes with
its own name. Avoid: spin, fade, pulse, slide, bounce, shake, float, rotate,
grow, blink, scroll, wobble, flip, zoom, wiggle, shimmer, glow, drift, sparkle.

**2. All internal links go through `url()`** (`digidesk/src/url.js`, which the
site's `assets.js` re-exports). The site deploys to a subpath
(`/Doppelganger-Website`), so a bare `href="/links"` silently breaks
navigation, and the home page is `/Doppelganger-Website` with no trailing
slash. `joinBase()` is the pure half, tested without a bundler.

**3. Never change a URL path.** Slugs match Squarespace exactly so that when the
real domain moves across, nothing needs redirecting. `trailingSlash: 'never'`
and `build.format: 'file'` exist for this reason. Do not "tidy" a route.

**4. The tool never imports the site.** Nothing in `digidesk/` may import a
file in `site/`, name the site's repository or domain in code, or glob for the
site's files itself. The site's facts reach the tool through the integration's
options and the three modules it generates (`virtual:digidesk/site`,
`virtual:digidesk/custom`, `virtual:digidesk/shell`; see
`digidesk/index.js`). The site imports the tool as `digidesk/…`, never as
`../../digidesk/…`. `digidesk/test/boundary.test.mjs` fails on any of it. This
is what makes the later split a move of a folder.

**5. Verify visually, not just by build success.** A green build proves nothing
about layout. Screenshot at desktop and mobile widths before claiming done, and
check in WebKit at an iPhone's size: Timothy works on an iPhone. Three real
bugs shipped or nearly shipped past a passing build: the flip card overflowing
its cell, the sun at 100vw, and `Email:` losing its space to a flex container.

## Layout of the repository

```
package.json                 the workspace: digidesk/ and site/
.github/workflows/deploy.yml install, test both, build site/, deploy

digidesk/                    THE TOOL
  index.js                   the Astro integration: options, routes, virtual modules
  version.mjs                the build stamp, both numbers
  src/                       the engine and the editor (one module per concern)
  components/                AdaptiveGrid, LayoutEditor, Head, Scripts
  routes/                    pages the tool makes: board, home, editor, modeler, app files
  styles/faces.css           how each face draws
  test/                      the seam, the editor's rules, fixtures
  docs/BUREAU-PORT.md        what has come over from Bureau, and what is next

site/                        THE WEBSITE
  astro.config.mjs           base, redirects, and digidesk({ … })
  src/data/layouts/*.json    every board: pages, header, footer
  src/data/look.json         colours, type, pinned or flat
  src/data/works.json        every work, its section and its tags
  src/assets.js              every remote picture
  src/layouts/Base.astro     the page shell: SEO, fonts, header and footer
  src/components/            SiteChrome (header and footer), FlipCard
  src/custom/                the site's own kinds
  src/pages/                 pages written by hand (404)
  public/                    icons, favicon, media the editor commits
  widgets/                   Squarespace code blocks
  scripts/site.test.mjs      the site's facts
  docs/SCOPE.md              what it takes to leave Squarespace
```

## When the split comes

1. `git subtree split --prefix=digidesk` (or `git filter-repo`) carries the
   tool's history into a new repository, `StarrySidekick/DigiDesk`.
2. The site's `package.json` changes `"digidesk": "*"` to
   `"github:StarrySidekick/DigiDesk#v0.NN"`: a tag, so the site moves to a
   new tool only when that line changes.
3. `site/` becomes the website repository's root. Publish keeps working with
   no change: the integration asks git where the site sits, so its prefix goes
   from `site/` to nothing on its own.
