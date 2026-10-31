import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { visibilityClass } from '../../src/astro/visibility.js';
import { findNeighbours } from '../../src/sky/neighbours.js';
import { chunksOf, STAGES, stagesOf } from '../../src/sky/curriculum.js';
import { winterSky } from '../../src/sky/winter.js';
import { CHUNKS } from '../../src/data/chunks-sv.js';
import { PLACES } from '../../src/data/places.js';

const catalog = buildCatalog();
const stages = stagesOf(catalog, 2026);
const chunks = chunksOf(catalog);
const neighbours = findNeighbours(catalog.constellations);
const id = (i) => catalog.constellations[i].id;

test('three steps: the winter sky (34), the rest of Sweden (25), the rest (29)', () => {
  assert.deepEqual([1, 2, 3].map((s) => stages.filter((x) => x === s).length), [34, 25, 29]);
  const winter = winterSky(catalog, 2026);
  catalog.constellations.forEach((c) => {
    const sweden = PLACES.some((p) => visibilityClass(c.figureDecs, p.lat) !== 'never');
    assert.equal(stages[c.index], winter.has(c.index) ? 1 : sweden ? 2 : 3, c.id);
  });
  assert.deepEqual(STAGES.map((s) => s.upTo), [1, 2, 3]);
});

test('every constellation is in one group, groups of two to five, one step each, in step order', () => {
  const members = chunks.flatMap((ch) => ch.members);
  assert.equal(members.length, 88);
  assert.equal(new Set(members).size, 88);
  let last = 1;
  for (const ch of chunks) {
    assert.ok(ch.members.length >= 2 && ch.members.length <= 5, `${ch.name}: ${ch.members.length}`);
    assert.ok(ch.members.every((i) => stages[i] === ch.stage), `${ch.name}: all in step ${ch.stage}`);
    assert.ok(ch.stage >= last, `${ch.name} comes after the groups of step ${last}`);
    last = ch.stage;
  }
  assert.ok(chunks[0].members.includes(catalog.byId.get('UMa').index), 'it starts with Stora björnen');
});

test('the constellations of a group lie together: each borders another of the group', () => {
  for (const ch of chunks) {
    const reached = new Set([ch.members[0]]);
    for (let grew = true; grew;) {
      grew = false;
      for (const i of ch.members) {
        if (!reached.has(i) && neighbours[i].some((n) => reached.has(n))) {
          reached.add(i);
          grew = true;
        }
      }
    }
    assert.equal(reached.size, ch.members.length, `${ch.name}: ${ch.members.map(id).join(' ')}`);
  }
});

test('each group has a short name and a reason, tidy Swedish', () => {
  assert.equal(new Set(CHUNKS.map((ch) => ch.name)).size, CHUNKS.length, 'names are unique');
  for (const ch of CHUNKS) {
    assert.deepEqual(Object.keys(ch).sort(), ['members', 'name', 'reason', 'stage'], ch.name);
    assert.ok(ch.name.length >= 3 && ch.name.length <= 32, ch.name);
    assert.ok(ch.reason.length >= 20 && ch.reason.length <= 180, `${ch.name}: ${ch.reason.length}`);
    for (const text of [ch.name, ch.reason]) {
      assert.equal(text, text.trim());
      assert.ok(!/\s{2}|!|Visste du/.test(text), `${ch.name}: ${text}`);
    }
    assert.ok(/[.)]$/.test(ch.reason), `${ch.name}: a whole sentence`);
  }
});
