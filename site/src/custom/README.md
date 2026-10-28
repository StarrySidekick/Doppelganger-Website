# Custom kinds: StarrySidekick's own objects

This folder is where the website does things DigiDesk doesn't. Each kind
here becomes an object you can make from the picker, then hold, move,
resize and publish like any other. The only difference is that this site's
code draws it.

There are two sizes of "custom", and they live in different places:

- **A bit of markup.** Use the `html` object (HTML block) on a board. It
  can't run a script, which is deliberate.
- **Anything that needs code.** Add a kind here.

## The kinds here

| Kind | File | On | What it is |
| --- | --- | --- | --- |
| `film` | `film.js` | /film | A film credit, as a frame of 35mm film |
| `trading-card` | `trading-card.js` | /games | A game as a card that turns over, Play on the back |
| `disc` | `disc.js` | /music | A song as a record you press to play |
| `turntable` | `turntable.js` | /music | Plays the records: drop the needle, scratch, loop |
| `art-frame` | `art-frame.js` | /art | A framed picture that opens large |
| `invention` | `invention.js` | /inventions | An app or object as a patent sheet |
| `starfield` | `starfield.js` | nowhere yet | The small example to copy |

Shared by them: `sketch.js` (drawing in Timothy's chalk hand, with the
three-frame boil), `sketch.css` (the boil's stylesheet), `parts.js` (escaping,
pictures, links, and `arranging()`, which every kind checks so a press while
the board is unlocked moves things rather than playing them), and `player.js`
(the one player the records and the turntable share).

## Adding a kind

1. Make a file here, for example `confetti.js`, that exports one object:

   ```js
   export const confetti = {
     label: 'Confetti',                 // what the picker calls it
     says: 'Paper falling',             // the line under it in the picker
     size: [6, 4],                      // new ones are this many cells
     fields: [                          // what the object editor offers
       { key: 'data.pieces', label: 'How many pieces', kind: 'number' },
     ],
     data: { pieces: 40 },              // what a new one starts with
     render: (o) => `<div class="confetti"></div>`,
     wake: (el, o) => { /* start it */ return () => { /* stop it */ }; },
   };
   ```

2. Add it to `index.js`, in `export const kinds = { … }`. A name with a dash
   is quoted: `'trading-card': tradingCard`.

3. Run `npm run dev` from the repository root, open a page, press the
   corner dot, and hold the board. It's in the picker.

## The four rules

- **Your settings live under `data`.** Field keys start with `data.`.
  Top-level names like `body` and `link` belong to the tool.
- **`render` returns a string and never touches the page.** It runs at
  build time in node, and in the browser while you edit.
- **`wake` is where scripts run.** It runs once for each drawn copy, on a
  visitor's page and in the editor. Return a function that stops whatever
  it started, because the editor replaces a tile every time it redraws it.
- **Styles go in a stylesheet you import** from the kind's file
  (`import './confetti.css'`). Prefix every class and every `@keyframes`
  name with the kind's name (hard rule 1).

Optional: `face` (one of the tool's faces, default `none`), `attrs` (tool
attributes such as `link` to make it clickable), `check(o)` (returns a list
of problems, which fails the build), and `picker: false` to keep a kind out
of the picker.

When a kind would be useful on any site, move it into DigiDesk as a built-in
kind. That's how the spinning card and the player started.
