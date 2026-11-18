// The closed parts of a stick figure: the loops its lines go round, such as the bowl of
// the Big Dipper or the square of Pegasus. The sky fills them with a soft colour, so that
// a figure reads as a shape and not only as lines. A figure whose lines never close (the
// W of Cassiopeia, the cross of the Swan) has none.

/**
 * The loops of a figure, found by walking round each face of the drawing: from every line,
 * in both directions, always taking the next line clockwise at each star. The walks that
 * go round an inside come out anticlockwise; the one round the outside of each connected
 * part comes out clockwise and is left out.
 * @param {ArrayLike<number>} segments  star indices in pairs, one pair per line
 * @param {(star: number) => [number, number] | null} pointOf  where a star lies on a flat
 *   map of the figure (x to the right, y up), or null for one that cannot be mapped
 * @returns {number[][]} each loop as the stars round it, in order
 */
export function figureFaces(segments, pointOf) {
  const points = new Map();
  const next = new Map();
  const seen = new Set();
  for (let k = 0; k + 1 < segments.length; k += 2) {
    const a = segments[k];
    const b = segments[k + 1];
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key)) continue;
    for (const s of [a, b]) if (!points.has(s)) points.set(s, pointOf(s));
    if (!points.get(a) || !points.get(b)) continue;
    seen.add(key);
    for (const [u, v] of [[a, b], [b, a]]) {
      if (!next.has(u)) next.set(u, []);
      next.get(u).push(v);
    }
  }
  // Round each star, its neighbours in order of direction.
  for (const [s, around] of next) {
    const [x, y] = points.get(s);
    const angle = (t) => Math.atan2(points.get(t)[1] - y, points.get(t)[0] - x);
    around.sort((u, v) => angle(u) - angle(v));
  }
  const walked = new Set();
  const faces = [];
  for (const [start, around] of next) {
    for (const first of around) {
      if (walked.has(`${start}>${first}`)) continue;
      const face = [];
      let u = start;
      let v = first;
      while (!walked.has(`${u}>${v}`)) {
        walked.add(`${u}>${v}`);
        face.push(u);
        const at = next.get(v);
        const w = at[(at.indexOf(u) - 1 + at.length) % at.length];
        u = v;
        v = w;
      }
      let area = 0;
      for (let k = 0; k < face.length; k++) {
        const p = points.get(face[k]);
        const q = points.get(face[(k + 1) % face.length]);
        area += p[0] * q[1] - q[0] * p[1];
      }
      if (area > 1e-9 && face.length >= 3) faces.push(face);
    }
  }
  return faces;
}

/**
 * A flat map of the sky round a direction (a gnomonic one: great circles are straight
 * lines), for figureFaces.
 * @param {number[]} center  unit vector the map is centred on
 * @returns {(v: number[]) => [number, number] | null}  null for a direction more than
 *   about 80 degrees away
 */
export function flatMapAt(center) {
  const [cx, cy, cz] = center;
  const n = Math.hypot(cx, cy);
  // East along the map's x axis; at a pole any direction will do.
  const ex = n > 1e-9 ? [-cy / n, cx / n, 0] : [1, 0, 0];
  const ey = [cy * ex[2] - cz * ex[1], cz * ex[0] - cx * ex[2], cx * ex[1] - cy * ex[0]];
  return (v) => {
    const d = v[0] * cx + v[1] * cy + v[2] * cz;
    if (d < 0.17) return null;
    return [(v[0] * ex[0] + v[1] * ex[1] + v[2] * ex[2]) / d, (v[0] * ey[0] + v[1] * ey[1] + v[2] * ey[2]) / d];
  };
}
