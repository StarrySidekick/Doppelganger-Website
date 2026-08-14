/**
 * Tests for the widget build.
 *
 * A block goes into Squarespace by hand and there is no version control on that
 * side, so a malformed one is expensive to notice and expensive to undo. These
 * assert the properties that make a block safe to paste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forScript, buildOne, widgetNames } from './build-widgets.mjs';

test('there is at least one widget to build', () => {
  assert.ok(widgetNames().length > 0, widgetNames().join(', '));
});

test('forScript breaks up </script> so it cannot end the script element', () => {
  // The HTML parser does not know it is inside a JS string; `</script>` in the
  // markup would terminate the block and dump the rest of the widget onto the
  // page as visible text.
  const out = forScript('<div></div><script>alert(1)</script>');
  assert.ok(!out.includes('</'), out);
  assert.ok(out.includes('<\\/'), out);
  // Escaping must not change the value the browser actually sees.
  assert.equal(JSON.parse(out.replace(/<\\\//g, '</')), '<div></div><script>alert(1)</script>');
});

test('forScript survives quotes, newlines and non-ascii', () => {
  const s = 'a "b" \'c\'\n— café 🙂';
  assert.equal(JSON.parse(forScript(s)), s);
});

for (const name of widgetNames()) {
  const { meta, block } = buildOne(name);

  test(`${name}: carries provenance back to a commit`, () => {
    // The only thing tying a block in the Squarespace admin to its source.
    assert.match(block, /^<!-- .+ v\d+ · doppelganger@[0-9a-f]{7,}/m);
  });

  test(`${name}: nothing can accidentally close the script element`, () => {
    const script = block.slice(block.indexOf('<script>') + 8, block.lastIndexOf('</script>'));
    assert.ok(!script.includes('</script>'), 'an unescaped </script> would break the page');
  });

  test(`${name}: isolates itself in a shadow root`, () => {
    assert.match(block, /attachShadow\(\{ mode: 'open' \}\)/);
  });

  test(`${name}: mounting twice is a no-op`, () => {
    // Squarespace re-runs inline scripts on ajax navigation.
    assert.match(block, /data-sk-ready/);
  });

  test(`${name}: a thrown error cannot take the page down`, () => {
    assert.match(block, /catch \(err\)/);
  });

  test(`${name}: is self-contained — no repo-relative references`, () => {
    // A code block cannot reach a file in this repo.
    assert.ok(!/src=["']\.{0,2}\//.test(block), 'relative src would 404 on Squarespace');
    assert.ok(!/href=["']\.{0,2}\//.test(block), 'relative href would 404 on Squarespace');
    assert.ok(!block.includes('import '), 'a bare import will not resolve in a code block');
  });

  test(`${name}: any keyframe it defines is prefixed`, () => {
    // Shadow roots scope keyframes, but the habit is what stops the next
    // widget that is NOT in a shadow root from repeating history.
    // Comments are stripped first — prose about keyframes is not a keyframe.
    const declarations = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\\n/g, '\n');
    const found = [...declarations.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    assert.ok(found.length > 0, 'expected this widget to declare keyframes');
    for (const kf of found) assert.match(kf, /^sk[A-Z]/, `${kf} is not prefixed`);
  });

  test(`${name}: declared defaults are actually on the element`, () => {
    for (const [k, v] of Object.entries(meta.defaults ?? {})) {
      assert.ok(block.includes(`${k}="${v}"`), `${k} missing from the pasted block`);
    }
  });

  test(`${name}: stays small enough to paste comfortably`, () => {
    assert.ok(block.length < 60_000, `${(block.length / 1024).toFixed(1)} KB is too big for a code block`);
  });
}
