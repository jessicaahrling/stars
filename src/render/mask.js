// Equirectangular RGBA texture that tints the area of marked constellations.
import { rasterizeRings } from '../sky/rings.js';

export const MASK_W = 2048;
export const MASK_H = 1024;

/** Rasterized runs per constellation index, as flat [col, rowStart, rowEnd, ...]. */
const runCache = new Map();
let data = null;

function runsFor(c) {
  let runs = runCache.get(c.index);
  if (!runs) {
    const list = [];
    rasterizeRings(c.ringsJ2000, MASK_W, MASK_H, (col, r0, r1) => list.push(col, r0, r1));
    runs = Int16Array.from(list);
    runCache.set(c.index, runs);
  }
  return runs;
}

/**
 * @param {import('../sky/catalog.js').Constellation[]} constellations
 * @param {Map<number, number[]>} tints constellation index -> [r, g, b] (0..255)
 * @returns {Uint8Array} premultiplied RGBA, row 0 at Dec +90 (reused between calls)
 */
export function buildMask(constellations, tints) {
  if (!data) data = new Uint8Array(MASK_W * MASK_H * 4);
  else data.fill(0);
  for (const [index, [r, g, b]] of tints) {
    const runs = runsFor(constellations[index]);
    for (let k = 0; k < runs.length; k += 3) {
      const col = runs[k];
      for (let row = runs[k + 1]; row <= runs[k + 2]; row++) {
        const o = (row * MASK_W + col) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
  }
  return data;
}
