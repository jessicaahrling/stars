// Polygon tests on the celestial sphere, done in (RA, Dec) degrees.
//
// Constellation boundaries are lines of constant RA or Dec in B1875 coordinates, so
// they are exact straight edges in that plane. Inside/outside is decided by walking
// along a meridian from the north celestial pole and counting boundary crossings.
// This needs no special handling for RA 0/360, and rings that wind around a pole
// (Ursa Minor, Octans, the Milky Way edges) just start out "inside" at the pole.
import { wrap180, wrap360 } from '../astro/math.js';

/**
 * Prepares a ring of [ra, dec] points (degrees, closing point optional).
 * A ring that winds once around the celestial poles splits the sphere into a
 * northern and a southern part; `pole` says which one is the inside: 'auto' (the
 * part the pole on the ring's own hemisphere is in), 'north' or 'south'.
 * @returns {{x1: Float64Array, dx: Float64Array, y1: Float64Array, y2: Float64Array,
 *   ymin: number, ymax: number, polar: boolean, northInside: boolean,
 *   raStart: number, raWidth: number}} raStart/raWidth: the RA range the ring covers
 */
export function prepareRing(points, pole = 'auto') {
  let n = points.length;
  if (n > 1 && points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1]) n--;
  const x1 = new Float64Array(n);
  const dx = new Float64Array(n);
  const y1 = new Float64Array(n);
  const y2 = new Float64Array(n);
  let total = 0;
  let xmin = 0;
  let xmax = 0;
  let ymin = Infinity;
  let ymax = -Infinity;
  let ysum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    x1[i] = wrap360(a[0]);
    dx[i] = wrap180(b[0] - a[0]);
    y1[i] = a[1];
    y2[i] = b[1];
    total += dx[i];
    if (total < xmin) xmin = total;
    if (total > xmax) xmax = total;
    ysum += a[1];
    if (a[1] < ymin) ymin = a[1];
    if (a[1] > ymax) ymax = a[1];
  }
  const polar = Math.abs(total) > 180;
  const northInside = polar && (pole === 'north' || (pole === 'auto' && ysum > 0));
  const raStart = polar ? 0 : wrap360(points[0][0] + xmin);
  const raWidth = polar ? 360 : xmax - xmin;
  return { x1, dx, y1, y2, ymin, ymax, polar, northInside, raStart, raWidth };
}

/**
 * Collects the declinations where the meridian at `ra` crosses the ring. Each edge
 * covers the half-open RA interval [west end, east end), so a meridian through a
 * vertex is counted once where the ring passes through and 0 or 2 times where it
 * turns back.
 */
function meridianCrossings(ring, ra, out) {
  const { x1, dx, y1, y2 } = ring;
  for (let i = 0; i < x1.length; i++) {
    const d = dx[i];
    if (d === 0) continue;
    let f;
    if (d > 0) {
      const u = wrap360(ra - x1[i]);
      if (u >= d) continue;
      f = u / d;
    } else {
      const u = wrap360(ra - (x1[i] + d));
      if (u >= -d) continue;
      f = 1 - u / -d;
    }
    out.push(y1[i] + (y2[i] - y1[i]) * f);
  }
  return out;
}

/** Inside test of a point (degrees) against one prepared ring. */
export function pointInRing(ring, ra, dec) {
  if (dec > ring.ymax) return ring.northInside;
  if (dec < ring.ymin) return ring.polar && !ring.northInside;
  const hits = meridianCrossings(ring, ra, []);
  let north = 0;
  for (const y of hits) if (y > dec) north++;
  return (north % 2 === 1) !== ring.northInside;
}

/**
 * Rasterizes rings into an equirectangular grid (column c covers RA around
 * (c + 0.5) * 360 / width, row r covers Dec around 90 - (r + 0.5) * 180 / height).
 * Calls `paint(col, rowStart, rowEnd)` (inclusive) for every run of rows inside a
 * ring. Rings are painted independently; XOR the runs for even-odd semantics.
 */
export function rasterizeRings(rings, width, height, paint) {
  const rowOf = (dec) => ((90 - dec) * height) / 180 - 0.5;
  const hits = [];
  for (const ring of rings) {
    // Only the columns whose centre lies in the ring's RA range can be inside it.
    const c0 = ring.polar ? 0 : Math.ceil((ring.raStart * width) / 360 - 0.5);
    const c1 = ring.polar ? width - 1 : Math.floor(((ring.raStart + ring.raWidth) * width) / 360 - 0.5);
    for (let c = c0; c <= c1; c++) {
      const col = ((c % width) + width) % width;
      const ra = ((col + 0.5) * 360) / width;
      hits.length = 0;
      meridianCrossings(ring, ra, hits);
      if (!hits.length && !ring.polar) continue;
      hits.sort((a, b) => b - a);
      let inside = ring.northInside;
      let top = 90;
      for (let k = 0; k <= hits.length; k++) {
        const bottom = k < hits.length ? hits[k] : -90;
        if (inside) {
          const r0 = Math.max(0, Math.ceil(rowOf(top)));
          const r1 = Math.min(height - 1, Math.floor(rowOf(bottom)));
          if (r1 >= r0) paint(col, r0, r1);
        }
        inside = !inside;
        top = bottom;
      }
    }
  }
}
