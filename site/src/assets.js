/**
 * Every remote asset in one place.
 *
 * These still point at Squarespace's CDN. When they move into /public this is
 * the ONLY file that changes — that is the whole reason for the indirection.
 *
 * It is also one of the site's three answers to DigiDesk (see astro.config.mjs):
 * the tool reads `asset`, `sized` and `srcset` from here to draw a picture an
 * object names by `asset:` key. The tool never imports this file by name.
 */
import { joinBase, url } from 'digidesk/src/url.js';
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

  // The Art page's wall: every picture that was on /uiux, by project, in the
  // order the live page showed them (October 2026).
  starcassonneBridges: IMG + '234efeaa-cc6e-47e9-aeaa-04164e6a1fcc/Bridges.png',
  starcassonneTowers: IMG + '31b0ae52-559a-47b6-921e-b310b9c5aaac/Towers.png',
  starcassonneHalflings: IMG + '8a16f6c9-0a75-4d8b-beae-7e0cfb29a564/Halflings.png',
  starcassonneCastles: IMG + '11dfe874-6b7b-4ecb-a181-b5100a245b3c/Castles.png',
  starcassonneAbbeys: IMG + '15bf6f58-90a9-4a0f-85a2-3f246460197e/Abbeys.png',
  composersKey67: IMG + 'c356588c-fdf8-4bc4-8304-ab1ddb4522a5/Untitled_Artwork+67.png',
  composersKey72: IMG + '17a44092-d840-40fc-bd92-b0e7b67a1615/Untitled_Artwork+72.png',
  composersKey68: IMG + '17437ace-5c4d-4ebe-ab59-bd5b6d6969a5/Untitled_Artwork+68.png',
  composersKey79: IMG + '024793b5-8428-4b45-99f2-63719f587d51/Untitled_Artwork+79.png',
  composersKey69: IMG + 'b1822475-4bfa-48e1-9e3e-bfbbb770cd55/Untitled_Artwork+69.png',
  composersKey80: IMG + '3f98c056-2dda-4f4f-b2ff-e066df809ecb/Untitled_Artwork+80.png',
  composersKey70: IMG + '77d0a985-7357-4f47-bd54-ed678ca08792/Untitled_Artwork+70.png',
  composersKey77: IMG + '7144836e-6b19-4817-b1e3-0a12e0d3a7e1/Untitled_Artwork+77.png',
  composersKey71: IMG + 'e1df8c72-702b-4056-9549-0157d454942c/Untitled_Artwork+71.png',
  composersKey75: IMG + '8d9fbeef-6004-49bd-b14f-7b546ad87060/Untitled_Artwork+75.png',
  composersKey68b: IMG + '344d94e4-9dc1-4733-8823-51e5f86dd5a1/Untitled_Artwork+68.png',
  composersKey73: IMG + 'b8b0994c-90ba-4f9a-bff6-5af53c70538a/Untitled_Artwork+73.png',
  composersKey78: IMG + 'b743c74e-db1f-4f8f-8fc8-be818dc8af41/Untitled_Artwork+78.png',
  composersKey74: IMG + 'f800755d-137f-4a62-a61a-7ac9cca74e28/Untitled_Artwork+74.png',
  shmush5: IMG + '0bea00f9-f321-418f-9766-522a73c458d1/MacBook+Pro+16_+-+5.png',
  shmush3: IMG + '628ce7d0-4e86-4ec2-8abe-ca255df17d79/MacBook+Pro+16_+-+3+%281%29.png',
  cafeClubStart: IMG + '79ea9f7b-0e7c-4135-8a52-cc34838f1b62/Start+Page.png',
  cafeClubPhone: IMG + '75c6515e-6288-4df8-9f2a-7e50f1816a3c/Untitled_Artwork+81.png',
  cafeClubMap: IMG + '3a0290c0-9b82-4a98-83cf-a3ccea3c49e9/Map+Page+-+Map.png',
  bureauInbox1: IMG + '73396861-2bd1-4d01-b93b-8fc2310270e4/Inbox-1.png',
  bureauInbox: IMG + 'cf55d280-d0c1-43ae-b17f-de41e7fbcc07/Inbox.png',
  bureauInbox4: IMG + '07f8c501-6e21-4613-b103-fa07677e82a3/Inbox-4.png',
  bureauInbox2: IMG + '5c5fb631-ebc4-4d11-ab02-3a96b1215477/Inbox-2.png',
  bureauInbox3: IMG + '037a56b4-0f60-4974-8d4b-3977e1f60343/Inbox-3.png',
  o57Layer4: IMG + '2871e76d-ee00-4fb2-aec8-4ce6bfb545f5/Layer-4.png',
  o57Group1: IMG + '168a47cf-e1a4-4664-95f1-156fff8c2d7b/Group+1.png',
  o57Layer1: IMG + '963aa050-726a-4262-b09a-7ae7f8f1ba78/Layer-1.png',
  o57Layer2: IMG + 'bff57361-27a5-4e78-ad3b-7a82c60c05c7/Layer-2.png',
  o57Layer3: IMG + 'f7d3c359-09c5-42e6-b43c-622a05dafc7d/Layer-3.png',
  o57Layer7: IMG + '07140102-9ff7-4ffa-8aa7-5c1386ab34f3/Layer-7.png',
  o57Layer5: IMG + 'a188080e-e80c-4266-8225-d373d799a0ad/Layer-5.png',
  o57Layer9: IMG + 'b2832986-61d0-4112-b6ee-404398f3c2f4/Layer-9.png',
  aether83: IMG + '8894092c-17de-44b2-827b-2073a19a0a84/Untitled_Artwork+83.png',
  aether82: IMG + 'cda6500e-286e-4b48-b4a8-ecd8ad710d2a/Untitled_Artwork+82.png',
  doodle84: IMG + 'c4d53d79-068f-49ba-bdf8-215b57d2c3ac/Untitled_Artwork+84.png',

  // Composer's Key's own lettering, the cover of its itch.io page.
  composersKeyLogo: 'https://img.itch.zone/aW1nLzg2NTU1NzEucG5n/original/AsNbVH.png',
};

/*
 * Pictures that live in this repository rather than on the CDN: placeholders
 * in Timothy's manner (scripts/placeholder-art.mjs, `npm run placeholders`)
 * for things he has not drawn yet. When he does, his file goes in
 * public/media/ and the line here changes to point at it.
 *
 * Getters, because `url()` needs the bundler's base (import.meta.env), and
 * plain node, which runs the site's tests and imports this file, has none.
 * Asked for during a build or in the browser, they answer like the rest.
 */
const LOCAL = {
  films:       'media/placeholder/films-button.svg',
  inventions:  'media/placeholder/inventions-button.svg',
  art:         'media/placeholder/art-button.svg',
  bookCover7:  'media/placeholder/book-interactive-novels.svg',
  itchIcon:    'media/placeholder/itch-icon.svg',
  comingSoon:  'media/placeholder/coming-soon.svg',
};
for (const [key, path] of Object.entries(LOCAL)) {
  Object.defineProperty(asset, key, { get: () => url(path), enumerable: true });
}

/** The placeholders, by key, so a test can check each file exists. */
export const PLACEHOLDERS = LOCAL;

/** An `asset:` key, a `media:` file or an address, as the address it names. */
export const resolveAsset = (ref) => {
  if (typeof ref !== 'string') return ref;
  if (ref.startsWith('asset:')) return asset[ref.slice(6)] ?? '';
  if (ref.startsWith('media:')) return url('media/' + ref.slice(6));
  return ref;
};

export const GAMES_URL = 'https://starry-sidekick.itch.io/composers-key-proof-of-concept';
export const SOUNDCLOUD = 'https://soundcloud.com/user-682162199';

/** The real domain. Single source of truth — SEO tags read this, not a literal. */
export const PROD_ORIGIN = 'https://timothyvlangas.com';

/* `url()` and `joinBase()` are the tool's (digidesk/src/url.js): every site
   DigiDesk builds may sit on a subpath. Re-exported so the site has one place
   to import its helpers from. */
export { joinBase, url };

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
