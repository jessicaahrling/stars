import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { altitudeAt } from '../../src/astro/visibility.js';
import { mat3Apply, raDecFromVec, wrap180 } from '../../src/astro/math.js';
import { precessionMatrix } from '../../src/astro/precession.js';
import { julianDate, lstDeg } from '../../src/astro/time.js';
import { fromLocal } from '../../src/ui/format.js';
import { PLACES } from '../../src/data/places.js';
import { MIN_ALT, MIN_NIGHTS, winterNights, winterOf, winterSky } from '../../src/sky/winter.js';

const catalog = buildCatalog();
const ids = (set) => [...set].map((i) => catalog.constellations[i].id).sort();
const idx = (id) => catalog.byId.get(id).index;
const place = (id) => PLACES.find((p) => p.id === id);
const nights = (id) => winterNights(catalog, place(id).lat, place(id).lon, 2026);

test('the winter sky: 34 seen at ten from both Stockholm and Göteborg for a month of the winter', () => {
  const w = winterSky(catalog, 2026);
  assert.equal(w.size, 34);
  const winterSky22 = ['Ori', 'Tau', 'Gem', 'Aur', 'CMa', 'CMi', 'Lep', 'Mon', 'Eri', 'Per', 'Cnc', 'Leo', 'Hya'];
  const allNight = ['UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cam', 'Cyg', 'Lyr'];
  const evening = ['Peg', 'And', 'Psc', 'Cet', 'Ari', 'Tri', 'Boo', 'Com'];
  for (const c of [...winterSky22, ...allNight, ...evening]) assert.ok(w.has(idx(c)), c);
  for (const c of ['Her', 'CrB', 'Vir', 'Aql', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Del', 'Vul', 'Crv']) assert.ok(!w.has(idx(c)), c);
});

test('Herkules is up at ten for a month in Stockholm but not in Göteborg, so it waits', () => {
  const [s, g] = [nights('stockholm'), nights('goteborg')];
  assert.ok(s[idx('Her')] >= MIN_NIGHTS && g[idx('Her')] < MIN_NIGHTS);
  assert.deepEqual([s[idx('Ori')], g[idx('Ori')]], [90, 90], 'Orion every evening');
  assert.ok(s[idx('CMa')] >= MIN_NIGHTS && s[idx('CMa')] < 90, 'Stora hunden from mid-December');
});

test('the evenings are counted as they look at ten each day', () => {
  // Every tenth evening, looked at directly, agrees with the count for those evenings.
  const { lat, lon } = place('stockholm');
  const precess = precessionMatrix(julianDate(fromLocal(2027, 1, 15, 0, 0)));
  for (const id of ['CMa', 'Her', 'Leo', 'Eri', 'Peg']) {
    const c = catalog.byId.get(id);
    const figure = c.figureStars.map((i) => raDecFromVec(mat3Apply(precess, [catalog.stars.x[i], catalog.stars.y[i], catalog.stars.z[i]])));
    const upOn = (day) => {
      const date = new Date(Date.UTC(2026, 11, day));
      const lst = lstDeg(julianDate(fromLocal(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 22, 0)), lon);
      return figure.filter(([ra, dec]) => altitudeAt(dec, wrap180(lst - ra), lat) >= MIN_ALT).length * 2 >= figure.length;
    };
    let counted = 0;
    for (let day = 1; day <= 90; day++) if (upOn(day)) counted++;
    assert.equal(counted, nights('stockholm')[c.index], id);
  }
});

test('a winter is named after the year of its December, and the winter sky does not change over the years', () => {
  assert.equal(winterOf(Date.UTC(2027, 0, 20)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 9, 29)), 2026);
  assert.equal(winterOf(Date.UTC(2026, 5, 1)), 2025);
  const now = ids(winterSky(catalog, 2026));
  for (const year of [2000, 2024, 2025, 2027, 2028, 2050]) assert.deepEqual(ids(winterSky(catalog, year)), now, String(year));
});
