// "Vinterkvällar": the constellations that can be seen on a winter evening, between six
// and midnight from December to February. One counts when at least half of its figure
// stands 5 degrees or more above the horizon for an hour on end on some such evening: the
// test visibilityClass uses for 'visible', kept to winter evenings, and long enough that a
// figure only just up at the very edge of the evenings does not count.
import { DEG, mat3Apply, raDecFromVec, wrap180, wrap360 } from '../astro/math.js';
import { precessionMatrix } from '../astro/precession.js';
import { julianDate, lstDeg } from '../astro/time.js';
import { fromLocal, localParts } from '../ui/format.js';

/** The evenings: from 18:00 to midnight, Swedish time. */
export const EVENING_FROM = 18;
/** How high (degrees) a figure star must stand to count as seen. */
export const MIN_ALT = 5;
/** How long (hours) at least half of a figure must stay that high. */
export const MIN_HOURS = 1;

/** Degrees of sidereal time in an hour. */
const SIDEREAL_DEG_PER_HOUR = 15 * 1.00273790935;

/** The winter a time falls in or comes before, by the year its December is in. */
export function winterOf(ms) {
  const { year, month } = localParts(ms);
  return month >= 7 ? year : year - 1;
}

/**
 * Hour angle (degrees) on either side of the meridian within which a star at `dec`
 * stands `minAlt` or higher from latitude `lat`: 180 when it always does, -1 when never.
 */
export function hourAngleAbove(dec, lat, minAlt) {
  const cosH = (Math.sin(minAlt * DEG) - Math.sin(lat * DEG) * Math.sin(dec * DEG)) / (Math.cos(lat * DEG) * Math.cos(dec * DEG));
  if (cosH <= -1) return 180;
  if (cosH > 1) return -1;
  return Math.acos(cosH) / DEG;
}

/**
 * For each constellation, the longest time (hours) that at least half of its figure stays
 * MIN_ALT or higher in one go on the evenings of a winter, seen from a place.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {number} year  the year of the winter's December
 * @returns {number[]} hours, by constellation index
 */
export function winterHours(catalog, lat, lon, year) {
  // Each evening shows the sky about four minutes of sidereal time later than the one
  // before, so all the evenings together show one unbroken span of it: from the first
  // evening's start to the last one's end, at midnight going into March. Any stretch of
  // it shorter than an evening lies within one evening.
  const first = lstDeg(julianDate(fromLocal(year, 12, 1, EVENING_FROM, 0)), lon);
  const span = wrap360(lstDeg(julianDate(fromLocal(year + 1, 3, 1, 0, 0)), lon) - first);
  const precess = precessionMatrix(julianDate(fromLocal(year + 1, 1, 15, 0, 0)));
  const { stars } = catalog;
  return catalog.constellations.map((c) => {
    const figure = c.figureStars.map((i) => {
      const [ra, dec] = raDecFromVec(mat3Apply(precess, [stars.x[i], stars.y[i], stars.z[i]]));
      return { ra, h: hourAngleAbove(dec, lat, MIN_ALT) };
    });
    // How many stars are up changes only as one rises or sets, so the span is cut there
    // and each piece judged at its middle.
    const cuts = [0, span];
    for (const s of figure) {
      if (s.h < 0 || s.h >= 180) continue;
      for (const at of [wrap360(s.ra - s.h - first), wrap360(s.ra + s.h - first)]) if (at < span) cuts.push(at);
    }
    cuts.sort((a, b) => a - b);
    let longest = 0;
    let run = 0;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const middle = first + (cuts[k] + cuts[k + 1]) / 2;
      const up = figure.filter((s) => s.h >= 180 || Math.abs(wrap180(middle - s.ra)) <= s.h).length;
      run = up * 2 >= figure.length ? run + cuts[k + 1] - cuts[k] : 0;
      longest = Math.max(longest, run);
    }
    return longest / SIDEREAL_DEG_PER_HOUR;
  });
}

/**
 * The constellations seen on the evenings of a winter from a place.
 * @returns {Set<number>} constellation indices
 */
export function winterEvenings(catalog, lat, lon, year) {
  const hours = winterHours(catalog, lat, lon, year);
  return new Set(catalog.constellations.filter((c) => hours[c.index] >= MIN_HOURS).map((c) => c.index));
}
