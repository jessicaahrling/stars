// "Träna": flashcards with spaced repetition. A constellation is shown with its stars
// only, then with its stick figure, then named, and the learner says how it went. Play
// starts with a few striking constellations; more come in once those are known.

/** The first constellations to learn, in this order. After them the rest follow by prominence. */
export const FIRST = ['UMa', 'Cas', 'Ori', 'Cyg', 'Leo', 'UMi', 'Lyr', 'Tau', 'Gem', 'Aur', 'Boo', 'Peg', 'Sco', 'Aql', 'Per', 'And', 'CMa', 'Dra', 'Her', 'Vir'];

/** How many constellations play starts with, and how many come in at a time after that. */
export const START_CARDS = 4;
export const MORE_CARDS = 2;

/** A card in this box or higher counts as known: answered right at least twice in a row. */
export const KNOWN_BOX = 2;

const MINUTE = 60_000;
const DAY = 86_400_000;
/** How long a card rests after an answer, by the box it lands in (Leitner boxes). */
export const INTERVALS = [0, MINUTE, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];

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
 * A card after an answer: 'again' sends it back to the first box, 'good' moves it one box
 * up and 'easy' two. A right answer before the card is due changes nothing but the count:
 * it keeps its box and its rest, so that a long session cannot push cards months ahead.
 * @param {{box: number, due: number, n: number} | undefined} card
 * @param {'again' | 'good' | 'easy'} answer
 * @param {number} now  ms
 */
export function grade(card, answer, now) {
  const n = (card ? card.n : 0) + 1;
  if (answer !== 'again' && card && card.n > 0 && now < card.due) return { box: card.box, due: card.due, n };
  const box = answer === 'again' ? 0 : Math.min(INTERVALS.length - 1, (card ? card.box : 0) + (answer === 'easy' ? 2 : 1));
  return { box, due: now + INTERVALS[box], n };
}

/**
 * Picks the card to show next. Constellations come into play START_CARDS at first and
 * MORE_CARDS at a time once every card in play is known; new cards are added to `cards`.
 * A card that was just missed comes back first, as soon as one other has been shown;
 * otherwise the card that has waited longest goes first, or, when none is due yet, the one
 * due soonest, so practice never has to stop. The card just shown waits a turn if it can.
 * @param {Map<number, {box: number, due: number, n: number}>} cards  constellations in play
 * @param {number[]} order  see introductionOrder
 * @param {(index: number) => boolean} inGoal  constellations to learn (seen from here)
 * @param {number} now  ms
 * @param {number} last  the card just shown, or -1
 * @returns {number} a constellation index, or -1 when there is nothing to learn
 */
export function nextCard(cards, order, inGoal, now, last = -1) {
  const inPlay = () => [...cards.keys()].filter(inGoal);
  const waiting = order.filter((i) => inGoal(i) && !cards.has(i));
  const bringIn = (n) => {
    for (const i of waiting.slice(0, n)) cards.set(i, { box: 0, due: now, n: 0 });
  };
  if (!inPlay().length) bringIn(START_CARDS);
  else if (waiting.length && inPlay().every((i) => cards.get(i).box >= KNOWN_BOX)) bringIn(MORE_CARDS);
  const play = inPlay();
  if (!play.length) return -1;
  const pool = play.length > 1 ? play.filter((i) => i !== last) : play;
  const missed = pool.filter((i) => {
    const c = cards.get(i);
    return c.box === 0 && c.n > 0 && c.due <= now;
  });
  return (missed.length ? missed : pool).reduce((a, b) => (cards.get(b).due < cards.get(a).due ? b : a));
}

/**
 * @returns {{goal: number, inPlay: number, known: number, done: boolean}}
 */
export function trainingProgress(cards, inGoal, count) {
  let goal = 0;
  let inPlay = 0;
  let known = 0;
  for (let i = 0; i < count; i++) {
    if (!inGoal(i)) continue;
    goal++;
    const card = cards.get(i);
    if (!card) continue;
    inPlay++;
    if (card.box >= KNOWN_BOX) known++;
  }
  return { goal, inPlay, known, done: goal > 0 && known === goal };
}
