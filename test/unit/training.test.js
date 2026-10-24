import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { visibilityClass } from '../../src/astro/visibility.js';
import {
  FIRST, grade, INTERVALS, introductionOrder, KNOWN_BOX, MORE_CARDS, nextCard, START_CARDS, trainingProgress,
} from '../../src/sky/training.js';

const catalog = buildCatalog();
const order = introductionOrder(catalog.constellations, catalog.stars.mag);
const id = (i) => catalog.constellations[i].id;
const stockholm = (i) => visibilityClass(catalog.constellations[i].figureDecs, 59.33) !== 'never';

test('every constellation comes into play once, the striking ones first', () => {
  assert.equal(order.length, 88);
  assert.equal(new Set(order).size, 88);
  assert.deepEqual(order.slice(0, FIRST.length).map(id), FIRST);
  assert.deepEqual(order.slice(0, 4).map(id), ['UMa', 'Cas', 'Ori', 'Cyg']);
  // Faint, late-named constellations come last among those seen from Stockholm.
  const seen = order.filter(stockholm).map(id);
  assert.ok(seen.indexOf('Sex') > seen.length - 10 && seen.indexOf('LMi') > 30, seen.join(' '));
});

const MINUTE = 60_000;
const DAY = 86_400_000;

test('the rests grow from nothing through minutes and days to about two months', () => {
  assert.equal(INTERVALS[0], 0);
  INTERVALS.slice(1).forEach((ms, k) => assert.ok(ms > INTERVALS[k], `box ${k + 1} rests longer than box ${k}`));
  assert.equal(INTERVALS[1], MINUTE);
  assert.equal(INTERVALS[KNOWN_BOX], 10 * MINUTE);
  assert.equal(INTERVALS[KNOWN_BOX + 1], DAY, 'a known card rests a day after its next right answer');
  assert.equal(INTERVALS.at(-1), 60 * DAY);
});

test('answers move cards between boxes', () => {
  let now = 1_000_000;
  let card = grade(undefined, 'good', now);
  assert.deepEqual(card, { box: 1, due: now + MINUTE, n: 1 });
  now = card.due;
  card = grade(card, 'easy', now);
  assert.deepEqual(card, { box: 3, due: now + DAY, n: 2 });
  card = grade(card, 'again', now);
  assert.deepEqual(card, { box: 0, due: now, n: 3 });
  let top = { box: INTERVALS.length - 1, due: 0, n: 9 };
  top = grade(top, 'easy', now);
  assert.equal(top.box, INTERVALS.length - 1, 'the last box is as far as it goes');
});

test('a card practised before it is due keeps its box and its rest, but a miss still counts', () => {
  const card = { box: 2, due: 5000, n: 4 };
  assert.deepEqual(grade(card, 'good', 1000), { box: 2, due: 5000, n: 5 });
  assert.deepEqual(grade(card, 'easy', 1000), { box: 2, due: 5000, n: 5 });
  assert.deepEqual(grade(card, 'again', 1000), { box: 0, due: 1000, n: 5 });
  assert.equal(grade(card, 'good', 5000).box, 3, 'once due, a right answer moves it up');
  assert.equal(grade({ box: 0, due: 9000, n: 0 }, 'good', 1000).box, 1, 'a new card moves up at once');
});

test('play starts with four, and two more come in once those are known', () => {
  const cards = new Map();
  let now = 0;
  let last = -1;
  const shown = [];
  const answer = (result) => {
    last = nextCard(cards, order, stockholm, now, last);
    shown.push(id(last));
    cards.set(last, grade(cards.get(last), result, now));
    now += 20_000;
  };
  answer('good');
  assert.equal(cards.size, START_CARDS);
  assert.deepEqual([...cards.keys()].map(id), ['UMa', 'Cas', 'Ori', 'Cyg']);
  for (let k = 0; k < 7; k++) answer('good');
  assert.equal(cards.size, START_CARDS, 'nothing new before all four are known');
  assert.ok([...cards.values()].every((c) => c.box >= KNOWN_BOX));
  answer('good');
  assert.equal(cards.size, START_CARDS + MORE_CARDS);
  assert.deepEqual(shown.slice(0, 4), ['UMa', 'Cas', 'Ori', 'Cyg'], 'new cards in order');
  assert.ok(shown.every((s, k) => k === 0 || s !== shown[k - 1]), 'never the same card twice in a row');
});

test('a card answered wrong comes back soon, after another one', () => {
  const cards = new Map();
  const first = nextCard(cards, order, stockholm, 0);
  cards.set(first, grade(cards.get(first), 'good', 1));
  const missed = nextCard(cards, order, stockholm, 1000, first);
  cards.set(missed, grade(cards.get(missed), 'again', 1000));
  const between = nextCard(cards, order, stockholm, 2000, missed);
  assert.notEqual(between, missed, 'not straight away');
  cards.set(between, grade(cards.get(between), 'good', 2000));
  // The fourth card has waited since play began, longer than the missed one, but the miss goes first.
  assert.equal(nextCard(cards, order, stockholm, 3000, between), missed);
});

test('cards that are not due yet are still practised, soonest first', () => {
  const cards = new Map();
  const ids = ['UMa', 'Cas', 'Ori', 'Cyg'].map((c) => catalog.byId.get(c).index);
  ids.forEach((i, k) => cards.set(i, { box: 1, due: 10_000 + k, n: 1 }));
  assert.equal(nextCard(cards, order, stockholm, 0, -1), ids[0]);
  assert.equal(nextCard(cards, order, stockholm, 0, ids[0]), ids[1]);
});

test('another place changes the goal: cards that never rise there are neither asked nor counted', () => {
  const kiruna = (i) => visibilityClass(catalog.constellations[i].figureDecs, 67.86) !== 'never';
  const idx = (c) => catalog.byId.get(c).index;
  const cards = new Map([[idx('Pup'), { box: 0, due: 0, n: 1 }], [idx('PsA'), { box: 3, due: 0, n: 4 }]]);
  assert.ok(!kiruna(idx('Pup')) && !kiruna(idx('PsA')));
  const first = nextCard(cards, order, kiruna, 1000);
  assert.ok(kiruna(first));
  assert.equal([...cards.keys()].filter(kiruna).length, START_CARDS, 'play starts afresh with four that rise there');
  const p = trainingProgress(cards, kiruna, 88);
  assert.equal(p.known, 0, 'the known card that never rises there does not count');
  assert.equal(p.goal, catalog.constellations.filter((c) => kiruna(c.index)).length);
});

test('practice reaches every constellation seen from here, and progress counts it', () => {
  const cards = new Map();
  let now = 0;
  let last = -1;
  for (let step = 0; step < 2000; step++) {
    last = nextCard(cards, order, stockholm, now, last);
    cards.set(last, grade(cards.get(last), 'good', now));
    now += 4000;
    if (trainingProgress(cards, stockholm, 88).done) break;
  }
  const p = trainingProgress(cards, stockholm, 88);
  assert.equal(p.done, true);
  assert.equal(p.known, p.goal);
  assert.equal(p.goal, catalog.constellations.filter((c) => stockholm(c.index)).length);
  assert.ok([...cards.keys()].every(stockholm), 'nothing that never rises here is asked');
});
