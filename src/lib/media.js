/**
 * Bringing an image in from the editor.
 *
 * This is Bureau's import path, ported. Bureau has been doing this for a while
 * and got several things right that are not obvious the first time, so the
 * shape below is deliberately the same shape — see its decisions 71 and 86:
 *
 *   - **Downscale on import.** An untouched phone photo is several megabytes
 *     and nothing on this grid renders anywhere near that wide.
 *   - **Keep alpha only when there is alpha.** JPEG has no alpha channel, so a
 *     cut-out PNG saved as JPEG comes back with a box behind it. Sample the
 *     pixels, and re-encode as PNG only when something is actually see-through.
 *   - **Never rasterise an SVG.** Drawing one into a canvas throws away the one
 *     thing an SVG is for. The source file is the asset.
 *   - **Refuse loudly, with a number.** A ceiling you can read beats a site
 *     that has quietly become slow.
 *
 * Where this parts company with Bureau: Bureau stores the bytes in IndexedDB
 * for one device, and this commits them to a git repository that everyone then
 * downloads. So the ceiling is much lower, the output is real file bytes rather
 * than a data URL — base64 in git is a third bigger and unreadable in a diff —
 * and the caller is expected to think twice, because git history is
 * append-only and an image committed once is committed forever.
 *
 * Browser only: it uses canvas. Nothing here runs at build time.
 */

/** The long edge anything bitmap gets scaled down to. */
export const MAX_EDGE = 1600;

/**
 * The most we will put in a commit.
 *
 * Bureau allows 60 MB because it is one person's device. This is a git
 * repository and a GitHub Pages site with a 1 GB ceiling, and every version of
 * every file stays in the history forever, so the number is much smaller and
 * the refusal is the feature.
 */
export const MAX_BYTES = 4 * 1024 * 1024;

/** JPEG quality for a photo with nothing see-through in it. */
const QUALITY = 0.82;

/** Types worth accepting at all. Audio and video are deliberately not here. */
export const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

/**
 * A filename that is safe as a URL path segment and stable across imports.
 * Lowercased, punctuation folded to dashes, and the extension forced to match
 * what we actually encoded rather than what the file arrived as.
 */
export function mediaName(original, ext) {
  // Basename first. A path is not a name, and taking the last segment is both
  // what a person means by "the file" and what makes "../../etc/passwd" simply
  // "passwd" rather than something that has to be defended against later.
  const base = String(original ?? 'image').split(/[\\/]/).pop();
  // Only a real extension: 1-8 word characters at the very end. Matching any
  // trailing dot-run turns ".hidden" into nothing at all.
  const stem = (base.replace(/\.[a-z0-9]{1,8}$/i, '') || base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '') || 'image';
  return `${stem}.${ext}`;
}

/**
 * Does any pixel have a non-opaque alpha?
 *
 * Sampled on a stride rather than read whole: a 1600px image is 2.5 million
 * pixels and the question only needs a yes or a no. A tainted canvas throws,
 * and the safe answer there is "assume alpha" — keeping a PNG costs bytes,
 * flattening a cut-out costs the picture.
 */
export function hasAlpha(ctx, canvas) {
  try {
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(d.length / 4 / 20000)) * 4;
    for (let i = 3; i < d.length; i += step) if (d[i] < 250) return true;
    return false;
  } catch {
    return true;
  }
}

/** Turn a Blob into the base64 the GitHub API wants, without a giant string. */
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const readAsText = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Could not read that file'));
    fr.onload = () => res(String(fr.result ?? ''));
    fr.readAsText(file);
  });

const loadImage = (url) =>
  new Promise((res, rej) => {
    const im = new Image();
    im.onerror = () => rej(new Error('Could not read that image'));
    im.onload = () => res(im);
    im.src = url;
  });

/**
 * Prepare a picked file for committing.
 *
 * @returns {Promise<{name, blob, previewUrl, width, height, bytes, note}>}
 * @throws  {Error} with a message meant to be shown to a person
 */
export async function prepareImage(file) {
  if (!file) throw new Error('No file');
  if (!/^image\//.test(file.type)) {
    throw new Error('That is not an image. Audio and video need somewhere to live that is not git.');
  }

  // An SVG is kept as itself. See the note at the top: rasterising it is the
  // one transformation that destroys what it is for.
  if (/svg/i.test(file.type)) {
    const text = await readAsText(file);
    if (!/<svg[\s>]/i.test(text)) throw new Error('That file says it is an SVG but has no <svg> in it');
    const why = /<\s*script/i.test(text) && 'a <script> tag';
    if (why) throw new Error(`That SVG contains ${why}, so it is not going in the repo`);
    const blob = new Blob([text], { type: 'image/svg+xml' });
    if (blob.size > MAX_BYTES) throw new Error(tooBig(blob.size));
    return {
      name: mediaName(file.name, 'svg'),
      blob,
      previewUrl: URL.createObjectURL(blob),
      width: null, height: null, bytes: blob.size,
      note: 'kept as SVG, not resampled',
    };
  }

  const objectUrl = URL.createObjectURL(file);
  let im;
  try {
    im = await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(im.width, im.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(im.width * scale));
  canvas.height = Math.max(1, Math.round(im.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(im, 0, 0, canvas.width, canvas.height);

  // A GIF is very often animated here — the whole site is animated GIFs — and
  // a canvas only ever holds the first frame. Re-encoding one would silently
  // throw the animation away, which is worse than the bytes it would save.
  if (/gif/i.test(file.type)) {
    if (file.size > MAX_BYTES) throw new Error(tooBig(file.size, 'A GIF cannot be resized without losing its animation, so it goes in whole or not at all.'));
    return {
      name: mediaName(file.name, 'gif'),
      blob: file,
      previewUrl: URL.createObjectURL(file),
      width: im.width, height: im.height, bytes: file.size,
      note: 'kept whole — resizing a GIF would drop its animation',
    };
  }

  const keepAlpha = hasAlpha(ctx, canvas);
  const blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error('Could not re-encode that image'))),
      keepAlpha ? 'image/png' : 'image/jpeg',
      keepAlpha ? undefined : QUALITY
    )
  );
  if (blob.size > MAX_BYTES) throw new Error(tooBig(blob.size));

  return {
    name: mediaName(file.name, keepAlpha ? 'png' : 'jpg'),
    blob,
    previewUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    bytes: blob.size,
    note: scale < 1
      ? `scaled to ${canvas.width}×${canvas.height}${keepAlpha ? ', alpha kept' : ''}`
      : (keepAlpha ? 'alpha kept' : 're-encoded'),
  };
}

const mb = (n) => (n / 1048576).toFixed(1);
const tooBig = (size, extra = '') =>
  `That is ${mb(size)}MB and the limit is ${mb(MAX_BYTES)}MB. ` +
  `Git keeps every version forever, so a big file is big in every clone from now on. ${extra}`.trim();

/** Where a media file lives in the repo. */
export const mediaPath = (name) => `public/media/${name}`;

/** How an element refers to one. Resolved to a real URL by the caller's ctx. */
export const mediaRef = (name) => `media:${name}`;
