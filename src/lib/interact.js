/**
 * What a published page does on its own.
 *
 * Three objects have live behaviour that has nothing to do with editing, so it
 * cannot live in editor.js — a visitor never downloads that. A fold opens and
 * shuts; an accordion opens one of its items at a time; a feed of works
 * narrows to a tag when a chip is pressed. All three are a class and an aria
 * state, and that is the whole file.
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

  // Clicking away shuts an open fold, which is what a dropdown does.
  if (!e.target.closest('.ob-fold')) closeOthers(null);
}

export function wireInteractions(root = document) {
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOthers(null);
  });
}
