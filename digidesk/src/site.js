/**
 * The site, as the tool's components see it at build time.
 *
 * Everything here is read from `virtual:digidesk/site`, which the integration
 * generates out of the site's own files (see index.js), and turned into the
 * few answers a page needs: the look, checked and with its pictures resolved;
 * a picture reference as an address; a board's own title, description and
 * share picture. A site's shell imports this rather than reaching into the
 * tool's internals, and the tool's routes import it rather than the site.
 *
 * Build-time only. It is the one module in src/ that knows a site exists at
 * all, and it knows it only as data handed over.
 */
import { assets, look as lookData } from 'virtual:digidesk/site';
import { lookCSS, validateLook, resolveLook } from './look.js';
import { url } from './url.js';

export { layouts, getLayout } from './layouts.js';
export { assets };

/**
 * An `asset:` key, a `media:` file or an address, as the address it names.
 * A key the site's assets file does not have is a typo in data, and the build
 * is the right place to find out.
 */
export function resolveRef(ref, where = 'a layout') {
  if (typeof ref !== 'string') return ref;
  if (ref.startsWith('asset:')) {
    const key = ref.slice(6);
    const src = assets.asset?.[key];
    if (!src) {
      throw new Error(`${where} wants asset "${key}", which is not in the site's assets file. `
        + `Known: ${Object.keys(assets.asset ?? {}).join(', ')}`);
    }
    return src;
  }
  if (ref.startsWith('media:')) return url('media/' + ref.slice(6));
  return ref;
}

/** A picture at a rendered width, if the site's host can resize; otherwise as it is. */
export const sized = (src, w) => (typeof assets.sized === 'function' ? assets.sized(src, w) : src);
/** A srcset, or undefined when the site's host cannot resize. */
export const srcset = (src, widths) => (typeof assets.srcset === 'function' ? assets.srcset(src, widths) : undefined);

// The site's look is data too: a malformed look.json fails the build here
// rather than shipping a page with no colours. Its pictures (sparks, the
// pointer) are named the way a layout names them, by asset: key.
const lookProblems = validateLook(lookData, 'look.json');
if (lookProblems.length) throw new Error('Invalid look:\n  ' + lookProblems.join('\n  '));

/** The look, checked, with every picture it names resolved. */
export const look = resolveLook(lookData, (r) => resolveRef(r, 'look.json'));

/** The look as CSS custom properties, for a <style> in the head. */
export const lookStyle = () => lookCSS(look);

/** What a board says about itself as a page: its title, description and share picture. */
export function pageOf(layout, name) {
  const title = layout.title ?? (name === 'index' ? 'Home'
    : name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return {
    title,
    // Both optional, set in the Board panel; the shell falls back to the
    // site's own line and picture.
    description: layout.description || undefined,
    image: layout.image ? resolveRef(layout.image, `layout "${name}"`) : undefined,
    header: layout.header !== false,
  };
}
