/**
 * A site's own kinds: registered, drawn, edited, checked.
 *
 * custom.js is the room a site has for anything DigiDesk does not do, so
 * what is pinned here is that a registered kind is a first-class object:
 * in the picker, drawn through renderElement, given its fields in the
 * object editor, validated, and changeable to and from like any kind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCustom, CUSTOM, isCustomKind } from './custom.js';
import {
  KINDS, PICKER_KINDS, has, isTyped, renderElement, fieldsOf, checkElement, setKind, escapeHtml,
} from './elements.js';

registerCustom({
  kinds: {
    sparkler: {
      label: 'Sparkler', says: 'Fizzes', size: [3, 2],
      fields: [{ key: 'data.fizz', label: 'Fizz', kind: 'number' }],
      data: { fizz: 3 },
      render: (o) => `<i class="sp" data-n="${escapeHtml(o.data?.fizz)}"></i>`,
      check: (o) => (o.data?.fizz > 10 ? ['too much fizz'] : []),
    },
    hidden: { render: () => '', picker: false },
  },
});

test('a registered kind joins the registry and the picker', () => {
  assert.ok(isCustomKind('sparkler'));
  assert.equal(KINDS.sparkler.label, 'Sparkler');
  assert.deepEqual(KINDS.sparkler.size, [3, 2]);
  assert.ok(PICKER_KINDS.includes('sparkler'));
  assert.ok(!PICKER_KINDS.includes('hidden'), 'picker: false keeps it out');
});

test('it is a typed object carrying `custom`', () => {
  const o = { id: 'sp-1', kind: 'sparkler', data: { fizz: 4 } };
  assert.ok(isTyped(o));
  assert.ok(has(o, 'custom'));
});

test('it draws through renderElement, wrapped so the browser can wake it', () => {
  const o = { id: 'sp-1', kind: 'sparkler', data: { fizz: 4 }, desk: { col: [1, 3], row: [1, 2] } };
  const html = renderElement(o, {});
  assert.match(html, /^<div class="ob-custom" data-custom="sparkler" data-o="/);
  assert.match(html, /<i class="sp" data-n="4"><\/i><\/div>$/);
  // The object travels with it, minus where it sits.
  const data = JSON.parse(html.match(/data-o="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(data, { id: 'sp-1', kind: 'sparkler', data: { fizz: 4 } });
});

test('a custom kind that also carries link is a link', () => {
  const o = { id: 'sp-2', kind: 'sparkler', attrs: ['custom', 'link'], link: '/music', data: {} };
  const html = renderElement(o, { link: (h) => '/base' + h });
  assert.match(html, /^<a [^>]*href="\/base\/music"/);
});

test('its own fields are offered by the object editor', () => {
  const keys = fieldsOf({ kind: 'sparkler' }).map((f) => f.key);
  assert.ok(keys.includes('data.fizz'));
  assert.ok(keys.includes('onclick'), 'and the fields every object has');
});

test('it is checked: its own check, and data must be an object', () => {
  assert.deepEqual(checkElement({ kind: 'sparkler', data: { fizz: 1 } }), []);
  assert.match(checkElement({ kind: 'sparkler', data: { fizz: 99 } }, 'x').join(), /x: too much fizz/);
  assert.match(checkElement({ kind: 'sparkler', data: [1] }, 'x').join(), /x\.data must be an object/);
});

test('a kind nobody registered fails the build rather than vanishing', () => {
  assert.match(checkElement({ kind: 'unheardof' }, 'x').join(), /x\.kind "unheardof" is not one of/);
});

test('changing a note into it starts it with its data and keeps the note', () => {
  const o = setKind({ id: 'n', kind: 'note', body: 'Keep me' }, 'sparkler');
  assert.deepEqual(o.data, { fizz: 3 });
  assert.equal(o.body, 'Keep me', 'a kind is a preset, nothing is thrown away');
  assert.notEqual(o.data, CUSTOM.sparkler.data, 'a copy, not the shared default');
});

test('a site may not take the name of one of the tool\'s kinds, or a bad name', () => {
  assert.throws(() => registerCustom({ kinds: { note: { render: () => '' } } }), /DigiDesk's own kinds/);
  assert.throws(() => registerCustom({ kinds: { 'Bad Name': { render: () => '' } } }), /lower case/);
  assert.throws(() => registerCustom({ kinds: { norender: {} } }), /no render/);
});
