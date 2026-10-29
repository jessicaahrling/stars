import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { altitudeAt, visibilityClass } from '../../src/astro/visibility.js';
import { mat3Apply, raDecFromVec, wrap180 } from '../../src/astro/math.js';
import { precessionMatrix } from '../../src/astro/precession.js';
import { julianDate, lstDeg } from '../../src/astro/time.js';
import { fromLocal } from '../../src/ui/format.js';
import { PLACES } from '../../src/data/places.js';
import { hourAngleAbove, MIN_ALT, MIN_HOURS, winterEvenings, winterHours, winterOf } from '../../src/sky/winter.js';

const catalog = buildCatalog();
const ids = (set) => [...set].map((i) => catalog.constellations[i].id).sort();
const place = (id) => PLACES.find((p) => p.id === id);
const winter = (id) => winterEvenings(catalog, place(id).lat, place(id).lon, 2026);
const seen = (id) => new Set(catalog.constellations.filter((c) => visibilityClass(c.figureDecs, place(id).lat) !== 'never').map((c) => c.index));
const hoursOf = (id, cid) => winterHours(catalog, place(id).lat, place(id).lon, 2026)[catalog.byId.get(cid).index];

test('from Stockholm, 45 of the 57 are seen on winter evenings; the summer ones and the lowest are not', () => {
  const w = winter('stockholm');
  const year = seen('stockholm');
  assert.deepEqual([w.size, year.size], [45, 57]);
  assert.ok([...w].every((i) => year.has(i)), 'each of them is seen from Stockholm at all');
  assert.deepEqual(ids([...year].filter((i) => !w.has(i))), ['Crv', 'For', 'Lib', 'Oph', 'PsA', 'Pup', 'Pyx', 'Scl', 'Sco', 'Sct', 'Ser', 'Sgr']);
  const winterSky = ['Ori', 'Tau', 'Gem', 'Aur', 'CMa', 'CMi', 'Lep', 'Mon', 'Eri', 'Per'];
  const allNight = ['UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cam'];
  const evening = ['Peg', 'And', 'Cyg', 'Lyr', 'Leo', 'Cnc', 'Cap', 'Vir'];
  for (const c of [...winterSky, ...allNight, ...evening]) assert.ok(w.has(catalog.byId.get(c).index), c);
});

test('a figure only just up at the edge of the evenings does not count', () => {
  // Skölden stands high enough for a few minutes at six on the first evenings of
  // December, Korpen for a few just before midnight at the end of February.
  assert.ok(hoursOf('stockholm', 'Sct') > 0 && hoursOf('stockholm', 'Sct') < 0.2);
  assert.ok(hoursOf('stockholm', 'Crv') > 0 && hoursOf('stockholm', 'Crv') < 0.5);
  assert.ok(hoursOf('stockholm', 'Cap') > MIN_HOURS, 'Stenbocken stays more than an hour in early December');
  assert.ok(hoursOf('stockholm', 'Ori') > 6 && hoursOf('stockholm', 'UMa') > 11, 'Orion all evening long, Stora björnen all winter');
});

test('how many from each place', () => {
  const counts = Object.fromEntries(PLACES.map((p) => [p.id, winter(p.id).size]));
  assert.deepEqual(counts, { malmo: 46, goteborg: 45, visby: 45, stockholm: 45, sundsvall: 42, ostersund: 42, umea: 42, kiruna: 41 });
  // Further north less than half of Stora hunden reaches 5 degrees: only Sirius and its head.
  assert.equal(winter('sundsvall').has(catalog.byId.get('CMa').index), false);
});

test('it agrees with looking at the sky every ten minutes of every winter evening', () => {
  const precess = precessionMatrix(julianDate(fromLocal(2027, 1, 15, 0, 0)));
  const figures = catalog.constellations.map((c) => c.figureStars.map((i) => raDecFromVec(
    mat3Apply(precess, [catalog.stars.x[i], catalog.stars.y[i], catalog.stars.z[i]]))));
  for (const { id, lat, lon } of PLACES) {
    // The longest run, in minutes, of looks with at least half of a figure high enough.
    const looked = catalog.constellations.map(() => 0);
    for (let day = 0; day < 90; day++) {
      const date = new Date(Date.UTC(2026, 11, 1 + day));
      const six = fromLocal(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 18, 0);
      const run = catalog.constellations.map(() => -1);
      for (let min = 0; min <= 360; min += 10) {
        const lst = lstDeg(julianDate(six + min * 60_000), lon);
        figures.forEach((figure, k) => {
          const up = figure.filter(([ra, dec]) => altitudeAt(dec, wrap180(lst - ra), lat) >= MIN_ALT).length;
          run[k] = up * 2 >= figure.length ? run[k] + 1 : -1;
          looked[k] = Math.max(looked[k], run[k] * 10);
        });
      }
    }
    // Looks ten minutes apart see all but at most twenty minutes of a run, never more than it.
    const hours = winterHours(catalog, lat, lon, 2026);
    catalog.constellations.forEach((c, k) => {
      const minutes = Math.min(hours[k] * 60, 360);
      assert.ok(looked[k] <= minutes + 0.5 && looked[k] > minutes - 20, `${id} ${c.id}: looked ${looked[k]}, worked out ${minutes.toFixed(1)}`);
    });
  }
});

test('a star stands high enough within an hour angle on either side of the meridian', () => {
  assert.equal(hourAngleAbove(89, 59, 5), 180, 'near the pole: always');
  assert.equal(hourAngleAbove(-60, 59, 5), -1, 'far south: never');
  assert.ok(Math.abs(hourAngleAbove(0, 0, 0) - 90) < 1e-9, 'on the equator, from the equator: six hours each way');
  const h = hourAngleAbove(20, 59, 5);
  assert.ok(Math.abs(altitudeAt(20, h, 59) - 5) < 1e-9);
});

test('a winter is named after the year of its December, and the choice does not change over the years', () => {
  assert.equal(winterOf(Date.UTC(2027, 0, 20)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 9, 29)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 5, 1)), 2025);
  for (const { id, lat, lon } of PLACES) {
    const now = ids(winterEvenings(catalog, lat, lon, 2026));
    for (const year of [2000, 2024, 2025, 2027, 2028, 2050]) assert.deepEqual(ids(winterEvenings(catalog, lat, lon, year)), now, `${id} ${year}`);
  }
});
