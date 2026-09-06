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
