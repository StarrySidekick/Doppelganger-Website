# Intent

What this is for, and what to build next. Recorded **2026-09-06** from Timothy's
own answers to a direct set of questions, so this is *stated* intent rather than
intent inferred from the code.

**Read this before choosing what to build.** Where it disagrees with the rest of
the docs about **direction**, this file is newer and wins. Where it disagrees
about **mechanics** — how the code works, what was decided deliberately, the
invariants — the other docs win, always.

When something here is done, or turns out to be wrong, **edit it**. A stale
intent file is worse than no intent file.

## What it is for

Two things share this repo, and they are not equally important right now.

**The tool (DigiDesk) is what Timothy wants pushed on.** The website is the
guinea pig that proves the tool works, not the deliverable.

## What is next

DigiDesk: the engine, the editor, the object model, the faces. The useful
question is what a person building a page would reach for and not find.

**One answer taken 2026-09-06: copy and paste (⌘C / ⌘V), across boards and
across pages.** Duplicate put a copy beside the original and there was nothing
that crossed a boundary — so a nav item made on the page could not be moved into
the header, and anything wanted on a second page had to be built twice. The
clipboard is `localStorage` rather than a variable, and deliberately: each page
is its own document, so an in-memory clipboard dies on exactly the navigation
worth supporting. Ids are re-assigned on landing, because ids are global to the
document (hard rule 0), which also makes pasting onto the board you copied from
a duplicate rather than a collision.

**Two things it turned up that are worth knowing.** The keyboard handler returns
early when nothing is selected, and clicking another board clears the selection —
so paste has to sit *above* that gate or it can never fire on the board you just
moved to. And on `/editor`, more than one editor instance answers to the active
board name, so a single ⌘V pasted twice there while behaving correctly on a real
page; the event is stamped so one press is one paste, but **the underlying
`/editor` name collision is still there** and would bite anything else that acts
on a keypress.

**Answered 2026-09-17:** `scripts/editor-harness.mjs` (`npm run test:editor`)
is a committed Playwright harness that presses the real editor in a real
browser — hold-to-drag, a corner-grip resize, and undo through both paths (the
toast's own button and Ctrl+Z), at desktop and narrow widths. It is not part
of `npm test` (no Chromium in `npm ci`'s environment), so it does not gate a
commit the way the rest of the suite does — it is run by hand, same as the
smoke tests in Bureau and EveryPark. What copy/paste itself still lacks a test
for: only the geometry it shares with everything else in `editor.js` is
covered this way; the clipboard round-trip (⌘C / ⌘V, across boards and across
pages) is still unguarded and would be the next thing to add here.


## Deliberately not next

- **`/uiux` and the six blog collections.** Still 404s, still on `PLANNED` in
  `scripts/site.test.mjs`, and deliberately parked. Do not spend a session on
  routes he has deprioritised.
- **Content parity with Squarespace.** Blog content import is coming, but it is
  behind the tool.

## Worth knowing

- He **does** intend to leave Squarespace. The domains renew 8 December 2026 and
  transferring them out is the gate, so `docs/SCOPE.md` §0 still governs the
  timing of the asset migration.
- **DigiDesk becoming its own repo is a real plan, just not yet.** That is the
  whole reason hard rule 4 exists (`src/lib/` may not import `assets.js` or
  anything under `src/data/`). Keep enforcing it; the seam is the thing that
  makes the split cheap later.
