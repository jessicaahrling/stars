// Which constellations border each other. Two constellations are neighbours when they
// share a stretch of boundary; touching at a corner is not enough. The boundaries are
// lines of constant RA or Dec in B1875, so a shared stretch is a pair of collinear,
// overlapping edges.
import { wrap180, wrap360 } from '../astro/math.js';

/** Degrees; the boundary data carries rounding noise of about 0.0001 degrees. */
const SAME_LINE = 0.01;
/** Shortest shared stretch, in degrees on the sky, that makes two constellations neighbours. */
const MIN_SHARED = 0.05;

/** Length of the overlap of the RA arcs [a, a + w] and [b, b + v] (degrees, w, v >= 0). */
function arcOverlap(a, w, b, v) {
  const d = wrap360(b - a);
  const e = wrap360(a - b);
  return Math.max(0, Math.min(w, d + v) - d, Math.min(v, e + w) - e);
}

/**
 * @param {{index: number, ringsB1875: {x1: Float64Array, dx: Float64Array, y1: Float64Array, y2: Float64Array}[]}[]} constellations
 * @returns {number[][]} for each constellation index, its neighbours' indices in ascending order
 */
export function findNeighbours(constellations) {
  const meridians = [];
  const parallels = [];
  for (const c of constellations) {
    for (const r of c.ringsB1875) {
      for (let i = 0; i < r.x1.length; i++) {
        const { x1, dx, y1, y2 } = { x1: r.x1[i], dx: r.dx[i], y1: r.y1[i], y2: r.y2[i] };
        if (Math.abs(dx) < SAME_LINE) {
          meridians.push({ c: c.index, ra: wrap360(x1 + dx / 2), lo: Math.min(y1, y2), hi: Math.max(y1, y2) });
        } else if (Math.abs(y2 - y1) < SAME_LINE) {
          parallels.push({ c: c.index, dec: (y1 + y2) / 2, ra: dx > 0 ? x1 : wrap360(x1 + dx), w: Math.abs(dx) });
        }
      }
    }
  }
  const sets = constellations.map(() => new Set());
  const link = (a, b) => {
    sets[a].add(b);
    sets[b].add(a);
  };
  for (let i = 0; i < meridians.length; i++) {
    const p = meridians[i];
    for (let j = i + 1; j < meridians.length; j++) {
      const q = meridians[j];
      if (p.c === q.c || sets[p.c].has(q.c) || Math.abs(wrap180(p.ra - q.ra)) >= SAME_LINE) continue;
      if (Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) > MIN_SHARED) link(p.c, q.c);
    }
  }
  for (let i = 0; i < parallels.length; i++) {
    const p = parallels[i];
    for (let j = i + 1; j < parallels.length; j++) {
      const q = parallels[j];
      if (p.c === q.c || sets[p.c].has(q.c) || Math.abs(p.dec - q.dec) >= SAME_LINE) continue;
      const shared = arcOverlap(p.ra, p.w, q.ra, q.w) * Math.cos((p.dec * Math.PI) / 180);
      if (shared > MIN_SHARED) link(p.c, q.c);
    }
  }
  return sets.map((s) => [...s].sort((a, b) => a - b));
}
