// Generates src/data/sky-data.js from the d3-celestial data set (BSD-3-Clause,
// Olaf Frohn), pinned to one commit. Downloads are cached in .cache/.
//
//   node scripts/build-data.mjs
//
// Output (all J2000 unless noted):
//   stars          sorted bright -> faint, with the constellation each one lies in
//   constellations Swedish + Latin names, label points, stick figures (star indices)
//                  and IAU boundaries as B1875 rings (exact constant RA/Dec edges)
//   milky way      equirectangular grey-scale PNG rasterized from the 5 outline levels
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';
import { mat3Apply, raDecFromVec, vecFromRaDec, wrap180, wrap360 } from '../src/astro/math.js';
import { J2000_TO_B1875 } from '../src/astro/precession.js';
import { pointInRing, prepareRing, rasterizeRings } from '../src/sky/rings.js';
import { CONSTELLATION_NAMES_SV, STAR_NAMES_SV } from '../src/data/names-sv.js';

const COMMIT = '7e720a3de062059d4c5400a379146a601d9010e0';
const BASE = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${COMMIT}/data/`;
const FILES = ['stars.6.json', 'starnames.json', 'constellations.json', 'constellations.lines.json',
  'constellations.bounds.json', 'mw.json'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache', 'd3-celestial', COMMIT);
const outFile = path.join(root, 'src/data/sky-data.js');

// Mira (omicron Ceti) is part of the Cetus figure but too variable for the mag-6 file.
const EXTRA_STARS = [{ hip: 10826, ra: 34.8366, dec: -2.9776, mag: 6.0, bv: 1.42 }];

async function load(name) {
  const file = path.join(cacheDir, name);
  try {
    await access(file);
  } catch {
    await mkdir(cacheDir, { recursive: true });
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`download ${name}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  downloaded ${name}`);
  }
  return JSON.parse(await readFile(file, 'utf8'));
}

const round = (x, d) => Number(x.toFixed(d));
const toB1875 = (ra, dec) => raDecFromVec(mat3Apply(J2000_TO_B1875, vecFromRaDec(ra, dec)));

const [starsJson, namesJson, consJson, linesJson, boundsJson, mwJson] = await Promise.all(FILES.map(load));

// ---------------------------------------------------------------- boundaries (B1875)
const ALIGN_TOL = 0.005; // degrees

function misaligned(a, b) {
  return Math.min(Math.abs(wrap180(b[0] - a[0])), Math.abs(b[1] - a[1])) > ALIGN_TOL;
}

/**
 * Precesses a J2000 boundary ring to B1875. The source densified a few polar edges
 * along J2000 lines, which puts their midpoints off the true B1875 parallel; vertices
 * whose both edges are skew are such midpoints and are dropped.
 */
function boundaryRingB1875(ringJ2000, id) {
  let ring = ringJ2000.map(([ra, dec]) => toB1875(ra, dec));
  if (ring.length > 1 && !misaligned(ring[0], ring[ring.length - 1]) &&
      Math.hypot(wrap180(ring[0][0] - ring.at(-1)[0]), ring[0][1] - ring.at(-1)[1]) < 1e-6) ring.pop();
  const n = ring.length;
  ring = ring.filter((p, i) => !(misaligned(ring[(i + n - 1) % n], p) && misaligned(p, ring[(i + 1) % n])));
  for (let i = 0; i < ring.length; i++) {
    if (misaligned(ring[i], ring[(i + 1) % ring.length])) throw new Error(`${id}: skew boundary edge at ${ring[i]}`);
  }
  return ring.map(([ra, dec]) => [round(wrap360(ra), 4), round(dec, 4)]);
}

const ids = [];
const boundsById = new Map();
for (const f of boundsJson.features) {
  if (!boundsById.has(f.id)) {
    boundsById.set(f.id, []);
    ids.push(f.id);
  }
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    if (poly.length !== 1) throw new Error(`${f.id}: polygon with holes is not supported`);
    boundsById.get(f.id).push(boundaryRingB1875(poly[0], f.id));
  }
}
if (ids.length !== 88) throw new Error(`expected 88 constellations, got ${ids.length}`);
for (const id of ids) if (!CONSTELLATION_NAMES_SV[id]) throw new Error(`missing Swedish name for ${id}`);

const prepared = ids.map((id) => boundsById.get(id).map((r) => prepareRing(r)));
function constellationIndexAt(raJ2000, decJ2000) {
  const [ra, dec] = toB1875(raJ2000, decJ2000);
  const hits = [];
  prepared.forEach((rings, i) => {
    if (rings.some((r) => pointInRing(r, ra, dec))) hits.push(i);
  });
  return hits;
}

// ---------------------------------------------------------------- stars
const stars = starsJson.features.map((f) => ({
  hip: f.id,
  ra: wrap360(f.geometry.coordinates[0]),
  dec: f.geometry.coordinates[1],
  mag: f.properties.mag,
  bv: f.properties.bv === '' || f.properties.bv == null ? 0.6 : Number(f.properties.bv),
}));
for (const s of EXTRA_STARS) if (!stars.some((t) => t.hip === s.hip)) stars.push({ ...s });
stars.sort((a, b) => a.mag - b.mag || a.hip - b.hip);

// Flamsteed numbers predate the 1930 boundaries, so a few designations name a
// neighbouring constellation (10 UMa lies in Lynx); those are expected here.
let mismatches = 0;
let checked = 0;
for (const s of stars) {
  const hits = constellationIndexAt(s.ra, s.dec);
  if (hits.length !== 1) throw new Error(`HIP ${s.hip} is in ${hits.length} constellations`);
  s.con = hits[0];
  const ref = namesJson[s.hip]?.c;
  if (ref) {
    checked++;
    if (ids[s.con] !== ref) mismatches++;
  }
}
console.log(`  boundary check: ${checked - mismatches}/${checked} stars agree with the catalogue`);

// ---------------------------------------------------------------- names
const starIndexByHip = new Map(stars.map((s, i) => [s.hip, i]));
const starNames = {};
const bayer = {};
for (const [hip, n] of Object.entries(namesJson)) {
  const i = starIndexByHip.get(Number(hip));
  if (i === undefined) continue;
  const name = STAR_NAMES_SV[hip] || n.name;
  if (name && stars[i].mag <= 4.5) starNames[i] = name;
  if (n.bayer) bayer[i] = n.bayer;
}

// ---------------------------------------------------------------- figures & labels
const posKey = (ra, dec) => `${wrap360(ra).toFixed(3)},${dec.toFixed(3)}`;
const starByPos = new Map(stars.map((s, i) => [posKey(s.ra, s.dec), i]));
const separation = (a, b) => Math.hypot(wrap180(a.ra - b.ra) * Math.cos((b.dec * Math.PI) / 180), a.dec - b.dec);
/** Stars closer than this (degrees) are one point to the eye, like the two halves of a close double. */
const DOUBLE_RADIUS = 0.1;
const remapped = [];

/**
 * Some figure vertices sit on the fainter half of a close double (alpha1 CVn instead
 * of Cor Caroli, Toliman instead of Rigil Kentaurus); use the brightest star within
 * DOUBLE_RADIUS, the one people actually see.
 */
function brightestNear(i) {
  for (let k = 0; k < i; k++) { // stars are sorted bright first
    if (separation(stars[k], stars[i]) < DOUBLE_RADIUS) {
      remapped.push(`HIP ${stars[i].hip} -> ${stars[k].hip}`);
      return k;
    }
  }
  return i;
}

function starAt(ra, dec) {
  const exact = starByPos.get(posKey(ra, dec));
  if (exact !== undefined) return brightestNear(exact);
  let best = -1;
  let bestD = 0.02;
  stars.forEach((s, i) => {
    const d = separation(s, { ra, dec });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) throw new Error(`no star at line vertex ${ra},${dec}`);
  return brightestNear(best);
}

const figures = new Map(ids.map((id) => [id, []]));
for (const f of linesJson.features) {
  for (const line of f.geometry.coordinates) figures.get(f.id).push(line.map(([ra, dec]) => starAt(ra, dec)));
}
console.log(`  figure vertices moved to the brighter half of a double: ${[...new Set(remapped)].join(', ') || 'none'}`);
const meta = new Map();
for (const f of consJson.features) {
  const m = meta.get(f.id) || { labels: [] };
  m.la = f.properties.name.replace(/ (Caput|Cauda)$/, '');
  m.gen = f.properties.gen;
  m.rank = Number(f.properties.rank);
  m.center = m.center || [round(wrap360(f.properties.display[0]), 2), round(f.properties.display[1], 2)];
  m.labels.push([round(wrap360(f.geometry.coordinates[0]), 2), round(f.geometry.coordinates[1], 2)]);
  meta.set(f.id, m);
}

const constellations = ids.map((id) => {
  const m = meta.get(id);
  return {
    id,
    sv: CONSTELLATION_NAMES_SV[id],
    la: m.la,
    gen: m.gen,
    rank: m.rank,
    center: m.center,
    labels: m.labels,
    lines: figures.get(id),
    bounds: boundsById.get(id).map((r) => r.flat()),
  };
});

// ---------------------------------------------------------------- milky way texture
const MW_W = 1024;
const MW_H = 512;
const GALACTIC_CENTER = [266.4, -28.94];
const GALACTIC_POLE = [192.86, 27.13];

function rasterLevel(feature) {
  const rings = [];
  for (const poly of feature.geometry.coordinates) for (const ring of poly) rings.push(prepareRing(ring));
  const grid = new Uint8Array(MW_W * MW_H);
  rasterizeRings(rings, MW_W, MW_H, (col, r0, r1) => {
    for (let r = r0; r <= r1; r++) grid[r * MW_W + col] ^= 1;
  });
  const at = ([ra, dec]) => grid[Math.floor((90 - dec) / 180 * MW_H) * MW_W + Math.floor(ra / 360 * MW_W)];
  // Rings that wind around a celestial pole make the inside/outside ambiguous; the
  // band must contain the galactic centre and not the galactic pole.
  if (!at(GALACTIC_POLE) && (feature.id !== 'ol1' || at(GALACTIC_CENTER))) return grid;
  if (at(GALACTIC_POLE) && (feature.id !== 'ol1' || !at(GALACTIC_CENTER))) {
    for (let i = 0; i < grid.length; i++) grid[i] ^= 1;
    return grid;
  }
  throw new Error(`milky way level ${feature.id}: inconsistent orientation`);
}

const mw = new Float32Array(MW_W * MW_H);
for (const f of mwJson.features) {
  const grid = rasterLevel(f);
  for (let i = 0; i < mw.length; i++) mw[i] += grid[i];
}

/** Separable box blur, repeated for a near-gaussian kernel; horizontal radius grows with 1/cos(dec). */
function blur(src, radius, passes) {
  let a = src;
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < MW_H; y++) {
      const dec = 90 - ((y + 0.5) * 180) / MW_H;
      const r = Math.min(MW_W / 4, Math.round(radius / Math.max(0.1, Math.cos((dec * Math.PI) / 180))));
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * MW_W + ((k + MW_W) % MW_W)];
      for (let x = 0; x < MW_W; x++) {
        b[y * MW_W + x] = sum / (2 * r + 1);
        sum += a[y * MW_W + ((x + r + 1) % MW_W)] - a[y * MW_W + ((x - r + MW_W) % MW_W)];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < MW_W; x++) {
      for (let y = 0; y < MW_H; y++) {
        let sum = 0;
        let cnt = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < MW_H) {
            sum += a[yy * MW_W + x];
            cnt++;
          }
        }
        b[y * MW_W + x] = sum / cnt;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

const smooth = blur(mw, 3, 3);
const grey = new Uint8Array(MW_W * MW_H);
for (let i = 0; i < grey.length; i++) grey[i] = Math.round(255 * Math.pow(Math.min(1, smooth[i] / 5), 0.8));

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngGrey(pixels, w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 2; // "Up" filter
    for (let x = 0; x < w; x++) {
      const up = y ? pixels[(y - 1) * w + x] : 0;
      raw[y * (w + 1) + 1 + x] = (pixels[y * w + x] - up) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const png = pngGrey(grey, MW_W, MW_H);

// ---------------------------------------------------------------- write module
const col = (key, digits) => stars.map((s) => (digits == null ? s[key] : round(s[key], digits))).join(',');
const out = `// GENERATED by scripts/build-data.mjs from d3-celestial ${COMMIT.slice(0, 7)} - do not edit.
// Sources: XHIP (Anderson & Francis 2012) via d3-celestial; constellation lines and
// label positions by Olaf Frohn after the IAU; boundaries from Davenhall & Leggett
// (1989); Milky Way outlines by Jose R. Vieira. See CREDITS.md.

/** Stars brighter than about magnitude 6, sorted bright to faint. J2000 degrees. */
export const STARS = {
  hip: [${col('hip')}],
  ra: [${col('ra', 4)}],
  dec: [${col('dec', 4)}],
  mag: [${col('mag', 2)}],
  bv: [${col('bv', 2)}],
  con: [${col('con')}],
};

/** Proper names of bright stars, keyed by index into STARS. */
export const STAR_NAMES = ${JSON.stringify(starNames)};

/** Bayer letters, keyed by index into STARS. */
export const STAR_BAYER = ${JSON.stringify(bayer)};

/**
 * The 88 constellations. lines: stick figure as polylines of STARS indices.
 * bounds: boundary rings as flat [ra, dec, ...] lists in B1875 degrees.
 */
export const CONSTELLATIONS = [
${constellations.map((c) => '  ' + JSON.stringify(c)).join(',\n')}
];

/** Milky Way brightness, equirectangular (RA 0..360 left to right, Dec +90 at the top). */
export const MILKY_WAY_PNG = 'data:image/png;base64,${png.toString('base64')}';
`;
await writeFile(outFile, out);
console.log(`  wrote ${path.relative(root, outFile)} (${(out.length / 1024).toFixed(0)} kB, ${stars.length} stars, milky way png ${(png.length / 1024).toFixed(0)} kB)`);
