/**
 * Lets the site's tests import its custom kinds under plain node.
 *
 * Each kind imports its own stylesheet (`import './film.css'`), which Vite
 * turns into a <link> on the page and node refuses outright: a .css file is
 * not a module it knows. This hook answers every .css import with an empty
 * module, so the tests can register the kinds and check every object on
 * every board the way the build does. Loaded by `npm test` with --import.
 */
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  }
`));
