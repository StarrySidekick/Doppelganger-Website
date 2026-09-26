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

  // The rest of the Squarespace site, measured off the live pages September
  // 2026 so the boards could be rebuilt as objects. Same rule as above:
  // images.squarespace-cdn.com resizes, static1 does not.
  backstage:    IMG + 'ca491940-f2b3-45e0-83fb-8bdfdeb1a395/download.png',
  linkedin:     IMG + '8bf292a4-4170-477b-ac8a-f2bfa5b74498/Untitled_Artwork+43.png',
  soundcloudIcon: IMG + '9b0549c0-5d36-4de0-ae08-73e0b55f1cb5/Untitled_Artwork+34.png',
  youtube:      IMG + '30957ea8-5fc7-49a8-b89c-59292cd77635/Untitled_Artwork+41.png',

  bookcase:     CDN + '65c16630d546017619f83037/1707173425378/Bookcase.png',
  books:        CDN + '65c1685598e48a59f972d824/1707173973476/Books.gif',
  bookCover1:   CDN + '65c1be87d5460176190bc005/1707196039716/Book_Cover_1.gif',
  bookCover2:   CDN + '65c1be87468eb90c91481b2e/1707196039716/Book_Cover_2.gif',
  bookCover3:   CDN + '65c1be87e05c5f0a08c895ea/1707196039709/Book_Cover_3.gif',
  bookCover4:   CDN + '65c1be872731095de8ef54ce/1707196039708/Book_Cover_4.gif',
  bookCover5:   CDN + '65c1c88ed736531a291eda02/1707198606709/Book_Cover_5.gif',
  bookCover6:   CDN + '65c1be87bea3613accd6df46/1707196039600/Book_Cover_6.gif',
  arrowLeft:    CDN + '65c1b0880c1dbe3dd70098a6/1707192456950/Arrow_Left.gif',
  arrowRight:   CDN + '65c1b088e6a9694984f0db30/1707192456993/Arrow_Right.gif',
  go:           CDN + '65c1b0883949f25c0b3b0329/1707192456980/Go.gif',

  skipLeft:     CDN + '65f4df42b435f55330df9336/1710546754045/Arrow_Skip_Left.gif',
  skipRight:    CDN + '65f4df425f42d43d529bbe8b/1710546754047/Arrow_Skip_Right.gif',
  play:         CDN + '65f4dab481119573af1a1e61/1710545588272/Arrow_Right+2.gif',
  pause:        CDN + '65f4f42702bb687ab122e639/1710552103399/Pause.gif',

  // The site's own pointer, and the star a click throws.
  star:         CDN + '65c1730a3dfa56218f95fc91/1707176714824/Star.png',
  cursor:       CDN + '658a48cb06fdfa7abb78a76a/1703561419043/Cursor_-_Empty.png',
  cursorOver:   CDN + '658a48c7549719130fedf014/1703561415052/Cursor_-_Solid.png',
};

/** An `asset:` key, a `media:` file or an address, as the address it names. */
export const resolveAsset = (ref) => {
  if (typeof ref !== 'string') return ref;
  if (ref.startsWith('asset:')) return asset[ref.slice(6)] ?? '';
  if (ref.startsWith('media:')) return url('media/' + ref.slice(6));
  return ref;
};

export const GAMES_URL = 'https://starry-sidekick.itch.io/composers-key';
export const SOUNDCLOUD = 'https://soundcloud.com/user-682162199';

/** The real domain. Single source of truth — SEO tags read this, not a literal. */
export const PROD_ORIGIN = 'https://timothyvlangas.com';

/**
 * Join a path onto the deploy base.
 *
 * Pure, and exported on its own, so the one rule below can be tested without a
 * bundler: `import.meta.env` does not exist outside Vite.
 *
 * **The site root has no trailing slash.** `astro.config.mjs` sets
 * `trailingSlash: 'never'` and `build.format: 'file'`, so the home page is
 * `/Doppelganger-Website` and `/Doppelganger-Website/` is a 404 — which is
 * exactly what the header's home icon and the footer's "Home" link were
 * pointing at, because joining an empty path left the base's own slash on the
 * end. Hard rule 2 lives in this function; this was hard rule 2 failing inside
 * the helper written to enforce it.
 */
export const joinBase = (base, p) => {
  const joined = ((base ?? '/') + '/' + (p ?? '')).replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
};

/** Prefix an internal path with the deploy base. Required on project Pages. */
export const url = (p) => joinBase(import.meta.env.BASE_URL, p);

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
