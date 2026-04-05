import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOOD_SEARCH_SOURCE,
  searchFoodsHierarchically,
} from '../../src/services/foodSearch.js';

test('local mode returns local results without online fallback when local has matches', async () => {
  const calls = [];

  const result = await searchFoodsHierarchically({
    mode: 'local',
    query: 'chicken',
    isOnline: true,
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

test('local mode falls back to FatSecret when local is empty', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'local',
    query: 'protein bar',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchFatSecret: async () => ({
        foods: [{ id: 'fs_1', name: 'Protein Bar' }],
      }),
      searchOpenFoodFacts: async () => ({ foods: [] }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.FATSECRET);
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.sourcesTried, ['local', 'fatsecret']);
  assert.equal(result.results[0].id, 'fs_1');
});

test('local mode falls back to OpenFoodFacts when FatSecret has no results', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'local',
    query: 'rare snack',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchFatSecret: async () => ({ foods: [] }),
      searchOpenFoodFacts: async () => ({
        foods: [{ id: 'off_1', name: 'Rare Snack' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.sourcesTried, [
    'local',
    'fatsecret',
    'openfoodfacts',
  ]);
  assert.equal(result.results[0].id, 'off_1');
});

test('online mode returns empty for short queries', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'online',
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

test('online mode records source errors and continues fallback', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'online',
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
