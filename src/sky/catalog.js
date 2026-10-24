// Turns the generated data module into render-ready structures: unit vectors,
// line segments, densified boundary outlines and point-in-constellation lookup.
import { CONSTELLATIONS, MILKY_WAY_PNG, STAR_BAYER, STAR_NAMES, STARS } from '../data/sky-data.js';
import { ART, ART_QUANT } from '../data/art-data.js';
import { angleBetween, mat3Apply, raDecFromVec, vecFromRaDec } from '../astro/math.js';
import { B1875_TO_J2000, J2000_TO_B1875 } from '../astro/precession.js';
import { artFrame, fromArt } from './art-frame.js';
import { pointInRing, prepareRing } from './rings.js';

/** Longest boundary step after densifying, in degrees. */
const OUTLINE_STEP = 0.5;

/** Points along a B1875 boundary ring, returned as J2000 unit vectors. */
function densifyRing(flat) {
  const out = [];
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = flat[2 * i];
    const y1 = flat[2 * i + 1];
    const x2 = flat[(2 * i + 2) % flat.length];
    const y2 = flat[(2 * i + 3) % flat.length];
    let dx = x2 - x1;
    dx -= 360 * Math.round(dx / 360);
    const dy = y2 - y1;
    const len = Math.max(Math.abs(dx) * Math.cos((Math.max(Math.abs(y1), Math.abs(y2)) * Math.PI) / 180), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(len / OUTLINE_STEP));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push(mat3Apply(B1875_TO_J2000, vecFromRaDec(x1 + dx * t, y1 + dy * t)));
    }
  }
  return out;
}

/**
 * Decodes a constellation's illustration into polylines of J2000 unit vectors.
 * @returns {{lines: {fine: boolean, vecs: Float32Array}[], radius: number}}
 */
function decodeArt(encoded, centerVec) {
  const frame = artFrame(centerVec);
  let maxR2 = 0;
  const lines = encoded.map((e) => {
    const n = (e.length - 1) / 2;
    const vecs = new Float32Array(n * 3);
    let x = 0;
    let y = 0;
    for (let k = 0; k < n; k++) {
      x += e[1 + 2 * k];
      y += e[2 + 2 * k];
      maxR2 = Math.max(maxR2, x * x + y * y);
      vecs.set(fromArt(frame, x / ART_QUANT, y / ART_QUANT), 3 * k);
    }
    return { fine: e[0] === 1, vecs };
  });
  // Angular radius in degrees (stereographic: r = 2 tan(theta / 2), 10 units per degree).
  const r = Math.sqrt(maxR2) / ART_QUANT / ((10 * 180) / Math.PI);
  return { lines, radius: ((2 * Math.atan(r / 2)) * 180) / Math.PI };
}

function buildStars() {
  const n = STARS.ra.length;
  const s = {
    count: n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    mag: Float32Array.from(STARS.mag),
    bv: Float32Array.from(STARS.bv),
    con: Uint8Array.from(STARS.con),
    hip: Int32Array.from(STARS.hip),
    ra: Float32Array.from(STARS.ra),
    dec: Float32Array.from(STARS.dec),
  };
  for (let i = 0; i < n; i++) {
    const v = vecFromRaDec(STARS.ra[i], STARS.dec[i]);
    s.x[i] = v[0];
    s.y[i] = v[1];
    s.z[i] = v[2];
  }
  return s;
}

/**
 * @typedef {object} Constellation
 * @property {number} index
 * @property {string} id      IAU abbreviation, e.g. 'UMa'
 * @property {string} sv      Swedish name
 * @property {boolean} plural whether the Swedish name is a plural
 * @property {string} la      Latin name
 * @property {string} gen     Latin genitive
 * @property {number[]} centerVec   J2000 unit vector of the framing centre
 * @property {number} radius  degrees from the centre to the farthest figure star
 * @property {number[][]} labelVecs
 * @property {Uint16Array} segments  pairs of star indices
 * @property {number[]} figureStars  unique star indices of the stick figure
 * @property {number} brightest      star index of the brightest star inside the boundary
 * @property {number[][][]} outlines J2000 unit vectors along each boundary ring
 * @property {{fine: boolean, vecs: Float32Array}[]} art illustration polylines (J2000 vectors), may be empty
 * @property {number} artRadius degrees from the centre to the farthest point of the illustration
 * @property {object[]} ringsJ2000   prepared rings in J2000 (for rasterizing)
 */

export function buildCatalog() {
  const stars = buildStars();
  const starVec = (i) => [stars.x[i], stars.y[i], stars.z[i]];
  const brightest = new Array(CONSTELLATIONS.length).fill(-1);
  for (let i = stars.count - 1; i >= 0; i--) brightest[stars.con[i]] = i; // stars are sorted bright first

  /** @type {Constellation[]} */
  const constellations = CONSTELLATIONS.map((c, index) => {
    const segs = [];
    const fig = new Set();
    for (const line of c.lines) {
      for (let k = 0; k < line.length; k++) {
        fig.add(line[k]);
        if (k) segs.push(line[k - 1], line[k]);
      }
    }
    const figureStars = [...fig];
    const centerVec = vecFromRaDec(c.center[0], c.center[1]);
    let radius = 5;
    for (const i of figureStars) radius = Math.max(radius, angleBetween(centerVec, starVec(i)));
    const outlines = c.bounds.map(densifyRing);
    const art = ART[c.id] ? decodeArt(ART[c.id], centerVec) : null;
    return {
      index,
      id: c.id,
      sv: c.sv,
      // Jakthundarna, Tvillingarna and Fiskarna take plural words ("upptäckta", "dem").
      plural: /(arna|erna)$/.test(c.sv),
      la: c.la,
      gen: c.gen,
      rank: c.rank,
      centerVec,
      radius,
      labelVecs: c.labels.map(([ra, dec]) => vecFromRaDec(ra, dec)),
      segments: Uint16Array.from(segs),
      figureStars,
      figureDecs: figureStars.map((i) => stars.dec[i]),
      brightest: brightest[index],
      outlines,
      art: art ? art.lines : [],
      artRadius: art ? art.radius : 0,
      ringsB1875: c.bounds.map((flat) => {
        const pts = [];
        for (let k = 0; k < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]);
        return prepareRing(pts);
      }),
      ringsJ2000: outlines.map((vecs) => prepareRing(vecs.map(raDecFromVec))),
    };
  });

  /** 1 for stars that are part of some constellation's stick figure. */
  stars.inFigure = new Uint8Array(stars.count);
  for (const c of constellations) for (const i of c.figureStars) stars.inFigure[i] = 1;

  /** Index of the constellation containing a J2000 unit vector. */
  function constellationAt(vecJ2000) {
    const [ra, dec] = raDecFromVec(mat3Apply(J2000_TO_B1875, vecJ2000));
    for (const c of constellations) {
      for (const ring of c.ringsB1875) if (pointInRing(ring, ra, dec)) return c.index;
    }
    return -1;
  }

  return {
    stars,
    starVec,
    starNames: STAR_NAMES,
    bayer: STAR_BAYER,
    constellations,
    byId: new Map(constellations.map((c) => [c.id, c])),
    constellationAt,
    milkyWayPng: MILKY_WAY_PNG,
  };
}
