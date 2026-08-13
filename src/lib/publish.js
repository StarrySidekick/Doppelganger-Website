/**
 * Commit a layout back to the repository from the browser.
 *
 * GitHub Pages is static — there is no backend to POST to — so the editor talks
 * to the GitHub contents API directly with a token you paste in once. Pushing
 * to the default branch is what makes the public view change: Actions rebuilds
 * and redeploys, which takes roughly a minute.
 *
 * On the token, because it is a real credential:
 *   - Use a FINE-GRAINED token limited to this one repository, with
 *     Contents: read and write. Nothing else. Not a classic token.
 *   - It is kept in localStorage so you do not retype it. Anything running on
 *     this origin could read it. The origin only ever serves this site's own
 *     files, but that is the exposure — give it a short expiry and use
 *     "Forget token" when you are done.
 *   - It is never logged, never put in a URL, and only ever sent to
 *     api.github.com over https.
 */

const API = 'https://api.github.com';

/** Where the editor publishes. The deploy workflow watches this branch. */
export const TARGET = {
  owner: 'StarrySidekick',
  repo: 'doppelganger',
  branch: 'main',
};

export const pathFor = (name) => `src/data/layouts/${name}.json`;

/** base64 of a UTF-8 string, chunked so a big layout can't blow the stack. */
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

/** Turn an API failure into something worth reading. */
async function explain(res) {
  let detail = '';
  try { detail = (await res.json())?.message ?? ''; } catch { /* no body */ }
  if (res.status === 401) return 'Token rejected — it may be expired or mistyped.';
  if (res.status === 403) return `Forbidden — the token needs Contents: read and write on this repo. ${detail}`;
  if (res.status === 404) return 'Not found — check the token can see this repository.';
  if (res.status === 409) return 'The file changed on GitHub since this page loaded. Reload and republish.';
  if (res.status === 422) return `GitHub rejected the commit. ${detail}`;
  return `GitHub returned ${res.status}. ${detail}`;
}

/**
 * Read the file's current sha, which the API needs in order to replace it.
 * @returns {Promise<{sha:string|null}>} null sha means the file does not exist yet
 */
export async function currentSha({ token, path, target = TARGET, fetchImpl = fetch }) {
  const url = `${API}/repos/${target.owner}/${target.repo}/contents/${path}?ref=${encodeURIComponent(target.branch)}`;
  const res = await fetchImpl(url, { headers: headers(token) });
  if (res.status === 404) return { sha: null };
  if (!res.ok) throw new Error(await explain(res));
  return { sha: (await res.json()).sha };
}

/**
 * Write a layout to the repo. Returns the commit's html_url.
 *
 * The caller is expected to have validated the layout — this will happily
 * commit nonsense, and the build is the thing that would then fail.
 */
export async function publishLayout({
  token, name, layout, message, target = TARGET, fetchImpl = fetch,
}) {
  if (!token) throw new Error('No token.');
  const path = pathFor(name);
  const { sha } = await currentSha({ token, path, target, fetchImpl });

  const body = {
    message: message || `Update ${name} layout from the in-page editor`,
    content: toBase64(JSON.stringify(layout, null, 2) + '\n'),
    branch: target.branch,
  };
  // Omitted entirely when the file is new; GitHub rejects an explicit null.
  if (sha) body.sha = sha;

  const res = await fetchImpl(
    `${API}/repos/${target.owner}/${target.repo}/contents/${path}`,
    { method: 'PUT', headers: headers(token), body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(await explain(res));

  const json = await res.json();
  return { url: json.commit?.html_url, sha: json.content?.sha, path };
}
