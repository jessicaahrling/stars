import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { visibilityClass } from '../../src/astro/visibility.js';
import {
  AGAIN_AFTER, FIRST, grade, introductionOrder, isDue, MORE_CARDS, nextCard, NOW_AFTER, NOW_DAYS, PERMANENT,
  PERMANENT_AFTER, PERMANENT_DAYS, START_CARDS, trainingProgress,
} from '../../src/sky/training.js';

const catalog = buildCatalog();
const order = introductionOrder(catalog.constellations, catalog.stars.mag);
const id = (i) => catalog.constellations[i].id;
const idx = (c) => catalog.byId.get(c).index;
const stockholm = (i) => visibilityClass(catalog.constellations[i].figureDecs, 59.33) !== 'never';
const DAY = 86_400_000;

/** Plays `count` cards, answering each with answerFor(id, card); returns the ids shown. */
function play(cards, count, answerFor, { turn = 0, now = 0, inGoal = stockholm } = {}) {
  const shown = [];
  let last = -1;
  for (let k = 0; k < count; k++) {
    last = nextCard(cards, order, inGoal, turn + k, now, last);
    shown.push(id(last));
    cards.set(last, grade(cards.get(last), answerFor(id(last), cards.get(last)), turn + k, now));
  }
  return shown;
}

test('every constellation comes into play once, the striking ones first', () => {
  assert.equal(order.length, 88);
  assert.equal(new Set(order).size, 88);
  assert.deepEqual(order.slice(0, FIRST.length).map(id), FIRST);
  assert.deepEqual(order.slice(0, 4).map(id), ['UMa', 'Cas', 'Ori', 'Cyg']);
  const seen = order.filter(stockholm).map(id);
  assert.ok(seen.indexOf('Sex') > seen.length - 10 && seen.indexOf('LMi') > 30, seen.join(' '));
});

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

test('play starts with four; two more come in as soon as those are known and nothing is due', () => {
  const cards = new Map();
  const shown = play(cards, 9, () => 'now');
  assert.deepEqual(shown, ['UMa', 'Cas', 'Ori', 'Cyg', 'Leo', 'UMi', 'Lyr', 'Tau', 'UMa'], 'reviews come in between new ones');
  assert.equal(cards.size, START_CARDS + 2 * MORE_CARDS);
});

test('knowing a card for good moves straight on, and it comes back only now and then', () => {
  const cards = new Map();
  const shown = play(cards, 57, () => 'permanent');
  assert.deepEqual(new Set(shown).size, 57, 'every constellation seen from Stockholm, once each');
  assert.equal(trainingProgress(cards, stockholm, 88).done, true);
});

test('a card known for good stays away while play goes on with others', () => {
  const cards = new Map();
  const shown = play(cards, 100, (c) => (c === 'UMa' ? 'permanent' : 'now'));
  assert.equal(shown.filter((c) => c === 'UMa').length, 1, 'Ursa Major is not shown again within 100 cards');
  assert.ok(shown.filter((c) => c === 'Cas').length >= 3, 'while one known for now comes back');
  const back = play(cards, PERMANENT_AFTER, (c) => (c === 'UMa' ? 'permanent' : 'now'), { turn: 100 });
  assert.ok(back.includes('UMa'), 'but it does come back now and then');
});

test('a miss comes back after two others, and nothing new comes in until it is known', () => {
  const cards = new Map();
  const shown = play(cards, 8, (c, card) => (c === 'Cas' && card.n === 0 ? 'again' : 'now'));
  // UMa, Cas (missed), Ori, Cyg, Cas again; only then the next two.
  assert.deepEqual(shown.slice(0, 6), ['UMa', 'Cas', 'Ori', 'Cyg', 'Cas', 'Leo']);
});

test('the same card is never shown twice in a row while another is in play', () => {
  const cards = new Map();
  const shown = play(cards, 300, (c) => (c.length % 3 === 0 ? 'again' : 'now'));
  assert.ok(shown.every((s, k) => k === 0 || s !== shown[k - 1]));
});

test('known for now, every constellation is learnt with few showings each', () => {
  const cards = new Map();
  const views = new Map();
  let turn = 0;
  let last = -1;
  while (!trainingProgress(cards, stockholm, 88).done) {
    last = nextCard(cards, order, stockholm, turn, 0, last);
    views.set(last, (views.get(last) || 0) + 1);
    cards.set(last, grade(cards.get(last), 'now', turn, 0));
    turn++;
    assert.ok(turn < 1000);
  }
  const counts = [...views.values()];
  assert.equal(counts.length, trainingProgress(cards, stockholm, 88).goal);
  assert.ok(Math.max(...counts) <= 6, `at most six showings each (${Math.max(...counts)})`);
  assert.ok([...cards.keys()].every(stockholm), 'nothing that never rises here is asked');
});

test('when everything is known and nothing is due, practice goes on with the card due soonest', () => {
  const cards = new Map([[idx('UMa'), { level: 2, dueTurn: 50, dueAt: null, n: 3 }], [idx('Cas'), { level: 1, dueTurn: 40, dueAt: null, n: 2 }]]);
  const all = (i) => i === idx('UMa') || i === idx('Cas');
  assert.equal(id(nextCard(cards, order, all, 10, 0, -1)), 'Cas');
  assert.equal(id(nextCard(cards, order, all, 10, 0, idx('Cas'))), 'UMa');
});

test('another place changes the goal: cards that never rise there are neither asked nor counted', () => {
  const kiruna = (i) => visibilityClass(catalog.constellations[i].figureDecs, 67.86) !== 'never';
  const cards = new Map([[idx('Pup'), { level: 0, dueTurn: 0, dueAt: null, n: 1 }], [idx('PsA'), { level: PERMANENT, dueTurn: 0, dueAt: null, n: 4 }]]);
  assert.ok(!kiruna(idx('Pup')) && !kiruna(idx('PsA')));
  const first = nextCard(cards, order, kiruna, 0, 0);
  assert.ok(kiruna(first));
  assert.equal([...cards.keys()].filter(kiruna).length, START_CARDS, 'play starts afresh with four that rise there');
  const p = trainingProgress(cards, kiruna, 88);
  assert.deepEqual([p.known, p.permanent], [0, 0], 'the card known there for good does not count here');
});
