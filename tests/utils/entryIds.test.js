import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectDayEntryIds,
  repairDayEntryIds,
  resolveEntryId,
} from '../../src/utils/food/entryIds.js';

const entry = (id, name = `entry ${id}`) => ({ id, name });

const idsOf = (meals) =>
  Object.values(meals)
    .flat()
    .map((item) => item.id);

test('collectDayEntryIds reads every meal and ignores missing ids', () => {
  const ids = collectDayEntryIds({
    breakfast: [entry(1), entry(undefined)],
    lunch: [entry('a'), null],
    dinner: 'not a list',
  });

  assert.deepEqual([...ids], [1, 'a']);
});

test('resolveEntryId keeps a free id, including a string one', () => {
  assert.equal(resolveEntryId(7, new Set([1])), 7);
  assert.equal(resolveEntryId('entry-1', new Set()), 'entry-1');
});

test('resolveEntryId replaces a taken or missing id with an unused number', () => {
  assert.equal(resolveEntryId(1, new Set([1]), 5000), 5000);
  assert.equal(resolveEntryId(undefined, new Set(), 5000), 5000);
  assert.equal(resolveEntryId(1, new Set([1, 5000, 5001]), 5000), 5002);
});

test('repairDayEntryIds returns the same object when ids are already unique', () => {
  const meals = { breakfast: [entry(1)], lunch: [entry(2)] };

  assert.equal(repairDayEntryIds(meals), meals);
});

test('repairDayEntryIds keeps the first holder and renumbers the repeats', () => {
  const meals = {
    breakfast: [entry(1, 'oats')],
    lunch: [entry(1, 'rice'), entry(2, 'chicken'), entry(1, 'beans')],
  };

  const repaired = repairDayEntryIds(meals);

  assert.deepEqual(idsOf(repaired), [1, 3, 2, 4]);
  assert.deepEqual(
    repaired.lunch.map((item) => item.name),
    ['rice', 'chicken', 'beans']
  );
  // The input is left alone.
  assert.deepEqual(idsOf(meals), [1, 1, 2, 1]);
});

test('repairDayEntryIds is deterministic', () => {
  const meals = {
    lunch: [entry(1), entry(1), entry(undefined)],
    dinner: [entry(1)],
  };

  assert.deepEqual(repairDayEntryIds(meals), repairDayEntryIds(meals));
  assert.equal(new Set(idsOf(repairDayEntryIds(meals))).size, 4);
});
