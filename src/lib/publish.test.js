/**
 * Tests for publishing back to the repo.
 *
 * fetch is injected, so these assert the exact requests that WOULD go to GitHub
 * without a token, a network call, or a commit.
 *
 * The thing most worth pinning here is that a layout and its images land as ONE
 * commit. Publishing them separately would rebuild the site once per file and
 * leave a window where the live JSON points at an image that is not there yet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishLayout, publishFiles, currentSha, toBase64, pathFor, TARGET } from './publish.js';

const layout = { columns: 24, elements: [{ id: 'card' }] };

/** A fetch stand-in that records calls and replays canned responses. */
function stubFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra fetch: ' + url);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body ?? {},
    };
  };
  impl.calls = calls;
  return impl;
}

/** The happy path through the git data API, in the order publishFiles walks it. */
const okCommit = (blobs = 1) => [
  { status: 200, body: { object: { sha: 'basesha' } } },
  { status: 200, body: { tree: { sha: 'basetree' } } },
  ...Array.from({ length: blobs }, (_, i) => ({ status: 201, body: { sha: 'blob' + i } })),
  { status: 201, body: { sha: 'newtree' } },
  { status: 201, body: { sha: 'commitsha', html_url: 'https://github.com/c/1' } },
  { status: 200, body: {} },
];

test('toBase64 round-trips utf-8, including characters outside latin-1', () => {
  const s = '{"note":"café — 日本語 🙂"}';
  assert.equal(Buffer.from(toBase64(s), 'base64').toString('utf8'), s);
});

test('toBase64 handles a layout far bigger than the chunk size', () => {
  const big = JSON.stringify({ elements: Array.from({ length: 5000 }, (_, i) => ({ id: 'e' + i })) });
  assert.ok(big.length > 0x8000);
  assert.equal(Buffer.from(toBase64(big), 'base64').toString('utf8'), big);
});

test('pathFor points at the layout data directory', () => {
  assert.equal(pathFor('links'), 'src/data/layouts/links.json');
});

test('publishing a layout makes exactly one commit on the target branch', async () => {
  const f = stubFetch(okCommit(1));
  const out = await publishLayout({ token: 'tok', name: 'links', layout, message: 'Rearrange links', fetchImpl: f });

  const urls = f.calls.map((c) => `${c.method} ${c.url.replace(/^https:\/\/api\.github\.com/, '')}`);
  assert.deepEqual(urls, [
    'GET /repos/StarrySidekick/Doppelganger-Website/git/ref/heads/main',
    'GET /repos/StarrySidekick/Doppelganger-Website/git/commits/basesha',
    'POST /repos/StarrySidekick/Doppelganger-Website/git/blobs',
    'POST /repos/StarrySidekick/Doppelganger-Website/git/trees',
    'POST /repos/StarrySidekick/Doppelganger-Website/git/commits',
    'PATCH /repos/StarrySidekick/Doppelganger-Website/git/refs/heads/main',
  ]);
  assert.equal(out.url, 'https://github.com/c/1');
  assert.equal(out.path, 'src/data/layouts/links.json');
});

test('the layout is committed as readable utf-8, not base64', async () => {
  const f = stubFetch(okCommit(1));
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  const blob = JSON.parse(f.calls[2].body);
  assert.equal(blob.encoding, 'utf-8');
  // A layout that arrives as base64 is unreviewable in a diff, which is most of
  // the reason for keeping it as a JSON file in the repo at all.
  assert.match(blob.content, /"columns": 24/);
  assert.match(blob.content, /\n$/, 'files end with a newline');
});

test('images ride along in the SAME commit as the layout', async () => {
  const f = stubFetch(okCommit(3));
  const out = await publishLayout({
    token: 'tok', name: 'links', layout, message: 'Add a picture',
    media: [
      { path: 'public/media/sun.png', base64: 'AAAA' },
      { path: 'public/media/moon.jpg', base64: 'BBBB' },
    ],
    fetchImpl: f,
  });

  const blobs = f.calls.filter((c) => c.url.endsWith('/git/blobs')).map((c) => JSON.parse(c.body));
  assert.equal(blobs.length, 3, 'one blob per file, layout included');
  assert.equal(blobs[1].encoding, 'base64');
  assert.equal(blobs[1].content, 'AAAA');

  // Exactly one commit, one tree, one ref move — not one per file.
  assert.equal(f.calls.filter((c) => c.url.endsWith('/git/commits')).length, 1);
  assert.equal(f.calls.filter((c) => c.method === 'PATCH').length, 1);

  const tree = JSON.parse(f.calls.find((c) => c.url.endsWith('/git/trees')).body);
  assert.deepEqual(tree.tree.map((t) => t.path), [
    'src/data/layouts/links.json', 'public/media/sun.png', 'public/media/moon.jpg',
  ]);
  assert.deepEqual(out.paths, tree.tree.map((t) => t.path));
  // The commit message says images came too, so the history reads truthfully.
  assert.match(JSON.parse(f.calls.find((c) => c.url.endsWith('/git/commits')).body).message, /\+2 images/);
});

test('the new tree is built ON the old one, so the rest of the repo survives', async () => {
  const f = stubFetch(okCommit(1));
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  const tree = JSON.parse(f.calls.find((c) => c.url.endsWith('/git/trees')).body);
  // Without base_tree this commits a repo containing only the files listed —
  // which is to say it deletes everything else.
  assert.equal(tree.base_tree, 'basetree');
  assert.equal(tree.tree[0].mode, '100644');
  assert.equal(tree.tree[0].type, 'blob');
});

test('the commit is parented on the branch head that was read', async () => {
  const f = stubFetch(okCommit(1));
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  const commit = JSON.parse(f.calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.deepEqual(commit.parents, ['basesha']);
  assert.equal(commit.tree, 'newtree');
});

test('the branch move is not forced, so a concurrent push is not clobbered', async () => {
  const f = stubFetch(okCommit(1));
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  const patch = JSON.parse(f.calls.at(-1).body);
  assert.equal(patch.sha, 'commitsha');
  assert.equal(patch.force, false);
});

test('a rejected branch move is explained as someone else having pushed', async () => {
  const steps = okCommit(1);
  steps[steps.length - 1] = { status: 422, body: { message: 'Update is not a fast forward' } };
  const f = stubFetch(steps);
  await assert.rejects(
    publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f }),
    /pushed to the repo while you were editing/
  );
});

test('the default commit message names the layout', async () => {
  const f = stubFetch(okCommit(1));
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  const commit = JSON.parse(f.calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.match(commit.message, /Update links layout/);
});

test('the token goes in the auth header and nowhere else', async () => {
  const f = stubFetch(okCommit(2));
  await publishLayout({
    token: 'secret-token', name: 'links', layout,
    media: [{ path: 'public/media/a.png', base64: 'AAAA' }], fetchImpl: f,
  });
  for (const c of f.calls) {
    assert.equal(c.headers.Authorization, 'Bearer secret-token');
    assert.doesNotMatch(c.url, /secret-token/, 'never in a URL');
    assert.doesNotMatch(c.body ?? '', /secret-token/, 'never in a body');
  }
});

test('publishing without a token fails before any request', async () => {
  const f = stubFetch([]);
  await assert.rejects(publishLayout({ token: '', name: 'links', layout, fetchImpl: f }), /No token/);
  await assert.rejects(publishFiles({ token: '', files: [{ path: 'a', text: 'b' }], fetchImpl: f }), /No token/);
  assert.equal(f.calls.length, 0);
});

test('publishing nothing is refused rather than making an empty commit', async () => {
  const f = stubFetch([]);
  await assert.rejects(publishFiles({ token: 'tok', files: [], fetchImpl: f }), /Nothing to publish/);
  assert.equal(f.calls.length, 0);
});

test('API failures are reported in words, not status codes', async () => {
  const cases = [
    [401, /Token rejected/],
    [403, /Contents: read and write/],
    [404, /Not found/],
  ];
  for (const [status, expected] of cases) {
    const f = stubFetch([{ status, body: { message: 'nope' } }]);
    await assert.rejects(publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f }), expected);
  }
});

test('a failure partway through is reported, not swallowed', async () => {
  const steps = okCommit(1);
  steps[2] = { status: 500, body: { message: 'boom' } };   // the blob upload
  const f = stubFetch(steps);
  await assert.rejects(
    publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f }),
    /500 on uploading src\/data\/layouts\/links\.json/
  );
});

test('currentSha still answers "does this file exist yet"', async () => {
  const missing = stubFetch([{ status: 404 }]);
  assert.deepEqual(await currentSha({ token: 't', path: 'x', fetchImpl: missing }), { sha: null });

  const there = stubFetch([{ status: 200, body: { sha: 'abc' } }]);
  assert.deepEqual(await currentSha({ token: 't', path: 'x', fetchImpl: there }), { sha: 'abc' });
  assert.match(there.calls[0].url, /\/contents\/x\?ref=main$/);
});

test('TARGET points at the branch the deploy workflow watches', () => {
  assert.equal(TARGET.branch, 'main');
  assert.equal(TARGET.owner, 'StarrySidekick');
  assert.equal(TARGET.repo, 'Doppelganger-Website');
});
