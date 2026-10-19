import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmstDeg, julianDate } from '../../src/astro/time.js';
import { precessionMatrix } from '../../src/astro/precession.js';
import { equatorialToHorizontal, azAltFromVec, compassName } from '../../src/astro/frames.js';
import { mat3Apply, raDecFromVec, vecFromRaDec } from '../../src/astro/math.js';
import { maxAltitude, minAltitude, altitudeAt } from '../../src/astro/visibility.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('julian date of the Unix epoch and J2000', () => {
  assert.equal(julianDate(0), 2440587.5);
  assert.equal(julianDate(Date.UTC(2000, 0, 1, 12)), 2451545.0);
});

test('mean sidereal time matches Meeus example 12.a', () => {
  // 1987 April 10, 0h UT: 13h 10m 46.3668s
  const expected = (13 + 10 / 60 + 46.3668 / 3600) * 15;
  near(gmstDeg(julianDate(Date.UTC(1987, 3, 10))), expected, 0.0001);
});

test('precession matches Meeus example 21.b (theta Persei to 2028 Nov 13.19)', () => {
  const v = mat3Apply(precessionMatrix(2462088.69), vecFromRaDec(41.054063, 49.22775));
  const [ra, dec] = raDecFromVec(v);
  near(ra, 41.547214, 0.0002, 'RA');
  near(dec, 49.348483, 0.0002, 'Dec');
});

test('a star on the meridian is due south at 90 - latitude + declination', () => {
  const lat = 59.33;
  const lst = 123;
  const [az, alt] = azAltFromVec(mat3Apply(equatorialToHorizontal(lst, lat), vecFromRaDec(lst, 10)));
  near(az, 180, 1e-9);
  near(alt, 90 - lat + 10, 1e-9);
});

test('the celestial pole stands at the latitude in the north', () => {
  const [az, alt] = azAltFromVec(mat3Apply(equatorialToHorizontal(77, 63.8), [0, 0, 1]));
  near(alt, 63.8, 1e-9);
  near(az, 0, 1e-9);
});

test('a star six hours before the meridian is in the east', () => {
  const [az] = azAltFromVec(mat3Apply(equatorialToHorizontal(0, 59), vecFromRaDec(90, 0)));
  near(az, 90, 1e-9);
});

test('culmination altitudes', () => {
  assert.equal(maxAltitude(-30, 60), 0);
  near(minAltitude(80, 59.33), 49.33, 1e-9);
  near(altitudeAt(20, 0, 59.33), maxAltitude(20, 59.33), 1e-9);
  near(altitudeAt(20, 180, 59.33), minAltitude(20, 59.33), 1e-9);
});

test('Swedish compass names', () => {
  assert.equal(compassName(0), 'norr');
  assert.equal(compassName(359), 'norr');
  assert.equal(compassName(135), 'sydost');
  assert.equal(compassName(260), 'väster');
});
