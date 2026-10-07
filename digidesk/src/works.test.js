/**
 * Tests for the works: the catalogue, and the query a feed asks of it.
 *
 * The point of this half of the content model is that a work is written down
 * ONCE and appears wherever it belongs. So the assertions worth making are
 * about that: the same work answering several different questions, and the
 * catalogue refusing an entry that would be invisible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryWorks, validateWorks, typesOf, worksOf, normalizeWork, tagKey } from './works.js';

const catalogue = {
  types: {
    film: { label: 'Film', path: '/film', tags: ['Score', 'Sound design'] },
    games: { label: 'Games', path: '/games' },
    writing: { label: 'Writing', path: '/writing' },
  },
  works: [
    { id: 'a-film', title: 'A Film', type: 'film', tags: ['Score', 'Director'], year: 2024 },
    { id: 'older', title: 'Older Film', type: 'film', tags: ['Sound design'], year: 2019 },
    { id: 'a-game', title: 'A Game', type: 'games', tags: ['Design'], year: 2022 },
    { id: 'undated', title: 'Undated', type: 'writing', tags: ['Poem'] },
  ],
};

test('one work answers every question it belongs to', () => {
  // The whole reason for a catalogue rather than a list per page.
  const everything = queryWorks(catalogue, {});
  const film = queryWorks(catalogue, { type: 'film' });
  const scored = queryWorks(catalogue, { tag: 'Score' });
  assert.equal(everything.total, 4);
  assert.deepEqual(film.items.map((w) => w.id), ['a-film', 'older']);
  assert.deepEqual(scored.items.map((w) => w.id), ['a-film']);
  // …and the two axes narrow together.
  assert.deepEqual(queryWorks(catalogue, { type: 'film', tag: 'Sound design' }).items.map((w) => w.id), ['older']);
});

test('the tags offered are the tags that are actually there', () => {
  /* A chip that matches nothing on the page in front of you is a dead end.
     They come from the RESULT, so the film page never offers "Design". */
  assert.deepEqual(queryWorks(catalogue, { type: 'film' }).tags, ['Director', 'Score', 'Sound design']);
  assert.deepEqual(queryWorks(catalogue, { type: 'games' }).tags, ['Design']);
  assert.deepEqual(queryWorks(catalogue, { type: 'film', tag: 'Score' }).tags, ['Director', 'Score']);
});

test('a tag matches however it was typed, and is offered as first written', () => {
  const shouty = { ...catalogue, works: [{ id: 'x', title: 'X', type: 'film', tags: ['Score'] },
                                          { id: 'y', title: 'Y', type: 'film', tags: ['score'] }] };
  assert.equal(queryWorks(shouty, { tag: 'SCORE' }).total, 2);
  assert.deepEqual(queryWorks(shouty, {}).tags, ['Score'], 'one chip, not two spellings of one');
  assert.equal(tagKey('  Sound Design '), 'sound design');
});

test('a work with no year has no place on the timeline, in either direction', () => {
  // Last under newest AND last under oldest. It is neither the newest nor the
  // oldest thing; sorting it first under "oldest" would claim a date the
  // catalogue does not have.
  assert.equal(queryWorks(catalogue, { sort: 'newest' }).items.at(-1).id, 'undated');
  assert.equal(queryWorks(catalogue, { sort: 'oldest' }).items.at(-1).id, 'undated');
  assert.equal(queryWorks(catalogue, { sort: 'oldest' }).items[0].id, 'older');
  assert.deepEqual(queryWorks(catalogue, { sort: 'title' }).items.map((w) => w.title),
    ['A Film', 'A Game', 'Older Film', 'Undated']);
});

test('a limit cuts the list but not the count', () => {
  const got = queryWorks(catalogue, { limit: 2 });
  assert.equal(got.items.length, 2);
  assert.equal(got.total, 4, 'a strip of recent work still knows how much there is');
});

test('a work whose type is not a section is refused', () => {
  /* It would be invisible on every section page and appear only in the
     everything list, which is a typo rather than an intention. */
  const problems = validateWorks({ ...catalogue, works: [{ id: 'x', title: 'X', type: 'flim' }] });
  assert.match(problems.join(' '), /type "flim" is not one of/);
});

test('the catalogue refuses what would not be addressable', () => {
  const one = (w) => validateWorks({ ...catalogue, works: [w] }).join(' | ');
  assert.match(one({ title: 'No id', type: 'film' }), /needs an id/);
  assert.match(one({ id: 'Caps Here', title: 'x', type: 'film' }), /lowercase letters, digits and dashes/);
  assert.match(one({ id: 'ok', type: 'film' }), /needs a title/);
  assert.match(one({ id: 'ok', title: 'x', type: 'film', year: '2024' }), /must be a whole year/);
  assert.match(one({ id: 'ok', title: 'x', type: 'film', tags: 'Score' }), /tags must be an array/);
  const twice = validateWorks({ ...catalogue, works: [
    { id: 'same', title: 'A', type: 'film' }, { id: 'same', title: 'B', type: 'film' }] });
  assert.match(twice.join(' '), /is used twice/);
  assert.deepEqual(validateWorks(catalogue), [], 'and a good one passes');
});

test('a malformed catalogue is described rather than thrown at', () => {
  // validateWorks is handed junk on purpose and has to report on it.
  assert.match(validateWorks(null).join(' '), /is not an object/);
  assert.match(validateWorks({}).join(' '), /types must be an object/);
  assert.match(validateWorks({ types: { film: { label: 'Film' } }, works: 'no' }).join(' '), /works must be an array/);
  assert.deepEqual(worksOf({}), []);
  assert.deepEqual(typesOf(null), []);
});

test('a work arrives complete, so nothing downstream has to guard', () => {
  const w = normalizeWork({ id: 'x', title: 'X', type: 'film', tags: [' Score ', '', 'Mix'] });
  assert.deepEqual(w.tags, ['Score', 'Mix'], 'blank tags dropped, spaces trimmed');
  assert.equal(w.year, null);
  assert.equal(w.blurb, '');
  assert.equal(w.link, '');
  assert.equal(w.media, null);
});
