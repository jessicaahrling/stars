// "Rikta mot himlen": where a phone held up to the sky looks. The phone's orientation
// (DeviceOrientationEvent: alpha, beta and gamma in degrees, turning the device's frame
// into the earth's east-north-up) gives the direction out of the back of the phone, the
// way its camera looks: an altitude, and an azimuth from north through east. The sky
// keeps its horizon level, so how the phone is turned about that direction is left out.
// Close to straight up or down, the azimuth leans on where the top of the screen points,
// so that it stays steady there.

const RAD = Math.PI / 180;
/** How much the top of the screen counts for the azimuth near straight up or down. */
const UP_WEIGHT = 0.1;

/** Rz(alpha) · Rx(beta) · Ry(gamma), row-major: device coordinates to east-north-up. */
export function deviceToEarth(alpha, beta, gamma) {
  const [ca, sa] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)];
  const [cb, sb] = [Math.cos(beta * RAD), Math.sin(beta * RAD)];
  const [cg, sg] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)];
  return [
    ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
    sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg,
    -cb * sg, sb, cb * cg,
  ];
}

const apply = (m, v) => [0, 3, 6].map((r) => m[r] * v[0] + m[r + 1] * v[1] + m[r + 2] * v[2]);

/**
 * Where the back of the phone looks.
 * @param {number} alpha  about the vertical: 0 with the top of the phone to the north (on
 *   an absolute reading), counting up anticlockwise seen from above
 * @param {number} beta  front to back: 90 held upright
 * @param {number} gamma  side to side
 * @param {number} [screenAngle]  how far the screen's content is turned (screen.orientation.angle)
 * @returns {{az: number, alt: number}} degrees: azimuth 0 to 360 from north through east, altitude
 */
export function pointingOf(alpha, beta, gamma, screenAngle = 0) {
  const m = deviceToEarth(alpha, beta, gamma);
  const look = apply(m, [0, 0, -1]);
  const theta = screenAngle * RAD;
  const up = apply(m, [Math.sin(theta), Math.cos(theta), 0]);
  const alt = Math.asin(Math.max(-1, Math.min(1, look[2])));
  // Forward along the ground: where the camera looks; only within a few degrees of
  // straight up or down, where that runs out, the way the top of the screen leans away from.
  const e = look[0] - UP_WEIGHT * Math.sin(alt) * up[0];
  const n = look[1] - UP_WEIGHT * Math.sin(alt) * up[1];
  const az = ((Math.atan2(e, n) / RAD) % 360 + 360) % 360;
  return { az, alt: alt / RAD };
}

/**
 * Where the top of the phone (as held upright in portrait) points along the ground: what
 * an iPhone's compass heading measures. Null while the top points within about 15° of
 * straight up or down, where that azimuth is unsteady.
 * @returns {{az: number} | null}
 */
export function topAzimuthOf(alpha, beta, gamma) {
  const top = apply(deviceToEarth(alpha, beta, gamma), [0, 1, 0]);
  if (Math.hypot(top[0], top[1]) < 0.25) return null;
  return { az: ((Math.atan2(top[0], top[1]) / RAD) % 360 + 360) % 360 };
}
