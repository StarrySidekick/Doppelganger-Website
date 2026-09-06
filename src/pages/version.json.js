/**
 * The build stamp, as a file you can fetch.
 *
 * `curl https://…/Doppelganger-Website/version.json` answers "what is actually
 * live right now" without opening the site, and the editor's bar fetches it to
 * tell you whether a publish has finished rebuilding. `__BUILD__` is replaced
 * at build time — see scripts/version.mjs and astro.config.mjs.
 */
export function GET() {
  return new Response(JSON.stringify(__BUILD__, null, 2) + '\n', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The whole point is to see the new one the moment it is live.
      'cache-control': 'no-cache',
    },
  });
}
