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
 * It shells out to git in the SITE's folder, so the number is the site's
 * repository's, never the tool's: the tool asks, it does not know (hard rule
 * 4). `versionFrom` is the pure half, exported so the scheme can be tested
 * without a repo.
 *
 * **There are two numbers since the tool got its own folder.** The site's is
 * every commit in its repository, as it always was, because every commit can
 * change what is deployed. DigiDesk's is the commits that touched the tool,
 * counted by path (`digidesk/`, and `src/lib/` where it lived before it had a
 * name), so it moves only when the tool does. When the tool leaves for its
 * own repository with its history, that count is its commit count there too.
 */
import { execSync } from 'node:child_process';

/** 54 → "0.54", 100 → "1.00", 154 → "1.54". */
export const versionFrom = (n) => (Number(n) / 100).toFixed(2);

/** Ask git something, and don't take the build down if there is no git. */
function git(args, fallback = '', cwd = undefined) {
  try {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
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
export function buildInfo({ cwd, tool } = {}) {
  const build = Number(git('rev-list --count HEAD', '0', cwd)) || 0;
  const dirty = git('status --porcelain', '', cwd) !== '';
  const out = {
    build,
    version: versionFrom(build) + (dirty ? '+' : ''),
    sha: git('rev-parse --short HEAD', 'unknown', cwd),
    dirty,
    at: new Date().toISOString(),
  };
  if (tool) out.digidesk = toolInfo(tool);
  return out;
}

/**
 * DigiDesk's own number: commits that touched the tool's folder, plus its old
 * home. `dir` is the tool's folder; the paths are asked of git from there.
 */
export function toolInfo(dir) {
  const top = git('rev-parse --show-toplevel', '', dir);
  if (!top) return { build: 0, version: versionFrom(0) };
  const here = git('rev-parse --show-prefix', '', dir).replace(/\/$/, '') || '.';
  const paths = [here, 'src/lib'].map((p) => `':(top)${p}'`).join(' ');
  const build = Number(git(`rev-list --count HEAD -- ${paths}`, '0', dir)) || 0;
  const dirty = git(`status --porcelain -- ${paths}`, '', dir) !== '';
  return { build, version: versionFrom(build) + (dirty ? '+' : '') };
}
