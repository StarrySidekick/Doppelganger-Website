/**
 * Commit back to the repository from the browser.
 *
 * GitHub Pages is static — there is no backend to POST to — so the editor talks
 * to the GitHub API directly with a token you paste in once. Pushing to the
 * default branch is what makes the public view change: Actions rebuilds and
 * redeploys, which takes roughly a minute.
 *
 * **One commit, however many files.** A layout and the images it references
 * have to arrive together. Committing them one at a time through the contents
 * API would mean a run of commits, a rebuild for each, and a window where the
 * published JSON points at an image that is not there yet. So this uses the git
 * data API — blobs, a tree, a commit, then move the branch — which is more
 * requests but exactly one commit and one rebuild.
 *
 * Moving the branch is also the concurrency check. The ref update is not
 * forced, so if anything else pushed while you were editing, GitHub refuses it
 * rather than overwriting the other change.
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
  repo: 'Doppelganger-Website',
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
async function explain(res, what) {
  let detail = '';
  try { detail = (await res.json())?.message ?? ''; } catch { /* no body */ }
  if (res.status === 401) return 'Token rejected — it may be expired or mistyped.';
  if (res.status === 403) return `Forbidden — the token needs Contents: read and write on this repo. ${detail}`;
  if (res.status === 404) return 'Not found — check the token can see this repository.';
  if (res.status === 409 || res.status === 422) {
    return 'Something else pushed to the repo while you were editing, so this was not applied. Reload and publish again.';
  }
  return `GitHub returned ${res.status} on ${what}. ${detail}`;
}

/** One API call, with the token in the header and nowhere else. */
async function call(fetchImpl, token, url, what, init = {}) {
  const res = await fetchImpl(url, {
    ...init,
    headers: headers(token),
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(await explain(res, what));
  return res.json();
}

/**
 * Read a file's current sha, which the contents API needs to replace it.
 * Kept because the editor uses it to tell "new" from "changed" before it
 * decides what to say in a commit message.
 * @returns {Promise<{sha:string|null}>} null sha means the file does not exist
 */
export async function currentSha({ token, path, target = TARGET, fetchImpl = fetch }) {
  const url = `${API}/repos/${target.owner}/${target.repo}/contents/${path}?ref=${encodeURIComponent(target.branch)}`;
  const res = await fetchImpl(url, { headers: headers(token) });
  if (res.status === 404) return { sha: null };
  if (!res.ok) throw new Error(await explain(res, 'reading the file'));
  return { sha: (await res.json()).sha };
}

/**
 * Commit a set of files as one commit.
 *
 * @param {object}   o
 * @param {string}   o.token
 * @param {Array<{path:string, text?:string, base64?:string}>} o.files
 *        `text` for anything readable — it is stored as UTF-8 and stays
 *        diffable. `base64` for bytes that were never text, such as an image.
 * @param {string}   o.message
 * @returns {Promise<{url:string, sha:string, paths:string[]}>}
 */
export async function publishFiles({ token, files, message, target = TARGET, fetchImpl = fetch }) {
  if (!token) throw new Error('No token.');
  if (!files?.length) throw new Error('Nothing to publish.');

  const repo = `${API}/repos/${target.owner}/${target.repo}`;
  const ref = `heads/${target.branch}`;

  // Where the branch is now. Everything below is built on top of this exact
  // commit, and the ref update at the end refuses if it has moved since.
  const head = await call(fetchImpl, token, `${repo}/git/ref/${ref}`, 'reading the branch');
  const baseSha = head.object.sha;
  const baseCommit = await call(fetchImpl, token, `${repo}/git/commits/${baseSha}`, 'reading the last commit');

  // A blob per file. Bytes go up as base64 and text as utf-8, so a layout stays
  // readable in the repo instead of becoming an opaque wall of base64.
  const blobs = [];
  for (const f of files) {
    const blob = await call(fetchImpl, token, `${repo}/git/blobs`, `uploading ${f.path}`, {
      method: 'POST',
      body: f.base64 != null
        ? { content: f.base64, encoding: 'base64' }
        : { content: f.text, encoding: 'utf-8' },
    });
    blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // base_tree means "everything else stays as it is" — without it this would
  // commit a tree containing only these files and delete the rest of the repo.
  const tree = await call(fetchImpl, token, `${repo}/git/trees`, 'building the tree', {
    method: 'POST',
    body: { base_tree: baseCommit.tree.sha, tree: blobs },
  });

  const commit = await call(fetchImpl, token, `${repo}/git/commits`, 'writing the commit', {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [baseSha] },
  });

  // Not forced. If anything else pushed while this was being assembled, this
  // fails and the other change survives.
  await call(fetchImpl, token, `${repo}/git/refs/${ref}`, 'moving the branch', {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });

  return { url: commit.html_url, sha: commit.sha, paths: files.map((f) => f.path) };
}

/**
 * Write one layout, and any images it has picked up, in a single commit.
 *
 * The caller is expected to have validated the layout — this will happily
 * commit nonsense, and the build is the thing that would then fail.
 *
 * @param {Array<{path:string, base64:string}>} [media] files to commit alongside
 */
export async function publishLayout({
  token, name, layout, message, media = [], target = TARGET, fetchImpl = fetch,
}) {
  if (!token) throw new Error('No token.');
  const files = [
    { path: pathFor(name), text: JSON.stringify(layout, null, 2) + '\n' },
    ...media,
  ];
  const what = media.length
    ? `${message || `Update ${name} layout from the in-page editor`} (+${media.length} image${media.length > 1 ? 's' : ''})`
    : message || `Update ${name} layout from the in-page editor`;
  const out = await publishFiles({ token, files, message: what, target, fetchImpl });
  return { ...out, path: pathFor(name) };
}
