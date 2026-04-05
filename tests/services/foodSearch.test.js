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

test('searchFoodsOnline uses OpenFoodFacts results', async () => {
  const result = await searchFoodsOnline({
    query: 'rare snack',
    dependencies: {
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_1', name: 'Rare Snack' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.sourcesTried, ['openfoodfacts']);
  assert.equal(result.results[0].id, 'off_1');
});

test('searchFoodsOnline returns empty for short queries', async () => {
  const result = await searchFoodsOnline({
    query: 'a',
    dependencies: {
      searchOpenFoodFacts: async () => ({ foods: [{ id: 'off_1' }] }),
    },
  });

  assert.equal(result.results.length, 0);
  assert.equal(result.source, FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  assert.deepEqual(result.sourcesTried, []);
});

test('searchFoodsOnline records source errors', async () => {
  const result = await searchFoodsOnline({
    query: 'cereal',
    dependencies: {
      searchOpenFoodFacts: async () => {
        throw new Error('openfoodfacts down');
      },
    },
  });

  assert.equal(result.results.length, 0);
  assert.deepEqual(result.sourcesTried, ['openfoodfacts']);
  assert.equal(
    result.errorsBySource[FOOD_SEARCH_SOURCE.OPENFOODFACTS],
    'openfoodfacts down'
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
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_1', name: 'Oats Product' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.results.length, 1);
  assert.equal(result.fallbackUsed, false);
});
