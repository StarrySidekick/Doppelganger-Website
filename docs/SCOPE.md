# Scope: what it takes to actually replace Squarespace

Written September 2026, against the eleven things you asked for. This is a
scoping document, not a plan of record — nothing here is built yet. It exists so
the next session doesn't re-derive it.

The short version: **nine of your eleven requirements are cheap. Two are the
whole project.** The two are (a) content has to stop living inside `.astro`
markup, and (b) the site needs somewhere to keep binaries that isn't git. Every
other requirement is a small feature hanging off those two.

---

## 1. The organising idea: everything gets an address

You asked for "a way to get to each element." That is the right instinct and
it's worth making the spine of the whole design, because it's the thing the
current site fails at.

Right now the site has exactly one addressable thing: an element's **position**
(`src/data/layouts/links.json`, keyed by element id). Its **content** — the
email address, the social links, the card images — is markup inside
`src/pages/links.astro`. That markup is unreachable. The editor can move the
email tile but cannot change the email. Nothing but a code change can.

So: three namespaces, and every single thing on the site lives in exactly one of
them, reachable from the editor and from Claude by the same address.

| Address | Is | Lives in | Edited by |
|---|---|---|---|
| `page#element-id` | a tile — its position *and* its content | `src/data/pages/<page>.json` | in-page editor, or Claude |
| `collection/slug` | a blog post, a project | `src/content/<collection>/<slug>.md` | admin "new post", or Claude |
| `media/key` | an image, a gif, a song | R2 bucket + `src/data/media.json` | upload from the site, or a script |

If something on the site doesn't have one of those three addresses, it's a bug in
the model, not a special case. That rule is what keeps you from ending up back
where you are — with half the site editable and half of it stranded in markup.

---

## 2. The decision everything else follows from

You want two things that normally pull against each other:

- **Edit live, from the site, logged in** — which wants a database.
- **Keep queueing programmatic changes from Claude** — which wants files in git.

You don't have to choose, but you do have to split on the right seam. The seam
is **size and diffability**, not importance:

- **Text, structure, layout, tags, prices → git.** Small, diffable, reviewable,
  revertible. Claude can read and rewrite them. A bad edit is `git revert`.
- **Binaries → object storage.** Images, gifs, songs. Not diffable, and putting
  hundreds of MB into a git repo makes every clone and every build slower
  forever, permanently, because git history is append-only. This is not a
  preference; it's the one irreversible mistake available here.
- **Credentials and auth → a tiny server.** Which the site currently has none
  of, and which is the real reason to move hosts.

Git stays the source of truth for everything you'd want to review. R2 holds
everything you wouldn't. Both are reachable from the browser and from Claude.

---

## 3. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Astro** (keep) | Already here, already correct for this. No reason to churn. |
| Host | **Cloudflare Workers** (static assets + a few routes) | One origin that serves files *and* runs code. Static asset requests are free and unlimited; you only pay when a request actually invokes your code, which here means admin actions only. |
| Admin login | **Cloudflare Access**, policy = your email only | Free to 50 users. You get a real login screen and an identity header on the server side, and you write **zero** auth code. No passwords, no sessions, no reset flow, no leak. |
| Media | **R2** bucket + public custom domain | $0 egress. Songs and gifs stream straight out. |
| Image resizing | **Cloudflare Image Transformations**, remote-source mode | Replaces Squarespace's `?format=800w` trick exactly. Billed per *unique* transformation with 5,000/mo free — a few hundred images across four widths is well under that. |
| Publishing | Worker route → GitHub Contents API | Same mechanism `src/lib/publish.js` already uses, moved server-side. |
| Blog / projects | Astro content collections, Markdown + frontmatter | Tags and sorting come free. Claude edits them as files. |
| Forms | **Web3Forms** (already chosen) | Needs only a real access key. Don't rebuild what's already decided. |
| Commerce | **External checkout** — Stripe Payment Links, Lemon Squeezy, or itch.io | See §7. |

### About the recorded "Cloudflare rejected" decision

`CLAUDE.md` says Cloudflare was considered and rejected because "Cloudflare has
de-prioritised Pages in favour of Workers, and the unmetered-bandwidth advantage
solves a problem this site doesn't have."

Both halves of that were right and neither one applies to this scope:

- **Bandwidth is still not the reason.** It isn't why to move. Ignore it.
- **The Pages concern is right, so don't deploy to Pages.** Deploy to *Workers*
  with static assets — which is precisely the thing Pages was de-prioritised in
  favour of. The old decision points at the new target.

The actual reason to move is structural: **GitHub Pages serves files and nothing
else.** It cannot check who you are, cannot hold a secret, cannot accept an
upload. Requirements 2, 3, 7 and 10 on your list are all server-side by nature.
Today's editor works around this by asking the browser to hold a GitHub token in
`localStorage` — which `publish.js` documents honestly as a real exposure. That
workaround does not survive contact with "log in as admin"; it just moves the
credential somewhere worse. Moving hosts is how the token stops living in your
browser at all.

Everything else in that decision stands. This isn't a reversal; it's the same
reasoning meeting a requirement it hadn't been asked about.

### Cost

| | |
|---|---|
| Workers (static assets) | $0 — free and unlimited |
| Workers (admin routes) | $0 on the free tier's 100k requests/day; $5/mo if you ever want the paid tier |
| Cloudflare Access | $0 |
| R2 — 500 GB storage | ~$7.50/mo (first 10 GB free; **500 MB is $0**) |
| R2 — egress | $0, at any volume |
| Image Transformations | $0 under 5,000 unique/mo |
| Web3Forms | $0 to 250/mo |
| Domain | ~$12–20/yr |
| **Realistic total** | **$0–5/mo**, against ~$276/yr for Squarespace Business |

Verified September 2026. Sources at the bottom.

---

## 4. The actual work: inverting the content model

This is the large one. Everything else is small.

Today a page is a **hand-written document** that happens to consult a layout
file. It needs to become a **renderer** that draws whatever the data says.

```
Today                              After
─────                              ─────
links.astro   markup + ids         pages/links.json   ids + type + content + geometry
links.json    geometry only        links.astro        ~10 lines: read data, render types
```

Concretely, `src/data/layouts/links.json` grows from geometry into the whole
tile, and moves to `src/data/pages/`:

```jsonc
{
  "columns": 24, "rowHeight": 26, "gap": 8, "reflowBelow": 700,
  "elements": [
    { "id": "email", "type": "text",
      "desk": { "col": [2, 8], "row": [9, 2] }, "flow": "stack",
      "content": { "html": "Email: <a href=\"mailto:…\">…</a>" } },

    { "id": "card", "type": "flipcard",
      "desk": { "col": [10, 6], "row": [5, 8] }, "flow": "full",
      "content": { "front": "media/card-front", "back": "media/card-back" } }
  ]
}
```

One file per page, holding both position and content, because the element id is
already the join key between them and one file means one commit means one atomic
publish. Splitting geometry and content into parallel files keyed by id is the
obvious alternative and it's a trap — the two drift and nothing catches it.

`normalizeLayout()` already migrates v1 (single box) to v2 (desk/narrow). This is
v3, and it migrates the same way: an element with no `type` is `type: "html"`
with its current markup captured as content. Nothing has to be rewritten by hand.

**Element types are the extensible spine.** Each type is one directory: a render
component, an editor panel, a schema. Adding "audio player" or "youtube" is
adding a directory, not touching the engine.

```
text · richtext · image · gallery · audio · youtube · embed
flipcard · link · spacer · collection-list · project-grid · form · buy
```

That registry is also, precisely, the thing your last bullet describes. A web
design suite is an element registry, a grid engine and an editor that reads
both. You already have two of the three. **So one architectural rule is worth
adopting now, while it's free:** `src/lib/` (the engine, the editor, the
registry) must not import from `src/data/` or `assets.js`. The engine may not
know this is Timothy's website. That boundary costs nothing today and is
expensive to retrofit once twenty things have reached across it.

---

## 5. How each requirement lands

| # | You asked for | Verdict | What it takes |
|---|---|---|---|
| 1 | Grid placement, rigid, separate desktop/mobile | **Already built** | `adaptive-grid.js` does this. `boxOk()` already refuses overlaps rather than shoving — that *is* "rigid, less flowy." Two stored layouts per element already exist. Nothing to do. |
| 2 | In-site edit mode, admin login, move + edit text | Auth: **small**. Text editing: **medium** | Access gives the login. Moving already works. Editing text is a `contenteditable` panel per element type — which only becomes possible after §4. |
| 3 | Hundreds of MB, dozens of songs, gifs, video | **Small, once R2 exists** | R2 direct, `<audio>` over range requests. Note: the deploy bundle caps individual files at 25 MiB, so media must live in R2 regardless — which is where it belongs anyway. |
| 4 | Groundwork for selling a few tools | **Small** | A `buy` element type + `src/data/products.json`. See §7. |
| 5 | Header and footer | **Small** | `SiteChrome.astro` becomes `src/data/chrome.json`, rendered by the same grid engine with its own scope. Editable by the same editor. Reuses everything. |
| 6 | Web form → email | **Nearly done** | Web3Forms is wired; the access key is a placeholder and the submit button is disabled until it's real. Roughly a five-minute job whenever you want it. |
| 7 | Add a blog post from admin mode | **Medium** | Content collections + a "New post" panel that commits a `.md` through the same publish route. |
| 8 | Cheap and stable | **$0–5/mo** | See the table above. |
| 9 | Keep programmatic changes from Claude | **Preserved by design** | Everything textual stays a file in git. This gets *better*, not worse — Claude can currently only edit geometry; after §4 it can edit content too. |
| 10 | Load assets from the site and from Claude | **Medium** | Two paths, one manifest. See §6. |
| 11 | Projects, tagged and sortable | **Medium** | `src/content/projects/*.md` with `tags:` frontmatter, rendered by a `project-grid` element with filter and sort controls. |

---

## 6. The media pipeline

Two ways in, converging on one manifest — that convergence is the whole design.

```
Browser  ──▶ POST /api/admin/media ──┐
(Access-gated)                       ├──▶ R2 ──▶ media.json committed to git
Claude   ──▶ scripts/upload-media ───┘         (key, width, height, type, alt)
```

`assets.js` stops being a hand-maintained list of Squarespace URLs and becomes a
resolver over `media.json` — which is exactly the indirection that file was built
for, finally used for its stated purpose.

**This also retires the Squarespace CDN dependency.** `CLAUDE.md` notes it isn't
urgent while the subscription runs, but becomes a hard deadline the moment you
cancel — every image on the site is currently served by the thing you'd be
cancelling. Building this pipeline turns that from a scheduled emergency into a
non-event, and Image Transformations reproduces the `?format=Nw` resizing that
took the homepage from 15.3 MB to 0.7 MB. Don't lose that on the way across.

---

## 7. Commerce, deliberately shallow

You said external checkout is fine, which saves you an enormous amount: no cart,
no payment handling, no tax logic, no PCI scope, no fraud, no refunds code.

Groundwork is three small things:

1. A `buy` element type: `{ title, blurb, price, checkoutUrl, media }`.
2. `src/data/products.json` — a few entries.
3. A `/tools` page listing them.

The checkout URL points at **Stripe Payment Links** (a URL you create in
Stripe's dashboard, no code), **Lemon Squeezy** (handles VAT and digital
delivery, takes a larger cut), or **itch.io**, which you already use for
Composer's Key. Digital file delivery is the provider's problem.

The upgrade path, if you ever outgrow it: swap `checkoutUrl` for a Worker route
that creates a Stripe Checkout Session. The element schema doesn't change. That's
what makes this groundwork rather than a dead end.

---

## 8. Phases

Ordered by what unblocks what. Sizes are relative, not calendar estimates.

| | Phase | Size | Unblocks |
|---|---|---|---|
| 0 | Move the ground — Workers, domain, Access on `/admin`, drop `base` | S | everything |
| 1 | **Content model inversion** (§4) — element types, pages as data | **L** | 2, 4, 5, 11 |
| 2 | Publish server-side; token leaves the browser; edit text in place | M | the whole point |
| 3 | Media — R2, upload both ways, `assets.js` as resolver, pull assets across | M | 3, 10; kills the CDN dependency |
| 4 | Collections — blog + projects, tags, sorting, "new post" | M | 7, 11 |
| 5 | Header and footer as editable chrome | S | 5 |
| 6 | Commerce groundwork | S | 4 |
| 7 | Parity — `/uiux` (40 images), the six blog collections, DNS cutover | M | cancelling Squarespace |

Phase 0 is worth doing even if you stop immediately afterwards: it drops `base`
from `astro.config.mjs`, which `CLAUDE.md` already identifies as the only change
required to move to the real domain.

Phase 1 is the one that matters. Everything after it is small *because* of it.

---

## 9. Things I'd flag before you commit

- **This is a CMS.** You are building one. That's a real scope, and it's worth
  naming rather than discovering in month three. The honest alternative is
  Sveltia or Decap CMS — git-backed, free, admin login and a media library out of
  the box, roughly a day of work. I'm not recommending it as the primary,
  because they give you *form-based* editing and the drag-the-grid editor is the
  entire reason this project exists. But if Phase 4 drags, bolting one of them on
  for **just the blog** is a legitimate shortcut that doesn't compromise anything
  else.
- **Publish latency is 1–2 minutes** (commit → build → deploy), which you said is
  fine. Two hazards: rapid successive publishes can queue and race, so the
  publish route should debounce; and a publish while a build is running needs to
  not silently lose. Worth a queue, not worth a database.
- **Concurrent edits conflict.** If Claude pushes while you're editing, GitHub
  returns 409 and you lose the in-progress edit. `publish.js` already handles
  this with a "reload and republish" message. With one author it's a non-issue —
  but don't let me push to `main` while you're in edit mode.
- **Cloudflare Access is a real login screen in front of your own site.** That's
  the feature, but it means an expired session interrupts editing. Set a long
  session duration.
- **Don't put media in git.** Repeating it because it's the one mistake here that
  can't be undone — git history is append-only, so a 300 MB blob committed once
  is 300 MB in every clone forever, even after deletion.
- **The engine boundary from §4** (`src/lib/` importing nothing site-specific) is
  free today and expensive later. It's the difference between "my website" and
  "the thing I could release."

---

## 10. What I'd do first

Phase 0, standalone, in an afternoon: stand the site up on Workers, put Access in
front of `/editor`, confirm you get a login screen and the site still looks
right. It's small, it's reversible, it proves the whole auth story, and it
answers the only question in this document I can't answer from a desk — whether
a real login in front of your own site feels good to use or feels like a wall.

If it feels good, Phase 1 is worth the weight. If it doesn't, better to know
before inverting the content model.

---

### Sources

Verified September 2026:
[R2 pricing](https://developers.cloudflare.com/r2/pricing) ·
[Zero Trust free tier](https://costbench.com/software/business-vpn/cloudflare-zero-trust/free-plan/) ·
[Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) ·
[Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/) ·
[Images pricing](https://developers.cloudflare.com/images/pricing)
