import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { discoveryState, START_ID } from '../../src/sky/discovery.js';
import { findNeighbours } from '../../src/sky/neighbours.js';
import { visibilityClass } from '../../src/astro/visibility.js';

const catalog = buildCatalog();
const neighbours = findNeighbours(catalog.constellations);
const index = (id) => catalog.byId.get(id).index;
const idsOf = (list) => list.map((i) => catalog.constellations[i].id);
const seenFrom = (lat) => (i) => visibilityClass(catalog.constellations[i].figureDecs, lat) !== 'never';

test('discovery starts with Ursa Major and offers its neighbours', () => {
  const s = discoveryState(new Set([index(START_ID)]), neighbours, seenFrom(59.33));
  assert.deepEqual(idsOf(s.next), ['Lyn', 'Leo', 'LMi', 'Boo', 'Cam', 'CVn', 'Com', 'Dra'].sort((a, b) => index(a) - index(b)));
  assert.equal(s.foundInGoal, 1);
  assert.ok(s.goal > 50 && s.goal < 70, `${s.goal} constellations seen from Stockholm`);
  assert.equal(s.done, false);
});

test('the offer grows with every constellation found', () => {
  const found = new Set([index('UMa'), index('Dra')]);
  const s = discoveryState(found, neighbours, () => true);
  for (const id of ['UMi', 'Cep', 'Her', 'Lyr', 'Cyg', 'Lyn', 'Boo']) assert.ok(idsOf(s.next).includes(id), id);
  assert.ok(!s.next.some((i) => found.has(i)), 'nothing found is offered again');
});

test('collecting every neighbour in turn finds the whole goal and then stops', () => {
  for (const [lat, all] of [[59.33, false], [67.86, false], [59.33, true]]) {
    const inGoal = all ? () => true : seenFrom(lat);
    const found = new Set([index(START_ID)]);
    for (let s = discoveryState(found, neighbours, inGoal); !s.done; s = discoveryState(found, neighbours, inGoal)) {
      assert.ok(s.next.length, 'something can always be added');
      found.add(s.next[s.next.length - 1]);
    }
    const s = discoveryState(found, neighbours, inGoal);
    assert.deepEqual(s.next, []);
    assert.equal(s.foundInGoal, s.goal);
    if (all) assert.equal(found.size, 88);
  }
});

test('constellations outside the goal are stepping stones only when nothing else borders', () => {
  // A made-up sky: 0 - 1 - 2 in a row, where 1 is outside the goal.
  const nb = [[1], [0, 2], [1]];
  const inGoal = (i) => i !== 1;
  assert.deepEqual(discoveryState(new Set([0]), nb, inGoal).next, [1]);
  assert.deepEqual(discoveryState(new Set([0, 1]), nb, inGoal).next, [2]);
  assert.equal(discoveryState(new Set([0, 1, 2]), nb, inGoal).done, true);
  // Once the goal is complete nothing more is offered, even with neighbours left.
  assert.deepEqual(discoveryState(new Set([0]), [[1], [0]], (i) => i === 0).next, []);
});
