/**
 * What build is this?
 *
 * **The version IS the commit count**, as `0.NN` — Bureau's scheme (its
 * persist.js), and for its reason: a number chosen by hand says nothing you can
 * check. The fifty-fourth commit is `0.54` and the hundredth will be `1.00`,
 * which is the first honest claim to a 1.0 this will have made.
 *
 * Bureau still writes its number by hand and bumps it with the service worker.
 * Here it is derived at build time instead, so it cannot drift from the repo at
 * all: there is no number to forget to bump.
 *
 * It answers exactly one question — *"which build is this page, and has the
 * live site caught up with what I pushed?"* — which is the question you ask
 * whenever a change appears not to have deployed. It reaches the page three
 * ways: a `<meta name="build">` in every head, a `/version.json` you can curl,
 * and the editor's bar.
 *
 * This lives in scripts/ rather than src/lib/ deliberately. It shells out to
 * git and reads the working tree, which is a fact about this repository and not
 * about the tool (hard rule 4). `versionFrom` is the pure half, exported so the
 * scheme can be tested without a repo.
 */
import { execSync } from 'node:child_process';

/** 54 → "0.54", 100 → "1.00", 154 → "1.54". */
export const versionFrom = (n) => (Number(n) / 100).toFixed(2);

/** Ask git something, and don't take the build down if there is no git. */
function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
}

/**
 * The build stamp, read once at build time.
 *
 * `dirty` is true when the working tree has uncommitted changes, which makes a
 * local preview say `0.54+` — so a number read off a dev server is never
 * mistaken for one that could be deployed.
 */
export function buildInfo() {
  const build = Number(git('rev-list --count HEAD', '0')) || 0;
  const dirty = git('status --porcelain') !== '';
  return {
    build,
    version: versionFrom(build) + (dirty ? '+' : ''),
    sha: git('rev-parse --short HEAD', 'unknown'),
    dirty,
    at: new Date().toISOString(),
  };
}
