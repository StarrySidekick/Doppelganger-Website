#!/usr/bin/env node
/**
 * The editor test that presses anything — a real browser, driving the real
 * gesture handlers in src/lib/editor.js.
 *
 * `src/lib/editor.test.js` covers the pure geometry (`trackAt`, `cellAt`,
 * `spanBetween`) without a browser, and that is deliberate — most of it does
 * not need one. But the hold-to-drag, the resize grips and the undo stack all
 * live inside `pointerdown`/`pointermove`/`pointerup` handlers wired to a real
 * `.ag-grid`, and nothing in the repo had ever pressed one. INTENT.md names
 * this exact gap: "there is no editor test in the repo that presses
 * anything... All of the above was verified by driving a browser from a
 * scratch file, which is not the same as being guarded." This is that
 * scratch file, kept.
 *
 * It runs on `/links?edit=1` — a real page, in edit mode — and presses the
 * HEADER and FOOTER chrome on it (`src/data/layouts/header.json` /
 * `footer.json`), not the page's own board: every page board ships empty
 * right now (see CLAUDE.md "Current state"), and header/footer are the one
 * place with real, stable objects at known positions to grab. It deliberately
 * does NOT go through `/editor` (the standalone picker) — every empty layout
 * hashes to the same scope class in `scopeFor()` (adaptive-grid.js), since
 * scope is derived from geometry and every empty board's geometry is
 * identical, so `/editor`'s eleven simultaneously-mounted boards collide on
 * `.ag-cell`/`.ag-root` queries in a way a single real page never does. Worth
 * knowing on its own; see the report this harness's first run produced.
 * Nothing here publishes; everything it does lives in this browser's
 * localStorage, the same as any other editing session before Publish is
 * pressed.
 *
 * Deliberately NOT named `*.test.mjs` and NOT wired into `npm test`. It needs
 * a real Chromium and Playwright, which `npm ci` in deploy.yml does not
 * provide — exactly the reasoning EveryPark's `tools/isotest/` already
 * states for its own harness: "the no-build, no-dependency rule is about
 * what ships, and tools/ [here: this script] does not." It also starts its
 * own Astro dev server, which is slow relative to `node --test`.
 *
 * Run it:
 *   npm run dev &            # or let this script start its own (default)
 *   node scripts/editor-harness.mjs
 *
 * Playwright is not a project dependency (this repo has none besides Astro,
 * on purpose). It is resolved from wherever the environment already has it —
 * a local `node_modules/playwright` if one exists, or the global install this
 * sandbox ships at /opt/node22/lib/node_modules/playwright. Set
 * EDITOR_HARNESS_CHROME to override the browser binary.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.EDITOR_HARNESS_PORT || 4321);
const BASE = `http://localhost:${PORT}/Doppelganger-Website`;
const SHOTS = join(root, 'scripts', 'editor-harness-shots');
const CHROME = process.env.EDITOR_HARNESS_CHROME || '/opt/pw-browsers/chromium';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Not a project dependency — see the header comment. Fall back to the
    // sandbox's global install.
    const guess = '/opt/node22/lib/node_modules/playwright/index.mjs';
    if (existsSync(guess)) return import(pathToFileURL(guess).href);
    throw new Error(
      'Could not find "playwright". Install it locally (npm i -D playwright, ' +
        'never committed per this repo\'s no-dependency rule — for local runs ' +
        'only) or set EDITOR_HARNESS_CHROME/point Node at a global install.'
    );
  }
}

/** Poll a URL until it answers, or give up. Astro's dev server takes a beat. */
async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server never answered at ${url}`);
}

/**
 * Read one element's box out of the layout this browser has drafted.
 *
 * The editor only writes to localStorage on the first real change (`commit()`
 * calls `onChange`) — before that, "what's there" is only the layout the page
 * embedded on load, in `script.ag-editor-data`. Fall back to that so "before"
 * can be read the same way as "after".
 */
async function boxOf(page, layoutName, id, device = 'desk') {
  return page.evaluate(
    ({ layoutName, id, device }) => {
      const raw = localStorage.getItem(`doppelganger.layout.${layoutName}`);
      let layout;
      if (raw) {
        layout = JSON.parse(raw);
      } else {
        const node = [...document.querySelectorAll('script.ag-editor-data')]
          .map((n) => JSON.parse(n.textContent))
          .find((d) => d.name === layoutName);
        layout = node?.layout;
      }
      const el = layout?.elements.find((e) => e.id === id);
      return el ? el[device] ?? null : null;
    },
    { layoutName, id, device },
  );
}

/**
 * Cell geometry read off the real checkerboard, so no pixel math is guessed.
 *
 * `scopeSel` must narrow to one grid. Several boards on a page full of empty,
 * identically-shaped layouts can hash to the SAME scope class
 * (`scopeFor()` in adaptive-grid.js — a real, separate finding from this
 * harness: unrelated empty layouts are indistinguishable by geometry alone),
 * and `.ag-cell[data-col="1"][data-row="2"]` matches one such cell per grid on
 * the page. An unscoped query silently grabs whichever grid happens to come
 * first in the DOM.
 */
async function cellRect(page, scopeSel, col, row) {
  const sel = `${scopeSel} .ag-cell[data-col="${col}"][data-row="${row}"]`;
  const handle = await page.$(sel);
  assert.ok(handle, `no checkerboard cell at ${sel} — is the board unlocked?`);
  const box = await handle.boundingBox();
  assert.ok(box, `${sel} has no box — hidden or detached?`);
  return box;
}

async function centerOf(page, selector) {
  const handle = await page.$(selector);
  assert.ok(handle, `missing ${selector}`);
  const box = await handle.boundingBox();
  assert.ok(box, `${selector} has no box — hidden or detached?`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Press, hold past the 200ms mouse threshold (src/lib/editor.js: HOLD_MOUSE),
 * then drag. The wait is short enough to land well before the 320ms extra
 * (MENU_AFTER) that would open the object menu instead of arming a drag.
 */
async function holdAndDragTo(page, fromSel, toX, toY) {
  const from = await centerOf(page, fromSel);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(230);
  // A single big jump clears both the 6px wobble check and the 5px "moved"
  // threshold in one pointermove, same as onMove reads it.
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.move(toX + 1, toY); // a second event so onMove's velocity smoothing has two samples
  await page.mouse.up();
}

async function dragGripTo(page, gripSel, toX, toY) {
  const from = await centerOf(page, gripSel);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down(); // a grip arms at once — no hold to wait out
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
}

const results = [];
/** Run a step now (later steps assume earlier ones left the board as found), record it either way. */
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await loadPlaywright();

  console.log(`[editor-harness] starting astro dev on :${PORT}…`);
  const dev = spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let devLog = '';
  dev.stdout.on('data', (d) => { devLog += d; });
  dev.stderr.on('data', (d) => { devLog += d; });

  let browser;
  let failed = 0;
  try {
    await waitForServer(`${BASE}/links`);
    console.log('[editor-harness] dev server is up');

    browser = await chromium.launch(
      existsSync(CHROME) ? { executablePath: CHROME } : {},
    );

    /* ---------------- desktop: the real interactions ---------------- */

    // A real page, not `/editor` — every board on `/editor` is mounted at
    // once (so switching boards there costs nothing), and every EMPTY page
    // layout hashes to the SAME scope class in scopeFor() (adaptive-grid.js),
    // since scope is derived from geometry and every empty board's geometry
    // is identical. An unscoped `.ag-cell` query on `/editor` silently reads
    // whichever empty board happens to be first in the DOM — a real finding,
    // not a harness bug, and worth its own line in the report. A real page
    // carries its header and footer chrome exactly once, so `.header-grid`
    // and `.footer-grid` (SiteChrome.astro) are unambiguous here.
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await desktop.newPage();
    page.on('pageerror', (err) => console.error('[page error]', err));
    page.on('console', (msg) => { if (msg.type() === 'error') console.error('[console]', msg.text()); });

    await page.goto(`${BASE}/links?edit=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ag-bar', { timeout: 10000 });
    await page.waitForSelector('.header-grid .ag-cell', { timeout: 10000 });
    await page.screenshot({ path: join(SHOTS, 'desktop-mounted.png') });

    await step('the editor mounts unlocked, on a fresh browser', async () => {
      const editing = await page.evaluate(() => document.documentElement.classList.contains('ag-editing'));
      const cellCount = await page.$$eval('.ag-cell', (n) => n.length);
      assert.ok(editing, 'html.ag-editing was not set');
      assert.ok(cellCount > 0, 'no checkerboard drawn — board reads locked');
    });

    await step('a press with no movement selects the tile', async () => {
      const p = await centerOf(page, '.header-grid #site-wordmark');
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.up();
      const selected = await page.$eval('.header-grid #site-wordmark', (n) => n.classList.contains('ag-selected'));
      assert.ok(selected, '#site-wordmark did not pick up .ag-selected');
    });

    await step('hold, then drag, moves a tile — and the toast offers Undo', async () => {
      const before = await boxOf(page, 'header', 'site-sun');
      assert.deepEqual(before, { col: [23, 2], row: [1, 2] }, 'unexpected starting position — layout drifted?');

      // Somewhere clearly empty: columns 17–22, row 1, are free between the
      // wordmark (ends at 16) and the sun (starts at 23). Y stays at the
      // tile's own center — site-sun is 2 rows tall, so a single checkerboard
      // cell's center sits half a row off its own and would smuggle in an
      // unintended row move alongside the intended column one.
      const from = await centerOf(page, '.header-grid #site-sun');
      const target = await cellRect(page, '.header-grid', 18, 1);
      await holdAndDragTo(page, '.header-grid #site-sun', target.x + target.width / 2, from.y);

      const after = await boxOf(page, 'header', 'site-sun');
      assert.ok(after, 'no box recorded after the drag');
      assert.notDeepEqual(after, before, 'site-sun did not move');
      assert.equal(after.col[1], before.col[1], 'a move must not change the span');

      const toastText = await page.$eval('.ag-toast', (n) => n.textContent);
      assert.match(toastText, /Moved|narrow position/, `unexpected toast: "${toastText}"`);
      const undoBtn = await page.$('.ag-toast-undo');
      assert.ok(undoBtn, 'the toast has no Undo button');

      await undoBtn.click();
      const reverted = await boxOf(page, 'header', 'site-sun');
      assert.deepEqual(reverted, before, 'the toast\'s own Undo did not put site-sun back');
    });

    await step('a corner grip resizes, and ⌘Z / Ctrl+Z reverses it', async () => {
      const before = await boxOf(page, 'header', 'site-home');
      assert.deepEqual(before, { col: [1, 2], row: [1, 2] }, 'unexpected starting position — layout drifted?');

      // Grow the SE corner two columns right, along the same row so the fixed
      // 2-row header height is never in question.
      const target = await cellRect(page, '.header-grid', 6, 1);
      await dragGripTo(
        page, '.header-grid #site-home .ag-grip-se',
        target.x + target.width - 2, target.y + target.height / 2,
      );

      const grown = await boxOf(page, 'header', 'site-home');
      assert.ok(grown, 'no box recorded after the resize');
      assert.ok(grown.col[1] > before.col[1], `span did not grow: ${before.col[1]} -> ${grown.col[1]}`);
      assert.equal(grown.col[0], before.col[0], 'a SE resize must not move the left edge');

      await page.keyboard.press('Control+z');
      const reverted = await boxOf(page, 'header', 'site-home');
      assert.deepEqual(reverted, before, 'Ctrl+Z did not put the resize back');
    });

    await page.screenshot({ path: join(SHOTS, 'desktop-after.png') });
    await desktop.close();

    /* ---------------- mobile: the board that matters most ---------------- */

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mpage = await mobile.newPage();
    mpage.on('pageerror', (err) => console.error('[mobile page error]', err));
    // The footer, not the header: header's narrow row is 8 columns wide and
    // all three of its objects already fill it edge to edge (2+4+2), so there
    // is nowhere legal to drag a tile TO. The footer's narrow board has a
    // whole free row (site-nav sits in row 1, site-colophon in row 3) —
    // genuine room, rather than a drag this board would correctly refuse.
    // Real page again, for the same reason as the desktop block above.
    await mpage.goto(`${BASE}/links?edit=1`, { waitUntil: 'networkidle' });
    await mpage.waitForSelector('.ag-bar', { timeout: 10000 });
    await mpage.waitForSelector('.footer-grid .ag-cell', { timeout: 10000 });
    await mpage.screenshot({ path: join(SHOTS, 'mobile-mounted.png') });

    await step('narrow reads its own device and the bar fits the width', async () => {
      const device = await mpage.evaluate(() => document.querySelector('.footer-grid')?.dataset.agDevice);
      assert.equal(device, 'narrow', 'a 390px viewport should read as the narrow device');
      const barBox = await mpage.$eval('.ag-bar', (n) => n.getBoundingClientRect());
      assert.ok(barBox.width <= 390 + 1, `the bar (${barBox.width}px) overflows a 390px phone`);
    });

    await step('a mouse-simulated hold still moves a tile at narrow width', async () => {
      const before = await boxOf(mpage, 'footer', 'site-nav', 'narrow');
      assert.deepEqual(before, { col: [1, 8], row: [1, 1] }, 'unexpected starting position — layout drifted?');
      // Straight down into row 2, which nothing occupies — full width, so the
      // column must not need to change, only the row.
      const from = await centerOf(mpage, '.footer-grid #site-nav');
      const target = await cellRect(mpage, '.footer-grid', 1, 2);
      await holdAndDragTo(mpage, '.footer-grid #site-nav', from.x, target.y + target.height / 2);
      const after = await boxOf(mpage, 'footer', 'site-nav', 'narrow');
      assert.ok(after, 'no narrow box recorded after the drag');
      // Not asserting the whole box — only that narrow's own stored box moved,
      // proving device() picked `narrow` rather than silently writing `desk`.
      assert.notDeepEqual(after, before, 'the narrow box did not change');
      assert.equal(after.row[0], 2, `expected row 2, landed on row ${after.row[0]}`);
    });

    await mpage.screenshot({ path: join(SHOTS, 'mobile-after.png') });
    await mobile.close();
  } catch (err) {
    console.error('[editor-harness] setup or navigation failed before all steps ran:', err);
  } finally {
    if (browser) await browser.close();
    dev.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    failed = results.filter((r) => !r.ok).length;
    if (failed && devLog) console.log('\n[editor-harness] dev server log:\n' + devLog);
  }

  console.log(`\n[editor-harness] ${results.length - failed}/${results.length} passed. Screenshots in ${SHOTS}/`);
  process.exit(failed || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[editor-harness] crashed:', err);
  process.exit(1);
});
