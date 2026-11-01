// The outline around a group of constellations: the stretches of its members' boundaries
// that face a constellation outside the group. The boundaries are lines of constant RA or
// Dec in B1875, so a stretch two members share is a pair of collinear, overlapping edges;
// taking those away from every member's edges leaves the outline, which is then joined up
// into as few lines as it takes.
import { mat3Apply, vecFromRaDec, wrap180, wrap360 } from '../astro/math.js';
import { B1875_TO_J2000 } from '../astro/precession.js';

/** Degrees; the boundary data carries rounding noise of about 0.0001 degrees. */
const SAME_LINE = 0.01;
/** Degrees; a piece left shorter than this, in RA or Dec, is rounding noise. */
const MIN_PIECE = 0.01;
/** Longest step along the outline, in degrees on the sky. */
const STEP = 0.5;
/** Squared chord between end points that are one and the same (about 0.005 degrees). */
const SAME_POINT = (0.005 * Math.PI / 180) ** 2;

/**
 * Each edge as a meridian ({meridian: true, ra, lo, hi}: Dec from lo to hi) or a parallel
 * ({meridian: false, dec, west, width}: RA eastward from west).
 */
function edgesOf(c) {
  const out = [];
  for (const r of c.ringsB1875) {
    for (let i = 0; i < r.x1.length; i++) {
      const { x1, dx, y1, y2 } = { x1: r.x1[i], dx: r.dx[i], y1: r.y1[i], y2: r.y2[i] };
      if (Math.abs(dx) < SAME_LINE) out.push({ meridian: true, ra: wrap360(x1 + dx / 2), lo: Math.min(y1, y2), hi: Math.max(y1, y2) });
      else out.push({ meridian: false, dec: (y1 + y2) / 2, west: dx > 0 ? x1 : wrap360(x1 + dx), width: Math.abs(dx) });
    }
  }
  return out;
}

/** What is left of [0, length] once the intervals are taken away, longer than MIN_PIECE. */
function remaining(length, taken) {
  taken.sort((a, b) => a[0] - b[0]);
  const left = [];
  let at = 0;
  for (const [a, b] of taken) {
    if (a > at + MIN_PIECE) left.push([at, Math.min(a, length)]);
    at = Math.max(at, b);
    if (at >= length) break;
  }
  if (length > at + MIN_PIECE) left.push([at, length]);
  return left.filter(([a, b]) => b - a > MIN_PIECE);
}

/** Points ([ra, dec], B1875) from one end of a meridian or parallel piece to the other. */
function along(ra0, dec0, ra1, dec1) {
  const len = Math.max(Math.abs(ra1 - ra0) * Math.cos((Math.max(Math.abs(dec0), Math.abs(dec1)) * Math.PI) / 180), Math.abs(dec1 - dec0));
  const steps = Math.max(1, Math.ceil(len / STEP));
  const pts = [];
  for (let k = 0; k <= steps; k++) pts.push([ra0 + ((ra1 - ra0) * k) / steps, dec0 + ((dec1 - dec0) * k) / steps]);
  return pts;
}

const near = (u, v) => (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2 + (u[2] - v[2]) ** 2 < SAME_POINT;

/**
 * @param {{index: number, ringsB1875: {x1: Float64Array, dx: Float64Array, y1: Float64Array, y2: Float64Array}[]}[]} constellations
 * @param {number[]} members  indices of the group's constellations
 * @returns {number[][][]} lines of J2000 unit vectors around the group; a closed one ends where it starts
 */
export function groupOutline(constellations, members) {
  const edges = members.map((i) => ({ i, list: edgesOf(constellations[i]) }));
  const pieces = [];
  for (const { i, list } of edges) {
    const others = edges.filter((e) => e.i !== i).flatMap((e) => e.list);
    for (const e of list) {
      if (e.meridian) {
        const taken = others
          .filter((o) => o.meridian && Math.abs(wrap180(o.ra - e.ra)) < SAME_LINE)
          .map((o) => [o.lo - e.lo, o.hi - e.lo]);
        for (const [a, b] of remaining(e.hi - e.lo, taken)) pieces.push(along(e.ra, e.lo + a, e.ra, e.lo + b));
      } else {
        // RA wraps around, so an overlapping arc can start up to a full turn either side.
        const taken = [];
        for (const o of others) {
          if (o.meridian || Math.abs(o.dec - e.dec) >= SAME_LINE) continue;
          const d = wrap360(o.west - e.west);
          taken.push([d, d + o.width], [d - 360, d - 360 + o.width]);
        }
        for (const [a, b] of remaining(e.width, taken)) pieces.push(along(e.west + a, e.dec, e.west + b, e.dec));
      }
    }
  }
  const lines = pieces.map((pts) => pts.map(([ra, dec]) => mat3Apply(B1875_TO_J2000, vecFromRaDec(ra, dec))));
  return joinUp(lines);
}

/** Joins lines that meet end to end, turning them round where needed. */
function joinUp(lines) {
  const left = new Set(lines);
  const out = [];
  const take = (end, flip) => {
    for (const l of left) {
      if (near(l[0], end)) return (left.delete(l), flip ? l.slice().reverse() : l);
      if (near(l[l.length - 1], end)) return (left.delete(l), flip ? l : l.slice().reverse());
    }
    return null;
  };
  while (left.size) {
    const first = left.values().next().value;
    left.delete(first);
    let line = first.slice();
    for (let next; (next = take(line[line.length - 1], false)); ) line = line.concat(next.slice(1));
    for (let prev; (prev = take(line[0], true)); ) line = prev.slice(0, -1).concat(line);
    out.push(line);
  }
  return out;
}
