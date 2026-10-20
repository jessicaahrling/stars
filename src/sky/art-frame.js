// Local drawing frame for constellation illustrations.
//
// Each illustration is drawn in a flat frame centred on its constellation, as seen
// on the sky with north up and east to the left (SVG convention: x grows to the right
// = west, y grows downwards = south). The flat frame is a stereographic projection
// around the constellation centre, the same projection the sky view uses, so shapes
// keep their look. ART_UNITS_PER_DEG units equal one degree near the centre.

export const ART_UNITS_PER_DEG = 10;
const S = (ART_UNITS_PER_DEG * 180) / Math.PI;

/** Orthonormal basis at a J2000 unit vector: east, north and the centre itself. */
export function artFrame(center) {
  const [cx, cy, cz] = center;
  // East points towards increasing RA: z x c.
  let ex = -cy;
  let ey = cx;
  const el = Math.hypot(ex, ey) || 1;
  ex /= el;
  ey /= el;
  // North completes the right-handed set: c x e.
  const n = [-cz * ey, cz * ex, cx * ey - cy * ex];
  return { e: [ex, ey, 0], n, c: [cx, cy, cz] };
}

/** J2000 unit vector -> [x, y] in frame units (x west, y south). */
export function toArt(frame, v) {
  const { e, n, c } = frame;
  const ve = v[0] * e[0] + v[1] * e[1] + v[2] * e[2];
  const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  const vc = v[0] * c[0] + v[1] * c[1] + v[2] * c[2];
  const k = 2 / (1 + vc);
  return [-ve * k * S, -vn * k * S];
}

/** [x, y] in frame units -> J2000 unit vector. */
export function fromArt(frame, x, y) {
  const { e, n, c } = frame;
  const xe = -x / S;
  const yn = -y / S;
  const r2 = xe * xe + yn * yn;
  const d = 4 + r2;
  const ke = (4 * xe) / d;
  const kn = (4 * yn) / d;
  const kc = (4 - r2) / d;
  return [
    ke * e[0] + kn * n[0] + kc * c[0],
    ke * e[1] + kn * n[1] + kc * c[1],
    ke * e[2] + kn * n[2] + kc * c[2],
  ];
}
