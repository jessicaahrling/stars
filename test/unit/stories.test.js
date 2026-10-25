import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORIES } from '../../src/data/stories-sv.js';
import { CONSTELLATION_NAMES_SV } from '../../src/data/names-sv.js';

test('every constellation has a story, and nothing else does', () => {
  assert.deepEqual(Object.keys(STORIES).sort(), Object.keys(CONSTELLATION_NAMES_SV).sort());
});

test('stories are short, tidy Swedish texts in three parts', () => {
  for (const [id, s] of Object.entries(STORIES)) {
    assert.deepEqual(Object.keys(s).sort(), ['origin', 'special', 'story'], id);
    assert.ok(s.origin.length >= 10 && s.origin.length <= 70, `${id} origin: ${s.origin.length}`);
    assert.ok(s.story.length >= 120 && s.story.length <= 460, `${id} story: ${s.story.length}`);
    assert.ok(s.special.length >= 50 && s.special.length <= 260, `${id} special: ${s.special.length}`);
    for (const text of Object.values(s)) {
      assert.equal(text, text.trim(), `${id}: no space at the ends`);
      assert.ok(!/\s{2}|!|Visste du/.test(text), `${id}: no double spaces, exclamations or "Visste du": ${text}`);
    }
    assert.ok(/[.)]$/.test(s.story) && /[.)]$/.test(s.special), `${id}: whole sentences`);
  }
});
