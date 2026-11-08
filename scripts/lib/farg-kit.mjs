// A small kit for the coloured test drawings: smooth closed shapes through points, tapered
// tubes (limbs, tails) along a curve, circles and ellipses, all as SVG paths in the app's
// art frame (10 units = 1 degree, x west/right, y south/down).
const f = (n) => (Math.round(n * 10) / 10).toString();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]) || 1;
const norm = (a) => mul(a, 1 / len(a));
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Catmull-Rom through the points as cubic Béziers (closed or open). */
export function smooth(points, closed = true, k = 1 / 6) {
  const n = points.length;
  const at = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${f(points[0][0])} ${f(points[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = add(p1, mul(sub(p2, p0), k));
    const c2 = sub(p2, mul(sub(p3, p1), k));
    d += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

export const poly = (points, closed = true) => `M ${points.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L ')}${closed ? ' Z' : ''}`;

/** Points along a Catmull-Rom curve through the points. */
export function along(points, per = 8) {
  const out = [];
  const n = points.length;
  const at = (i) => points[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[n - 1]);
  return out;
}

/** A tapered tube along a curve through the points: width w0 at the start, w1 at the end, round ends. */
export function tube(points, w0, w1 = w0) {
  const c = along(points, 10);
  const left = [], right = [];
  c.forEach((p, i) => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    const t = norm(sub(b, a));
    const nrm = [-t[1], t[0]];
    const w = (w0 + (w1 - w0) * (i / (c.length - 1))) / 2;
    left.push(add(p, mul(nrm, w)));
    right.push(sub(p, mul(nrm, w)));
  });
  const end = norm(sub(c[c.length - 1], c[c.length - 2]));
  const start = norm(sub(c[1], c[0]));
  const ring = [...left, add(c[c.length - 1], mul(end, w1 / 2)), ...right.reverse(), sub(c[0], mul(start, w0 / 2))];
  // Every few points is enough for the smoothing.
  return smooth(ring.filter((_, i) => i % 2 === 0 || i === left.length), true);
}

/**
 * A straight-sided strip along a polyline, for limbs and tails that follow the lines
 * exactly: sharp (mitred) joints at the stars, square ends; half-widths per point (one
 * number for all).
 */
export function strip(points, widths) {
  const w = (i) => (Array.isArray(widths) ? widths[i] : widths) / 2;
  const n = points.length;
  const dir = (i) => norm(sub(points[i + 1], points[i]));
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const d1 = dir(Math.max(0, i - 1));
    const d2 = dir(Math.min(n - 2, i));
    const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]];
    let m = norm(add(n1, n2));
    const cos = Math.max(0.35, m[0] * n2[0] + m[1] * n2[1]);
    m = mul(m, w(i) / cos);
    left.push(add(points[i], m));
    right.push(sub(points[i], m));
  }
  return poly([...left, ...right.reverse()]);
}

/** A point part of the way from a to b (t from 0 to 1). */
export const on = (a, b, t) => lerp(a, b, t);

export function ellipse(cx, cy, rx, ry = rx, rot = 0) {
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    const r = (rot * Math.PI) / 180;
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return smooth(pts, true, 0.2);
}

/** An SVG document: shapes [{d, fill, stroke?, w?, dash?}] over a viewBox. */
export function svg(viewBox, title, shapes, sw) {
  const body = shapes.map((s) => {
    const fill = s.fill ?? 'none';
    const stroke = s.stroke ?? (fill === 'none' ? '#1b1b1b' : '#1b1b1b');
    const w = s.w ?? sw;
    return `  <path d="${s.d}" fill="${fill}" stroke="${stroke}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(f).join(' ')}">\n  <!-- ${title} -->\n${body}\n</svg>\n`;
}
