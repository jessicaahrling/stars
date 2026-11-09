// "Upptäck himlen": the sky starts with the group of Ursa Major (see src/data/chunks-sv.js)
// and the viewer adds a neighbouring group at a time, until they have them all. Two groups
// are neighbours when a member of one borders a member of the other. The state below works
// on any such graph: on the groups here, and on single constellations in the tests.

export const START_ID = 'UMa';

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

/**
 * Progress and what can be added next: groups in the app, constellations in the tests.
 * @param {Set<number>} found  indices of the ones found so far
 * @param {number[][]} neighbours  see groupNeighbours (or findNeighbours)
 * @param {(index: number) => boolean} inGoal  whether one is to be collected (a group
 *   with a member seen from the viewer's place, or every group)
 * @returns {{next: number[], goal: number, foundInGoal: number, done: boolean}}
 *   next: indices in ascending order, empty once every goal constellation is found
 */
export function discoveryState(found, neighbours, inGoal) {
  let goal = 0;
  let foundInGoal = 0;
  for (let i = 0; i < neighbours.length; i++) {
    if (!inGoal(i)) continue;
    goal++;
    if (found.has(i)) foundInGoal++;
  }
  const done = foundInGoal === goal;
  const border = new Set();
  if (!done) for (const i of found) for (const j of neighbours[i]) if (!found.has(j)) border.add(j);
  // One outside the goal is offered only as a stepping stone, when nothing in the goal
  // borders the ones found.
  let next = [...border].filter(inGoal);
  if (!next.length) next = [...border];
  return { next: next.sort((a, b) => a - b), goal, foundInGoal, done };
}
