import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { altitudeAt, visibilityClass } from '../../src/astro/visibility.js';
import { mat3Apply, raDecFromVec, wrap180 } from '../../src/astro/math.js';
import { precessionMatrix } from '../../src/astro/precession.js';
import { julianDate, lstDeg } from '../../src/astro/time.js';
import { fromLocal } from '../../src/ui/format.js';
import { PLACES } from '../../src/data/places.js';
import { hourAngleAbove, MIN_ALT, winterEvenings, winterOf } from '../../src/sky/winter.js';

const catalog = buildCatalog();
const ids = (set) => [...set].map((i) => catalog.constellations[i].id).sort();
const place = (id) => PLACES.find((p) => p.id === id);
const winter = (id) => winterEvenings(catalog, place(id).lat, place(id).lon, 2026);
const seen = (id) => new Set(catalog.constellations.filter((c) => visibilityClass(c.figureDecs, place(id).lat) !== 'never').map((c) => c.index));

test('from Stockholm, 48 of the 57 are seen on winter evenings; the summer ones and the lowest are not', () => {
  const w = winter('stockholm');
  const year = seen('stockholm');
  assert.deepEqual([w.size, year.size], [48, 57]);
  assert.ok([...w].every((i) => year.has(i)), 'each of them is seen from Stockholm at all');
  assert.deepEqual(ids([...year].filter((i) => !w.has(i))), ['For', 'Lib', 'Oph', 'PsA', 'Pup', 'Pyx', 'Scl', 'Sco', 'Sgr']);
  const winterSky = ['Ori', 'Tau', 'Gem', 'Aur', 'CMa', 'CMi', 'Lep', 'Mon', 'Eri', 'Per'];
  const allNight = ['UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cam'];
  const evening = ['Peg', 'And', 'Cyg', 'Lyr', 'Leo', 'Cnc'];
  for (const c of [...winterSky, ...allNight, ...evening]) assert.ok(w.has(catalog.byId.get(c).index), c);
});

test('the farther north, the fewer', () => {
  const sizes = ['malmo', 'stockholm', 'kiruna'].map((id) => winter(id).size);
  assert.deepEqual(sizes, [51, 48, 42]);
});

test('it agrees with looking at the sky every ten minutes of every winter evening', () => {
  for (const id of ['stockholm', 'kiruna']) {
    const { lat, lon } = place(id);
    const precess = precessionMatrix(julianDate(fromLocal(2027, 1, 15, 0, 0)));
    const figures = catalog.constellations.map((c) => c.figureStars.map((i) => raDecFromVec(
      mat3Apply(precess, [catalog.stars.x[i], catalog.stars.y[i], catalog.stars.z[i]]))));
    const looked = new Set();
    for (let day = 0; day < 90; day++) {
      const date = new Date(Date.UTC(2026, 11, 1 + day));
      const six = fromLocal(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 18, 0);
      for (let min = 0; min <= 360; min += 10) {
        const lst = lstDeg(julianDate(six + min * 60_000), lon);
        figures.forEach((figure, k) => {
          const up = figure.filter(([ra, dec]) => altitudeAt(dec, wrap180(lst - ra), lat) >= MIN_ALT).length;
          if (up * 2 >= figure.length) looked.add(k);
        });
      }
    }
    assert.deepEqual(ids(winterEvenings(catalog, lat, lon, 2026)), ids(looked), id);
  }
});

test('a star stands high enough within an hour angle on either side of the meridian', () => {
  assert.equal(hourAngleAbove(89, 59, 5), 180, 'near the pole: always');
  assert.equal(hourAngleAbove(-60, 59, 5), -1, 'far south: never');
  assert.ok(Math.abs(hourAngleAbove(0, 0, 0) - 90) < 1e-9, 'on the equator, from the equator: six hours each way');
  const h = hourAngleAbove(20, 59, 5);
  assert.ok(Math.abs(altitudeAt(20, h, 59) - 5) < 1e-9);
});

test('a winter is named after the year of its December, and the choice hardly changes over the years', () => {
  assert.equal(winterOf(Date.UTC(2027, 0, 20)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 9, 29)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 5, 1)), 2025);
  const { lat, lon } = place('stockholm');
  assert.deepEqual(ids(winterEvenings(catalog, lat, lon, 2000)), ids(winterEvenings(catalog, lat, lon, 2050)));
});
