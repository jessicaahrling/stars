import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { chunksOf } from '../../src/sky/curriculum.js';
import { groupOutline } from '../../src/sky/group-outline.js';
import { angleBetween } from '../../src/astro/math.js';

const catalog = buildCatalog();
const all = catalog.constellations;
const index = (id) => catalog.byId.get(id).index;
const chunks = chunksOf(catalog);

/** Length in degrees on the sky of lines of unit vectors (angleBetween gives degrees). */
const lengthOf = (lines) => lines.reduce((sum, l) => sum + l.slice(1).reduce((s, v, k) => s + angleBetween(l[k], v), 0), 0);
const ringLength = (c) => lengthOf(c.outlines.map((r) => [...r, r[0]]));
const closed = (l) => angleBetween(l[0], l[l.length - 1]) < 1e-3;

/** A point a little to the side of the outline at the middle of a step, on each side. */
function sides(a, b, off = 0.02) {
  const m = a.map((x, k) => x + b[k]);
  const n = Math.hypot(...m);
  const mid = m.map((x) => x / n);
  // The step's direction crossed with the point gives the side.
  const d = b.map((x, k) => x - a[k]);
  const s = [d[1] * mid[2] - d[2] * mid[1], d[2] * mid[0] - d[0] * mid[2], d[0] * mid[1] - d[1] * mid[0]];
  const sn = Math.hypot(...s);
  const r = (off * Math.PI) / 180;
  return [1, -1].map((sign) => {
    const p = mid.map((x, k) => x + (sign * r * s[k]) / sn);
    const pn = Math.hypot(...p);
    return p.map((x) => x / pn);
  });
}

test('one constellation alone is outlined by its own boundary, all the way round', () => {
  for (const id of ['Ori', 'UMa', 'UMi', 'Oct', 'Cru', 'Peg']) {
    const c = all[index(id)];
    const lines = groupOutline(all, [c.index]);
    assert.equal(lines.length, 1, `${id}: one line`);
    assert.ok(closed(lines[0]), `${id}: closed`);
    assert.ok(Math.abs(lengthOf(lines) - ringLength(c)) < 0.01, `${id}: ${lengthOf(lines)} vs ${ringLength(c)}`);
  }
  // Serpens is in two halves, and each is outlined.
  const ser = groupOutline(all, [index('Ser')]);
  assert.equal(ser.length, 2);
  assert.ok(ser.every(closed));
});

test('the whole sky has nothing around it', () => {
  assert.deepEqual(groupOutline(all, all.map((c) => c.index)), []);
});

test('two neighbours are outlined without the stretch they share', () => {
  const ori = all[index('Ori')];
  const tau = all[index('Tau')];
  const lines = groupOutline(all, [ori.index, tau.index]);
  assert.equal(lines.length, 1);
  assert.ok(closed(lines[0]));
  // What they share, measured another way: the steps of Orion's boundary with Taurus
  // just outside.
  let byPoints = 0;
  for (const r of ori.outlines) {
    r.forEach((a, k) => {
      const b = r[(k + 1) % r.length];
      if (sides(a, b, 0.02).some((p) => catalog.constellationAt(p) === tau.index)) byPoints += angleBetween(a, b);
    });
  }
  const shared = (ringLength(ori) + ringLength(tau) - lengthOf(lines)) / 2;
  assert.ok(byPoints > 20 && Math.abs(shared - byPoints) < 0.05, `they share ${shared} degrees, by points ${byPoints}`);
  // Not neighbours: both outlines in full.
  const apart = groupOutline(all, [ori.index, index('UMa')]);
  assert.equal(apart.length, 2);
  assert.ok(Math.abs(lengthOf(apart) - ringLength(ori) - ringLength(all[index('UMa')])) < 0.01);
});

test('every group is outlined by one closed line with the group on one side and the rest of the sky on the other', () => {
  assert.equal(chunks.length, 28);
  for (const ch of chunks) {
    const lines = groupOutline(all, ch.members);
    assert.ok(lines.length >= 1 && lines.every(closed), `${ch.name}: ${lines.length} closed lines`);
    // The members border each other, so one line goes round them all, unless the group
    // closes round a constellation outside it.
    assert.equal(lines.length, 1, `${ch.name}: ${lines.length} lines`);
    const inGroup = new Set(ch.members);
    let checked = 0;
    for (const l of lines) {
      for (let k = 0; k + 1 < l.length; k += 3) {
        const [p, q] = sides(l[k], l[k + 1]);
        const a = catalog.constellationAt(p);
        const b = catalog.constellationAt(q);
        // Right at a corner a side can touch a third constellation; that says nothing.
        if (a === b) assert.fail(`${ch.name}: both sides in ${all[a].id}`);
        assert.ok(inGroup.has(a) !== inGroup.has(b), `${ch.name}: ${all[a].id} | ${all[b].id}`);
        checked++;
      }
    }
    assert.ok(checked > 20, `${ch.name}: ${checked} points checked`);
    // Every member's boundary is longer than what it adds to the outline, but the outline
    // still goes past every member.
    for (const i of ch.members) {
      const near = lines.some((l) => l.some((v) => all[i].outlines.some((r) => r.some((u) => angleBetween(u, v) < 1e-3))));
      assert.ok(near, `${ch.name}: the outline passes ${all[i].id}`);
    }
  }
});
