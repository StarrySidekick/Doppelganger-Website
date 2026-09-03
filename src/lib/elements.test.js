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
  fieldsOf, getField, setField, renderElement, checkElement, upgradeElement, unsafeHtml, escapeHtml, tiltFor,
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
  assert.deepEqual(fieldsOf({ kind: 'image' }).map((f) => f.key), ['media.src', 'media.alt', 'link', 'title']);
  assert.deepEqual(fieldsOf({ kind: 'note' }).map((f) => f.key), []);
  assert.deepEqual(fieldsOf({ kind: 'html' }).map((f) => f.key), ['body']);
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
