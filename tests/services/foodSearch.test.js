import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOOD_SEARCH_SOURCE,
  resolveAiFoodEntry,
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
      searchUsda: async () => {
        calls.push('usda');
        return { foods: [{ id: 'usda_1', name: 'Chicken Product' }] };
      },
    },
  });

  assert.deepEqual(calls, ['local']);
  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.results.length, 1);
});

test('searchFoodsLocal includes pinned foods not present in base local results', async () => {
  const result = await searchFoodsLocal({
    query: '',
    limit: 1,
    pinnedFoodIds: ['food_honey'],
    dependencies: {
      searchLocal: async () => [
        { id: 'food_almonds', name: 'Roasted Honey Almonds' },
      ],
      getFoodsByIds: async (ids) => {
        assert.deepEqual(ids, ['food_honey']);
        return [{ id: 'food_honey', name: 'Honey' }];
      },
      searchUsda: async () => ({ foods: [] }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.deepEqual(
    result.results.map((food) => food.id),
    ['food_honey', 'food_almonds']
  );
  assert.equal(result.localOffset, 0);
  assert.equal(result.nextOffset, 1);
  assert.equal(result.localRowsCount, 1);
  assert.equal(result.hasMoreLocal, true);
});

test('searchFoodsLocal supports offset pagination and skips pinned hydration on later pages', async () => {
  const calls = [];

  const result = await searchFoodsLocal({
    query: 'honey',
    limit: 2,
    offset: 2,
    pinnedFoodIds: ['food_honey'],
    dependencies: {
      searchLocal: async ({ offset }) => {
        calls.push(`local:${offset}`);
        return [{ id: 'food_3', name: 'Honey Oats' }];
      },
      getFoodsByIds: async () => {
        calls.push('pinned');
        return [{ id: 'food_honey', name: 'Honey' }];
      },
      searchUsda: async () => ({ foods: [] }),
    },
  });

  assert.deepEqual(calls, ['local:2']);
  assert.deepEqual(
    result.results.map((food) => food.id),
    ['food_3']
  );
  assert.equal(result.localOffset, 2);
  assert.equal(result.nextOffset, 3);
  assert.equal(result.localRowsCount, 1);
  assert.equal(result.hasMoreLocal, false);
});

test('searchFoodsOnline uses USDA results', async () => {
  const result = await searchFoodsOnline({
    query: 'rare snack',
    dependencies: {
      searchUsda: async () => ({
        foods: [{ id: 'usda_1', name: 'Rare Snack' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.sourcesTried, ['usda']);
  assert.equal(result.results[0].id, 'usda_1');
});

test('searchFoodsOnline returns empty for short queries', async () => {
  const result = await searchFoodsOnline({
    query: 'a',
    dependencies: {
      searchUsda: async () => ({ foods: [{ id: 'usda_1' }] }),
    },
  });

  assert.equal(result.results.length, 0);
  assert.equal(result.source, FOOD_SEARCH_SOURCE.USDA);
  assert.deepEqual(result.sourcesTried, []);
});

test('searchFoodsOnline records source errors', async () => {
  const result = await searchFoodsOnline({
    query: 'cereal',
    dependencies: {
      searchUsda: async () => {
        throw new Error('usda down');
      },
    },
  });

  assert.equal(result.results.length, 0);
  assert.deepEqual(result.sourcesTried, ['usda']);
  assert.equal(
    result.errorsBySource[FOOD_SEARCH_SOURCE.USDA],
    'usda down'
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
      searchUsda: async () => {
        calls.push('usda');
        return { foods: [{ id: 'usda_1', name: 'Chicken Product' }] };
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
      searchUsda: async () => ({
        foods: [{ id: 'usda_match', name: 'Cacao Tablet', category: 'fats' }],
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.matchedFood?.name, 'Cacao Tablet');
  assert.equal(result.queryUsed, 'cacao tablet');
  assert.equal(result.fallbackUsed, true);
});

test('resolveAiFoodLookup falls back to grounded web lookup when local and USDA miss', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchUsda: async () => ({ foods: [] }),
      searchGrounded: async () => ({
        name: 'Rare Local Dessert',
        per100g: {
          calories: 320,
          protein: 4,
          carbs: 45,
          fats: 14,
        },
        confidence: 'low',
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
  assert.equal(result.matchedFood?.name, 'Rare Local Dessert');
  assert.equal(result.matchedFood?.per100g?.calories, 320);
  assert.equal(result.fallbackUsed, true);
});

test('resolveAiFoodEntry uses lookup per100g when resolved metadata is provided', async () => {
  const { verifiedEntry } = await resolveAiFoodEntry({
    entry: {
      name: 'Chicken Breast',
      grams: 150,
      calories: 300,
      protein: 20,
      carbs: 0,
      fats: 5,
      confidence: 'low',
    },
    lookupMeta: {
      status: 'resolved',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      matchConfidence: 'high',
      matchedFood: {
        per100g: {
          calories: 165,
          protein: 31,
          carbs: 0,
          fats: 3.6,
        },
      },
    },
  });

  assert.equal(verifiedEntry.name, 'Chicken Breast');
  assert.equal(verifiedEntry.calories, 248);
  assert.equal(verifiedEntry.protein, 46.5);
  assert.equal(verifiedEntry.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(verifiedEntry.portionResolutionMethod, 'explicit_grams');
  assert.equal(verifiedEntry.portionAssumed, false);
});

test('resolveAiFoodEntry falls back to entry estimate when lookup is unresolved', async () => {
  const { verifiedEntry } = await resolveAiFoodEntry({
    entry: {
      name: 'Mystery Stew',
      grams: 200,
      calories: 300,
      protein: 12,
      carbs: 30,
      fats: 10,
      confidence: 'medium',
    },
    lookupMeta: {
      status: 'no_match',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      matchConfidence: 'low',
      matchedFood: null,
    },
  });

  assert.equal(verifiedEntry.calories, 300);
  assert.equal(verifiedEntry.protein, 12);
  assert.equal(verifiedEntry.carbs, 30);
  assert.equal(verifiedEntry.fats, 10);
  assert.equal(verifiedEntry.source, 'estimate');
});

test('searchFoodsHierarchically local wrapper maps to local-only behavior', async () => {
  const result = await searchFoodsHierarchically({
    mode: 'local',
    query: 'oats',
    dependencies: {
      searchLocal: async () => [{ id: 'oats_1', name: 'Rolled Oats' }],
      searchUsda: async () => ({
        foods: [{ id: 'usda_1', name: 'Oats Product' }],
      }),
    },
  });

  assert.equal(result.source, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.results.length, 1);
  assert.equal(result.fallbackUsed, false);
});
