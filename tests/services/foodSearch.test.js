import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOOD_SEARCH_SOURCE,
  resolveAiFoodLookup,
  searchFoodsLocal,
  searchFoodsOnline,
  searchFoodsHierarchically,
} from '../../src/services/foodSearch.js';

test('searchFoodsLocal returns local results only', async () => {
  const calls = [];

  const result = await searchFoodsLocal({
    query: 'chicken',
    dependencies: {
      searchLocal: async () => {
        calls.push('local');
        return [{ id: 'local_1', name: 'Chicken Breast' }];
      },
      searchFatSecret: async () => {
        calls.push('fatsecret');
        return { foods: [{ id: 'fs_1', name: 'Chicken' }] };
      },
      searchOpenFoodFacts: async () => {
        calls.push('openfoodfacts');
        return { foods: [{ id: 'off_1', name: 'Chicken Product' }] };
      },
    },
  });

  assert.deepEqual(calls, ['local']);
  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.results.length, 1);
});

test('searchFoodsOnline falls back to OpenFoodFacts when FatSecret has no matches', async () => {
  const result = await searchFoodsOnline({
    query: 'rare snack',
    dependencies: {
      searchFatSecret: async () => ({ foods: [] }),
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_1', name: 'Rare Snack' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.sourcesTried, ['fatsecret', 'openfoodfacts']);
  assert.equal(result.results[0].id, 'off_1');
});

test('searchFoodsOnline returns empty for short queries', async () => {
  const result = await searchFoodsOnline({
    query: 'a',
    dependencies: {
      searchFatSecret: async () => ({ foods: [{ id: 'fs_1' }] }),
      searchOpenFoodFacts: async () => ({ foods: [{ id: 'off_1' }] }),
    },
  });

  assert.equal(result.results.length, 0);
  assert.equal(result.source, FOOD_SEARCH_SOURCE.FATSECRET);
  assert.deepEqual(result.sourcesTried, []);
});

test('searchFoodsOnline records source errors and continues fallback', async () => {
  const result = await searchFoodsOnline({
    query: 'cereal',
    dependencies: {
      searchFatSecret: async () => {
        throw new Error('fatsecret down');
      },
      searchOpenFoodFacts: async () => ({ foods: [] }),
    },
  });

  assert.equal(result.results.length, 0);
  assert.deepEqual(result.sourcesTried, ['fatsecret', 'openfoodfacts']);
  assert.equal(
    result.errorsBySource[FOOD_SEARCH_SOURCE.FATSECRET],
    'fatsecret down'
  );
});

test('resolveAiFoodLookup keeps strong local match without online fallback', async () => {
  const calls = [];

  const result = await resolveAiFoodLookup({
    entryName: 'chicken breast',
    isOnline: true,
    dependencies: {
      searchLocal: async () => {
        calls.push('local');
        return [
          { id: 'local_chicken', name: 'Chicken Breast', category: 'protein' },
          { id: 'local_other', name: 'Rice', category: 'carbs' },
        ];
      },
      searchFatSecret: async () => {
        calls.push('fatsecret');
        return { foods: [{ id: 'fs_1', name: 'Chicken' }] };
      },
      searchOpenFoodFacts: async () => {
        calls.push('openfoodfacts');
        return { foods: [{ id: 'off_1', name: 'Chicken Product' }] };
      },
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.matchConfidence, 'high');
  assert.equal(result.matchedFood?.name, 'Chicken Breast');
  assert.deepEqual(calls, ['local']);
});

test('resolveAiFoodLookup uses online fallback when local match is weak', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'tableya',
    lookupTerms: ['cacao tablet'],
    isOnline: true,
    dependencies: {
      searchLocal: async ({ query }) => {
        if (query === 'tableya') {
          return [
            {
              id: 'local_wrong',
              name: 'Maple Syrup',
              category: 'carbs',
            },
          ];
        }
        return [];
      },
      searchFatSecret: async () => ({ foods: [] }),
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_match', name: 'Cacao Tablet', category: 'fats' }],
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  assert.equal(result.matchedFood?.name, 'Cacao Tablet');
  assert.equal(result.queryUsed, 'cacao tablet');
  assert.equal(result.fallbackUsed, true);
});

test('searchFoodsHierarchically local wrapper maps to local-only behavior', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'local',
    query: 'oats',
    dependencies: {
      searchLocal: async () => [{ id: 'oats_1', name: 'Rolled Oats' }],
      searchFatSecret: async () => ({ foods: [{ id: 'fs_1', name: 'Oats' }] }),
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_1', name: 'Oats Product' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.results.length, 1);
  assert.equal(result.fallbackUsed, false);
});
