/**
 * Runs once per host element, with `host` (the div in the page) and `root`
 * (its shadow root) already set up by the wrapper the build emits.
 *
 * Everything configurable comes off data attributes, so the same pasted block
 * can be used more than once on a page with different cards in it.
 */
const front = host.getAttribute('data-front');
const back = host.getAttribute('data-back') || front;
const holo = host.getAttribute('data-holo');
const size = host.getAttribute('data-size');
const speed = host.getAttribute('data-speed');
const label = host.getAttribute('data-label') || 'Business card';

if (!front) {
  // Say what is wrong and how to fix it, rather than rendering an empty box.
  host.textContent = 'Flip card: add a data-front="…" image URL.';
  return;
}

if (size) host.style.setProperty('--sk-size', parseInt(size, 10) + 'px');
if (speed) host.style.setProperty('--sk-speed', parseFloat(speed) + 's');
if (holo) host.style.setProperty('--sk-holo', 'url("' + holo + '")');

const f = root.querySelector('[data-role="front"]');
const b = root.querySelector('[data-role="back"]');
f.src = front;
b.src = back;

// One face carries the description; the other is decorative, so a screen
// reader announces the card once rather than twice.
f.alt = label;
b.alt = '';
