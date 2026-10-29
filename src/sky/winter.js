// "Vinterkvällar": the constellations that can be seen on a winter evening, between six
// and midnight from December to February. One counts when at least half of its figure
// stands 5 degrees or more above the horizon at some moment then: the test visibilityClass
// uses for 'visible', kept to winter evenings.
import { DEG, mat3Apply, raDecFromVec, wrap180, wrap360 } from '../astro/math.js';
import { precessionMatrix } from '../astro/precession.js';
import { julianDate, lstDeg } from '../astro/time.js';
import { fromLocal, localParts } from '../ui/format.js';

/** The evenings: from 18:00 to midnight, Swedish time. */
export const EVENING_FROM = 18;
/** How high (degrees) a figure star must stand to count as seen. */
export const MIN_ALT = 5;

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
 * The constellations seen on the evenings of a winter from a place.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {number} year  the year of the winter's December
 * @returns {Set<number>} constellation indices
 */
export function winterEvenings(catalog, lat, lon, year) {
  // Each evening shows the sky about four minutes of sidereal time later than the one
  // before, so all the evenings together show one unbroken span of it: from the first
  // evening's start to the last one's end, at midnight going into March.
  const first = lstDeg(julianDate(fromLocal(year, 12, 1, EVENING_FROM, 0)), lon);
  const span = wrap360(lstDeg(julianDate(fromLocal(year + 1, 3, 1, 0, 0)), lon) - first);
  const inSpan = (lst) => wrap360(lst - first) <= span;
  const precess = precessionMatrix(julianDate(fromLocal(year + 1, 1, 15, 0, 0)));
  const { stars } = catalog;
  const seen = new Set();
  for (const c of catalog.constellations) {
    const figure = c.figureStars.map((i) => {
      const [ra, dec] = raDecFromVec(mat3Apply(precess, [stars.x[i], stars.y[i], stars.z[i]]));
      return { ra, h: hourAngleAbove(dec, lat, MIN_ALT) };
    });
    const upAt = (lst) => figure.filter((s) => s.h >= 180 || Math.abs(wrap180(lst - s.ra)) <= s.h + 1e-9).length;
    // How many stars are up changes only as one rises or sets, so the most there are at
    // once is reached at the start of the span or as one of them rises within it.
    const moments = [first, ...figure.filter((s) => s.h >= 0 && s.h < 180).map((s) => wrap360(s.ra - s.h)).filter(inSpan)];
    if (moments.some((lst) => upAt(lst) * 2 >= figure.length)) seen.add(c.index);
  }
  return seen;
}
