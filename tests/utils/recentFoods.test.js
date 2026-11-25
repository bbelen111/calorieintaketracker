import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECENT_FOODS_LIMIT,
  buildRecentFoods,
  formatRecentDayLabel,
  getRecentFoodKey,
  searchRecentFoods,
  toRecentDisplayFood,
} from '../../src/utils/food/recentFoods.js';

const logged = (name, timestamp, overrides = {}) => ({
  id: timestamp,
  name,
  grams: 100,
  calories: 100,
  timestamp,
  ...overrides,
});

const names = (recents) => recents.map(({ entry }) => entry.name);

test('buildRecentFoods handles an empty or missing log', () => {
  assert.deepEqual(buildRecentFoods({}), []);
  assert.deepEqual(buildRecentFoods(undefined), []);
  assert.deepEqual(
    buildRecentFoods({ '2026-03-20': { lunch: [null, { grams: 5 }] } }),
    []
  );
});

test('buildRecentFoods lists every kind of entry, latest logged first', () => {
  const recents = buildRecentFoods({
    '2026-03-20': {
      breakfast: [logged('Oats', '2026-03-20T08:00:00Z', { foodId: 'usda_1' })],
      lunch: [
        logged('Omelette', '2026-03-20T12:00:00Z', {
          foodId: 'ai_1_0',
          source: 'ai',
        }),
        logged('Soda', '2026-03-20T12:30:00Z', { foodId: 'off_0123' }),
        logged('Home soup', '2026-03-20T13:00:00Z', { grams: null }),
      ],
    },
  });

  assert.deepEqual(names(recents), ['Home soup', 'Soda', 'Omelette', 'Oats']);
  assert.equal(recents[3].mealType, 'breakfast');
  assert.equal(recents[3].dateKey, '2026-03-20');
});

test('a repeated food appears once, as its latest log', () => {
  const recents = buildRecentFoods({
    '2026-03-19': {
      lunch: [
        logged('Rice', '2026-03-19T12:00:00Z', { foodId: 'usda_2', grams: 80 }),
      ],
    },
    '2026-03-20': {
      dinner: [
        logged('Rice', '2026-03-20T19:00:00Z', {
          foodId: 'usda_2',
          grams: 220,
        }),
      ],
    },
  });

  assert.equal(recents.length, 1);
  assert.equal(recents[0].entry.grams, 220);
  assert.equal(recents[0].mealType, 'dinner');
});

test('recency follows when a food was logged, not the day it sits on', () => {
  const recents = buildRecentFoods({
    // Backfilled today onto last week.
    '2026-03-13': { lunch: [logged('Backfilled', '2026-03-20T20:00:00Z')] },
    '2026-03-20': { lunch: [logged('Earlier', '2026-03-20T12:00:00Z')] },
  });

  assert.deepEqual(names(recents), ['Backfilled', 'Earlier']);
});

test('numeric timestamps work and a missing one falls back to the day', () => {
  const recents = buildRecentFoods({
    '2026-03-18': { lunch: [logged('Undated', undefined)] },
    '2026-03-17': {
      lunch: [logged('Numeric', Date.parse('2026-03-19T12:00:00Z'))],
    },
  });

  assert.deepEqual(names(recents), ['Numeric', 'Undated']);
});

test('per-log AI and manual ids are matched by brand and name', () => {
  assert.equal(
    getRecentFoodKey({ foodId: 'ai_1_0', name: ' Egg  Omelette ' }),
    getRecentFoodKey({ foodId: 'ai_2_0', name: 'egg omelette' })
  );
  assert.equal(
    getRecentFoodKey({ foodId: 'manual_4', name: 'Soup' }),
    getRecentFoodKey({ name: 'soup' })
  );
  assert.notEqual(
    getRecentFoodKey({ name: 'Yogurt', brand: 'One' }),
    getRecentFoodKey({ name: 'Yogurt', brand: 'Two' })
  );
});

test('stable food ids keep same-named foods apart', () => {
  assert.notEqual(
    getRecentFoodKey({ foodId: 'usda_1', name: 'Rice' }),
    getRecentFoodKey({ foodId: 'usda_2', name: 'Rice' })
  );
});

test('searchRecentFoods matches every word across brand and name', () => {
  const recents = buildRecentFoods({
    '2026-03-20': {
      lunch: [
        logged('Greek yogurt', 3, { brand: 'Chobani' }),
        logged('Greek salad', 2),
        logged('Rice', 1),
      ],
    },
  });

  assert.deepEqual(names(searchRecentFoods(recents, 'greek')), [
    'Greek yogurt',
    'Greek salad',
  ]);
  assert.deepEqual(names(searchRecentFoods(recents, ' chobani  yog ')), [
    'Greek yogurt',
  ]);
  assert.deepEqual(searchRecentFoods(recents, 'pizza'), []);
});

test('the list is capped but search still reaches older foods', () => {
  const recents = buildRecentFoods({
    '2026-03-20': {
      lunch: [
        logged('Oldest porridge', 1),
        ...Array.from({ length: RECENT_FOODS_LIMIT }, (_, index) =>
          logged(`Food ${index}`, index + 2)
        ),
      ],
    },
  });

  const shown = names(searchRecentFoods(recents, ''));
  assert.equal(shown.length, RECENT_FOODS_LIMIT);
  assert.equal(shown.includes('Oldest porridge'), false);
  assert.deepEqual(names(searchRecentFoods(recents, 'porridge')), [
    'Oldest porridge',
  ]);
});

test('formatRecentDayLabel reads naturally', () => {
  const today = '2026-03-01';

  assert.equal(formatRecentDayLabel(today, today), 'Today');
  assert.equal(formatRecentDayLabel('2026-02-28', today), 'Yesterday');
  assert.equal(formatRecentDayLabel('2026-02-03', today), 'Feb 3');
  assert.equal(formatRecentDayLabel('2025-12-31', today), 'Dec 31, 2025');
});

test('toRecentDisplayFood recovers the source from what an entry records', () => {
  const sourceOf = (entry) => toRecentDisplayFood(entry).source;

  assert.equal(sourceOf({ foodId: 'recipe_1', grams: 300 }), 'recipe');
  assert.equal(sourceOf({ foodId: 'user_1', grams: 100 }), 'user');
  assert.equal(sourceOf({ foodId: 'ai_1_0', grams: 100 }), 'ai');
  assert.equal(sourceOf({ source: 'ai', grams: 100 }), 'ai');
  assert.equal(sourceOf({ grams: null }), 'manual');
  assert.equal(sourceOf({ foodId: 'usda_1', grams: 100 }), null);
});
