// Precession of the equator (IAU 1976, Lieske et al.), as in Meeus ch. 21.
// Star data is given for J2000; constellation boundaries are defined for B1875.
import { DEG, mat3Mul, mat3Transpose, rotY, rotZ } from './math.js';
import { centuriesSinceJ2000, JD_B1875 } from './time.js';

const ARCSEC = DEG / 3600;

/**
 * Matrix that takes a J2000 equatorial unit vector to the mean equator and equinox
 * of the epoch `jd`. Its transpose goes the other way.
 */
export function precessionMatrix(jd) {
  const t = centuriesSinceJ2000(jd);
  const t2 = t * t;
  const t3 = t2 * t;
  const zeta = (2306.2181 * t + 0.30188 * t2 + 0.017998 * t3) * ARCSEC;
  const z = (2306.2181 * t + 1.09468 * t2 + 0.018203 * t3) * ARCSEC;
  const theta = (2004.3109 * t - 0.42665 * t2 - 0.041833 * t3) * ARCSEC;
  // Meeus 21.4 written as rotations: add zeta to RA, tilt by theta, add z to RA.
  return mat3Mul(rotZ(z), mat3Mul(rotY(-theta), rotZ(zeta)));
}

/** J2000 -> B1875 and back. */
export const J2000_TO_B1875 = precessionMatrix(JD_B1875);
export const B1875_TO_J2000 = mat3Transpose(J2000_TO_B1875);
