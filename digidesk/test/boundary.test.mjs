/**
 * The seam between the tool and the site, asserted.
 *
 * The website's hard rule 4 said `src/lib/` may not import the site's assets
 * or data, and it was a convention: nothing stopped an import crossing it.
 * Now the tool is its own folder and its own package, and this test is the
 * stop. DigiDesk may import itself, node, Astro, and the three modules the
 * integration generates. The site may import the tool only by its package
 * name, never by a path into its folder, so the day the tool leaves for its
 * own repository the site's imports do not change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(TOOL, '..', 'site');

function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(m?js|astro)$/.test(f)) out.push(p);
  }
  return out;
}

/** Every module specifier a file imports, static or dynamic. */
const specifiers = (src) => [
  ...src.matchAll(/^\s*import\s[^'"]*?['"]([^'"]+)['"]/gm),
  ...src.matchAll(/^\s*export\s[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm),
  ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
].map((m) => m[1]);

test('the tool imports nothing of the site', () => {
  const allowed = (spec) =>
    spec.startsWith('node:') || spec === 'astro' || spec.startsWith('astro/')
    || ['virtual:digidesk/site', 'virtual:digidesk/custom', 'virtual:digidesk/shell'].includes(spec);
  const bad = [];
  for (const f of files(TOOL)) {
    for (const spec of specifiers(readFileSync(f, 'utf8'))) {
      if (spec.startsWith('.')) {
        const to = resolve(dirname(f), spec);
        if (relative(TOOL, to).startsWith('..')) bad.push(`${relative(TOOL, f)} → ${spec}`);
      } else if (!allowed(spec)) bad.push(`${relative(TOOL, f)} → ${spec}`);
    }
  }
  assert.deepEqual(bad, [], 'DigiDesk may not reach outside its folder');
});

test('the site imports the tool by its name, never by a path into it', () => {
  const bad = [];
  for (const f of files(SITE)) {
    for (const spec of specifiers(readFileSync(f, 'utf8'))) {
      if (!spec.startsWith('.')) continue;
      const to = resolve(dirname(f), spec);
      if (relative(SITE, to).startsWith('..')) bad.push(`${relative(SITE, f)} → ${spec}`);
    }
  }
  assert.deepEqual(bad, [], "import 'digidesk/…', not '../../digidesk/…'");
});

test('no site name is written into the tool', () => {
  // The tool's comments may tell the history (they say where things came
  // from), but no CODE line may name the site's repository or domain.
  const bad = [];
  for (const f of files(TOOL)) {
    if (f.endsWith('.test.js') || f.endsWith('.test.mjs')) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (!code || code.startsWith('*') || code.startsWith('/*')) return;
      if (/Doppelganger-Website|StarrySidekick|timothyvlangas|doppelganger\./i.test(code)) {
        bad.push(`${relative(TOOL, f)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'a fact about the site belongs in its astro.config.mjs');
});
