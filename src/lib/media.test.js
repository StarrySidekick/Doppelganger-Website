/**
 * Tests for the parts of the image pipeline that do not need a browser.
 *
 * prepareImage() needs canvas and FileReader, so the resizing and the alpha
 * sampling are exercised in the browser pass instead. What is here is the
 * naming and the paths, which is what decides where a file lands in the repo
 * and what a layout has to say to find it again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaName, mediaPath, mediaRef, MAX_BYTES, MAX_EDGE, ACCEPT } from './media.js';

test('a picked filename becomes something safe in a URL and a repo path', () => {
  assert.equal(mediaName('My Photo (2).JPG', 'jpg'), 'my-photo-2.jpg');
  assert.equal(mediaName('Sun.gif', 'gif'), 'sun.gif');
  assert.equal(mediaName('   ', 'png'), 'image.png');
  assert.equal(mediaName('.hidden', 'png'), 'hidden.png');
  assert.equal(mediaName('photo.jpeg', 'jpg'), 'photo.jpg');
  // The extension comes from what we ENCODED, not what arrived — a PNG saved
  // as JPEG must not keep claiming to be a PNG.
  assert.equal(mediaName('cutout.png', 'jpg'), 'cutout.jpg');
});

test('a long name is cut, and never ends on a dash', () => {
  const name = mediaName('a'.repeat(200), 'png');
  assert.ok(name.length <= 52, name);
  assert.doesNotMatch(name, /-\.png$/);
});

test('names cannot climb out of the media directory', () => {
  // The basename is taken first, so a path never becomes part of the name and
  // there is nothing to escape from.
  assert.equal(mediaPath(mediaName('../../etc/passwd', 'png')), 'public/media/passwd.png');
  assert.equal(mediaName('/tmp/x.png', 'png'), 'x.png');
  assert.equal(mediaName('C:\\photos\\x.png', 'png'), 'x.png');
  for (const nasty of ['../x', 'a/../../b', './.']) {
    assert.doesNotMatch(mediaName(nasty, 'png').replace(/\.png$/, ''), /[./\\]/, nasty);
  }
});

test('the repo path and the content reference agree on the filename', () => {
  const n = mediaName('Sun.gif', 'gif');
  assert.equal(mediaPath(n), 'public/media/sun.gif');
  assert.equal(mediaRef(n), 'media:sun.gif');
  // AdaptiveGrid strips the prefix with slice(6); if these ever disagree the
  // built page asks for the wrong file.
  assert.equal(mediaRef(n).slice(6), n);
});

test('the ceilings are set for a git repo, not for one device', () => {
  // Bureau allows 60MB because it is one phone. This is committed history that
  // every clone carries forever, so it is deliberately far smaller.
  assert.ok(MAX_BYTES <= 8 * 1024 * 1024, 'a committed image stays small');
  assert.ok(MAX_EDGE >= 1200 && MAX_EDGE <= 2400);
  // Audio and video are not offered at all: git is the wrong home for them.
  assert.doesNotMatch(ACCEPT, /audio|video/);
  assert.match(ACCEPT, /image\/svg\+xml/);
});
