// "Träna": flashcards with spaced repetition. A constellation is shown with its stars
// only, then with its stick figure, then named, and the learner says how it went:
//   'again'      Fel                 back after AGAIN_AFTER other cards
//   'now'        Kan för tillfället  known; back after more and more cards each time
//   'permanent'  Kan permanent       known; back only now and then
// Play starts with a few striking constellations, and more come in whenever nothing is
// due and every card in play is known. Rests are counted in cards shown, so that play
// moves on at the learner's pace, and in days too, so that old cards come back between
// sessions.

/** The first constellations to learn, in this order. After them the rest follow by prominence. */
export const FIRST = ['UMa', 'Cas', 'Ori', 'Cyg', 'Leo', 'UMi', 'Lyr', 'Tau', 'Gem', 'Aur', 'Boo', 'Peg', 'Sco', 'Aql', 'Per', 'And', 'CMa', 'Dra', 'Her', 'Vir'];

/** How many constellations play starts with, and how many come in at a time after that. */
export const START_CARDS = 4;
export const MORE_CARDS = 2;

/** Cards shown before a missed card comes back. */
export const AGAIN_AFTER = 2;
/** Cards shown before a card known for now comes back, by how many times in a row it has been known. */
export const NOW_AFTER = [6, 15, 35, 80];
/** Days after which a card known for now comes back however little has been played. */
export const NOW_DAYS = [1, 3, 7, 21];
/** Level of a card known for good, and how long it rests: in cards shown and in days. */
export const PERMANENT = 9;
export const PERMANENT_AFTER = 120;
export const PERMANENT_DAYS = 45;

const DAY = 86_400_000;

/**
 * @typedef {object} Card
 * @property {number} level   0 not known (new or missed), 1-4 known for now, PERMANENT known for good
 * @property {number} dueTurn the turn (cards shown so far) from which it is due
 * @property {number | null} dueAt  the time (ms) from which it is due anyway, or null
 * @property {number} n       how many times it has been answered
 */

/**
 * Order in which constellations come into play: FIRST, then by the label rank of the
 * catalogue and the light of their five brightest figure stars.
 * @param {{index: number, id: string, rank: number, figureStars: number[]}[]} constellations
 * @param {ArrayLike<number>} mag  star magnitudes
 * @returns {number[]} constellation indices
 */
export function introductionOrder(constellations, mag) {
  const light = (c) => c.figureStars.map((i) => mag[i]).sort((a, b) => a - b).slice(0, 5)
    .reduce((sum, m) => sum + 10 ** (-0.4 * m), 0);
  const first = FIRST.map((id) => constellations.find((c) => c.id === id)).filter(Boolean);
  const rest = constellations.filter((c) => !FIRST.includes(c.id))
    .map((c) => ({ c, light: light(c) }))
    .sort((a, b) => (a.c.rank || 3) - (b.c.rank || 3) || b.light - a.light)
    .map((r) => r.c);
  return [...first, ...rest].map((c) => c.index);
}

/**
 * A card after an answer.
 * @param {Card | undefined} card
 * @param {'again' | 'now' | 'permanent'} answer
 * @param {number} turn  cards answered so far, this one not counted
 * @param {number} now   ms
 * @returns {Card}
 */
export function grade(card, answer, turn, now) {
  const n = (card ? card.n : 0) + 1;
  if (answer === 'again') return { level: 0, dueTurn: turn + 1 + AGAIN_AFTER, dueAt: null, n };
  if (answer === 'permanent') {
    return { level: PERMANENT, dueTurn: turn + 1 + PERMANENT_AFTER, dueAt: now + PERMANENT_DAYS * DAY, n };
  }
  // Known for now: one level up each time, as far as the last; a card known for good that
  // is only known for now again drops to the last level.
  const from = card ? card.level : 0;
  const level = from >= 1 ? Math.min(from + 1, NOW_AFTER.length) : 1;
  return { level, dueTurn: turn + 1 + NOW_AFTER[level - 1], dueAt: now + NOW_DAYS[level - 1] * DAY, n };
}

/** Whether a card is due: enough cards have been shown since, or enough days have passed. */
export function isDue(card, turn, now) {
  return turn >= card.dueTurn || (card.dueAt !== null && now >= card.dueAt);
}

/**
 * Picks the card to show next, and brings new constellations into play: START_CARDS at
 * first, then MORE_CARDS at a time whenever nothing is due and every card in play is
 * known. A missed card that is due goes first, then the card that has been due longest.
 * When nothing is due and nothing new can come in (a card is still missed, or every
 * constellation is in play), the card due soonest is shown, so practice never stops. The
 * card just shown waits a turn if another will do.
 * @param {Map<number, Card>} cards  constellations in play; new ones are added to it
 * @param {number[]} order  see introductionOrder
 * @param {(index: number) => boolean} inGoal  constellations to learn (seen from here)
 * @param {number} turn  cards answered so far
 * @param {number} now   ms
 * @param {number} last  the card just shown, or -1
 * @returns {number} a constellation index, or -1 when there is nothing to learn
 */
export function nextCard(cards, order, inGoal, turn, now, last = -1) {
  const inPlay = () => [...cards.keys()].filter(inGoal);
  const waiting = order.filter((i) => inGoal(i) && !cards.has(i));
  const bringIn = (count) => {
    for (const i of waiting.splice(0, count)) cards.set(i, { level: 0, dueTurn: turn, dueAt: null, n: 0 });
  };
  const pool = () => {
    const play = inPlay();
    return play.length > 1 ? play.filter((i) => i !== last) : play;
  };
  const earliest = (list) => list.reduce((a, b) => (cards.get(b).dueTurn < cards.get(a).dueTurn ? b : a));
  const due = () => {
    const list = pool().filter((i) => isDue(cards.get(i), turn, now));
    const missed = list.filter((i) => cards.get(i).level === 0 && cards.get(i).n > 0);
    return missed.length ? missed : list;
  };
  if (!inPlay().length) bringIn(START_CARDS);
  let list = due();
  if (!list.length && waiting.length && inPlay().every((i) => cards.get(i).level >= 1)) {
    bringIn(MORE_CARDS);
    list = due();
  }
  if (list.length) return earliest(list);
  const rest = pool();
  return rest.length ? earliest(rest) : -1;
}

/**
 * @returns {{goal: number, inPlay: number, known: number, permanent: number, done: boolean}}
 */
export function trainingProgress(cards, inGoal, count) {
  let goal = 0;
  let inPlay = 0;
  let known = 0;
  let permanent = 0;
  for (let i = 0; i < count; i++) {
    if (!inGoal(i)) continue;
    goal++;
    const card = cards.get(i);
    if (!card) continue;
    inPlay++;
    if (card.level >= 1) known++;
    if (card.level === PERMANENT) permanent++;
  }
  return { goal, inPlay, known, permanent, done: goal > 0 && known === goal };
}
