// Observing facts about a constellation for the current place and time.
import { mat3Apply, raDecFromVec, wrap180, wrap360 } from '../astro/math.js';
import { precessionMatrix } from '../astro/precession.js';
import { julianDate, lstDeg } from '../astro/time.js';
import { altitudeAt, maxAltitude, visibilityClass } from '../astro/visibility.js';
import { fromLocal, localParts } from '../ui/format.js';

const SIDEREAL_DEG_PER_DAY = 360.98564736629;
const DAY = 86400000;

/**
 * How much of a constellation's stick figure is above the horizon right now.
 * @returns {'up'|'rising'|'down'} up: at least half, rising: some, down: none
 */
export function figureState(c, view, starVec) {
  let up = 0;
  for (const i of c.figureStars) if (view.altOf(starVec(i)) > 0) up++;
  if (up * 2 >= c.figureStars.length) return 'up';
  return up > 0 ? 'rising' : 'down';
}

/**
 * @param {import('./catalog.js').Constellation} c
 * @param {import('./view.js').SkyView} view
 */
export function constellationFacts(c, view) {
  const { lat, lon, timeMs } = view;
  const jd = julianDate(timeMs);
  const [ra, dec] = raDecFromVec(mat3Apply(precessionMatrix(jd), c.centerVec));
  const altAt = (ms) => altitudeAt(dec, wrap180(lstDeg(julianDate(ms), lon) - ra), lat);
  const [az, alt] = view.azAltOf(c.centerVec);

  const lst = lstDeg(jd, lon);
  const transitMs = timeMs + (wrap360(ra - lst) / SIDEREAL_DEG_PER_DAY) * DAY;

  /** Next time within a day the centre crosses the horizon upward (or downward). */
  const crossing = (upward) => {
    const step = 10 * 60000;
    let prev = altAt(timeMs);
    for (let t = timeMs + step; t <= timeMs + DAY; t += step) {
      const a = altAt(t);
      if (upward ? prev < 0 && a >= 0 : prev >= 0 && a < 0) {
        let lo = t - step;
        let hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if ((altAt(mid) >= 0) === upward) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = a;
    }
    return null;
  };

  // The month whose evenings (22:00) show the constellation highest.
  const { year } = localParts(timeMs);
  let bestMonth = 1;
  let bestAlt = -Infinity;
  for (let m = 1; m <= 12; m++) {
    const a = altAt(fromLocal(year, m, 15, 22, 0));
    if (a > bestAlt) {
      bestAlt = a;
      bestMonth = m;
    }
  }

  return {
    az,
    alt,
    visibility: visibilityClass(c.figureDecs, lat),
    transitMs,
    transitAlt: maxAltitude(dec, lat),
    riseMs: alt < 0 ? crossing(true) : null,
    setMs: alt >= 0 ? crossing(false) : null,
    bestMonth,
  };
}
