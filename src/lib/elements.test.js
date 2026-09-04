/**
 * Tests for objects, attributes, kinds and faces.
 *
 * The rendered markup is asserted literally where it replaced markup a person
 * had written by hand, because the two must agree attribute for attribute. A
 * layout that renders "nearly" the same image is a regression nobody would
 * notice from a passing build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRS, KINDS, FACES, PICKER_KINDS, has, attrsOf, kindOf, faceOf, isTyped, isInline, isContainer,
  fieldsOf, getField, setField, renderElement, checkElement, upgradeElement, unsafeHtml, escapeHtml, tiltFor, makeItem, itemsOf,
  setKind, toggleAttr, feedOf, USER_ATTRS,
} from './elements.js';

/** Stand-ins for what AdaptiveGrid.astro supplies from assets.js. */
const ctx = {
  image: (m) => ({
    src: m.src === 'asset:home' ? 'https://cdn/Home.gif?format=300w' : m.src,
    srcset: m.widths ? 'https://cdn/Home.gif?format=100w 100w, https://cdn/Home.gif?format=300w 300w' : undefined,
    sizes: m.sizes,
  }),
  link: (href) => (href?.startsWith('/') ? '/Doppelganger-Website' + href : href),
};

test('an object with no kind is a slot, and a slot renders nothing', () => {
  assert.equal(kindOf({ id: 'a' }), 'slot');
  assert.equal(isTyped({ id: 'a' }), false);
  assert.equal(renderElement({ id: 'a' }, ctx), null);
  // Which is what keeps every layout written before this rendering from its page.
  assert.equal(kindOf({ id: 'a', kind: 'nonsense' }), 'slot');
});

test('attributes come from the kind unless the object says otherwise', () => {
  assert.deepEqual(attrsOf({ kind: 'image' }), ['media', 'link']);
  assert.deepEqual(attrsOf({ kind: 'image', attrs: ['media'] }), ['media']);
  assert.equal(has({ kind: 'drawer' }, 'container'), true);
  assert.equal(isContainer({ kind: 'note' }), false);
  // Never inferred from a name: a note told to carry a link, carries one.
  assert.equal(has({ kind: 'note', attrs: ['text', 'link'] }, 'link'), true);
  // Every kind's attributes are real attributes.
  for (const [k, def] of Object.entries(KINDS)) for (const a of def.attrs) assert.ok(ATTRS[a], `${k} carries unknown ${a}`);
  for (const k of PICKER_KINDS) assert.ok(KINDS[k]);
});

test('a face is per object, then the kind\'s, and always a real face', () => {
  assert.equal(faceOf({ kind: 'drawer' }), 'front');
  assert.equal(faceOf({ kind: 'drawer', face: 'spine' }), 'spine');
  assert.equal(faceOf({ kind: 'drawer', face: 'nope' }), 'front');
  for (const def of Object.values(KINDS)) assert.ok(FACES[def.face], def.label);
});

test('a linked picture matches the hand-written markup it replaced', () => {
  const html = renderElement({
    id: 'nav-home', kind: 'image',
    media: { src: 'asset:home', alt: 'Home', width: 480, height: 480, sizes: '120px', widths: [100, 300] },
    link: '/',
  }, ctx);
  // The link goes through ctx.link, which applies the deploy subpath — a bare
  // href="/" silently breaks navigation on project Pages.
  assert.match(html, /^<a class="ob-link" href="\/Doppelganger-Website\/" aria-label="Home">/);
  assert.match(html, /srcset="[^"]*100w[^"]*300w"/, 'the CDN srcset survives');
  assert.match(html, /sizes="120px"/);
  assert.match(html, /width="480" height="480"/);
  // Inside a labelled link the image is decorative; the anchor holds the name.
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /aria-hidden/);
});

test('a standalone decorative picture is hidden from assistive tech', () => {
  const html = renderElement({ kind: 'image', media: { src: 'u', alt: '', width: 128, height: 128 } }, ctx);
  assert.equal(html, '<img class="ob-img" src="u" width="128" height="128" alt="" aria-hidden="true" />');
});

test('a note renders its body as an editable field; raw html does not', () => {
  assert.equal(renderElement({ kind: 'note', body: 'hi <b>x</b>' }, ctx), '<div class="ob-body" data-edit="body">hi <b>x</b></div>');
  assert.equal(renderElement({ kind: 'html', body: '<section>x</section>' }, ctx), '<section>x</section>');
  assert.equal(isInline({ kind: 'note' }), true);
  assert.equal(isInline({ kind: 'html' }), false);
  assert.equal(isInline({ kind: 'image' }), false);
});

test('a drawer draws picture, title and the way in, from its attributes', () => {
  const html = renderElement({ kind: 'drawer', title: 'Writing', link: '/writing', media: { src: 'u' } }, ctx);
  assert.match(html, /^<a class="ob-link" href="\/Doppelganger-Website\/writing" aria-label="Writing">/);
  assert.match(html, /<img class="ob-img" src="u"/);
  assert.match(html, /<span class="ob-title" data-edit="title">Writing<\/span>/);
});

test('site-relative links in a body go through the resolver; external ones do not', () => {
  const html = renderElement({ kind: 'note', body:
    '<a href="/writing">W</a> · <a href="https://itch.io/x">G</a> · <a href="mailto:a@b.c">M</a> · <a href="//cdn/x">P</a>' }, ctx);
  assert.match(html, /href="\/Doppelganger-Website\/writing"/);
  assert.match(html, /href="https:\/\/itch\.io\/x"/);
  assert.match(html, /href="mailto:a@b\.c"/);
  assert.match(html, /href="\/\/cdn\/x"/, 'protocol-relative is not ours to rewrite');
});

test('attribute values cannot break out of their attribute', () => {
  const html = renderElement({ kind: 'image', media: { src: 'u', alt: 'a" onload="steal()' } }, ctx);
  assert.doesNotMatch(html, /onload="steal/);
  assert.equal(escapeHtml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('the settings fields follow the attributes, not the kind name', () => {
  assert.deepEqual(fieldsOf({ kind: 'image' }).map((f) => f.key), ['media.src', 'media.alt', 'link', 'title', 'onclick']);
  assert.deepEqual(fieldsOf({ kind: 'note' }).map((f) => f.key), ['onclick']);
  assert.deepEqual(fieldsOf({ kind: 'html' }).map((f) => f.key), ['body', 'onclick']);
  // Every object can be told what a click does, because that is a field like
  // any other rather than something only a link-shaped thing gets.
  assert.deepEqual(fieldsOf({ kind: 'fold' }).map((f) => f.key), ['title', 'fold.cols', 'fold.rows', 'onclick']);
  // A holder gets a field for what it holds. Without it a holder could be made
  // from the picker and never filled, which made the accordion and the gallery
  // unreachable from the editor.
  assert.deepEqual(fieldsOf({ kind: 'list' }).map((f) => f.key), ['title', 'arrange', 'items', 'onclick']);
  assert.ok(fieldsOf({ kind: 'drawer' }).some((f) => f.key === 'link'));
  const o = { kind: 'image' };
  setField(o, 'media.src', 'u'); setField(o, 'media.alt', 'x');
  assert.deepEqual(o.media, { src: 'u', alt: 'x' });
  assert.equal(getField(o, 'media.alt'), 'x');
  setField(o, 'media.alt', ''); setField(o, 'media.src', '');
  assert.equal(o.media, undefined, 'an emptied media object is no media');
});

test('checkElement reports problems against the attributes present', () => {
  assert.deepEqual(checkElement({ kind: 'note', body: 'ok' }, 'e'), []);
  assert.match(checkElement({ kind: 'image', media: {} }, 'e').join(), /media\.src/);
  assert.match(checkElement({ kind: 'zzz' }, 'e').join(), /is not one of/);
  assert.match(checkElement({ kind: 'note', attrs: ['text', 'flying'] }, 'e').join(), /unknown attribute/);
  assert.match(checkElement({ kind: 'note', face: 'hat' }, 'e').join(), /face/);
  assert.match(checkElement({ kind: 'note', body: '<script>x</script>' }, 'e').join(), /<script> tag/);
  assert.match(checkElement({ kind: 'image', media: { src: 'javascript:x' } }, 'e').join(), /javascript: URL/);
  // A drawer with nowhere to open is a tile that does nothing.
  assert.match(checkElement({ kind: 'drawer' }, 'e').join(), /no page to open/);
  assert.deepEqual(checkElement({ kind: 'drawer', link: '/links' }, 'e'), []);
  // Fields on a slot never render, so it is a dropped kind rather than data.
  assert.match(checkElement({ body: 'orphan' }, 'e').join(), /would never render/);
  assert.match(checkElement({ content: { html: 'x' } }, 'e').join(), /would never render/);
});

test('the v3 type+content shape upgrades to the object shape, and stays put after', () => {
  const text = upgradeElement({ id: 'a', type: 'text', content: { html: '<a href="x">E</a>' } });
  assert.equal(text.kind, 'note'); assert.equal(text.body, '<a href="x">E</a>');
  assert.equal(text.face, 'none', 'a run of page text was not paper before, and keeps looking as it did');
  assert.equal(text.type, undefined); assert.equal(text.content, undefined);

  const img = upgradeElement({ id: 'b', type: 'image', content: { src: 'asset:qr', alt: 'QR', href: '/', width: 1 } });
  assert.equal(img.kind, 'image');
  assert.deepEqual(img.media, { src: 'asset:qr', alt: 'QR', width: 1 });
  assert.equal(img.link, '/');

  assert.equal(upgradeElement({ id: 'c', type: 'slot' }).kind, 'slot');
  const already = { id: 'd', kind: 'note', body: 'x' };
  assert.equal(upgradeElement(already), already, 'idempotent on new data');
});

test('unsafeHtml names what is wrong rather than just refusing', () => {
  assert.match(unsafeHtml('<b onclick="x">'), /inline event handler/);
  assert.match(unsafeHtml('<iframe src="x">'), /<iframe>/);
  assert.equal(unsafeHtml('Email: <a href="mailto:a@b.c">a@b.c</a>'), null);
});

test('a pinned tile leans the same way every render, and never much', () => {
  assert.equal(tiltFor('email'), tiltFor('email'));
  assert.notEqual(tiltFor('email'), tiltFor('phone'));
  for (const id of ['a', 'email', 'site-home', 'drawer-12']) {
    assert.ok(Math.abs(tiltFor(id)) >= 0.6 && Math.abs(tiltFor(id)) <= 2.4, id);
  }
});

/* ------------------------------------------------------------------ *
 * A holder, and what it holds
 * ------------------------------------------------------------------ */

test('an item is built from what it was given, not from a name', () => {
  // The model's one rule, at the smallest scale it applies at: what this thing
  // can do is decided by which fields it was actually handed.
  assert.deepEqual(makeItem({ body: 'words' }).attrs, ['text']);
  assert.deepEqual(makeItem({ body: 'words', link: '/writing' }).attrs, ['text', 'link']);
  assert.deepEqual(makeItem({ title: 'T', src: 'asset:sun' }).attrs, ['text', 'media']);
  // It has to carry a real kind: a `slot` draws nothing from data, and one
  // holding fields fails its own check.
  assert.equal(makeItem({ body: 'x' }).kind, 'note');
  assert.deepEqual(checkElement(makeItem({ title: 'T', body: 'b', link: '/x' })), []);
});

test('a held thing that goes somewhere is a link, and goes through ctx.link', () => {
  /* "A row of links" is one of the three things a holder is for, and a held
     item carrying a link used to render as plain words — the anchor was only
     ever put on an object sitting on the board. */
  const holder = {
    kind: 'list', arrange: 'row',
    items: [makeItem({ title: 'Writing', link: '/writing' }), makeItem({ body: 'Away', link: 'https://example.com' })],
  };
  const html = renderElement(holder, { link: (h) => (h.startsWith('/') ? '/base' + h : h) });
  assert.match(html, /href="\/base\/writing"/, 'an internal link takes the base — hard rule 2');
  assert.match(html, /Writing/, 'a held thing with only a title still says its title');
  assert.match(html, /href="https:\/\/example\.com" target="_blank"/, 'an outside address opens in its own tab');
});

test('an accordion puts the title on the tab and everything else inside', () => {
  const holder = {
    kind: 'list', arrange: 'accordion',
    items: [makeItem({ title: 'One', body: 'The first.' })],
  };
  const html = renderElement(holder, {});
  assert.match(html, /data-acc="0" aria-expanded="false">One</);
  assert.match(html, /ob-panel" hidden>.*The first\./s);
});

test('a holder does not nest — the board is the layout engine', () => {
  const inner = { kind: 'list', title: 'Inside', items: [makeItem({ body: 'deep' })] };
  const outer = { kind: 'list', items: [inner] };
  const html = renderElement(outer, {});
  assert.doesNotMatch(html, /deep/, 'one level only');
  assert.equal(itemsOf(outer).length, 1);
});

/* ------------------------------------------------------------------ *
 * Changing what a thing is
 * ------------------------------------------------------------------ */

test('changing kind swaps the attributes and keeps the data', () => {
  /* Bureau's rule, and the reason a kind is a preset rather than a category.
     Nothing is thrown away for a choice you might undo a second later. */
  const o = { id: 'x', kind: 'note', body: 'Words I typed', flow: 'stack' };
  setKind(o, 'image');
  assert.equal(o.kind, 'image');
  assert.deepEqual(attrsOf(o), ['media', 'link']);
  assert.equal(o.body, 'Words I typed', 'the words survive being briefly not drawn');
  setKind(o, 'note');
  assert.equal(has(o, 'text'), true, 'and are drawn again when it can carry them');
});

test('changing kind drops a list of attributes chosen against the old one', () => {
  // Otherwise picking "Image" could leave you looking at a note.
  const o = { kind: 'note', attrs: ['text', 'holds'], items: [] };
  setKind(o, 'button');
  assert.equal(o.attrs, undefined);
  assert.deepEqual(attrsOf(o), KINDS.button.attrs);
});

test('an object can be told to carry something its kind never had', () => {
  /* The combination the whole model is built to allow, and the one that had no
     way of being made: USER_ATTRS has declared it since the port and nothing
     ever showed it. */
  const o = { kind: 'note', body: 'hello' };
  toggleAttr(o, 'media', true);
  assert.deepEqual(o.attrs, ['text', 'media']);
  assert.equal(has(o, 'media'), true);
  // …and its fields follow, with nothing designed for the combination.
  assert.ok(fieldsOf(o).some((f) => f.key === 'media.src'));
  assert.ok(fieldsOf(o).some((f) => f.key === 'body') === false, 'a note edits its words in the page');
  const html = renderElement({ ...o, media: { src: 'u', alt: 'a' } }, ctx);
  assert.match(html, /<img/);
  assert.match(html, /hello/);
});

test('an attribute turned off takes its field with it', () => {
  // Or the object keeps failing a check for something it no longer claims.
  const o = { kind: 'image', media: { src: 'u' }, link: '/x' };
  toggleAttr(o, 'link', false);
  assert.equal(o.link, undefined);
  assert.deepEqual(checkElement(o), []);
  const holder = { kind: 'list', items: [{ kind: 'note', body: 'a' }], arrange: 'row' };
  toggleAttr(holder, 'holds', false);
  assert.equal(holder.items, undefined);
  assert.equal(holder.arrange, undefined);
});

test('back to exactly the kind\'s attributes is no list at all', () => {
  // A file should not carry a list that changes nothing.
  const o = { kind: 'note' };
  toggleAttr(o, 'media', true);
  assert.ok(Array.isArray(o.attrs));
  toggleAttr(o, 'media', false);
  assert.equal(o.attrs, undefined);
});

test('every user-facing attribute is a real one', () => {
  for (const a of USER_ATTRS) assert.ok(ATTRS[a], `USER_ATTRS names unknown ${a}`);
});

/* ------------------------------------------------------------------ *
 * A feed
 * ------------------------------------------------------------------ */

test('a feed is a query, and the caller answers it', () => {
  /* elements.js must not learn what a work is or where the catalogue lives —
     hard rule 4, the same way ctx.image and ctx.link already work. */
  const o = { kind: 'works', feed: { type: 'film', sort: 'title' } };
  let asked = null;
  const html = renderElement(o, {
    works: (q) => { asked = q; return { items: [{ title: 'A Film', typeLabel: 'Film', year: 2024, tags: ['Score'], href: '/base/film', internal: true }], tags: ['Score'] }; },
  });
  assert.equal(asked.type, 'film');
  assert.equal(asked.sort, 'title');
  assert.match(html, /A Film/);
  assert.match(html, /href="\/base\/film"/);
  assert.doesNotMatch(html, /target="_blank"/, 'an address on this site is navigation, not a new tab');
  assert.match(html, /data-tag="Score"/, 'the chip a visitor narrows by');
});

test('a feed with no resolver says so rather than drawing an empty list', () => {
  const html = renderElement({ kind: 'works' }, {});
  assert.match(html, /drawn in when the page is built/);
});

test('a feed states its defaults, so nothing downstream has to guess', () => {
  assert.deepEqual(feedOf({}), { type: '', tag: '', limit: 0, sort: 'newest', chips: true });
  assert.equal(feedOf({ feed: { sort: 'nonsense' } }).sort, 'newest');
  assert.equal(feedOf({ feed: { limit: 2.6 } }).limit, 3);
  assert.equal(feedOf({ feed: { chips: false } }).chips, false);
});

test('a malformed feed fails the build', () => {
  const one = (feed) => checkElement({ kind: 'works', feed }).join(' | ');
  assert.match(one({ sort: 'sideways' }), /feed.sort "sideways" is not one of/);
  assert.match(one({ limit: 0 }), /positive number of works/);
  assert.match(one({ type: 12 }), /feed.type must be a string/);
  assert.deepEqual(checkElement({ kind: 'works', feed: { type: 'film', tag: 'Score', limit: 4, sort: 'oldest' } }), []);
  // A slot carrying a feed can only mean a dropped kind.
  assert.match(checkElement({ feed: {} }).join(' '), /kind "slot", so it would never render/);
});
