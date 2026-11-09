import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { groupColors, groupNeighbours } from '../../src/sky/discovery.js';
import { chunksOf, stagesOf } from '../../src/sky/curriculum.js';
import { winterSky } from '../../src/sky/winter.js';
import { GROUP_COLORS } from '../../src/render/palette.js';
import { findNeighbours } from '../../src/sky/neighbours.js';
import { visibilityClass } from '../../src/astro/visibility.js';

const catalog = buildCatalog();
const neighbours = findNeighbours(catalog.constellations);
const seenFrom = (lat) => (i) => visibilityClass(catalog.constellations[i].figureDecs, lat) !== 'never';
const chunks = chunksOf(catalog);
const groupNb = groupNeighbours(chunks, neighbours);
const groupNamed = (name) => chunks.findIndex((ch) => ch.name === name);
/** A group is shown from a place when any of it is ever seen from there. */
const groupSeenFrom = (lat) => (g) => chunks[g].members.some(seenFrom(lat));

test('Upptäck shows the groups any of which is seen from the place, or of the winter sky', () => {
  const seenGroups = (lat) => chunks.filter((ch, g) => groupSeenFrom(lat)(g)).length;
  assert.deepEqual([seenGroups(59.33), seenGroups(67.86), chunks.length], [18, 16, 28]);
  // The groups of the winter sky are those of the first step, all of whose members belong to it.
  for (const year of [2025, 2026, 2027]) {
    const winter = winterSky(catalog, year);
    const stages = stagesOf(catalog, year);
    const winterGroups = chunks.filter((ch) => ch.members.some((i) => winter.has(i)));
    assert.equal(winterGroups.length, 10);
    assert.ok(winterGroups.every((ch) => ch.stage === 1 && ch.members.every((i) => winter.has(i) && stages[i] === 1)));
  }
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

test('the three constellations with plural Swedish names are known', () => {
  assert.deepEqual(catalog.constellations.filter((c) => c.plural).map((c) => c.id).sort(), ['CVn', 'Gem', 'Psc']);
});
