/**
 * What a published page does on its own.
 *
 * Some objects have live behaviour that has nothing to do with editing, so it
 * cannot live in editor.js — a visitor never downloads that. A fold opens and
 * shuts; an accordion opens one of its items at a time; a feed of works
 * narrows to a tag when a chip is pressed; a carousel turns; a player drives
 * SoundCloud; a shuffle tints the page; and the look's sparks fly from a
 * click. Nothing here knows which site it is on — every address it uses is
 * on the element it was handed.
 *
 * One delegated listener on the document, the way Bureau keeps one set in
 * wire.js, so any number of folds cost one handler.
 */

/** Shut every fold except the one asked for. A dropdown that stacks is a mess. */
function closeOthers(except) {
  for (const tab of document.querySelectorAll('[data-fold][aria-expanded="true"]')) {
    if (tab === except) continue;
    tab.setAttribute('aria-expanded', 'false');
    tab.parentElement?.querySelector(':scope > .ob-fold')?.setAttribute('hidden', '');
  }
}

function onClick(e) {
  // A fold. Its panel is the next sibling of the tab, inside the same tile.
  const tab = e.target.closest('[data-fold]');
  if (tab) {
    const panel = tab.parentElement?.querySelector(':scope > .ob-fold');
    if (!panel) return;
    const open = tab.getAttribute('aria-expanded') === 'true';
    closeOthers(tab);
    tab.setAttribute('aria-expanded', String(!open));
    panel.toggleAttribute('hidden', open);
    return;
  }

  // An accordion item, inside a holder. One open at a time within its own
  // holder — a different holder on the same page keeps its own state.
  const acc = e.target.closest('[data-acc]');
  if (acc) {
    const holder = acc.closest('.ob-holds');
    const panel = acc.parentElement?.querySelector(':scope > .ob-panel');
    if (!holder || !panel) return;
    const open = acc.getAttribute('aria-expanded') === 'true';
    for (const other of holder.querySelectorAll('[data-acc]')) {
      other.setAttribute('aria-expanded', 'false');
      other.parentElement?.querySelector(':scope > .ob-panel')?.setAttribute('hidden', '');
    }
    acc.setAttribute('aria-expanded', String(!open));
    panel.toggleAttribute('hidden', open);
    return;
  }

  // A tag chip on a feed of works. One tag at a time, and "All" clears it —
  // a portfolio filter is a lens, not a query builder, and two tags at once
  // reliably produces an empty page and no idea why.
  const chip = e.target.closest('.ob-tag');
  if (chip) {
    const feed = chip.closest('[data-feed]');
    if (!feed) return;
    const want = chip.dataset.tag || '';
    for (const other of feed.querySelectorAll('.ob-tag')) {
      other.setAttribute('aria-pressed', String((other.dataset.tag || '') === want));
    }
    for (const work of feed.querySelectorAll('[data-work]')) {
      // data-tags is pipe-delimited, so this matches a whole tag rather than a
      // word inside one: "Score" must not match "Scorekeeper".
      work.hidden = !!want && !(work.dataset.tags || '').includes(`|${want}|`);
    }
    return;
  }

  // A carousel key: back, forward, or go to what is showing.
  const car = e.target.closest('[data-car]');
  if (car) {
    const holder = car.closest('[data-carousel]');
    if (!holder) return;
    if (car.dataset.car === 'go') {
      const at = holder.querySelector('.ob-frame[data-current]');
      const href = at?.dataset.href;
      if (!href) return;
      if (at.hasAttribute('data-ext')) window.open(href, '_blank', 'noopener');
      else window.location.href = href;
      return;
    }
    turnCarousel(holder, Number(car.dataset.car) || 0);
    return;
  }

  // A player's buttons. The widget is made on first use if the page has not
  // made it yet — a player drawn by the editor after the page loaded.
  const key = e.target.closest('[data-play-act]');
  if (key) {
    const player = key.closest('[data-player]');
    const act = key.dataset.playAct;
    widgetFor(player)?.then((w) => {
      if (act === 'toggle') w.toggle();
      else if (act === 'prev') w.prev();
      else if (act === 'next') w.next();
    });
    return;
  }

  // Clicking away shuts an open fold, which is what a dropdown does.
  if (!e.target.closest('.ob-fold')) closeOthers(null);
}

/* ------------------------------------------------------------------ *
 * A carousel
 * ------------------------------------------------------------------ */

/** Show frame `i` of a carousel, or step by `by` from the one showing. */
function showFrame(holder, i) {
  const frames = [...holder.querySelectorAll('.ob-frame')];
  if (!frames.length) return;
  const at = ((i % frames.length) + frames.length) % frames.length;
  frames.forEach((f, n) => f.toggleAttribute('data-current', n === at));
}
function turnCarousel(holder, by) {
  const frames = [...holder.querySelectorAll('.ob-frame')];
  const now = frames.findIndex((f) => f.hasAttribute('data-current'));
  showFrame(holder, (now < 0 ? 0 : now) + by);
}

/** Pointing at a hotspot shows the frame it belongs to. */
function onOver(e) {
  const spot = e.target.closest?.('[data-spot]');
  if (!spot) return;
  const holder = spot.closest('[data-carousel]');
  if (holder) showFrame(holder, Number(spot.dataset.spot));
}

/* ------------------------------------------------------------------ *
 * A player — SoundCloud's widget, hidden, driven by our own buttons
 * ------------------------------------------------------------------ */

const WIDGET_API = 'https://w.soundcloud.com/player/api.js';
let api = null;
/** Load SoundCloud's widget API once, and only on a page that asks for it. */
function loadApi() {
  api ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = WIDGET_API;
    s.onload = () => resolve(window.SC);
    s.onerror = () => { api = null; reject(new Error('SoundCloud did not load')); };
    document.head.append(s);
  });
  return api;
}

const widgets = new WeakMap();
/**
 * The widget behind one player, made on first ask. It lives in an iframe the
 * visitor never sees; everything they touch is the player's own markup.
 */
function widgetFor(player) {
  if (!player?.dataset.src) return null;
  if (widgets.has(player)) return widgets.get(player);
  const made = loadApi().then((SC) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.allow = 'autoplay';
    frame.title = 'SoundCloud player';
    frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(player.dataset.src)
      + '&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false';
    player.append(frame);
    const w = SC.Widget(frame);
    const title = player.querySelector('.ob-play-title');
    const scrub = player.querySelector('.ob-play-scrub');
    const toggle = player.querySelector('[data-play-act="toggle"] [data-play]');
    let length = 0;
    let dragging = false;
    const named = () => w.getCurrentSound((s) => { if (s?.title && title) title.textContent = s.title; });
    const measure = () => w.getDuration((d) => { length = d || 0; });
    const face = (playing) => {
      if (!toggle) return;
      const src = playing ? toggle.dataset.pause : toggle.dataset.play;
      if (src) toggle.src = src;
    };
    w.bind(SC.Widget.Events.READY, () => { named(); measure(); resolve(w); });
    w.bind(SC.Widget.Events.PLAY, () => { named(); measure(); face(true); });
    w.bind(SC.Widget.Events.PAUSE, () => face(false));
    w.bind(SC.Widget.Events.FINISH, () => face(false));
    w.bind(SC.Widget.Events.PLAY_PROGRESS, (p) => {
      if (!dragging && scrub) scrub.value = String(Math.round((p.relativePosition || 0) * 1000));
    });
    if (scrub) {
      scrub.addEventListener('input', () => { dragging = true; });
      scrub.addEventListener('change', () => {
        dragging = false;
        if (length) w.seekTo((Number(scrub.value) / 1000) * length);
      });
    }
  }));
  made.catch(() => widgets.delete(player));
  widgets.set(player, made);
  return made;
}

/* ------------------------------------------------------------------ *
 * The shuffle — the sun on the Squarespace site
 * ------------------------------------------------------------------ */

/*
 * Press it and the page takes a random tint; hold it three seconds and the
 * tint goes. Remembered per page, so a page keeps the mood you left it in.
 * The ranges are the Squarespace script's own. Edit mode is exempt: a filter
 * on <body> would also make it the containing block for every fixed thing,
 * which is the editor's bar.
 */
const HOLD_MS = 3000;
const moodKey = () => 'dd-mood:' + location.pathname;
const editing = () => document.documentElement.classList.contains('ag-editing');
function applyMood(v) { document.body.style.filter = v || ''; }
function shuffleMood() {
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const v = `invert(${pick([0, 5, 10, 15, 20, 25, 30])}%) sepia(${Math.floor(Math.random() * 10) * 10}%)`
    + ` hue-rotate(${Math.floor(Math.random() * 361)}deg) brightness(${100 + Math.floor(Math.random() * 101)}%)`;
  applyMood(v);
  try { localStorage.setItem(moodKey(), v); } catch { /* private mode: still tinted, just not remembered */ }
}
function clearMood() {
  applyMood('');
  try { localStorage.removeItem(moodKey()); } catch { /* ignore */ }
}
let holdTimer = 0;
let heldLong = false;
function onDown(e) {
  if (!e.target.closest?.('[data-shuffle]') || editing()) return;
  heldLong = false;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { heldLong = true; clearMood(); }, HOLD_MS);
}
function onUp() { clearTimeout(holdTimer); }
function onShuffle(e) {
  const b = e.target.closest?.('[data-shuffle]');
  if (!b || editing()) return false;
  // A hold that already put the colours back is not also a press.
  if (!heldLong) shuffleMood();
  heldLong = false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Sparks — a picture thrown from every click
 * ------------------------------------------------------------------ */

/*
 * The look may name a picture (`sparks`), and Base puts its address on
 * <body data-sparks>. Each click throws five, which fall and fade. They are
 * appended to <html>, not <body>, so a shuffled tint on body cannot become
 * their containing block and knock them off the pointer.
 */
function spark(src, x, y) {
  const img = document.createElement('img');
  img.src = src; img.alt = ''; img.className = 'ob-spark';
  img.setAttribute('aria-hidden', 'true');
  document.documentElement.append(img);
  const a = Math.random() * Math.PI * 2;
  const speed = Math.random() * 4 + 1;
  let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed, turn = 0, alpha = 1;
  const spin = Math.random() * 4 + 2;
  const step = () => {
    x += vx; y += vy; vy += 0.2; turn += spin; alpha -= 0.01;
    img.style.transform = `translate(${x}px, ${y}px) rotate(${turn}deg)`;
    img.style.opacity = String(alpha);
    if (alpha <= 0 || y > innerHeight + 40 || x < -40 || x > innerWidth + 40) img.remove();
    else requestAnimationFrame(step);
  };
  step();
}
function onSparks(e) {
  const src = document.body.dataset.sparks;
  if (!src || editing() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // A tool on the page — the 3D editor — is somewhere to work, not to play.
  if (e.target.closest?.('[data-quiet]')) return;
  for (let i = 0; i < 5; i++) spark(src, e.clientX - 16, e.clientY - 16);
}

/**
 * A form object, sent without leaving the page.
 *
 * The form is a plain POST to Web3Forms, so a browser with no script still
 * sends it and lands on their thank-you page. With script it is sent from
 * here and the page says "Sent" where the fields were. Nothing about the
 * address or the key lives in this file — both are on the form.
 */
async function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form || form.hasAttribute('data-unready')) return;
  e.preventDefault();
  const btn = form.querySelector('.ob-send');
  const was = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.success === false) throw new Error(out.message || `The form service said ${res.status}`);
    form.setAttribute('data-sent', '');
    form.querySelector('.ob-sent')?.removeAttribute('hidden');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = was; }
    const note = form.querySelector('.ob-sent');
    if (note) { note.textContent = `Could not send — ${err.message}`; note.removeAttribute('hidden'); }
  }
}

export function wireInteractions(root = document) {
  root.addEventListener('click', (e) => { onSparks(e); if (!onShuffle(e)) onClick(e); });
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('mouseover', onOver);
  root.addEventListener('focusin', onOver);
  // A page keeps the tint it was left in.
  try { if (!editing()) applyMood(localStorage.getItem(moodKey())); } catch { /* ignore */ }
  // A player learns its first track's title as soon as the page is up, the
  // way the Squarespace one did; its sound still waits for a press.
  for (const p of document.querySelectorAll('[data-player]')) widgetFor(p)?.catch(() => {});
  // 3D models. The renderer is only fetched on a page that has one — or the
  // moment the editor puts one down on a page that did not.
  const wake = () => import('./model-view.js').then(({ wakeModels }) => wakeModels());
  if (document.querySelector('canvas[data-model]')) wake();
  else {
    const mo = new MutationObserver(() => {
      if (document.querySelector('canvas[data-model]')) { mo.disconnect(); wake(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOthers(null);
  });
}
