# Bureau → DigiDesk: what has come over, and what is next

Written 2026-10-07, against Bureau v3.07 (decision 311), when Timothy asked
to "update digidesk … with all the functionality that we've since added to
bureau, and further align it with the idea that it's a website builder."

DigiDesk took Bureau's model and gesture layer between 2026-09-03 and
2026-09-06, which is roughly Bureau's decisions up to the 150s (the object
model, attributes, faces, the lock, the look, the lasso, groups, decorations,
the throw, undo and redo). Everything below is what Bureau decided after
that, one line per decision or group, marked:

- **Ported**: in DigiDesk now, from Bureau's source.
- **Next**: worth bringing over, in the order under *The order to build*.
- **Adapt**: the idea belongs on a website, but in a different shape.
- **Skip**: for organising a life (to-dos, habits, inboxes), or it is a
  Bureau-only answer to a desk on a phone. Not wrong, not for a website.

The rule from the root CLAUDE.md holds for all of it: **port from Bureau's
source**, not from its docs, and say in a comment where DigiDesk diverges.
Bureau stays as it is; nothing here changes it.

## Ported (2026-10-07)

| Bureau | What | In DigiDesk |
| --- | --- | --- |
| 210 | **The shape you draw is the question.** A box drawn on bare board offers the kinds nearest its shape first. | `shapeKinds()` in `src/elements.js`; the picker leads with them and lights the first four. |
| 247 | **The words.** Typeface, weight, slant, size, case, letter and line spacing, alignment both ways, ink, paper, halo. | `src/words.js`, stored under `o.words`; the object editor's *Words* fold; `w-*` classes in `styles/faces.css`. Bureau's reader-only keys (page sizes, layouts, drop capitals) are left out: a website has no reader. Fonts include the site's own two faces. |
| 277 | **Every `:hover` inside `@media (hover: hover)`**, so a tap on an iPhone does not leave things lit. | All four stylesheets; `test/rules.test.mjs` fails on a bare `:hover`. |
| 281 | **American English in the interface.** | The tool's copy (colors, centered, catalog). Identifiers and stored values keep their spelling. |
| 282 | **The bars tuck away.** A flick down hides the bar, leaving a faint pill; a press or a flick up brings it back. | The editor bar, `storeKey('tucked')`. |
| 303–304 | **Sections and the Contents.** A heading starts a section; the Contents lists the board's headings and goes to each. | `heading` attribute and kind (a real `<h2>`, its tile's id the anchor), `contents` kind, `sectionsOf()`. Going there is a plain `#anchor`, so it needs no script. |
| 175 (spirit) | **The rules load where they apply.** | `digidesk/CLAUDE.md` and `site/CLAUDE.md`, beside the code they are about. |

## The order to build

What is left, in the order that gives a website builder the most per step.
Each says what it becomes on the web.

1. **The paste grammar** (Bureau 284, 303, 309: `docs/GRAMMAR.md` there).
   A board, or a set of objects, written as JSON and pasted onto a board in
   one undo. On a website this is "Claude, make me a page", and the thing a
   Copy JSON already half-does. Start with paste-onto-this-board; `arrange:
   "rows"` (lay things in reading order with sizes and no cells) next, because
   that is what lets a page be written as a sequence.
2. **Backups** (305). Bureau keeps automatic copies in IndexedDB before
   anything risky. Here: a copy of every draft layout before each Publish and
   each Tidy, restorable from the Board panel. Drafts live only in one
   browser until published, which is exactly when a backup matters.
3. **Paper on paper** (308). Things that lay may be put down over each other
   at a height (`z`), and a stack can be squared, fanned or spread. Decor
   already overlaps; this generalises it into layering, which every design
   tool has and this one does not.
4. **The board's own zoom** (274–275). Pinch out to see the whole page, at a
   zoom that settles on whole cells; drawn as a transform on each thing,
   never CSS `zoom`, because Safari zooms container units twice. On a phone,
   arranging a 48-column page without it is arranging through a keyhole.
5. **Claude in the editor** (306–307). The fountain pen: a box drawn and
   filled by Claude, writing objects in the paste grammar through structured
   outputs, with the key kept in the browser and never in the site. Needs 1
   first.
6. **Page templates** (Bureau's benches, 292–301, *adapted*). A bench is a
   board that brings its whole environment. On a website that is a page
   template: *New page… from a template* (a gallery, a blog post, a project
   page), each a layout file with its look. `docs/BENCHES.md` and
   `docs/NAVIGATION.md` in Bureau are the thinking.
7. **A custom look drawn by hand** (271, 300). The painter: strokes over a
   front, a card or a button, and Face mode to move a knob and a name
   anywhere on it. For a website, hand-drawn buttons and frames, which is
   most of what the Squarespace site was.
8. **Portals** (222–226, 231). A link drawn as an opening (a vortex, a glimpse
   of the page via a screenshot) in a circle, square or arch. A website is
   made of links; this is the first link face that is not a picture or a
   plaque.
9. **Cards and decks** (269, 299). A card face (a playing card with a back
   and a suit) and a deck that deals, shuffles or opens. A portfolio as a
   deck of cards is a thing a website can be.
10. **Compound objects** (254). Several objects made and moved as one type
    (a player with its own buttons, a card with its caption). DigiDesk's
    holder is close; this is the general form.
11. **Rename is one field** (259), **a hold ring kept on screen by its
    labels** (279), **a tap's trailing click never lands on what the tap
    revealed** (277, `tapEcho()`): small editor fixes Bureau found on the
    phone. Check each against DigiDesk's editor before porting; some may not
    occur here.
12. **The specimen book** (143, from before the port but never brought
    over): every face, kind and look on one generated page. For a website
    builder this is the style guide, and it should be `/editor`'s second tab.
13. **The Showroom** (309, *adapted*). A room per part of the tool, laid by
    the tool itself. For DigiDesk: a demo site, the tool's own homepage, when
    it has its own repository.

## Adapt later, if a site asks for it

- **Free, tiled and fixed boards** (283, 287–290). Bureau's board grows with
  what is on it, in any direction. A web page already grows downward; a
  fixed board is what the header and footer are. Revisit if a page wants to
  grow sideways (a horizontal scroller).
- **Counters** (221, 228, 265). A rolling counter face. On a site: a visit
  counter or a "days since", which would need a number from somewhere.
- **Sound and video that loop, a video's first frame as its poster** (250,
  257). When video is possible at all, which waits on object storage (git
  cannot hold it).
- **The words' type-wide and site-wide defaults** (247's other two layers).
  When a site wants "every heading in Garamond" without setting each one: a
  `words` entry in `look.json`, read between the object and the kind.
- **A board that names what the selector makes on it** (199). A page that
  only takes pictures, say. Useful once there are templates.
- **Random** (244, 261): a coin that makes one of anything. Fun on a desk; on
  a website maybe as "surprise me" in the picker.

## Skip: for organising a life, or Bureau-only

None of these is a website feature. They stay Bureau's.

- **The camera and the dive** (187–192, 203): how a drawer opens on a desk.
  A drawer here is a page; navigation is the browser's.
- **Proportional boards, boards you add, tiles, one cell a tile, carving**
  (193–195, 219, 227, 233–235, 249, 272–273, 276, 283, 289): how a desk is
  laid out across a phone's screens. A web page is one column that scrolls.
- **The drawer front's tools, the lip, the gear, the rail** (204–208, 211,
  215, 220, 252, 302): the desk's furniture. The editor's bar is DigiDesk's.
- **Aspects of life, project types, the fifteen masters, the Workshop's
  sizes** (196, 236–238, 240, 246, 248): Timothy's life categories.
- **Habits, goals, achievements, the notepad, the inbox and pipes, the bin,
  sorting drawers that pack, Now, a line that is read** (202, 232, 242, 258,
  263, 278, 280, 285–286, 294, 296–298, 305's other two thirds): task and
  note management.
- **The rubber stamp, zones, the prioritizer, ranking by swiping, the
  benches as built** (292–293, 295, 299, 301): ways of working through
  things. Their idea of a template is item 6 above.
- **Decorations' photographs, plants, the jar, buttons as clothing buttons,
  Paintings from the Met** (208, 216, 243, 262, 266–267): Bureau's desk
  objects. The site has its own pictures; a custom kind can be any of these
  if it wants one.
- **No shadows on the board, the wooden table, carved walls** (290–291,
  311): the desk's look.
- **Line view, sorts and the letter block** (215, 217): sorting a list of
  things. A feed's sort is DigiDesk's own.
