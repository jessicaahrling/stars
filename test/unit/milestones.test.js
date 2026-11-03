import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../../src/sky/catalog.js';
import { chunksOf } from '../../src/sky/curriculum.js';
import { afterPractice, PRACTICE_AGAIN_AFTER, practiceRound, stageLearnt } from '../../src/sky/training.js';

const catalog = buildCatalog();
const chunks = chunksOf(catalog);
const known = (indices) => new Map(indices.map((i) => [i, { level: 1, dueTurn: 100, dueAt: null, n: 1 }]));
const upTo = (s) => chunks.filter((ch) => ch.stage <= s).flatMap((ch) => ch.members);

test('a step is learnt when every group of it, and of the steps before, is known', () => {
  assert.equal(stageLearnt(new Map(), chunks, 1), false);
  const winter = known(upTo(1));
  assert.equal(stageLearnt(winter, chunks, 1), true, 'the winter sky');
  assert.equal(stageLearnt(winter, chunks, 2), false, 'not yet the rest of Sweden');
  // One member missed again: the step is no longer learnt.
  const slipped = new Map(winter);
  slipped.set(upTo(1)[5], { level: 0, dueTurn: 3, dueAt: null, n: 4 });
  assert.equal(stageLearnt(slipped, chunks, 1), false);
  // Sweden's step takes the winter sky with it; the rest of Sweden alone is not enough.
  const restOfSweden = known(chunks.filter((ch) => ch.stage === 2).flatMap((ch) => ch.members));
  assert.equal(stageLearnt(restOfSweden, chunks, 2), false);
  assert.equal(stageLearnt(known(upTo(2)), chunks, 2), true);
  assert.equal(stageLearnt(known(upTo(3)), chunks, 3), true, 'the whole sky');
  assert.equal(upTo(3).length, 88);
});

test('a practice round takes every constellation once, shuffled', () => {
  const members = upTo(1);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const round = practiceRound(members, random);
  assert.deepEqual([...round].sort((a, b) => a - b), [...members].sort((a, b) => a - b));
  assert.notDeepEqual(round, members, 'in another order');
  assert.deepEqual(members, upTo(1), 'the members themselves are left as they were');
});

test('in a practice round a card answered is done with, and a miss comes back after a few others', () => {
  assert.equal(PRACTICE_AGAIN_AFTER, 3);
  assert.deepEqual(afterPractice([1, 2, 3, 4, 5, 6], 'now'), [2, 3, 4, 5, 6]);
  assert.deepEqual(afterPractice([1, 2, 3, 4, 5, 6], 'permanent'), [2, 3, 4, 5, 6]);
  assert.deepEqual(afterPractice([1, 2, 3, 4, 5, 6], 'again'), [2, 3, 4, 1, 5, 6]);
  // Near the end it comes back last, and alone it comes straight back.
  assert.deepEqual(afterPractice([1, 2], 'again'), [2, 1]);
  assert.deepEqual(afterPractice([1], 'again'), [1]);
  assert.deepEqual(afterPractice([1], 'now'), []);
  // A round always ends: each card is answered right at some point.
  let queue = [1, 2, 3, 4];
  let turns = 0;
  const misses = new Map([[2, 2], [4, 1]]);
  while (queue.length) {
    const card = queue[0];
    const miss = (misses.get(card) || 0) > 0;
    if (miss) misses.set(card, misses.get(card) - 1);
    queue = afterPractice(queue, miss ? 'again' : 'now');
    turns++;
  }
  assert.equal(turns, 7);
});
