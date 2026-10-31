// "Träna": flashcards with spaced repetition. A constellation is shown with its stars
// only, then with its stick figure, then named, and the learner says how it went:
//   'again'      Fel                 back after AGAIN_AFTER other cards
//   'now'        Kan för tillfället  known; back after more and more cards each time
//   'permanent'  Kan permanent       known; back only now and then
// Constellations come into play a group at a time (see sky/curriculum.js), the next group
// as soon as every card in play is known, or nothing is due because a missed one is still
// resting. Rests are counted in cards shown, so that play moves on at the learner's pace,
// and in days too, so that old cards come back between sessions.

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
 * Picks the card to show next, and brings new constellations into play a group at a
 * time (see sky/curriculum.js): the first group at first, then the next as soon as every
 * card in play is known. A missed card that is due goes first, then the card that has been
 * due longest (one due after days away counts as due from now), so the reviews that are
 * due come before a new group's cards, and a new group still comes in however many there
 * are to review. While a missed card rests and nothing else is due, the next group comes
 * in too, rather than known cards early, so that the miss comes back after AGAIN_AFTER
 * others and a card known for good stays away. Once every group is in play and nothing is
 * due, the card due soonest is shown, so practice never stops. The card just shown waits a
 * turn if another will do.
 * @param {Map<number, Card>} cards  constellations in play; new ones are added to it
 * @param {number[][]} groups  constellation indices, group by group, in learning order
 * @param {(index: number) => boolean} inGoal  constellations to learn
 * @param {number} turn  cards answered so far
 * @param {number} now   ms
 * @param {number} last  the card just shown, or -1
 * @returns {number} a constellation index, or -1 when there is nothing to learn
 */
export function nextCard(cards, groups, inGoal, turn, now, last = -1) {
  const inPlay = () => [...cards.keys()].filter(inGoal);
  const waiting = groups.map((g) => g.filter((i) => inGoal(i) && !cards.has(i))).filter((g) => g.length);
  const bringIn = () => {
    for (const i of waiting.shift() || []) cards.set(i, { level: 0, dueTurn: turn, dueAt: null, n: 0 });
  };
  const pool = () => {
    const play = inPlay();
    return play.length > 1 ? play.filter((i) => i !== last) : play;
  };
  const by = (key) => (list) => list.reduce((a, b) => (key(b) < key(a) ? b : a));
  const longestDue = by((i) => Math.min(cards.get(i).dueTurn, turn));
  const soonest = by((i) => cards.get(i).dueTurn);
  const due = () => {
    const list = pool().filter((i) => isDue(cards.get(i), turn, now));
    const missed = list.filter((i) => cards.get(i).level === 0 && cards.get(i).n > 0);
    return missed.length ? missed : list;
  };
  if (!inPlay().length) bringIn();
  let list = due();
  if (waiting.length && (!list.length || inPlay().every((i) => cards.get(i).level >= 1))) {
    bringIn();
    list = due();
  }
  if (list.length) return longestDue(list);
  const rest = pool();
  return rest.length ? soonest(rest) : -1;
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
