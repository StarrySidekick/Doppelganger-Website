/**
 * The one thing on a page that makes sound.
 *
 * Every record and the turntable share it, so one record plays at a time and
 * all of them agree about which. It plays a record one of two ways:
 *
 * - **Through SoundCloud** (`data.sound`, a track's address). Audio cannot be
 *   committed to the repository (git keeps every version of every file
 *   forever), so the songs live on SoundCloud and play through their widget,
 *   hidden, the way the /music player always has. The widget can play,
 *   pause, seek and set the volume, and nothing else: it cannot change speed.
 * - **From a file** (`data.audio`, an address of an mp3 hosted anywhere).
 *   Then it is an <audio> element, which CAN change speed, and with pitch
 *   following speed, which is what a turntable at 45 does to a 33.
 *
 * Nothing is loaded until somebody presses a record: the widget's script, its
 * iframe and the file all wait for the first press.
 *
 * State is one object, handed to every subscriber whenever it changes. The
 * position is where it was at `at` (performance.now()); while playing, the
 * real position is that plus the time since, times the rate. `positionNow()`
 * does the sum, so a spinning record does not have to wait for the widget's
 * next progress report to move.
 */

const WIDGET_API = 'https://w.soundcloud.com/player/api.js';

const state = {
  id: '', title: '', color: '', sound: '', audio: '',
  playing: false, loading: false,
  pos: 0, at: 0, dur: 0,
  rate: 1, volume: 80, loop: false,
  engine: '',
};

const subscribers = new Set();
const emit = () => { for (const fn of subscribers) fn(state); };

/** Hear about every change, starting with now. Returns how to stop. */
export function subscribe(fn) {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

/** Where the needle is, in milliseconds, this instant. */
export function positionNow() {
  if (!state.playing || state.loading) return state.pos;
  const p = state.pos + (performance.now() - state.at) * state.rate;
  return state.dur ? Math.min(p, state.dur) : p;
}

const setPos = (ms) => { state.pos = Math.max(0, ms); state.at = performance.now(); };

/** Can the record being played change speed? Only a file can. */
export const canChangeSpeed = () => state.engine === 'audio';

/* ------------------------------------------------------------------ *
 * The records on the page, in the order they are read
 * ------------------------------------------------------------------ */

/** A record's object as the track it plays. */
export function trackOf(o) {
  const d = o?.data ?? {};
  return {
    id: o?.id ?? '', title: d.title ?? '', color: d.color ?? '',
    sound: d.sound ?? '', audio: d.audio ?? '',
    length: Number(d.length) || 0,
  };
}

/** Every record on the page, top to bottom then left to right. */
export function records() {
  const all = [...document.querySelectorAll('[data-custom="disc"]')].map((el) => {
    let o = {};
    try { o = JSON.parse(el.dataset.o || '{}'); } catch { /* skip it */ }
    const b = el.getBoundingClientRect();
    return { el, track: trackOf(o), top: b.top + scrollY, left: b.left };
  }).filter((r) => r.track.sound || r.track.audio);
  // Two records whose tops are within a few pixels share a row.
  all.sort((a, b) => (Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left));
  return all.map((r) => r.track);
}

function step(by) {
  const list = records();
  if (!list.length) return;
  const at = list.findIndex((t) => t.id === state.id);
  const next = list[((at < 0 ? 0 : at + by) % list.length + list.length) % list.length];
  play(next);
}
export const next = () => step(1);
export const prev = () => {
  // A record well under way goes back to its start first, as every player does.
  if (positionNow() > 3000) seek(0);
  else step(-1);
};

/* ------------------------------------------------------------------ *
 * SoundCloud
 * ------------------------------------------------------------------ */

let api = null;
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

let widget = null;      // a promise of the widget, made on the first press
let widgetSound = '';   // what it has loaded

const widgetUrl = (sound) => 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(sound)
  + '&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false';

function makeWidget(sound) {
  widget = loadApi().then((SC) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.allow = 'autoplay';
    frame.title = 'SoundCloud player';
    frame.src = widgetUrl(sound);
    document.body.append(frame);
    widgetSound = sound;
    const w = SC.Widget(frame);
    const E = SC.Widget.Events;
    w.bind(E.READY, () => resolve(w));
    w.bind(E.PLAY, () => {
      if (state.engine !== 'sc') return;
      state.playing = true; state.loading = false; setPos(state.pos);
      w.getDuration((d) => { if (d) { state.dur = d; emit(); } });
      w.setVolume(state.volume);
      emit();
    });
    w.bind(E.PAUSE, () => { if (state.engine === 'sc') { state.playing = false; emit(); } });
    w.bind(E.FINISH, () => { if (state.engine === 'sc') finished(); });
    w.bind(E.PLAY_PROGRESS, (p) => {
      if (state.engine !== 'sc' || scratching) return;
      setPos(p.currentPosition || 0);
      emit();
    });
  }));
  widget.catch(() => { widget = null; state.loading = false; emit(); });
  return widget;
}

/* ------------------------------------------------------------------ *
 * A file
 * ------------------------------------------------------------------ */

let audio = null;
function audioEl() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  // Speed takes the pitch with it, as on a turntable.
  audio.preservesPitch = false;
  audio.webkitPreservesPitch = false;
  audio.addEventListener('playing', () => { if (state.engine === 'audio') { state.playing = true; state.loading = false; setPos(audio.currentTime * 1000); emit(); } });
  audio.addEventListener('pause', () => { if (state.engine === 'audio') { state.playing = false; setPos(audio.currentTime * 1000); emit(); } });
  audio.addEventListener('ended', () => { if (state.engine === 'audio') finished(); });
  audio.addEventListener('loadedmetadata', () => { if (state.engine === 'audio') { state.dur = audio.duration * 1000; emit(); } });
  audio.addEventListener('timeupdate', () => { if (state.engine === 'audio' && !scratching) { setPos(audio.currentTime * 1000); emit(); } });
  return audio;
}

/* ------------------------------------------------------------------ *
 * What a person can do
 * ------------------------------------------------------------------ */

/** Play a record from its start, or carry on with it if it is the one on. */
export async function play(track) {
  if (!track || !(track.sound || track.audio)) return;
  if (track.id === state.id && state.engine) return resume();

  pauseEngine();
  Object.assign(state, {
    id: track.id, title: track.title, color: track.color, sound: track.sound, audio: track.audio,
    dur: (track.length || 0) * 1000, loading: true, playing: false,
    engine: track.audio ? 'audio' : 'sc',
  });
  setPos(0);
  emit();

  if (state.engine === 'audio') {
    const a = audioEl();
    a.src = track.audio;
    a.playbackRate = state.rate;
    a.volume = state.volume / 100;
    a.play().catch(() => { state.loading = false; emit(); });
    return;
  }
  // The widget is made on the first press, with this record already in it,
  // and told to play once it is ready. After that it is reloaded with the
  // next record, and its own auto_play starts it.
  if (!widget) {
    const w = await makeWidget(track.sound);
    if (state.id === track.id) w.play();
  } else {
    const w = await widget;
    if (widgetSound !== track.sound) {
      widgetSound = track.sound;
      w.load(track.sound, { auto_play: true, hide_related: true, show_comments: false, show_user: false, visual: false });
    } else {
      w.seekTo(0);
      w.play();
    }
  }
}

function pauseEngine() {
  if (state.engine === 'audio') audio?.pause();
  if (state.engine === 'sc') widget?.then((w) => w.pause());
}

export function pause() {
  if (!state.engine) return;
  setPos(positionNow());
  pauseEngine();
  state.playing = false;
  emit();
}

export function resume() {
  if (!state.engine) return;
  if (state.engine === 'audio') audio?.play();
  if (state.engine === 'sc') widget?.then((w) => w.play());
}

export function toggle(fallback) {
  if (!state.engine) return play(fallback ?? records()[0]);
  return state.playing ? pause() : resume();
}

/** Move the needle to a place in the record, in milliseconds. */
export function seek(ms) {
  if (!state.engine) return;
  const to = Math.max(0, state.dur ? Math.min(ms, state.dur - 250) : ms);
  setPos(to);
  if (state.engine === 'audio' && audio) audio.currentTime = to / 1000;
  if (state.engine === 'sc') widget?.then((w) => w.seekTo(to));
  emit();
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(100, Number(v) || 0));
  if (audio) audio.volume = state.volume / 100;
  widget?.then((w) => w.setVolume(state.volume));
  emit();
}

/** Speed, as a multiple of 33⅓: 1, 1.35 (45) or 2.34 (78). A file only. */
export function setRate(r) {
  if (!canChangeSpeed()) return;
  setPos(positionNow());
  state.rate = r;
  if (audio) audio.playbackRate = r;
  emit();
}

export function setLoop(on) { state.loop = !!on; emit(); }

/**
 * Holding the record. While a hand is on it the sound stops, as it does on a
 * real one, and progress reports are ignored so the record stays where the
 * hand put it; letting go moves the needle there and carries on if it was
 * playing.
 */
let scratching = false;
let wasPlaying = false;
export function hold() {
  if (!state.engine || scratching) return;
  scratching = true;
  wasPlaying = state.playing;
  setPos(positionNow());
  pauseEngine();
  state.playing = false;
  emit();
}
export function release(ms) {
  if (!scratching) return;
  scratching = false;
  seek(ms);
  if (wasPlaying) resume();
}

function finished() {
  state.playing = false;
  setPos(state.dur);
  emit();
  if (state.loop) { seek(0); resume(); return; }
  // Like an album: the next record on the page, and stop after the last.
  const list = records();
  const at = list.findIndex((t) => t.id === state.id);
  if (at >= 0 && at < list.length - 1) play(list[at + 1]);
}

/** Minutes and seconds, the way a player shows them. */
export const clock = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
