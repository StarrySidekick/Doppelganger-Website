/**
 * StarrySidekick's own kinds of object.
 *
 * This is where the site does things the tool does not. Each kind here is an
 * object like any other on a board (held, moved, resized, published in the
 * layout, made from the picker), and its drawing is this site's code. The
 * contract is in digidesk/src/custom.js; the short version is in README.md
 * beside this file.
 *
 * A kind that turns out to be useful beyond this site belongs in DigiDesk
 * instead: move it into digidesk/src/elements.js as a built-in, the way the
 * card, the player and the carousel went from Squarespace code blocks to
 * general pieces of the tool.
 */
import './sketch.css';
import { starfield } from './starfield.js';
import { film } from './film.js';
import { tradingCard } from './trading-card.js';
import { disc } from './disc.js';
import { turntable } from './turntable.js';
import { artFrame } from './art-frame.js';
import { invention } from './invention.js';

/* The page pieces of the site's sections, one kind per kind of work:
   a film credit on /film, a trading card on /games, a record and the
   turntable on /music, a framed piece on /art, a patent sheet on
   /inventions. Each draws in Timothy's chalk hand (sketch.js). */
export const kinds = {
  starfield,
  film,
  'trading-card': tradingCard,
  disc,
  turntable,
  'art-frame': artFrame,
  invention,
};
