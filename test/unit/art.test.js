import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { artFrame, fromArt, toArt } from '../../src/sky/art-frame.js';
import { angleBetween, vecFromRaDec } from '../../src/astro/math.js';
import { flattenPath, parseArtSvg, readArt } from '../../scripts/lib/svg-art.mjs';
import { buildCatalog } from '../../src/sky/catalog.js';
import { CONSTELLATION_NAMES_SV } from '../../src/data/names-sv.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('art frame: north is up, east is left, 10 units per degree', () => {
  const frame = artFrame(vecFromRaDec(90, 20));
  const [nx, ny] = toArt(frame, vecFromRaDec(90, 21));
  near(nx, 0, 1e-9);
  near(ny, -10, 0.01, 'one degree north');
  const [ex, ey] = toArt(frame, vecFromRaDec(90 + 1 / Math.cos((20 * Math.PI) / 180), 20));
  near(ex, -10, 0.05, 'one degree east');
  near(ey, 0, 0.1);
});

test('art frame round trip', () => {
  const center = vecFromRaDec(250, -60);
  const frame = artFrame(center);
  for (const [x, y] of [[0, 0], [120, -40], [-300, 250], [5, 600]]) {
    const v = fromArt(frame, x, y);
    near(Math.hypot(...v), 1, 1e-12);
    const [x2, y2] = toArt(frame, v);
    near(x2, x, 1e-9);
    near(y2, y, 1e-9);
  }
  // Stereographic: 100 units is 2 atan(100 / 2S) with S = 10 * 180 / pi, just under 10 degrees.
  near(angleBetween(fromArt(frame, 0, -100), center), (2 * Math.atan(100 / ((2 * 1800) / Math.PI)) * 180) / Math.PI, 1e-9);
});

test('the SVG subset rejects what the app cannot draw', () => {
  const { errors } = parseArtSvg('<svg viewBox="0 0 1 1"><circle r="1"/><path d="m0 0 a1 1 0 0 0 1 1" fill="red"/><g transform="x"></g></svg>');
  assert.equal(errors.length, 4, errors.join('\n'));
  assert.deepEqual(parseArtSvg('<svg viewBox="0 0 1 1"><!-- ok --><g><path class="fine" d="M 0 0 L 1 1"/></g></svg>').errors, []);
});

test('paths flatten to polylines that keep their end points', () => {
  const [curve] = flattenPath('M 0 0 C 10 0 10 10 0 10', 0.1);
  assert.deepEqual(curve.slice(0, 2), [0, 0]);
  assert.deepEqual(curve.slice(-2), [0, 10]);
  assert.ok(curve.length > 10, 'a curve becomes several points');
  const [closed] = flattenPath('M 1 1 L 5 1 L 5 5 Z');
  assert.deepEqual(closed, [1, 1, 5, 1, 5, 5, 1, 1]);
  const [quad] = flattenPath('M 0 0 Q 5 10 10 0', 0.05);
  const mid = quad[Math.floor(quad.length / 4) * 2 + 1];
  assert.ok(mid > 3, 'the quadratic bulges towards its control point');
});

test('every illustration file is valid and named after a constellation', () => {
  const dir = new URL('../../art/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg'));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const id = f.slice(0, -4);
    assert.ok(CONSTELLATION_NAMES_SV[id], `${f} is named after an IAU abbreviation`);
    const polylines = readArt(readFileSync(new URL(f, dir), 'utf8'));
    const points = polylines.reduce((s, p) => s + p.pts.length / 2, 0);
    assert.ok(points > 20 && points < 1500, `${f}: ${points} points`);
  }
});

test('every constellation has an illustration', () => {
  const catalog = buildCatalog();
  const missing = catalog.constellations.filter((c) => !c.art.length).map((c) => c.id);
  assert.deepEqual(missing, []);
});

test('illustrations land on their own constellation', () => {
  const catalog = buildCatalog();
  for (const c of catalog.constellations) {
    if (!c.art.length) continue;
    assert.ok(c.artRadius > 2 && c.artRadius < 70, `${c.id} illustration radius ${c.artRadius}`);
    // Most of the drawing lies inside the constellation it belongs to. A drawing in the
    // wrong frame or orientation lands far below this; figures that share a scene, like
    // Vela's sail on the ship Argo, may spill a lot into their neighbours.
    let inside = 0;
    let total = 0;
    for (const line of c.art) {
      for (let k = 0; k < line.vecs.length; k += 3) {
        total++;
        if (catalog.constellationAt([line.vecs[k], line.vecs[k + 1], line.vecs[k + 2]]) === c.index) inside++;
      }
    }
    assert.ok(inside / total > 0.5, `${c.id}: ${Math.round((100 * inside) / total)} % of the drawing inside its boundary`);
  }
});

/** Pairs whose drawings are allowed to touch through each other, with the reason. */
const SHARED_STAR_OVERLAPS = new Set([
  // Alpheratz is both Andromeda's head and Pegasus' navel; the hair knot sits in Pegasus' corner.
  'And/Peg',
]);

test('neighbouring illustrations do not draw through each other', () => {
  const catalog = buildCatalog();
  const withArt = catalog.constellations.filter((c) => c.art.length);
  const segmentsIn = (c, frame) => c.art.filter((l) => !l.fine).map((l) => {
    const pts = [];
    for (let k = 0; k < l.vecs.length; k += 3) pts.push(toArt(frame, [l.vecs[k], l.vecs[k + 1], l.vecs[k + 2]]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { pts, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
  const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const cross = ([x1, y1], [x2, y2], [x3, y3], [x4, y4]) => {
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (Math.abs(d) < 1e-12) return false;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const found = [];
  for (let i = 0; i < withArt.length; i++) {
    for (let j = i + 1; j < withArt.length; j++) {
      const a = withArt[i];
      const b = withArt[j];
      if (angleBetween(a.centerVec, b.centerVec) > a.artRadius + b.artRadius) continue;
      const frame = artFrame(a.centerVec);
      const la = segmentsIn(a, frame);
      const lb = segmentsIn(b, frame);
      let n = 0;
      for (const p of la) {
        for (const q of lb) {
          if (!overlaps(p.box, q.box)) continue;
          for (let s = 1; s < p.pts.length; s++) {
            for (let t = 1; t < q.pts.length; t++) if (cross(p.pts[s - 1], p.pts[s], q.pts[t - 1], q.pts[t])) n++;
          }
        }
      }
      if (n && !SHARED_STAR_OVERLAPS.has(`${a.id}/${b.id}`)) found.push(`${a.id}/${b.id}: ${n} crossings`);
    }
  }
  assert.deepEqual(found, [], 'run node scripts/art-tool.mjs clash to see where');
});
