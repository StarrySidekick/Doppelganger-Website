/**
 * Tests for the element type registry.
 *
 * The rendered markup is asserted literally, because this code replaced markup
 * that a person had written by hand in links.astro and the two must agree
 * attribute for attribute. A layout that renders "nearly" the same image is a
 * regression nobody would notice from a passing build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderElement, checkElement, isTyped, isInline, typeOf, specOf, unsafeHtml, escapeHtml,
} from './elements.js';

/** Stand-ins for what AdaptiveGrid.astro supplies from assets.js. */
const ctx = {
  image: (c) => ({
    src: c.src === 'asset:home' ? 'https://cdn/Home.gif?format=300w' : c.src,
    srcset: c.widths ? 'https://cdn/Home.gif?format=100w 100w, https://cdn/Home.gif?format=300w 300w' : undefined,
    sizes: c.sizes,
  }),
  link: (href) => (href?.startsWith('/') ? '/Doppelganger-Website' + href : href),
};

test('an element with no type is a slot, and a slot renders nothing', () => {
  assert.equal(typeOf({ id: 'a' }), 'slot');
  assert.equal(isTyped({ id: 'a' }), false);
  assert.equal(renderElement({ id: 'a' }, ctx), null);
  // Which is what keeps every layout written before v3 rendering from its page.
  assert.equal(typeOf({ id: 'a', type: 'nonsense' }), 'slot');
});

test('a linked image matches the hand-written markup it replaced', () => {
  const html = renderElement({
    id: 'nav-home', type: 'image',
    content: {
      src: 'asset:home', alt: 'Home', href: '/',
      width: 480, height: 480, sizes: '120px', widths: [100, 300],
    },
  }, ctx);

  // The link goes through ctx.link, which is what applies the deploy subpath —
  // a bare href="/" silently breaks navigation on project Pages.
  assert.match(html, /^<a href="\/Doppelganger-Website\/" aria-label="Home">/);
  assert.match(html, /srcset="[^"]*100w[^"]*300w"/, 'the CDN srcset survives');
  assert.match(html, /sizes="120px"/);
  assert.match(html, /width="480" height="480"/);
  // Inside a labelled link the image is decorative and the anchor holds the
  // name; announcing it twice is the bug, and aria-hidden here is redundant.
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /aria-hidden/);
});

test('a standalone decorative image is hidden from assistive tech', () => {
  const html = renderElement({ type: 'image', content: { src: 'u', alt: '', width: 128, height: 128 } }, ctx);
  assert.equal(html, '<img src="u" width="128" height="128" alt="" aria-hidden="true" />');
});

test('an image with alt and no link keeps its alt and stays announced', () => {
  const html = renderElement({ type: 'image', content: { src: 'u', alt: 'QR code' } }, ctx);
  assert.equal(html, '<img src="u" alt="QR code" />');
});

test('text renders its stored html, and is the only inline-editable type', () => {
  assert.equal(renderElement({ type: 'text', content: { html: '<a href="x">hi</a>' } }, ctx), '<a href="x">hi</a>');
  assert.equal(isInline({ type: 'text' }), true);
  assert.equal(isInline({ type: 'image' }), false);
  assert.equal(isInline({ id: 'a' }), false);
});

test('attribute values cannot break out of their attribute', () => {
  const html = renderElement({ type: 'image', content: { src: 'u', alt: 'a" onload="steal()' } }, ctx);
  assert.doesNotMatch(html, /onload="steal/);
  assert.equal(escapeHtml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
});

test('unsafeHtml names what is wrong rather than just refusing', () => {
  assert.match(unsafeHtml('<script>x</script>'), /<script> tag/);
  assert.match(unsafeHtml('<b onclick="x">'), /inline event handler/);
  assert.match(unsafeHtml('javascript:alert(1)'), /javascript: URL/);
  assert.match(unsafeHtml('<iframe src="x">'), /<iframe>/);
  assert.equal(unsafeHtml('Email: <a href="mailto:a@b.c">a@b.c</a>'), null);
  assert.equal(unsafeHtml(''), null);
});

test('checkElement reports content problems against the declared type', () => {
  assert.deepEqual(checkElement({ type: 'text', content: { html: 'ok' } }, 'e'), []);
  assert.match(checkElement({ type: 'image', content: {} }, 'e').join(), /content\.src/);
  assert.match(checkElement({ type: 'zzz' }, 'e').join(), /is not one of/);
  // Content under a slot never renders, so it means the type went missing.
  assert.match(checkElement({ content: { html: 'x' } }, 'e').join(), /would never render/);
  assert.deepEqual(checkElement({ id: 'a' }, 'e'), []);
});

test('every declared type can be rendered and checked without throwing', () => {
  for (const type of ['slot', 'text', 'image', 'html']) {
    assert.doesNotThrow(() => renderElement({ type, content: {} }, ctx), type);
    assert.doesNotThrow(() => checkElement({ type, content: {} }, type), type);
    assert.ok(specOf({ type }).label, `${type} has a label for the settings panel`);
  }
});

test('site-relative links in text go through the resolver, external ones do not', () => {
  const link = (h) => '/Doppelganger-Website' + h;
  const html = renderElement({
    type: 'text',
    content: {
      html: '<a href="/writing">Writing</a> · <a href="https://itch.io/x">Games</a>'
        + ' · <a href="mailto:a@b.c">Mail</a> · <a href="//cdn.example/x">Protocol-relative</a>',
    },
  }, { ...ctx, link });

  // Hard rule 2: without this a footer link 404s on the deploy subpath, and
  // nothing about the stored content looks wrong.
  assert.match(html, /href="\/Doppelganger-Website\/writing"/);
  // Everything with a scheme, or belonging to another origin, is left alone.
  assert.match(html, /href="https:\/\/itch\.io\/x"/);
  assert.match(html, /href="mailto:a@b\.c"/);
  assert.match(html, /href="\/\/cdn\.example\/x"/, 'protocol-relative is not ours to rewrite');
});

test('a text element with no resolver renders unchanged', () => {
  const html = renderElement({ type: 'text', content: { html: '<a href="/x">x</a>' } }, {});
  assert.equal(html, '<a href="/x">x</a>');
});
