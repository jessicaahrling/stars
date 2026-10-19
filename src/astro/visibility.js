// What can be seen from a given latitude, and when.
import { clamp } from './math.js';

/** Highest altitude (degrees) a point at declination `dec` reaches from latitude `lat`. */
export function maxAltitude(dec, lat) {
  return 90 - Math.abs(lat - dec);
}

/** Lowest altitude (degrees), reached at lower culmination. */
export function minAltitude(dec, lat) {
  return Math.abs(lat + dec) - 90;
}

/**
 * How well a constellation can be seen from latitude `lat`, judged on the stars of
 * its stick figure:
 *  'circumpolar' - every figure star stays above the horizon all night, all year
 *  'visible'     - at least half of the figure climbs 5 degrees or higher
 *  'partly'      - some of the figure rises, but most of it never does
 *  'never'       - nothing of the figure rises
 * @param {number[]} decs declinations of the figure stars (degrees)
 */
export function visibilityClass(decs, lat) {
  if (decs.every((d) => minAltitude(d, lat) > 0)) return 'circumpolar';
  const up = decs.filter((d) => maxAltitude(d, lat) >= 5).length;
  if (up >= decs.length / 2) return 'visible';
  if (decs.some((d) => maxAltitude(d, lat) >= 1)) return 'partly';
  return 'never';
}

/** Altitude in degrees of a direction with declination `dec` at hour angle `haDeg`. */
export function altitudeAt(dec, haDeg, lat) {
  const r = Math.PI / 180;
  const s = Math.sin(lat * r) * Math.sin(dec * r) + Math.cos(lat * r) * Math.cos(dec * r) * Math.cos(haDeg * r);
  return Math.asin(clamp(s, -1, 1)) / r;
}
