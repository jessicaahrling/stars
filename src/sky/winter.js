// "Vinterhimlen": the constellations that can be seen at ten in the evening in winter
// from both Stockholm and Göteborg. One counts when at least half of its figure stands 5
// degrees or more above the horizon at 22:00 on at least 30 of the evenings from December
// to February, from each of the two: the test visibilityClass uses for 'visible', kept to
// winter evenings at ten, and to a month of them, so that a figure only just up at the
// very start or end of the winter does not count.
import { mat3Apply, raDecFromVec, wrap180 } from '../astro/math.js';
import { precessionMatrix } from '../astro/precession.js';
import { julianDate, lstDeg } from '../astro/time.js';
import { altitudeAt } from '../astro/visibility.js';
import { PLACES } from '../data/places.js';
import { fromLocal, localParts } from '../ui/format.js';

/** The places the winter sky is seen from. */
export const WINTER_PLACES = ['stockholm', 'goteborg'];
/** The hour of the evening, Swedish time. */
export const WINTER_HOUR = 22;
/** How high (degrees) a figure star must stand to count as seen. */
export const MIN_ALT = 5;
/** On how many winter evenings at least half of a figure must be up. */
export const MIN_NIGHTS = 30;

/** The winter a time falls in or comes before, by the year its December is in. */
export function winterOf(ms) {
  const { year, month } = localParts(ms);
  return month >= 7 ? year : year - 1;
}

/**
 * For each constellation, on how many evenings of a winter (1 December to the end of
 * February) at least half of its figure stands MIN_ALT or higher at WINTER_HOUR.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {number} year  the year of the winter's December
 * @returns {number[]} evenings, by constellation index
 */
export function winterNights(catalog, lat, lon, year) {
  const precess = precessionMatrix(julianDate(fromLocal(year + 1, 1, 15, 0, 0)));
  const { stars } = catalog;
  const figures = catalog.constellations.map((c) => c.figureStars.map((i) => raDecFromVec(mat3Apply(precess, [stars.x[i], stars.y[i], stars.z[i]]))));
  const nights = catalog.constellations.map(() => 0);
  const end = fromLocal(year + 1, 3, 1, 0, 0);
  for (let day = 1; ; day++) {
    const ms = fromLocal(year, 12, day, WINTER_HOUR, 0);
    if (ms >= end) break;
    const lst = lstDeg(julianDate(ms), lon);
    figures.forEach((figure, k) => {
      const up = figure.filter(([ra, dec]) => altitudeAt(dec, wrap180(lst - ra), lat) >= MIN_ALT).length;
      if (up * 2 >= figure.length) nights[k]++;
    });
  }
  return nights;
}

/**
 * The winter sky: the constellations seen on at least MIN_NIGHTS winter evenings at
 * WINTER_HOUR from every one of WINTER_PLACES.
 * @returns {Set<number>} constellation indices
 */
export function winterSky(catalog, year) {
  const counts = WINTER_PLACES.map((id) => {
    const p = PLACES.find((q) => q.id === id);
    return winterNights(catalog, p.lat, p.lon, year);
  });
  return new Set(catalog.constellations.filter((c) => counts.every((n) => n[c.index] >= MIN_NIGHTS)).map((c) => c.index));
}
