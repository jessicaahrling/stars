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
  // Collinear edges differ by less than SAME_LINE, so they land in the same or adjacent
  // buckets of that width; RA wraps around, so its buckets do too.
  const RA_BUCKETS = Math.round(360 / SAME_LINE);
  const pairs = (edges, key, wrap, touch) => {
    const buckets = new Map();
    for (const e of edges) {
      const k = key(e);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
    for (const [k, list] of buckets) {
      const next = buckets.get(wrap(k + 1)) || [];
      for (let i = 0; i < list.length; i++) {
        for (const q of [...list.slice(i + 1), ...next]) {
          const p = list[i];
          if (p.c !== q.c && !sets[p.c].has(q.c) && touch(p, q)) link(p.c, q.c);
        }
      }
    }
  };
  pairs(meridians, (e) => Math.round(e.ra / SAME_LINE) % RA_BUCKETS, (k) => k % RA_BUCKETS,
    (p, q) => Math.abs(wrap180(p.ra - q.ra)) < SAME_LINE && Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) > MIN_SHARED);
  pairs(parallels, (e) => Math.round(e.dec / SAME_LINE), (k) => k,
    (p, q) => Math.abs(p.dec - q.dec) < SAME_LINE
      && arcOverlap(p.ra, p.w, q.ra, q.w) * Math.cos((p.dec * Math.PI) / 180) > MIN_SHARED);
  return sets.map((s) => [...s].sort((a, b) => a - b));
}
