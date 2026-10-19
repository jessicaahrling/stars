// Small 3D vector / 3x3 matrix helpers. Matrices are row-major arrays of 9 numbers
// and act on column vectors: v' = M v.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Wraps an angle in degrees to [0, 360). */
export function wrap360(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Wraps an angle in degrees to [-180, 180). */
export function wrap180(deg) {
  return wrap360(deg + 180) - 180;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Unit vector for right ascension / declination (or any lon/lat pair) in degrees. */
export function vecFromRaDec(raDeg, decDeg) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

/** Inverse of vecFromRaDec: returns [ra in [0,360), dec] in degrees. */
export function raDecFromVec(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [wrap360(Math.atan2(v[1], v[0]) * RAD), Math.asin(clamp(v[2] / len, -1, 1)) * RAD];
}

export function mat3Mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

export function mat3Transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mat3Apply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Matrix rotating a vector by `a` radians about the z axis (counter-clockwise seen from +z). */
export function rotZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** Matrix rotating a vector by `a` radians about the y axis. */
export function rotY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** Angular distance in degrees between two unit vectors. */
export function angleBetween(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(clamp(d, -1, 1)) * RAD;
}
