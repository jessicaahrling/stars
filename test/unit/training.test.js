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

test('answers move cards between boxes', () => {
  const now = 1_000_000;
  let card = grade(undefined, 'good', now);
  assert.deepEqual(card, { box: 1, due: now + INTERVALS[1], n: 1 });
  card = grade(card, 'easy', now);
  assert.equal(card.box, 3);
  assert.equal(card.due, now + INTERVALS[3]);
  card = grade(card, 'again', now);
  assert.deepEqual(card, { box: 0, due: now, n: 3 });
  let top = { box: INTERVALS.length - 1, due: 0, n: 9 };
  top = grade(top, 'easy', now);
  assert.equal(top.box, INTERVALS.length - 1, 'the last box is as far as it goes');
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
    now += 5000;
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
  cards.set(first, grade(cards.get(first), 'again', 0));
  const second = nextCard(cards, order, stockholm, 1000, first);
  assert.notEqual(second, first);
  cards.set(second, grade(cards.get(second), 'good', 1000));
  assert.equal(nextCard(cards, order, stockholm, 2000, second), first, 'the missed one has waited longest');
});

test('cards that are not due yet are still practised, soonest first', () => {
  const cards = new Map();
  const ids = ['UMa', 'Cas', 'Ori', 'Cyg'].map((c) => catalog.byId.get(c).index);
  ids.forEach((i, k) => cards.set(i, { box: 1, due: 10_000 + k, n: 1 }));
  assert.equal(nextCard(cards, order, stockholm, 0, -1), ids[0]);
  assert.equal(nextCard(cards, order, stockholm, 0, ids[0]), ids[1]);
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
