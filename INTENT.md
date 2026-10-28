# Intent

What this is for, and what to build next, in Timothy's own words, dated.

**Read this before choosing what to build.** Where it disagrees with the rest of
the docs about **direction**, this file is newer and wins. Where it disagrees
about **mechanics** (how the code works, what was decided deliberately, the
invariants) the other docs win, always.

When something here is done, or turns out to be wrong, **edit it**. A stale
intent file is worse than no intent file.

## What it is for (2026-10-28)

**The website. DigiDesk is parked.** In his words: "i want to sort of reorient
this repo to just making my website, as i need to get that done. other
objectives surrounding making digidesk and stuff are pushed to the side for
now. the core of my site will be similar in some ways to my live squarespace
site, but there will be new pages and the material inside pages will be
different and built out."

This reverses 2026-09-06, when the tool was the point and the site its guinea
pig. The tool stays (the site is built with it and is edited with it), but a
session spends its time on pages, content and pieces of the site. A change to
`digidesk/` is fine when the site needs it (a bug, or something a page can't do
without), and is still its own `DigiDesk:` commit.

## The pages

His list, in his words, and where each stands.

| Page | His words | Where it is (2026-10-28) |
| --- | --- | --- |
| `/` | "home (very similar to how it is now on live)" | **Built.** The live page with six section buttons instead of four. The portrait goes to About. |
| `/film` | "films (will list all the films i've worked on or made, and what i did for them)" | **Built.** 13 credits from his Backstage profile, as film-strip frames (`film` kind). |
| `/games` | "games (will list all my games and stuff as trading cards you can flip to see info on and play" | **Built.** Composer's Key and Starcassonne as cards that turn over (`trading-card`), plus one placeholder card. |
| `/music` | "music (right now on live it's a simple player, but here it's going to be a collection of music discs you can play and manipulate in different ways, organization based in a few genre principles" | **Built.** 20 SoundCloud tracks as records in crates, and a turntable (`disc`, `turntable`). Crates are SoundCloud's own genre tags for now: Chiptune, Piano, Ambient, Not sorted yet. **His genre principles are still to come.** |
| `/inventions` | "inventions (new sections that is for my apps or physical objects that aren't games)" | **Built.** Bureau and DigiDesk as patent sheets (`invention`), plus one placeholder for a physical object. |
| `/art` | "art (organized like a gallery, and contain my paintings, drawings, style guides, ui, graphics, etc)" | **Built.** All 40 pictures from Squarespace's `/uiux`, framed (`art-frame`), in rooms: Paintings, Drawings, Style guides (empty, a sign), UI, Graphics. `/uiux` redirects here. |
| `/writing` | "writing (very similar to now but with upgraded ux, holds my poems, essays, short stories, interactive novels, etc.)" | **The bookcase, plus a seventh book (Interactive Novels), swipe and arrow keys.** The collection pages behind the books are not built: that is the next big piece (see below). |
| `/about` | "about (new, get to it by clicking my portrait on the home page" | **Built.** His portrait and a bio taken from his own Backstage "About me". |
| `/contact` | "email form (where the letter is right now, same as live)" | **Built**, dressed like live. **Sends nothing until it has a Web3Forms key.** |
| `/links` | "links (same as live but just more organized)" | **Built.** The live pieces in groups: Say hello, Listen and watch, Follow along, Work with me, Play. |

And: "there will also be secret pages and a bunch of other crazy stuff added
later, as the site itself will serve as a portfolio piece." The live site has
secret pages already, and their addresses must keep working when the domain
moves (hard rule 3): `/secret-poem-1`, `/hello-hypixel-studios`,
`/becauseimeanit26`, `/physics-test`, and `/home`. None is rebuilt yet.

**Pictures**: "for stuff that already has assets, like the music page button
and stuff, we use that, if it doesn't have an asset yet, we create placeholder
art that matches my style." Every placeholder is drawn by
`site/scripts/placeholder-art.mjs` and named in `site/src/assets.js` under
`LOCAL`; swapping in his drawing is replacing the file and that line. See
`site/CLAUDE.md`.

## What is next

1. **Content only he has.** His genre principles for the music crates; the
   real titles and words for the art (they are descriptive guesses now); film
   stills or posters; a picture and words for the Starcassonne card; the
   physical inventions; style guides for the Art room that is empty.
2. **Writing's collections.** Six books link to pages that do not exist here
   yet (`/poems`, `/essays-about-everything`, `/short-stories`, `/journal`,
   `/game-design`, `/expressiveaether`) plus `/interactive-novels`. The posts
   are public on the live site and exported to Markdown on his machine. Read
   "Poetry content" in `site/CLAUDE.md` before importing anything: a naive
   conversion destroys every stanza break.
3. **A Web3Forms key** for the contact form (free, made with his email), typed
   into the form's settings in the editor.
4. **His own drawings** for the placeholders: the Films, Inventions and Art
   buttons, the Interactive Novels book, the itch.io icon, the "coming soon"
   sign.
5. **Check it on the iPhone.** Everything was driven in a desk browser and an
   iPhone-sized Chromium; WebKit itself was not available. Worth checking by
   hand: a record playing from the first tap (SoundCloud's widget and iOS's
   autoplay rules), swiping the bookcase, and scrolling past it.
6. **The secret pages** and the "crazy stuff". Room for it is
   `site/src/custom/` (a kind of the site's own) or `site/src/pages/` (a page
   written by hand).

## Deliberately not next

- **DigiDesk for its own sake**: the Bureau port (`digidesk/docs/BUREAU-PORT.md`),
  the editor, the 3D modeller. Parked 2026-10-28.
- **The Works catalogue** (`works.json`, the `/works` page, feeds). The section
  pages are built from objects on each board instead, so a work is added on
  its page from the phone. The catalogue is still there; nothing shown uses it.

## Worth knowing

- He **does** intend to leave Squarespace. The domains renew **8 December
  2026** and transferring them out is the gate, so `site/docs/SCOPE.md` §0
  still governs the timing of the asset migration. Every picture still comes
  from Squarespace's CDN.
- **DigiDesk becoming its own repo is a real plan, just not yet.** The root
  CLAUDE.md says how the split goes when it comes.

## Earlier intent, for the record

- **2026-09-06**: the tool was the point, and copy and paste across boards was
  built. (The `/editor` name collision noted then is still there.)
- **2026-09-26**: "replicate our website as close as we can". Done for the five
  pages Squarespace had.
- **2026-09-28**: a 3D editor for an N64-style key, and "we need a full pwa".
  Both done.
- **2026-10-07**: the tool and the site are two folders in one repository,
  with room in the site for "crazy stuff" (`site/src/custom/`).
