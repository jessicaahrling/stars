// "Rikta mot himlen": where a phone held up to the sky looks. The phone's orientation
// (DeviceOrientationEvent: alpha, beta and gamma in degrees, turning the device's frame
// into the earth's east-north-up) gives the direction out of the back of the phone, the
// way its camera looks: an altitude, and an azimuth from north through east. The sky
// keeps its horizon level, so how the phone is turned about that direction is left out.
// The azimuth leans on where the top of the screen points, so that it stays steady when
// the phone looks straight up or down.

const RAD = Math.PI / 180;

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
  // Forward along the ground: where the camera looks, or, the higher it looks, the way the
  // top of the screen leans away from.
  const e = look[0] * Math.cos(alt) - up[0] * Math.sin(alt);
  const n = look[1] * Math.cos(alt) - up[1] * Math.sin(alt);
  const az = ((Math.atan2(e, n) / RAD) % 360 + 360) % 360;
  return { az, alt: alt / RAD };
}
