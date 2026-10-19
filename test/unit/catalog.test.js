import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { pointInRing, prepareRing, rasterizeRings } from '../../src/sky/rings.js';
import { vecFromRaDec } from '../../src/astro/math.js';
import { visibilityClass } from '../../src/astro/visibility.js';
import { CONSTELLATION_NAMES_SV } from '../../src/data/names-sv.js';

const catalog = buildCatalog();
const idAt = (ra, dec) => catalog.constellations[catalog.constellationAt(vecFromRaDec(ra, dec))]?.id;
const starByHip = (hip) => catalog.stars.hip.indexOf(hip);

test('88 constellations, each with a unique Swedish name', () => {
  assert.equal(catalog.constellations.length, 88);
  const names = new Set(catalog.constellations.map((c) => c.sv));
  assert.equal(names.size, 88);
  assert.equal(Object.keys(CONSTELLATION_NAMES_SV).length, 88);
  for (const c of catalog.constellations) {
    assert.ok(c.segments.length >= 2, `${c.id} has a stick figure`);
    assert.ok(c.outlines.length >= 1, `${c.id} has a boundary`);
  }
});

test('well-known stars fall in the right constellation', () => {
  const cases = [
    [88.7929, 7.4071, 'Ori'], // Betelgeuse
    [37.9546, 89.2641, 'UMi'], // Polaris
    [101.2872, -16.7161, 'CMa'], // Sirius
    [279.2347, 38.7837, 'Lyr'], // Vega
    [2.0969, 29.0904, 'And'], // Alpheratz, on the Pegasus border
    [310.358, 45.2803, 'Cyg'], // Deneb
    [344.4127, -29.6222, 'PsA'], // Fomalhaut
    [317.1951, -88.9565, 'Oct'], // sigma Octantis
    [47.0422, 40.9556, 'Per'], // Algol
    [135.1597, 41.7829, 'Lyn'], // 10 UMa, which lies in Lynx
  ];
  for (const [ra, dec, id] of cases) assert.equal(idAt(ra, dec), id, `${ra},${dec}`);
});

test('the region next to Ursa Minor near the pole belongs to Camelopardalis', () => {
  // HIP 65595 sits in a notch of Camelopardalis that wraps around Ursa Minor.
  assert.equal(idAt(201.7367, 78.6439), 'Cam');
});

test('every star is assigned to the constellation whose boundary contains it', () => {
  for (const hip of [27989, 11767, 32349, 91262]) {
    const i = starByHip(hip);
    assert.ok(i >= 0);
    assert.equal(catalog.stars.con[i], catalog.constellationAt(catalog.starVec(i)));
  }
});

test('ring tests across RA 0 and around a pole', () => {
  const square = prepareRing([[350, -5], [10, -5], [10, 5], [350, 5]]);
  assert.ok(pointInRing(square, 0, 0));
  assert.ok(pointInRing(square, 355, 1));
  assert.ok(!pointInRing(square, 20, 0));
  const cap = prepareRing([[0, 80], [90, 80], [180, 80], [270, 80]]);
  assert.ok(cap.polar && cap.northInside);
  assert.ok(pointInRing(cap, 123, 85));
  assert.ok(!pointInRing(cap, 123, 70));
  const southCap = prepareRing([[0, -80], [90, -80], [180, -80], [270, -80]]);
  assert.ok(pointInRing(southCap, 10, -89));
  assert.ok(!pointInRing(southCap, 10, 0));
});

test('rasterizing a ring that crosses RA 0 paints both edges of the map', () => {
  const ring = prepareRing([[350, -5], [10, -5], [10, 5], [350, 5]]);
  const cols = new Set();
  rasterizeRings([ring], 36, 18, (col) => cols.add(col));
  assert.deepEqual([...cols].sort((a, b) => a - b), [0, 35]);
});

test('what can be seen from Stockholm', () => {
  const vis = (id) => visibilityClass(catalog.byId.get(id).figureDecs, 59.33);
  assert.equal(vis('Cas'), 'circumpolar');
  assert.equal(vis('UMi'), 'circumpolar');
  assert.equal(vis('Ori'), 'visible');
  assert.equal(vis('Sco'), 'partly');
  assert.equal(vis('Cru'), 'never');
  assert.equal(vis('Cen'), 'never');
});

test('Polaris is named in Swedish', () => {
  assert.equal(catalog.starNames[starByHip(11767)], 'Polstjärnan');
});
