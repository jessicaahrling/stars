// Reads constellation illustrations (art/<id>.svg) in the small SVG subset the app
// supports, and flattens their curves into polylines.
//
// Allowed: one <svg> root with a viewBox, <path d="..."> children (optionally
// class="fine" for thin detail lines), and <g> without attributes for grouping.
// Path commands: M, L, C, Q, Z (absolute, upper case). No transforms, fills or text.

const CMD_ARGS = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/** Validates and parses an SVG string. Returns { paths: [{fine, d}], errors: [] }. */
export function parseArtSvg(svg) {
  const errors = [];
  const paths = [];
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*>/, '').trim();
  if (!/^<svg\b[^>]*\bviewBox="[^"]+"[^>]*>/.test(body)) errors.push('root must be <svg ... viewBox="...">');
  if (!/<\/svg>\s*$/.test(body)) errors.push('missing </svg>');
  const tags = body.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  for (const tag of tags) {
    const name = tag.match(/^<\/?([a-zA-Z]+)/)[1];
    if (tag.startsWith('</')) continue;
    if (name === 'svg') continue;
    if (name === 'g') {
      if (!/^<g\s*>$/.test(tag)) errors.push(`<g> must not have attributes: ${tag}`);
      continue;
    }
    if (name !== 'path') {
      errors.push(`element <${name}> is not allowed (only <path> and <g>)`);
      continue;
    }
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
    for (const k of Object.keys(attrs)) {
      if (k !== 'd' && k !== 'class') errors.push(`attribute ${k} is not allowed on <path>`);
    }
    if (attrs.class && attrs.class !== 'fine') errors.push(`class must be "fine" or absent, got "${attrs.class}"`);
    if (!attrs.d) {
      errors.push('<path> without d');
      continue;
    }
    const bad = new Set(attrs.d.match(/[^MLCQZ0-9.,\s+\-eE]/g) || []);
    if (bad.size) errors.push(`path commands ${[...bad].join(' ')} are not allowed (use absolute M L C Q Z)`);
    paths.push({ fine: attrs.class === 'fine', d: attrs.d });
  }
  if (!paths.length) errors.push('no <path> elements');
  return { paths, errors };
}

/** Tokenizes a path's d attribute into [cmd, numbers[]] pairs. */
function tokenize(d) {
  const out = [];
  const re = /([MLCQZ])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let cur = null;
  for (const m of d.matchAll(re)) {
    if (m[1]) {
      cur = { cmd: m[1], nums: [] };
      out.push(cur);
    } else {
      if (!cur) throw new Error('path must start with M');
      cur.nums.push(Number(m[2]));
    }
  }
  return out;
}

function flattenCubic(out, x0, y0, x1, y1, x2, y2, x3, y3, tol, depth = 0) {
  // Distance of the control points from the chord as a flatness measure.
  const dx = x3 - x0;
  const dy = y3 - y0;
  const len = Math.hypot(dx, dy) || 1e-9;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx) / len;
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx) / len;
  if (depth >= 12 || d1 + d2 <= tol) {
    out.push(x3, y3);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2;
  const ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2;
  const yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2;
  const ym = (ya + yb) / 2;
  flattenCubic(out, x0, y0, x01, y01, xa, ya, xm, ym, tol, depth + 1);
  flattenCubic(out, xm, ym, xb, yb, x23, y23, x3, y3, tol, depth + 1);
}

/**
 * Flattens a path's d attribute into polylines [x0, y0, x1, y1, ...].
 * @param {number} tol maximum deviation from the curve, in frame units
 */
export function flattenPath(d, tol = 0.3) {
  const lines = [];
  let line = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const { cmd, nums } of tokenize(d)) {
    const n = CMD_ARGS[cmd];
    if (n === 0) {
      if (nums.length) throw new Error('Z takes no numbers');
      if (line) {
        line.push(sx, sy);
        x = sx;
        y = sy;
      }
      continue;
    }
    if (nums.length === 0 || nums.length % n !== 0) throw new Error(`${cmd} needs a multiple of ${n} numbers, got ${nums.length}`);
    for (let k = 0; k < nums.length; k += n) {
      const a = nums.slice(k, k + n);
      if (cmd === 'M' && k === 0) {
        line = [a[0], a[1]];
        lines.push(line);
        x = sx = a[0];
        y = sy = a[1];
      } else if (cmd === 'L' || cmd === 'M') {
        line.push(a[0], a[1]);
        x = a[0];
        y = a[1];
      } else if (cmd === 'C') {
        flattenCubic(line, x, y, a[0], a[1], a[2], a[3], a[4], a[5], tol);
        x = a[4];
        y = a[5];
      } else if (cmd === 'Q') {
        // Raise to a cubic.
        const c1x = x + (2 / 3) * (a[0] - x);
        const c1y = y + (2 / 3) * (a[1] - y);
        const c2x = a[2] + (2 / 3) * (a[0] - a[2]);
        const c2y = a[3] + (2 / 3) * (a[1] - a[3]);
        flattenCubic(line, x, y, c1x, c1y, c2x, c2y, a[2], a[3], tol);
        x = a[2];
        y = a[3];
      }
    }
    if (!line) throw new Error('path must start with M');
  }
  return lines.filter((l) => l.length >= 4);
}

/** Parses, validates and flattens an illustration. Throws on invalid input. */
export function readArt(svg, tol) {
  const { paths, errors } = parseArtSvg(svg);
  if (errors.length) throw new Error(errors.join('\n'));
  const polylines = [];
  for (const p of paths) for (const pts of flattenPath(p.d, tol)) polylines.push({ fine: p.fine, pts });
  return polylines;
}
