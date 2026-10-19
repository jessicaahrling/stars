// Horizontal coordinates. The horizontal frame is East-North-Up (x = east,
// y = north, z = zenith). Azimuth is measured from north through east.
import { DEG, RAD, clamp, wrap360 } from './math.js';

/**
 * Matrix taking an equatorial vector (equator of date) to the horizontal frame,
 * for local sidereal time `lstDeg` and geographic latitude `latDeg`.
 */
export function equatorialToHorizontal(lstDeg, latDeg) {
  const L = lstDeg * DEG;
  const p = latDeg * DEG;
  const cL = Math.cos(L);
  const sL = Math.sin(L);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return [
    -sL, cL, 0,
    -sp * cL, -sp * sL, cp,
    cp * cL, cp * sL, sp,
  ];
}

/** Unit vector in the horizontal frame for azimuth/altitude in degrees. */
export function vecFromAzAlt(azDeg, altDeg) {
  const az = azDeg * DEG;
  const alt = altDeg * DEG;
  const c = Math.cos(alt);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(alt)];
}

/** [azimuth in [0,360), altitude] in degrees for a horizontal-frame vector. */
export function azAltFromVec(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [wrap360(Math.atan2(v[0], v[1]) * RAD), Math.asin(clamp(v[2] / len, -1, 1)) * RAD];
}

const DIRECTIONS = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];

/** Swedish compass direction (8 points) for an azimuth in degrees. */
export function compassName(azDeg) {
  return DIRECTIONS[Math.round(wrap360(azDeg) / 45) % 8];
}
