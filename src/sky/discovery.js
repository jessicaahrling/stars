// "Upptäck himlen": the sky starts with Ursa Major alone, and the viewer adds neighbours
// of the constellations found so far, one at a time, until they have them all.

export const START_ID = 'UMa';

/**
 * Progress and the constellations that can be added next.
 * @param {Set<number>} found  indices of the constellations found so far
 * @param {number[][]} neighbours  see findNeighbours
 * @param {(index: number) => boolean} inGoal  whether a constellation is one to collect
 *   (those seen from the viewer's place, or all of them)
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
  // A constellation outside the goal is offered only as a stepping stone, when no goal
  // constellation borders the ones found.
  let next = [...border].filter(inGoal);
  if (!next.length) next = [...border];
  return { next: next.sort((a, b) => a - b), goal, foundInGoal, done };
}
