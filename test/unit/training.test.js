import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { chunksOf, stagesOf } from '../../src/sky/curriculum.js';
import {
  AGAIN_AFTER, grade, groupDone, groupToLearn, isDue, nextCard, NOW_AFTER, NOW_DAYS, PERMANENT, PERMANENT_AFTER,
  PERMANENT_DAYS, REVIEW_EVERY, trainingProgress,
} from '../../src/sky/training.js';

const catalog = buildCatalog();
const groups = chunksOf(catalog).map((ch) => ch.members);
const stages = stagesOf(catalog, 2026);
const id = (i) => catalog.constellations[i].id;
const all = () => true;
const DAY = 86_400_000;

/** Groups of made-up cards 0, 1, 2 ... of the given sizes. */
function made(...sizes) {
  let next = 0;
  return sizes.map((n) => Array.from({ length: n }, () => next++));
}

/**
 * Plays `count` cards as the app does, one group at a time, answering each with
 * answerFor(card index, card, k); returns the cards shown and, for each, the group then learnt.
 */
function play(cards, count, answerFor, { gs = groups, turn = 0, now = 0, inGoal = all, from = { group: -1, seen: new Set() } } = {}) {
  const shown = [];
  const learning = [];
  const state = from;
  let last = -1;
  for (let k = 0; k < count; k++) {
    const next = groupToLearn(cards, gs, (g) => gs[g].some(inGoal), state.group, state.seen);
    if (next !== state.group) Object.assign(state, { group: next, seen: new Set() });
    const group = state.group >= 0 ? gs[state.group] : [];
    last = nextCard(cards, group, state.seen, inGoal, turn + k, now, last);
    shown.push(last);
    learning.push(state.group);
    cards.set(last, grade(cards.get(last), answerFor(last, cards.get(last), k), turn + k, now));
    if (group.includes(last)) state.seen.add(last);
  }
  return Object.assign(shown, { learning, state });
}

test('answers: a miss comes back after two others; known for now comes back later each time', () => {
  const now = 1_000_000;
  assert.deepEqual(grade(undefined, 'again', 10, now), { level: 0, dueTurn: 11 + AGAIN_AFTER, dueAt: null, n: 1 });
  let card = grade(undefined, 'now', 10, now);
  assert.deepEqual(card, { level: 1, dueTurn: 11 + NOW_AFTER[0], dueAt: now + NOW_DAYS[0] * DAY, n: 1 });
  const gaps = [];
  for (let k = 0; k < 6; k++) {
    card = grade(card, 'now', 100, now);
    gaps.push(card.dueTurn - 101);
  }
  assert.deepEqual(gaps, [NOW_AFTER[1], NOW_AFTER[2], NOW_AFTER[3], NOW_AFTER[3], NOW_AFTER[3], NOW_AFTER[3]], 'the rests grow, up to the last');
  const perm = grade(card, 'permanent', 100, now);
  assert.deepEqual(perm, { level: PERMANENT, dueTurn: 101 + PERMANENT_AFTER, dueAt: now + PERMANENT_DAYS * DAY, n: 8 });
  assert.equal(grade(perm, 'now', 200, now).level, NOW_AFTER.length, 'known for now again: the last level for now');
  assert.equal(grade(perm, 'again', 200, now).level, 0, 'a miss always starts over');
});

test('the rests grow from a few cards to many, and from a day to weeks', () => {
  assert.equal(AGAIN_AFTER, 2);
  NOW_AFTER.forEach((n, k) => k && assert.ok(n > NOW_AFTER[k - 1]));
  NOW_DAYS.forEach((d, k) => k && assert.ok(d > NOW_DAYS[k - 1]));
  assert.ok(PERMANENT_AFTER > NOW_AFTER.at(-1) && PERMANENT_DAYS > NOW_DAYS.at(-1));
});

test('a card is due after enough cards, or after enough days', () => {
  const card = grade(undefined, 'now', 0, 0);
  assert.equal(isDue(card, card.dueTurn - 1, 0), false);
  assert.equal(isDue(card, card.dueTurn, 0), true);
  assert.equal(isDue(card, 0, NOW_DAYS[0] * DAY), true, 'a day later it is due however little was played');
  assert.equal(isDue(grade(undefined, 'again', 0, 0), 0, 365 * DAY), false, 'a miss waits for cards, not days');
});

test('one group at a time: its members in order, and the next group once each is known', () => {
  const cards = new Map();
  const shown = play(cards, 8, () => 'now', { gs: made(3, 2, 2) });
  assert.deepEqual([...shown], [0, 1, 2, 3, 4, 5, 6, 0], 'every group learnt, then the reviews');
  assert.deepEqual(shown.learning, [0, 0, 0, 1, 1, 2, 2, -1]);
});

test('a group is not left until all of it is known; a miss comes back once it has rested', () => {
  const cards = new Map();
  const shown = play(cards, 6, (i, card) => (i === 1 && card.n === 0 ? 'again' : 'now'), { gs: made(3, 2) });
  // While the miss rests, a known card of the group fills in.
  assert.deepEqual([...shown], [0, 1, 2, 0, 1, 3]);
  assert.deepEqual(shown.learning, [0, 0, 0, 0, 0, 1]);
});

test('every third card is a review of an older group, when one is due', () => {
  const gs = made(...Array(40).fill(3));
  const cards = new Map();
  const shown = play(cards, 90, () => 'now', { gs });
  const reviews = shown.flatMap((c, k) => (shown.learning[k] >= 0 && !gs[shown.learning[k]].includes(c) ? [k] : []));
  assert.ok(reviews.length >= 15, `old groups come back (${reviews.length})`);
  assert.ok(reviews.every((k) => k % REVIEW_EVERY === REVIEW_EVERY - 1), reviews.join(' '));
  assert.ok(shown.learning.at(-1) > 10, 'and new groups keep coming');
});

test('knowing every card for good goes through the curriculum once, group by group', () => {
  const cards = new Map();
  const shown = play(cards, 88, () => 'permanent');
  assert.deepEqual([...shown], groups.flat(), 'each constellation once, in the order of the groups');
  assert.equal(trainingProgress(cards, all, 88).done, true);
});

test('in a group of two, a miss still rests: an older card comes a little early instead', () => {
  const gs = made(3, 2);
  const cards = new Map();
  const shown = play(cards, 7, (i, card) => (i === 3 && card.n === 0 ? 'again' : 'now'), { gs });
  // 0 1 2, then 3 missed and 4 known: the old 0 fills in before 3 comes back.
  assert.deepEqual([...shown.slice(3)], [3, 4, 0, 3]);
});

test('a card known for good stays away while play goes on with others', () => {
  const first = groups[0][0];
  const cards = new Map();
  const shown = play(cards, 100, (i) => (i === first ? 'permanent' : 'now'));
  assert.equal(shown.filter((i) => i === first).length, 1, `${id(first)} is not shown again within 100 cards`);
  assert.ok(shown.filter((i) => i === groups[0][1]).length >= 3, 'while one known for now comes back');
});

test('the same card is never shown twice in a row, and a miss rests at least two cards', () => {
  const cards = new Map();
  const misses = [];
  // New ones missed every other time, and a few known ones forgotten again.
  const shown = play(cards, 300, (i, card, k) => {
    const miss = (card?.n ?? 0) === 0 ? k % 2 === 0 : k % 7 === 0;
    if (miss) misses.push(k);
    return miss ? 'again' : 'now';
  });
  assert.ok(shown.every((s, j) => j === 0 || s !== shown[j - 1]));
  for (const k of misses) {
    const back = shown.indexOf(shown[k], k + 1);
    assert.ok(back < 0 || back - k > AGAIN_AFTER, `${id(shown[k])} missed at ${k}, back at ${back}`);
  }
  assert.ok(shown.learning.at(-1) > 5, `groups are learnt in spite of misses (${shown.learning.at(-1)})`);
});

test('known for now, the whole sky is learnt with few showings each', () => {
  const cards = new Map();
  const shown = play(cards, 600, () => 'now');
  const done = shown.learning.indexOf(-1);
  assert.ok(done > 0 && done < 3 * 88, `every group learnt after ${done} cards`);
  const counts = [...new Set(shown.slice(0, done))].map((c) => shown.slice(0, done).filter((x) => x === c).length);
  assert.equal(counts.length, 88);
  assert.ok(Math.max(...counts) <= 6, `at most six showings each (${Math.max(...counts)})`);
});

test('the winter sky is learnt before the rest of Sweden, and Sweden before the rest', () => {
  const cards = new Map();
  const shown = play(cards, 300, () => 'now').filter((i, k, list) => list.indexOf(i) === k);
  const stageOrder = shown.map((i) => stages[i]);
  assert.deepEqual(stageOrder, [...stageOrder].sort((a, b) => a - b), 'new cards come in step by step');
});

test('with every group learnt, practice goes on with the reviews due, then the card due soonest', () => {
  const [a, b] = [0, 1];
  const cards = new Map([[a, { level: 2, dueTurn: 50, dueAt: null, n: 3 }], [b, { level: 1, dueTurn: 40, dueAt: null, n: 2 }]]);
  assert.equal(nextCard(cards, [], new Set(), all, 10, 0, -1), b);
  assert.equal(nextCard(cards, [], new Set(), all, 10, 0, b), a);
  assert.equal(nextCard(cards, [], new Set(), all, 50, 0, b), a, 'due at 50');
});

test('a goal short of the whole sky: groups and reviews beyond it wait, and are not counted', () => {
  const winter = (i) => stages[i] === 1;
  const south = groups.flat().find((i) => stages[i] === 3);
  const cards = new Map([[south, { level: 0, dueTurn: 0, dueAt: null, n: 1 }]]);
  const shown = play(cards, 200, () => 'now', { inGoal: winter });
  assert.ok(shown.every(winter), 'only the winter sky is shown');
  assert.equal(shown.learning.at(-1), -1, 'and once it is learnt, play goes on with its reviews');
  const p = trainingProgress(cards, winter, 88);
  assert.deepEqual([p.goal, p.known], [34, 34]);
});

test('a group chosen again is gone through once more, then play goes back to the first not learnt', () => {
  const gs = made(3, 3, 3);
  const cards = new Map();
  play(cards, 6, () => 'now', { gs });
  assert.ok(groupDone(cards, gs[0]) && groupDone(cards, gs[1]) && !groupDone(cards, gs[2]));
  const from = { group: 0, seen: new Set() };
  const shown = play(cards, 4, () => 'now', { gs, turn: 6, from });
  assert.deepEqual([...shown.slice(0, 3)].sort(), [0, 1, 2], 'each of the chosen group once more');
  assert.equal(shown.learning[3], 2, 'and then the first group not learnt');
});

test('after days away, the reviews due come back every third card, the longest due first', () => {
  const gs = made(3, 3, 3, 3);
  const cards = new Map();
  play(cards, 6, () => 'now', { gs });
  const shown = play(cards, 9, () => 'now', { gs, turn: 6, now: NOW_DAYS[0] * DAY });
  assert.deepEqual([shown[2], shown[5], shown[8]], [0, 1, 2], 'one a third, oldest first');
  assert.deepEqual([shown[0], shown[1], shown[3]], [6, 7, 8], 'between them the next group');
  assert.equal(isDue(cards.get(3), 15, NOW_DAYS[0] * DAY), true, 'and more are due still');
});
