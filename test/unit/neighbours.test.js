import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { findNeighbours } from '../../src/sky/neighbours.js';
import { pointInRing } from '../../src/sky/rings.js';
import { wrap360 } from '../../src/astro/math.js';

const catalog = buildCatalog();
const neighbours = findNeighbours(catalog.constellations);
const ids = (id) => neighbours[catalog.byId.get(id).index].map((i) => catalog.constellations[i].id);

test('neighbours match the IAU boundaries', () => {
  assert.deepEqual(ids('UMa'), ['Boo', 'Cam', 'CVn', 'Com', 'Dra', 'Leo', 'LMi', 'Lyn']);
  assert.deepEqual(ids('UMi'), ['Cam', 'Cep', 'Dra']);
  assert.deepEqual(ids('Ori'), ['Eri', 'Gem', 'Lep', 'Mon', 'Tau']);
  assert.deepEqual(ids('Cru'), ['Cen', 'Mus']);
  // Both halves of Serpens count, and the RA 0h line and the south pole are no seams.
  assert.deepEqual(ids('Ser'), ['Aql', 'Boo', 'CrB', 'Her', 'Lib', 'Oph', 'Sgr', 'Sct', 'Vir']);
  assert.deepEqual(ids('And'), ['Cas', 'Lac', 'Peg', 'Per', 'Psc', 'Tri']);
  assert.deepEqual(ids('Oct'), ['Aps', 'Cha', 'Hyi', 'Ind', 'Men', 'Pav', 'Tuc']);
});

test('neighbours are mutual and every constellation can be reached from Ursa Major', () => {
  neighbours.forEach((list, i) => {
    assert.ok(list.length >= 2, `${catalog.constellations[i].id} has neighbours`);
    for (const j of list) assert.ok(neighbours[j].includes(i), `${i} <-> ${j}`);
  });
  const seen = new Set([catalog.byId.get('UMa').index]);
  const queue = [...seen];
  while (queue.length) for (const j of neighbours[queue.pop()]) if (!seen.has(j)) seen.add(j) && queue.push(j);
  assert.equal(seen.size, 88);
});

test('neighbours agree with what lies on either side of every boundary edge', () => {
  const at = (ra, dec) => {
    for (const c of catalog.constellations) for (const ring of c.ringsB1875) if (pointInRing(ring, wrap360(ra), dec)) return c.index;
    return -1;
  };
  const sampled = catalog.constellations.map(() => new Set());
  const off = 0.02;
  for (const c of catalog.constellations) {
    for (const r of c.ringsB1875) {
      for (let i = 0; i < r.x1.length; i++) {
        const len = Math.max(Math.abs(r.dx[i]) * Math.cos((r.y1[i] * Math.PI) / 180), Math.abs(r.y2[i] - r.y1[i]));
        const n = Math.max(3, Math.ceil(len / 0.5));
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          const ra = r.x1[i] + r.dx[i] * t;
          const dec = r.y1[i] + (r.y2[i] - r.y1[i]) * t;
          const meridian = Math.abs(r.dx[i]) < 0.01;
          const [a, b] = meridian
            ? [at(ra - off / Math.cos((dec * Math.PI) / 180), dec), at(ra + off / Math.cos((dec * Math.PI) / 180), dec)]
            : [at(ra, dec - off), at(ra, dec + off)];
          if (a >= 0 && b >= 0 && a !== b) {
            sampled[a].add(b);
            sampled[b].add(a);
          }
        }
      }
    }
  }
  assert.deepEqual(sampled.map((s) => [...s].sort((x, y) => x - y)), neighbours);
});
