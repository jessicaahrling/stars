// "Träna": flashcards with spaced repetition. A constellation is shown with its stars
// only, then with its stick figure, then named, and the learner says how it went:
//   'again'      Fel                 back after AGAIN_AFTER other cards
//   'now'        Kan för tillfället  known; back after more and more cards each time
//   'permanent'  Kan permanent       known; back only now and then
// Constellations are learnt a group at a time (see sky/curriculum.js): a group until every
// one in it is known, and then the next, with a review of an older card now and then.
// Rests are counted in cards shown, so that play moves on at the learner's pace, and in
// days too, so that old cards come back between sessions.

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

/** Every REVIEW_EVERY-th card is a review of a card outside the group, when one is due. */
export const REVIEW_EVERY = 3;

const missed = (card) => card.level === 0 && card.n > 0;

/**
 * Whether a group is learnt: every member known, and, when `seen` is given, answered since
 * the group was taken up (so that a group chosen again is gone through once more).
 * @param {Map<number, Card>} cards
 * @param {number[]} group
 * @param {Set<number>} [seen]
 */
export function groupDone(cards, group, seen) {
  return group.every((i) => cards.get(i)?.level >= 1 && (!seen || seen.has(i)));
}

/**
 * The group to learn: the one taken up (`current`) until it is learnt, then the first
 * within the goal not learnt yet.
 * @param {Map<number, Card>} cards
 * @param {number[][]} groups  in learning order
 * @param {(k: number) => boolean} groupInGoal
 * @param {number} current  the group taken up, or -1
 * @param {Set<number>} seen  its members answered since it was taken up
 * @returns {number} a group index, or -1 when every group within the goal is learnt
 */
export function groupToLearn(cards, groups, groupInGoal, current, seen) {
  if (current >= 0 && !groupDone(cards, groups[current], seen)) return current;
  return groups.findIndex((g, k) => groupInGoal(k) && !groupDone(cards, g));
}

/**
 * Picks the card to show next while learning one group at a time (see sky/curriculum.js).
 * The group's members come in when it is taken up, and are shown in their order, each
 * once; a miss comes back when it has rested, until every one is known. Every
 * REVIEW_EVERY-th card is a review instead, when a card outside the group is due (a miss
 * first, then the one due longest), so that old groups come back now and then; while a
 * miss in the group rests, the reviews due fill in, then the group's known cards, then an
 * older card a little early.
 * With no group, practice goes on with the reviews due, and then the card due soonest.
 * One due after days away counts as due from the turn it is first found so. The card just
 * shown waits a turn if another will do.
 * @param {Map<number, Card>} cards  constellations in play; the group's are added to it
 * @param {number[]} group  the group being learnt, in order, or [] when there is none
 * @param {Set<number>} seen  the group's members answered since it was taken up
 * @param {(index: number) => boolean} inGoal  constellations to review
 * @param {number} turn  cards answered so far
 * @param {number} now   ms
 * @param {number} last  the card just shown, or -1
 * @returns {number} a constellation index, or -1 when there is nothing to show
 */
export function nextCard(cards, group, seen, inGoal, turn, now, last = -1) {
  for (const i of group) if (!cards.has(i)) cards.set(i, { level: 0, dueTurn: turn, dueAt: null, n: 0 });
  for (const [i, c] of cards) if (c.dueAt !== null && now >= c.dueAt && c.dueTurn > turn) cards.set(i, { ...c, dueTurn: turn });
  const soonest = (list) => list.reduce((a, b) => (cards.get(b).dueTurn < cards.get(a).dueTurn ? b : a));
  const notLast = (list) => (list.length > 1 ? list.filter((i) => i !== last) : list);
  const inGroup = new Set(group);
  const others = notLast([...cards.keys()].filter((i) => !inGroup.has(i) && inGoal(i)));
  const due = others.filter((i) => isDue(cards.get(i), turn, now));
  const review = () => {
    const miss = due.filter((i) => missed(cards.get(i)));
    return soonest(miss.length ? miss : due);
  };
  if (due.length && turn % REVIEW_EVERY === REVIEW_EVERY - 1) return review();
  const mine = group.filter((i) => i !== last);
  const missedDue = mine.filter((i) => missed(cards.get(i)) && isDue(cards.get(i), turn, now));
  if (missedDue.length) return soonest(missedDue);
  const unseen = mine.filter((i) => !seen.has(i));
  if (unseen.length) return unseen[0];
  if (due.length) return review();
  const known = mine.filter((i) => cards.get(i).level >= 1);
  if (known.length) return soonest(known);
  // Only a miss is left in the group, still resting: an older card a little early, if any.
  if (others.length) return soonest(others);
  const rest = notLast(group);
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
