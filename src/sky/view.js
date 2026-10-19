// The observer's view: where they stand, when, and where they look. Projection is
// stereographic around the viewing direction, with the horizon kept level.
import { clamp, DEG, mat3Apply, mat3Mul, mat3Transpose } from '../astro/math.js';
import { azAltFromVec, equatorialToHorizontal } from '../astro/frames.js';
import { precessionMatrix } from '../astro/precession.js';
import { julianDate, lstDeg } from '../astro/time.js';

export const MIN_FOV = 12;
export const MAX_FOV = 160;

/** Camera matrix (horizontal -> camera: rows right, up, forward). */
export function cameraMatrix(azDeg, altDeg) {
  const az = azDeg * DEG;
  const alt = altDeg * DEG;
  const sa = Math.sin(az);
  const ca = Math.cos(az);
  const sh = Math.sin(alt);
  const ch = Math.cos(alt);
  return [
    ca, -sa, 0,
    -sa * sh, -ca * sh, ch,
    sa * ch, ca * ch, sh,
  ];
}

export class SkyView {
  constructor() {
    this.az = 180;
    this.alt = 25;
    this.fov = 100;
    this.lat = 59.33;
    this.lon = 18.07;
    this.timeMs = Date.now();
    this.width = 1;
    this.height = 1;
    this.update();
  }

  setSize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  /** Projection scale in CSS px per stereographic unit; `fov` spans the longer side. */
  get scale() {
    return Math.max(this.width, this.height) / (4 * Math.tan((this.fov * DEG) / 4));
  }

  /** Recomputes the frame matrices; call after changing time, place or direction. */
  update() {
    this.alt = clamp(this.alt, -90, 90);
    this.az = ((this.az % 360) + 360) % 360;
    this.fov = clamp(this.fov, MIN_FOV, MAX_FOV);
    const jd = julianDate(this.timeMs);
    this.jd = jd;
    this.lst = lstDeg(jd, this.lon);
    /** J2000 -> horizontal (precession folded in). */
    this.eqToHor = mat3Mul(equatorialToHorizontal(this.lst, this.lat), precessionMatrix(jd));
    this.horToEq = mat3Transpose(this.eqToHor);
    this.horToCam = cameraMatrix(this.az, this.alt);
    this.camToHor = mat3Transpose(this.horToCam);
    /** J2000 -> camera. */
    this.eqToCam = mat3Mul(this.horToCam, this.eqToHor);
    const s = this.scale;
    const rCorner = Math.hypot(this.width, this.height) / 2 / s;
    /** Cosine of the angle from the view centre to the screen corner. */
    this.cosCorner = Math.cos(2 * Math.atan(rCorner / 2));
    this.s = s;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
  }

  /**
   * Projects a camera-space unit vector to CSS pixels. Returns false for directions
   * far behind the viewer (they would land far outside the screen anyway).
   */
  projectCam(x, y, z, out) {
    if (z < -0.6) return false;
    const k = (2 / (1 + z)) * this.s;
    out.x = this.cx + x * k;
    out.y = this.cy - y * k;
    out.z = z;
    return true;
  }

  /** Projects a J2000 unit vector to CSS pixels. */
  projectEq(v, out) {
    const m = this.eqToCam;
    return this.projectCam(
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
      out,
    );
  }

  /** Horizontal-frame unit vector under a CSS pixel. */
  unproject(px, py) {
    const qx = (px - this.cx) / this.s;
    const qy = (this.cy - py) / this.s;
    const r2 = qx * qx + qy * qy;
    const d = 4 + r2;
    return mat3Apply(this.camToHor, [(4 * qx) / d, (4 * qy) / d, (4 - r2) / d]);
  }

  /** J2000 unit vector -> [azimuth, altitude] in degrees for the current time and place. */
  azAltOf(vecJ2000) {
    return azAltFromVec(mat3Apply(this.eqToHor, vecJ2000));
  }

  /** Altitude in degrees of a J2000 unit vector. */
  altOf(v) {
    const m = this.eqToHor;
    return Math.asin(clamp(m[6] * v[0] + m[7] * v[1] + m[8] * v[2], -1, 1)) / DEG;
  }
}
