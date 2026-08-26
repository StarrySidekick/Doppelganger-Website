/**
 * Tests for publishing a layout back to the repo.
 *
 * fetch is injected, so these assert the exact request that WOULD go to
 * GitHub without a token, a network call, or a commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishLayout, currentSha, toBase64, pathFor, TARGET } from './publish.js';

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

test('publishing an existing file reads its sha and sends it back', async () => {
  const f = stubFetch([
    { status: 200, body: { sha: 'oldsha' } },
    { status: 200, body: { commit: { html_url: 'https://github.com/c/1' }, content: { sha: 'newsha' } } },
  ]);
  const out = await publishLayout({
    token: 'tok', name: 'links', layout, message: 'Rearrange links', fetchImpl: f,
  });

  const [get, put] = f.calls;
  assert.equal(get.method, 'GET');
  assert.match(get.url, /\/repos\/StarrySidekick\/Doppelganger-Website\/contents\/src\/data\/layouts\/links\.json\?ref=main$/);

  assert.equal(put.method, 'PUT');
  const body = JSON.parse(put.body);
  assert.equal(body.message, 'Rearrange links');
  assert.equal(body.branch, TARGET.branch);
  assert.equal(body.sha, 'oldsha', 'must send the sha or GitHub refuses the overwrite');
  // What lands in the repo is the layout, pretty-printed, newline-terminated.
  const written = Buffer.from(body.content, 'base64').toString('utf8');
  assert.equal(written, JSON.stringify(layout, null, 2) + '\n');
  assert.deepEqual(JSON.parse(written), layout);

  assert.equal(out.url, 'https://github.com/c/1');
});

test('publishing a new file omits sha entirely', async () => {
  const f = stubFetch([
    { status: 404 },
    { status: 201, body: { commit: { html_url: 'u' }, content: { sha: 's' } } },
  ]);
  await publishLayout({ token: 'tok', name: 'uiux', layout, fetchImpl: f });
  const body = JSON.parse(f.calls[1].body);
  // GitHub rejects an explicit null sha, so the key must be absent.
  assert.ok(!('sha' in body), 'sha must not be present for a new file');
  assert.match(f.calls[1].url, /uiux\.json$/);
});

test('the default commit message names the layout', async () => {
  const f = stubFetch([
    { status: 200, body: { sha: 'x' } },
    { status: 200, body: { commit: {}, content: {} } },
  ]);
  await publishLayout({ token: 'tok', name: 'links', layout, fetchImpl: f });
  assert.match(JSON.parse(f.calls[1].body).message, /links/);
});

test('the token goes in the auth header and nowhere else', async () => {
  const f = stubFetch([
    { status: 200, body: { sha: 'x' } },
    { status: 200, body: { commit: {}, content: {} } },
  ]);
  await publishLayout({ token: 'github_pat_SECRET', name: 'links', layout, fetchImpl: f });
  for (const call of f.calls) {
    assert.equal(call.headers.Authorization, 'Bearer github_pat_SECRET');
    assert.ok(!call.url.includes('SECRET'), 'never in the URL');
    assert.ok(!(call.body ?? '').includes('SECRET'), 'never in the body');
  }
});

test('publishing without a token fails before any request', async () => {
  const f = stubFetch([]);
  await assert.rejects(
    () => publishLayout({ token: '', name: 'links', layout, fetchImpl: f }),
    /No token/
  );
  assert.equal(f.calls.length, 0);
});

test('a 404 on the read means "new file", not an error', async () => {
  const f = stubFetch([{ status: 404 }]);
  assert.deepEqual(await currentSha({ token: 't', path: 'p', fetchImpl: f }), { sha: null });
});

test('API failures are reported in words, not status codes', async () => {
  const cases = [
    [401, /expired or mistyped/],
    [403, /Contents: read and write/],
    [409, /changed on GitHub/],
    [422, /GitHub rejected the commit/],
    [500, /GitHub returned 500/],
  ];
  for (const [status, expected] of cases) {
    const f = stubFetch([{ status, body: { message: 'detail' } }]);
    await assert.rejects(
      () => currentSha({ token: 't', path: 'p', fetchImpl: f }),
      expected,
      `status ${status}`
    );
  }
  // 404 only surfaces as an error on the write, where the repo really is
  // unreachable rather than the file merely being absent.
  const f = stubFetch([{ status: 404 }, { status: 404, body: {} }]);
  await assert.rejects(
    () => publishLayout({ token: 't', name: 'links', layout, fetchImpl: f }),
    /can see this repository/
  );
});

test('a failure on the write is reported too, not swallowed', async () => {
  const f = stubFetch([
    { status: 200, body: { sha: 'x' } },
    { status: 409, body: { message: 'conflict' } },
  ]);
  await assert.rejects(
    () => publishLayout({ token: 't', name: 'links', layout, fetchImpl: f }),
    /changed on GitHub/
  );
});
