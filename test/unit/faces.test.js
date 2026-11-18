import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { figureFaces, flatMapAt } from '../../src/sky/faces.js';

const catalog = buildCatalog();
const con = (id) => catalog.byId.get(id);

test('a loop of lines is a face, whichever way its lines are given, and an open figure has none', () => {
  const at = [[0, 0], [1, 0], [1, 1], [0, 1], [2, 2], [3, 0]];
  const pointOf = (i) => at[i];
  // A square with a tail.
  assert.deepEqual(figureFaces([0, 1, 1, 2, 2, 3, 3, 0, 2, 4], pointOf).map((f) => [...f].sort()), [[0, 1, 2, 3]]);
  assert.deepEqual(figureFaces([1, 0, 2, 1, 3, 2, 0, 3], pointOf).map((f) => [...f].sort()), [[0, 1, 2, 3]]);
  // A line given twice counts once; a zigzag closes nothing.
  assert.deepEqual(figureFaces([0, 1, 1, 0, 1, 2, 2, 3], pointOf), []);
  // Two loops that share a line are two faces; so are two loops apart.
  assert.equal(figureFaces([0, 1, 1, 2, 2, 3, 3, 0, 0, 2], pointOf).length, 2);
  assert.equal(figureFaces([0, 1, 1, 3, 3, 0, 2, 4, 4, 5, 5, 2], pointOf).length, 2);
  // A star that cannot be mapped takes its lines with it.
  assert.deepEqual(figureFaces([0, 1, 1, 2, 2, 3, 3, 0], (i) => (i === 2 ? null : at[i])), []);
});

test('each face goes round an inside, by lines of the figure', () => {
  let withFaces = 0;
  for (const c of catalog.constellations) {
    if (c.faces.length) withFaces++;
    const lines = new Set();
    for (let k = 0; k < c.segments.length; k += 2) lines.add(`${Math.min(c.segments[k], c.segments[k + 1])}-${Math.max(c.segments[k], c.segments[k + 1])}`);
    for (const face of c.faces) {
      assert.ok(face.length >= 3, `${c.id}: ${face.length} corners`);
      face.forEach((s, k) => {
        const t = face[(k + 1) % face.length];
        assert.ok(lines.has(`${Math.min(s, t)}-${Math.max(s, t)}`), `${c.id}: ${s}-${t} is a line of the figure`);
        assert.ok(c.figureStars.includes(s));
      });
    }
  }
  assert.ok(withFaces >= 40 && withFaces < 60, `${withFaces} constellations have a closed part`);
});

test('the well-known shapes are found', () => {
  const sizes = (id) => con(id).faces.map((f) => f.length).sort((a, b) => a - b);
  // The bowl of the Big Dipper (and the bear's body), the bowl of the Little Dipper, the
  // square of Pegasus, the keystone of Hercules, the two triangles, the kite of Boötes.
  assert.ok(sizes('UMa').includes(4));
  assert.deepEqual(sizes('UMi'), [4]);
  assert.deepEqual(sizes('Peg'), [4]);
  assert.deepEqual(sizes('Her'), [4]);
  assert.deepEqual(sizes('Tri'), [3]);
  assert.deepEqual(sizes('TrA'), [3]);
  assert.ok(sizes('Boo').includes(6));
  // The bowl of the Big Dipper is its four bowl stars: Dubhe, Merak, Phecda and Megrez.
  const bowl = ['Dubhe', 'Merak', 'Phecda', 'Megrez'];
  const named = con('UMa').faces.map((f) => f.map((s) => catalog.starNames[s]).sort());
  assert.ok(named.some((names) => JSON.stringify(names) === JSON.stringify([...bowl].sort())), JSON.stringify(named));
  // Open figures: the W, the cross, the scorpion.
  for (const id of ['Cas', 'Cyg', 'Sco', 'Ari']) assert.deepEqual(con(id).faces, [], id);
});

test('the flat map keeps directions near its centre and gives up far from it', () => {
  const map = flatMapAt([0, 0, 1]);
  assert.deepEqual(map([0, 0, 1]), [0, 0]);
  assert.equal(map([1, 0, 0]), null);
  assert.equal(map([0, 0, -1]), null);
  const [x, y] = flatMapAt([1, 0, 0])([Math.cos(0.1), Math.sin(0.1), 0]);
  assert.ok(Math.abs(x - Math.tan(0.1)) < 1e-12 && Math.abs(y) < 1e-12, `${x}, ${y}`);
});
