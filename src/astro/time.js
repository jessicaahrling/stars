// Time scales: Julian dates and sidereal time.
import { wrap360 } from './math.js';

export const J2000 = 2451545.0;
/** Julian date of the Besselian epoch B1875.0 (the epoch of the IAU constellation boundaries). */
export const JD_B1875 = 2405889.258550475;

/** Julian date (UT) for a Unix time in milliseconds. */
export function julianDate(ms) {
  return ms / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0. */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000) / 36525;
}

/**
 * Greenwich mean sidereal time in degrees (IAU 1982, Meeus eq. 12.4).
 * Accurate to well under a second of time for dates near the present.
 */
export function gmstDeg(jd) {
  const d = jd - J2000;
  const t = d / 36525;
  return wrap360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000);
}

/** Local mean sidereal time in degrees for an east-positive longitude. */
export function lstDeg(jd, lonDeg) {
  return wrap360(gmstDeg(jd) + lonDeg);
}
