// What "Träna" teaches, and in which order. The sky is learnt in three steps: first the
// winter sky seen at ten in the evening from Stockholm and Göteborg, then the others seen
// from somewhere in Sweden, then the rest of the 88. Within each step the constellations
// come in groups (src/data/chunks-sv.js) that belong together, by a shared story, a
// pattern that spans them or a bright neighbour that leads to the others, and that lie
// side by side, so that each is remembered with the others.
import { visibilityClass } from '../astro/visibility.js';
import { CHUNKS } from '../data/chunks-sv.js';
import { PLACES } from '../data/places.js';
import { winterSky } from './winter.js';

/** The steps, as the training panel names them; `upTo` is what learning that far takes in. */
export const STAGES = [
  { id: 'winter', name: 'Vinterhimlen', upTo: 1 },
  { id: 'sweden', name: 'Sverige', upTo: 2 },
  { id: 'all', name: 'Hela himlen', upTo: 3 },
];

/**
 * The step each constellation belongs to: 1 the winter sky, 2 seen from somewhere in
 * Sweden, 3 the rest.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {number} year  the winter to judge the winter sky by (see winterOf)
 * @returns {number[]} by constellation index
 */
export function stagesOf(catalog, year) {
  const winter = winterSky(catalog, year);
  return catalog.constellations.map((c) => {
    if (winter.has(c.index)) return 1;
    return PLACES.some((p) => visibilityClass(c.figureDecs, p.lat) !== 'never') ? 2 : 3;
  });
}

/**
 * @typedef {object} Chunk
 * @property {number} stage
 * @property {string} name
 * @property {string} reason
 * @property {number[]} members  constellation indices, in the order they come in
 */

/**
 * The groups in learning order.
 * @param {import('./catalog.js').Catalog} catalog
 * @returns {Chunk[]}
 */
export function chunksOf(catalog) {
  return CHUNKS.map((ch) => ({ ...ch, members: ch.members.map((id) => catalog.byId.get(id).index) }));
}
