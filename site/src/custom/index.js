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
import { starfield } from './starfield.js';

export const kinds = { starfield };
