/**
 * Every remote asset in one place.
 *
 * These still point at Squarespace's CDN. When they move into /public this is
 * the ONLY file that changes — that is the whole reason for the indirection.
 */
const IMG = 'https://images.squarespace-cdn.com/content/v1/61b0ddefeda7f80c8b2a6085/';
const CDN = 'https://static1.squarespace.com/static/61b0ddefeda7f80c8b2a6085/t/';

export const asset = {
  sun:       CDN + '65d38ec724c0b3504ec6e7b7/1708363463425/Sun.gif',
  home:      IMG + '973e3d9e-e07c-4c69-85f2-be153c9615cf/Home.gif',
  persona:   IMG + '3cf91162-8293-46f0-805e-641db5d9bb2a/Animated_Persona_Blink.gif',
  wordmark:  IMG + 'f485d4ac-8340-44ac-9d5f-d0718c4f57bd/Starry+Sidekick+Fixed.gif',
  mail:      IMG + 'e2aca516-3661-4152-b561-832407554410/Mail+2.gif',
  linksIcon: IMG + 'd96840d4-8414-4753-aa57-d24d3d5a9a55/Link_Icon+2.gif',
  music:     IMG + 'f5423391-bfa6-4e52-8eea-ee007cc65ee3/Music+Button.gif',
  uiux:      IMG + 'c434c18f-14f7-46fc-8529-32d2e6b60a96/UI%3AUX+Button.gif',
  writing:   IMG + '70e8bbcb-051d-433b-9883-6ca11e0305ca/Writing+Button.gif',
  games:     IMG + '9bcbd857-e388-40bd-8bae-c42f4162184b/Games+Button.gif',
  sparkle:   IMG + '5ae30e7d-00db-4e24-b695-3c69d35549c4/Untitled_Artwork.gif',
  qr:        IMG + 'fd2c5124-b728-4df7-a3cb-bf922ece4bd5/QR_Code.png',
  instagram: IMG + 'bf18e077-6322-4ceb-ac0a-1fcf32a96299/Instagram.png',
  cardFront: CDN + '65f4b890ba886409c5d454ee/1710536848659/Business_Card_Front_Blue.png',
  cardBack:  CDN + '65f4b9c2bb62673336cf473c/1710537154891/Business_Card_Back.png',
  holo:      CDN + '65f4c128f5898d008359bc18/1710539049134/Holo+Small.jpg',
};

export const GAMES_URL = 'https://starry-sidekick.itch.io/composers-key';
export const SOUNDCLOUD = 'https://soundcloud.com/user-682162199';

/** The real domain. Single source of truth — SEO tags read this, not a literal. */
export const PROD_ORIGIN = 'https://timothyvlangas.com';

/** Prefix an internal path with the deploy base. Required on project Pages. */
export const url = (p) => (import.meta.env.BASE_URL + '/' + p).replace(/\/{2,}/g, '/');

/**
 * Asset sizing.
 *
 * The originals are enormous — the persona is 2057x2519 (9 MB) and never
 * renders wider than 300px. Squarespace's IMAGE cdn resizes on demand via
 * ?format=<width>w and keeps every frame of an animated GIF, so the fix is a
 * query string rather than a re-encode: no new files, no fidelity call, and
 * this stays the only file that changes when assets eventually move local.
 *
 * static1 serves raw files and IGNORES the parameter, so the helpers below
 * leave those URLs alone rather than emitting a srcset that is a lie.
 */
const RESIZABLE = /^https:\/\/images\.squarespace-cdn\.com\//;
const WIDTHS = [300, 500, 750, 1000];

/** One URL at a given rendered width. */
export const sized = (u, w) => (RESIZABLE.test(u) ? `${u}?format=${w}w` : u);

/** A srcset, or undefined when the host can't resize (Astro drops the attr). */
export const srcset = (u, widths = WIDTHS) =>
  RESIZABLE.test(u) ? widths.map((w) => `${sized(u, w)} ${w}w`).join(', ') : undefined;
