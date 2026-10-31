import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { chunksOf, stagesOf } from '../../src/sky/curriculum.js';
import {
  AGAIN_AFTER, grade, isDue, nextCard, NOW_AFTER, NOW_DAYS, PERMANENT, PERMANENT_AFTER, PERMANENT_DAYS, trainingProgress,
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

/** Plays `count` cards, answering each with answerFor(card index, card); returns the indices shown. */
function play(cards, count, answerFor, { gs = groups, turn = 0, now = 0, inGoal = all } = {}) {
  const shown = [];
  let last = -1;
  for (let k = 0; k < count; k++) {
    last = nextCard(cards, gs, inGoal, turn + k, now, last);
    shown.push(last);
    cards.set(last, grade(cards.get(last), answerFor(last, cards.get(last), k), turn + k, now));
  }
  return shown;
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

test('play starts with the first group, in its order; the next comes in as soon as nothing is due', () => {
  const cards = new Map();
  const shown = play(cards, 8, () => 'now', { gs: made(4, 3, 3) });
  assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 6, 0], 'a whole group at a time, and reviews first');
  assert.equal(cards.size, 10, 'the third group is in, after the review due');
});

test('a group partly in play already brings in only the rest', () => {
  const cards = new Map([[2, grade(undefined, 'now', 0, 0)]]);
  const shown = play(cards, 3, () => 'now', { gs: made(4, 3), turn: 1 });
  assert.deepEqual(shown, [0, 1, 3]);
});

test('a miss comes back after two others', () => {
  const cards = new Map();
  const shown = play(cards, 6, (i, card) => (i === 1 && card.n === 0 ? 'again' : 'now'), { gs: made(4, 2) });
  assert.deepEqual(shown, [0, 1, 2, 3, 1, 4]);
});

test('while a miss rests, the next group comes in, not known ones early', () => {
  const cards = new Map();
  const shown = play(cards, 7, (i, card) => (i === 3 && card.n === 0 ? 'again' : 'now'), { gs: made(4, 2, 2) });
  assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 3], 'the miss rests while the next group comes in, and then it comes back');

  // A card missed again and again, among cards known for good: it never comes back
  // before two others, and the ones known for good stay away.
  const hard = new Map();
  const seen = play(hard, 60, (i) => (i === 1 ? 'again' : 'permanent'), { gs: made(...Array(30).fill(3)) });
  const at = seen.flatMap((i, k) => (i === 1 ? [k] : []));
  assert.ok(at.length > 10 && at.every((k, j) => j === 0 || k - at[j - 1] > AGAIN_AFTER), at.join(' '));
  const rest = seen.filter((i) => i !== 1);
  assert.equal(new Set(rest).size, rest.length, 'no card known for good is shown twice in 60 cards');
});

test('knowing every card for good goes through the curriculum once, group by group', () => {
  const cards = new Map();
  const shown = play(cards, 88, () => 'permanent');
  assert.deepEqual(shown, groups.flat(), 'each constellation once, in the order of the groups');
  assert.equal(trainingProgress(cards, all, 88).done, true);
});

test('a card known for good stays away while play goes on with others', () => {
  const first = groups[0][0];
  const cards = new Map();
  const shown = play(cards, 100, (i) => (i === first ? 'permanent' : 'now'));
  assert.equal(shown.filter((i) => i === first).length, 1, `${id(first)} is not shown again within 100 cards`);
  assert.ok(shown.filter((i) => i === groups[0][1]).length >= 3, 'while one known for now comes back');
  const back = play(cards, PERMANENT_AFTER, (i) => (i === first ? 'permanent' : 'now'), { turn: 100 });
  assert.ok(back.includes(first), 'but it does come back now and then');
});

test('the same card is never shown twice in a row while another is in play', () => {
  const cards = new Map();
  const shown = play(cards, 300, (i, card, k) => (k % 3 === 0 ? 'again' : 'now'));
  assert.ok(shown.every((s, j) => j === 0 || s !== shown[j - 1]));
  assert.ok(cards.size > groups[0].length + groups[1].length, `new groups come in between misses (${cards.size})`);
});

test('known for now, the whole sky is learnt with few showings each', () => {
  const cards = new Map();
  const views = new Map();
  let turn = 0;
  let last = -1;
  while (!trainingProgress(cards, all, 88).done) {
    last = nextCard(cards, groups, all, turn, 0, last);
    views.set(last, (views.get(last) || 0) + 1);
    cards.set(last, grade(cards.get(last), 'now', turn, 0));
    turn++;
    assert.ok(turn < 1500);
  }
  const counts = [...views.values()];
  assert.equal(counts.length, 88);
  // The first ones are reviewed while the rest come in: 6, 15, 35 and then every 80 cards.
  assert.ok(Math.max(...counts) <= 8, `at most eight showings each (${Math.max(...counts)})`);
  assert.ok(turn < 6 * 88, `about five cards shown for each constellation (${turn})`);
});

test('the winter sky is learnt before the rest of Sweden, and Sweden before the rest', () => {
  const cards = new Map();
  const shown = play(cards, 88, () => 'now').filter((i, k, list) => list.indexOf(i) === k);
  const stageOrder = shown.map((i) => stages[i]);
  assert.deepEqual(stageOrder, [...stageOrder].sort((a, b) => a - b), 'new cards come in step by step');
});

test('when everything is known and nothing is due, practice goes on with the card due soonest', () => {
  const [a, b] = [0, 1];
  const cards = new Map([[a, { level: 2, dueTurn: 50, dueAt: null, n: 3 }], [b, { level: 1, dueTurn: 40, dueAt: null, n: 2 }]]);
  assert.equal(nextCard(cards, [[a, b]], all, 10, 0, -1), b);
  assert.equal(nextCard(cards, [[a, b]], all, 10, 0, b), a);
});

test('a goal short of the whole sky: cards beyond it are neither asked nor counted', () => {
  const winter = (i) => stages[i] === 1;
  const south = groups.flat().find((i) => stages[i] === 3);
  const cards = new Map([[south, { level: 0, dueTurn: 0, dueAt: null, n: 1 }]]);
  const first = nextCard(cards, groups, winter, 0, 0);
  assert.ok(winter(first) && first === groups[0][0], 'play starts afresh with the first winter group');
  const p = trainingProgress(cards, winter, 88);
  assert.deepEqual([p.goal, p.inPlay, p.known], [34, groups[0].length, 0]);
});

test('after days away, the reviews due come before a new group, all of them', () => {
  const gs = made(4, 3, 3);
  const cards = new Map();
  play(cards, 7, () => 'now', { gs });
  const shown = play(cards, 10, () => 'now', { gs, turn: 7, now: NOW_DAYS[0] * DAY });
  assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('old cards come back after days, however little has been played', () => {
  const gs = made(4, 2, 2);
  const cards = new Map();
  play(cards, 4, (i) => (i === 0 ? 'permanent' : 'now'), { gs });
  const at = (now) => nextCard(new Map(cards), gs, all, 4, now, -1);
  assert.equal(at(0), 4, 'the same session: nothing is due, so the next group comes in');
  assert.equal(at(NOW_DAYS[0] * DAY), 1, 'a day later the ones known for now are due, cards or not');
  const perm = new Map();
  play(perm, 4, () => 'permanent', { gs });
  const atPerm = (now) => nextCard(new Map(perm), gs, all, 4, now, -1);
  assert.equal(atPerm((PERMANENT_DAYS - 1) * DAY), 4, 'known for good: still resting');
  assert.equal(atPerm(PERMANENT_DAYS * DAY), 0, 'and back after weeks');
});
