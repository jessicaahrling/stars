import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { discoveryState, groupColors, groupNeighbours, START_ID } from '../../src/sky/discovery.js';
import { chunksOf } from '../../src/sky/curriculum.js';
import { GROUP_COLORS } from '../../src/render/palette.js';
import { findNeighbours } from '../../src/sky/neighbours.js';
import { visibilityClass } from '../../src/astro/visibility.js';

const catalog = buildCatalog();
const neighbours = findNeighbours(catalog.constellations);
const index = (id) => catalog.byId.get(id).index;
const idsOf = (list) => list.map((i) => catalog.constellations[i].id);
const seenFrom = (lat) => (i) => visibilityClass(catalog.constellations[i].figureDecs, lat) !== 'never';
const chunks = chunksOf(catalog);
const groupNb = groupNeighbours(chunks, neighbours);
const groupNamed = (name) => chunks.findIndex((ch) => ch.name === name);
/** A group is to be found from a place when any of it is ever seen from there. */
const groupSeenFrom = (lat) => (g) => chunks[g].members.some(seenFrom(lat));

test('Upptäck starts with the group of Ursa Major and offers the groups that border it', () => {
  const start = chunks.findIndex((ch) => ch.members.includes(index(START_ID)));
  assert.equal(chunks[start].name, 'Björnarna vid polen');
  const s = discoveryState(new Set([start]), groupNb, groupSeenFrom(59.33));
  assert.deepEqual(s.next.map((g) => chunks[g].name), ['Perseus räddar Andromeda', 'Herakles fiender', 'Björnvaktaren och hundarna',
    'Svanen och Lyran', 'Gömda djur kring björnen', 'Kronan, hjälten och läkaren']);
  assert.deepEqual([s.foundInGoal, s.goal, s.done], [1, 18, false]);
});

test('groups border each other both ways, and every group borders another', () => {
  // Every constellation is in one group, so the groups cover the sky.
  assert.equal(new Set(chunks.flatMap((ch) => ch.members)).size, 88);
  groupNb.forEach((nb, g) => {
    assert.ok(nb.length > 0, chunks[g].name);
    assert.ok(!nb.includes(g), `${chunks[g].name} is not its own neighbour`);
    for (const h of nb) assert.ok(groupNb[h].includes(g), `${chunks[g].name} | ${chunks[h].name}`);
  });
  // Neighbours because a member of one borders a member of the other: Orion borders Taurus.
  assert.ok(groupNb[groupNamed('Jägaren Orion')].includes(groupNamed('Över havet på djurens rygg')));
  assert.ok(!groupNb[groupNamed('Björnarna vid polen')].includes(groupNamed('Jägaren Orion')));
});

test('no two groups that border each other have the same colour', () => {
  const colors = groupColors(groupNb, GROUP_COLORS.length);
  assert.equal(colors.length, chunks.length);
  assert.ok(colors.every((c) => Number.isInteger(c) && c >= 0 && c < GROUP_COLORS.length));
  groupNb.forEach((nb, g) => nb.forEach((h) => assert.notEqual(colors[g], colors[h], `${chunks[g].name} | ${chunks[h].name}`)));
  // With too few colours to go round, the one neighbours have least of is taken.
  assert.deepEqual(groupColors([[1, 2], [0, 2], [0, 1]], 2), [0, 1, 0]);
});

test('collecting the groups on offer in turn finds every group in the goal', () => {
  for (const [lat, all, goal] of [[59.33, false, 18], [67.86, false, 16], [59.33, true, 28]]) {
    const inGoal = all ? () => true : groupSeenFrom(lat);
    const found = new Set([groupNamed('Björnarna vid polen')]);
    let s = discoveryState(found, groupNb, inGoal);
    assert.equal(s.goal, goal);
    while (!s.done) {
      assert.ok(s.next.length && s.next.every((g) => !found.has(g)), 'only new groups are offered, and always some');
      found.add(s.next[0]);
      s = discoveryState(found, groupNb, inGoal);
    }
    assert.deepEqual(s.next, []);
    if (all) assert.equal(found.size, 28);
    // Every constellation seen from here is in a group found.
    const cons = new Set([...found].flatMap((g) => chunks[g].members));
    for (const c of catalog.constellations) if (all || seenFrom(lat)(c.index)) assert.ok(cons.has(c.index), c.id);
  }
});

test('discovery starts with Ursa Major and offers its neighbours', () => {
  const s = discoveryState(new Set([index(START_ID)]), neighbours, seenFrom(59.33));
  assert.deepEqual(idsOf(s.next), ['Lyn', 'Leo', 'LMi', 'Boo', 'Cam', 'CVn', 'Com', 'Dra'].sort((a, b) => index(a) - index(b)));
  assert.equal(s.foundInGoal, 1);
  assert.ok(s.goal > 50 && s.goal < 70, `${s.goal} constellations seen from Stockholm`);
  assert.equal(s.done, false);
});

test('only constellations seen from here are offered while some of them are left', () => {
  const stockholm = seenFrom(59.33);
  const s = discoveryState(new Set(['UMa', 'Leo', 'Hya'].map(index)), neighbours, stockholm);
  assert.ok(s.next.every(stockholm), idsOf(s.next).join(' '));
  assert.ok(!idsOf(s.next).includes('Ant') && !idsOf(s.next).includes('Cen'));
});

test('the three constellations with plural Swedish names are known', () => {
  assert.deepEqual(catalog.constellations.filter((c) => c.plural).map((c) => c.id).sort(), ['CVn', 'Gem', 'Psc']);
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
    let s = discoveryState(found, neighbours, inGoal);
    for (let step = 0; !s.done; step++) {
      assert.ok(step < neighbours.length, 'the goal is reached within 88 additions');
      assert.ok(s.next.length, 'something can always be added');
      const pick = s.next[s.next.length - 1];
      assert.ok(!found.has(pick), 'only new constellations are offered');
      found.add(pick);
      s = discoveryState(found, neighbours, inGoal);
    }
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
  // When a goal constellation borders those found, the others wait.
  assert.deepEqual(discoveryState(new Set([0]), [[1, 2], [0], [0]], inGoal).next, [2]);
  assert.equal(discoveryState(new Set([0, 1, 2]), nb, inGoal).done, true);
  // Once the goal is complete nothing more is offered, even with neighbours left.
  assert.deepEqual(discoveryState(new Set([0]), [[1], [0]], (i) => i === 0).next, []);
});
