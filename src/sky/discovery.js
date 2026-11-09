// "Upptäck himlen" shows the sky as its groups (see src/data/chunks-sv.js), each in a
// colour of its own. Two groups are neighbours when a member of one borders a member of
// the other, and neighbours get different colours where that can be helped.

/**
 * Which groups border each other.
 * @param {{members: number[]}[]} chunks  the groups, every constellation in one of them
 * @param {number[][]} neighbours  constellation neighbours, see findNeighbours
 * @returns {number[][]} by group index, the neighbouring groups in ascending order
 */
export function groupNeighbours(chunks, neighbours) {
  const groupOf = new Map();
  chunks.forEach((ch, g) => ch.members.forEach((i) => groupOf.set(i, g)));
  return chunks.map((ch, g) => {
    const out = new Set();
    for (const i of ch.members) {
      for (const j of neighbours[i]) {
        const h = groupOf.get(j);
        if (h !== undefined && h !== g) out.add(h);
      }
    }
    return [...out].sort((a, b) => a - b);
  });
}

/**
 * A colour number for each group, 0 to colors - 1, never the same as a neighbour's when
 * that can be helped: each group in turn takes the first colour its neighbours coloured so
 * far do not have, or else the one they have least of.
 * @param {number[][]} groupNb  see groupNeighbours
 * @param {number} colors
 * @returns {number[]}
 */
export function groupColors(groupNb, colors) {
  const out = [];
  groupNb.forEach((nb, g) => {
    const used = new Array(colors).fill(0);
    for (const h of nb) if (h < g) used[out[h]]++;
    const free = used.indexOf(0);
    out.push(free >= 0 ? free : used.indexOf(Math.min(...used)));
  });
  return out;
}
