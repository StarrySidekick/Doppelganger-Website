/**
 * Build Squarespace code blocks from the widget sources.
 *
 * A code block cannot reference a file in this repo, so each widget has to
 * arrive as one self-contained blob of markup, styles and behaviour. This
 * composes widgets/<name>/{widget.html,widget.css,widget.js} into that blob and
 * writes it to widgets/dist/.
 *
 * Two outputs per widget:
 *   <name>.block.html    paste this into a Squarespace code block
 *   <name>.preview.html  the same block inside a deliberately hostile page,
 *                        for looking at it before it goes near the live site
 *
 * Isolation is by shadow root. Squarespace's stylesheet cannot reach in, the
 * widget's styles cannot leak out, and two blocks on one page cannot collide —
 * which is the whole reason this is worth a build step rather than a snippet
 * pasted by hand.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'widgets');
const OUT = join(SRC, 'dist');

/**
 * Make a string safe to sit inside a <script> in an HTML document.
 *
 * `</script>` anywhere in a JS string literal ends the script element, even
 * inside quotes — the HTML parser does not know it is in a string. Breaking
 * the sequence is the fix; the JS value is unchanged.
 */
const forScript = (s) => JSON.stringify(s).replace(/<\//g, '<\\/');

const sha = (() => {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return 'unknown'; }
})();

function buildOne(name) {
  const dir = join(SRC, name);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const html = readFileSync(join(dir, 'widget.html'), 'utf8').trim();
  const css = readFileSync(join(dir, 'widget.css'), 'utf8').trim();
  const js = readFileSync(join(dir, 'widget.js'), 'utf8').trim();

  // The provenance header is the only thing tying a block sitting in the
  // Squarespace admin back to the source that produced it. There is no git on
  // that side, so the block has to carry its own version.
  const header = `<!-- ${meta.name} v${meta.version} · doppelganger@${sha} · do not hand-edit, rebuild with npm run widgets -->`;

  // The block should work the moment it is pasted, so the host div carries the
  // real defaults. These are the bit that is meant to be edited by hand in the
  // Squarespace admin — everything below the div is generated.
  const attrs = Object.entries(meta.defaults ?? {})
    .map(([k, v]) => `\n  ${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');

  const block = `${header}
<div data-sk-widget="${meta.name}"${attrs}></div>
<script>
(function () {
  var CSS = ${forScript(css)};
  var HTML = ${forScript(html)};

  function mount(host) {
    // Squarespace re-runs inline scripts when it ajax-loads a page, so a
    // second pass must not build a second shadow root on the same element.
    if (host.hasAttribute('data-sk-ready')) return;
    host.setAttribute('data-sk-ready', '');

    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstChild) root.appendChild(wrap.firstChild);

    try {
      (function (host, root) {
${js.split('\n').map((l) => (l ? '        ' + l : '')).join('\n')}
      })(host, root);
    } catch (err) {
      // A broken widget must not take the rest of the page down with it.
      if (window.console) console.error('[${meta.name}]', err);
    }
  }

  var all = document.querySelectorAll('[data-sk-widget="${meta.name}"]');
  for (var i = 0; i < all.length; i++) mount(all[i]);
})();
</script>`;

  return { meta, block };
}

/** A page that does everything Squarespace might do to a widget, and worse. */
function preview(meta, block) {
  return `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${meta.title} — hostile host preview</title>
<style>
  /* ---- deliberately hostile host styles ----
     This page is not a neutral test. It reproduces the kinds of global rules a
     Squarespace theme actually ships, including the exact collision that
     rotated the business card on the wrong axis for months. If the widget
     survives here it will survive on the live site. */
  @keyframes spin { from { transform: rotateX(0deg) } to { transform: rotateX(360deg) } }
  @keyframes cardSpinY { from { transform: scale(.2) } to { transform: scale(.2) } }
  * { box-sizing: content-box; }
  div { margin: 14px; }
  img { width: 40px !important; height: 40px !important; border: 3px dashed red; }
  .card, .face, .stage { background: red !important; opacity: .2 !important; }
  #card { display: none !important; }
  body {
    margin: 0; background: #101014; color: #eee;
    font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
    padding: 2rem clamp(1rem, 5vw, 3rem) 4rem;
  }
  h1 { font-size: 1.3rem; font-weight: 600; margin: 0 0 .35rem; }
  p.note { opacity: .55; font-size: .85rem; margin: 0 0 2rem; max-width: 60ch; }
  .probe {
    border: 1px solid #444; padding: .8rem 1rem; margin: 2rem 0 0;
    font: 12px/1.4 ui-monospace, monospace; color: #9ad;
  }
  .frame { border: 1px dashed #333; padding: 1.5rem; }
</style>

<h1>${meta.title}</h1>
<p class="note">${meta.description}</p>
<p class="note">
  This page applies hostile global CSS on purpose — a conflicting
  <code>spin</code> keyframe, <code>img { width: 40px !important }</code>,
  <code>* { box-sizing: content-box }</code> and a red wash on
  <code>.card</code>. The widget below should be completely unaffected.
</p>

<div class="frame">
  ${block.split('\n').join('\n  ')}
</div>

<div class="probe" id="probe">
  Host probe — this text and the box around it must keep the host page's own
  styling. If the widget leaked, this would change.
</div>
`;
}

function galleryPage(built) {
  return `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Widget bench</title>
<style>
  body { margin:0; background:#0f0f13; color:#eaeaf0;
    font:16px/1.6 ui-sans-serif, system-ui, sans-serif;
    padding: 3rem clamp(1rem,5vw,4rem) 5rem; }
  h1 { font-size:1.6rem; margin:0 0 .4rem; }
  p.lede { opacity:.6; margin:0 0 2.5rem; max-width:60ch; }
  ul { list-style:none; padding:0; margin:0; display:grid; gap:1rem;
    grid-template-columns:repeat(auto-fill,minmax(17rem,1fr)); }
  li { border:1px solid #2a2a33; border-radius:5px; padding:1rem 1.1rem; }
  h2 { font-size:1rem; margin:0 0 .3rem; }
  .d { opacity:.55; font-size:.86rem; margin:0 0 .8rem; }
  a { color:#9d9bea; font:12px/1 ui-monospace,monospace; margin-right:1rem; }
</style>
<h1>Widget bench</h1>
<p class="lede">Each widget builds to a self-contained Squarespace code block.
Open the preview to see it inside a deliberately hostile page before it goes
anywhere near the live site.</p>
<ul>
${built.map(({ meta }) => `  <li>
    <h2>${meta.title}</h2>
    <p class="d">${meta.description}</p>
    <a href="./${meta.name}.preview.html">preview</a>
    <a href="./${meta.name}.block.html">block</a>
  </li>`).join('\n')}
</ul>
`;
}

export function widgetNames() {
  if (!existsSync(SRC)) return [];
  return readdirSync(SRC)
    .filter((n) => statSync(join(SRC, n)).isDirectory() && n !== 'dist')
    .sort();
}

export function buildAll() {
  mkdirSync(OUT, { recursive: true });
  const built = widgetNames().map((name) => {
    const { meta, block } = buildOne(name);
    writeFileSync(join(OUT, `${meta.name}.block.html`), block + '\n');
    writeFileSync(join(OUT, `${meta.name}.preview.html`), preview(meta, block));
    console.log(`  ${meta.name} v${meta.version}  ${(block.length / 1024).toFixed(1)} KB`);
    return { meta, block };
  });
  writeFileSync(join(OUT, 'index.html'), galleryPage(built));
  console.log(`built ${built.length} widget(s) → widgets/dist/`);
  return built;
}

// Only build when run directly, so the tests can import the pieces.
if (process.argv[1] && process.argv[1].endsWith('build-widgets.mjs')) buildAll();

export { forScript, buildOne };
