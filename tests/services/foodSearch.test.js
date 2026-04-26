import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeExtractedFoodEntries,
  FOOD_SEARCH_SOURCE,
  recordAcceptedAiFoodLookup,
  resetAcceptedAiLookupReuseCache,
  resetAiLookupSessionCache,
  resolveAiGroundedBatch,
  resolveAiFoodEntry,
  resolveAiFoodLookup,
  searchFoodsLocal,
  searchFoodsOnline,
  searchFoodsHierarchically,
} from '../../src/services/foodSearch.js';
import { AI_RAG_QUALITY_MODE } from '../../src/services/aiRagQuality.js';

test.beforeEach(() => {
  resetAiLookupSessionCache();
  resetAcceptedAiLookupReuseCache();
});

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
  assert.equal(result.errorsBySource[FOOD_SEARCH_SOURCE.USDA], 'usda down');
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
          {
            id: 'local_chicken',
            name: 'Chicken Breast',
            category: 'protein',
            per100g: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
          },
          {
            id: 'local_other',
            name: 'Rice',
            category: 'carbs',
            per100g: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
          },
        ];
      },
      searchUsda: async () => {
        calls.push('usda');
        return {
          foods: [
            {
              id: 'usda_1',
              name: 'Chicken Product',
              per100g: { calories: 170, protein: 28, carbs: 1, fats: 5 },
            },
          ],
        };
      },
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.matchConfidence, 'high');
  assert.equal(result.decision, 'accept_local');
  assert.equal(result.decisionReason, 'strong_local_match');
  assert.equal(result.matchedFood?.name, 'Chicken Breast');
  assert.equal(result.confidenceComponents?.trustMultiplier, 1);
  assert.ok(result.weightedMatchScore >= result.matchScore - 0.0001);
  assert.deepEqual(calls, ['local']);
});

test('resolveAiFoodLookup prioritizes branded result when query has explicit brand intent', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'heinz ketchup',
    lookupTerms: ['heinz tomato ketchup'],
    isOnline: false,
    dependencies: {
      searchLocal: async () => [
        {
          id: 'local_generic',
          name: 'Tomato Ketchup',
          brand: null,
          per100g: { calories: 112, protein: 1.3, carbs: 26, fats: 0.2 },
        },
        {
          id: 'local_brand',
          name: 'Tomato Ketchup',
          brand: 'Heinz',
          per100g: { calories: 112, protein: 1.3, carbs: 26, fats: 0.2 },
        },
      ],
      searchUsda: async () => ({ foods: [] }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.matchedFood?.brand, 'Heinz');
});

test('resolveAiFoodLookup keeps generic result for non-branded query intent', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'ketchup',
    lookupTerms: ['tomato ketchup'],
    isOnline: false,
    dependencies: {
      searchLocal: async () => [
        {
          id: 'local_generic',
          name: 'Ketchup',
          brand: null,
          per100g: { calories: 112, protein: 1.3, carbs: 26, fats: 0.2 },
        },
        {
          id: 'local_brand',
          name: 'Heinz Condiment',
          brand: 'Heinz',
          per100g: { calories: 112, protein: 1.3, carbs: 26, fats: 0.2 },
        },
      ],
      searchUsda: async () => ({ foods: [] }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.matchedFood?.name, 'Ketchup');
});

test('resolveAiFoodLookup forwards brand preference hint to local search dependency', async () => {
  const receivedPreferBrandMatches = [];

  await resolveAiFoodLookup({
    entryName: 'coca cola zero',
    isOnline: false,
    dependencies: {
      searchLocal: async ({ preferBrandMatches }) => {
        receivedPreferBrandMatches.push(preferBrandMatches);
        return [{ id: 'local_1', name: 'Coca Cola Zero', brand: 'Coca Cola' }];
      },
      searchUsda: async () => ({ foods: [] }),
    },
  });

  assert.equal(receivedPreferBrandMatches.length > 0, true);
  assert.equal(receivedPreferBrandMatches.every(Boolean), true);
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
              per100g: { calories: 260, protein: 0, carbs: 67, fats: 0 },
            },
          ];
        }
        return [];
      },
      searchUsda: async () => ({
        foods: [
          {
            id: 'usda_match',
            name: 'Cacao Tablet',
            category: 'fats',
            per100g: { calories: 400, protein: 12, carbs: 30, fats: 25 },
          },
        ],
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.matchedFood?.name, 'Cacao Tablet');
  assert.equal(result.queryUsed, 'cacao tablet');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.escalationAttempted, true);
  assert.equal(result.escalationReason, 'no_close_match');
  assert.equal(result.confidenceComponents?.trustMultiplier, 0.98);
  assert.ok(result.weightedMatchScore <= result.matchScore);
});

test('resolveAiFoodLookup ranking respects source preference weights', async () => {
  const dependencies = {
    searchLocal: async () => [
      {
        id: 'local_match',
        name: 'Coconut Water',
        per100g: { calories: 19, protein: 0.7, carbs: 3.7, fats: 0.2 },
      },
    ],
    searchUsda: async () => ({
      foods: [
        {
          id: 'usda_match',
          name: 'Coconut Water Beverage',
          per100g: { calories: 20, protein: 0.6, carbs: 4, fats: 0.1 },
        },
      ],
    }),
  };

  const result = await resolveAiFoodLookup({
    entryName: 'coconut water',
    lookupTerms: ['coconut water drink'],
    isOnline: true,
    sourcePreferenceWeights: {
      local: 0.85,
      usda: 1.15,
      ai_web_search: 1,
      estimate: 1,
    },
    dependencies,
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.decisionReason, 'strong_local_match');
});

test('resolveAiFoodLookup hard-reuses previously accepted match and bypasses USDA', async () => {
  const usdaCalls = [];

  recordAcceptedAiFoodLookup({
    entry: {
      name: 'Chicken Breast',
      lookupTerms: ['grilled chicken breast'],
      category: 'protein',
    },
    lookupMeta: {
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: 'grilled chicken breast',
      matchScore: 0.94,
      matchedFood: {
        name: 'Chicken Breast',
        category: 'protein',
        subcategory: 'poultry',
        per100g: {
          calories: 165,
          protein: 31,
          carbs: 0,
          fats: 3.6,
        },
      },
    },
  });

  const result = await resolveAiFoodLookup({
    entryName: 'Chicken Breast',
    lookupTerms: ['grilled chicken breast'],
    entryCategory: 'protein',
    isOnline: true,
    dependencies: {
      searchLocal: async () => {
        throw new Error('local should not run when accepted history matches');
      },
      searchUsda: async () => {
        usdaCalls.push('usda');
        return { foods: [] };
      },
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.acceptedFromHistory, true);
  assert.equal(result.decisionReason, 'accepted_history_match');
  assert.deepEqual(usdaCalls, []);
});

test('resolveAiFoodLookup accepts a usable local match without USDA', async () => {
  const calls = [];

  const result = await resolveAiFoodLookup({
    entryName: 'plain yogurt greek style',
    isOnline: true,
    dependencies: {
      searchLocal: async () => {
        calls.push('local');
        return [
          {
            id: 'local_1',
            name: 'Plain Yogurt Greek Style',
            per100g: { calories: 59, protein: 10, carbs: 3.6, fats: 0.4 },
          },
          {
            id: 'local_2',
            name: 'Fruit Yogurt',
            per100g: { calories: 90, protein: 4, carbs: 15, fats: 1 },
          },
        ];
      },
      searchUsda: async () => {
        calls.push('usda');
        return { foods: [] };
      },
    },
  });

  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.decision, 'accept_local');
  assert.deepEqual(calls, ['local']);
});

test('resolveAiFoodLookup escalates ambiguous local candidates to USDA', async () => {
  const calls = [];

  const result = await resolveAiFoodLookup({
    entryName: 'protein bar',
    isOnline: true,
    dependencies: {
      searchLocal: async () => {
        calls.push('local');
        return [
          {
            id: 'local_1',
            name: 'Protein Bar Chocolate',
            per100g: { calories: 380, protein: 30, carbs: 35, fats: 12 },
          },
          {
            id: 'local_2',
            name: 'Protein Bar Choco',
            per100g: { calories: 390, protein: 29, carbs: 34, fats: 13 },
          },
        ];
      },
      searchUsda: async () => {
        calls.push('usda');
        return {
          foods: [
            {
              id: 'usda_1',
              name: 'Protein Bar',
              per100g: { calories: 385, protein: 30, carbs: 34, fats: 12 },
            },
          ],
        };
      },
    },
  });

  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.decisionReason, 'usda_resolved_ambiguity');
  assert.equal(result.escalationReason, 'local_ambiguous');
  assert.deepEqual(calls, ['local', 'usda']);
});

test('resolveAiFoodLookup escalates strong local name match with missing per100g data', async () => {
  const calls = [];

  const result = await resolveAiFoodLookup({
    entryName: 'kimchi',
    isOnline: true,
    dependencies: {
      searchLocal: async () => {
        calls.push('local');
        return [{ id: 'local_1', name: 'Kimchi', per100g: null }];
      },
      searchUsda: async () => {
        calls.push('usda');
        return {
          foods: [
            {
              id: 'usda_1',
              name: 'Kimchi',
              per100g: { calories: 15, protein: 1.1, carbs: 2.4, fats: 0.5 },
            },
          ],
        };
      },
    },
  });

  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.decisionReason, 'usda_completed_missing_macros');
  assert.equal(result.escalationReason, 'missing_macros');
  assert.deepEqual(calls, ['local', 'usda']);
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
  assert.equal(result.decision, 'try_grounding');
  assert.equal(result.decisionReason, 'grounding_required');
  assert.equal(result.confidenceComponents?.trustMultiplier, 0.75);
  assert.ok(result.weightedMatchScore < result.matchScore);
});

test('resolveAiFoodLookup quality mode changes depth but keeps conservative acceptance', async () => {
  const makeDependencies = () => {
    const calls = [];
    return {
      calls,
      dependencies: {
        searchLocal: async ({ limit }) => {
          calls.push(`local:${limit}`);
          return [
            {
              id: 'local_1',
              name: 'Eggs',
              per100g: { calories: 155, protein: 13, carbs: 1.1, fats: 11 },
            },
          ];
        },
        searchUsda: async () => {
          calls.push('usda');
          return { foods: [] };
        },
      },
    };
  };

  const fast = makeDependencies();
  const fastResult = await resolveAiFoodLookup({
    entryName: 'eggs',
    qualityMode: AI_RAG_QUALITY_MODE.FAST,
    isOnline: true,
    dependencies: fast.dependencies,
  });

  const precision = makeDependencies();
  const precisionResult = await resolveAiFoodLookup({
    entryName: 'eggs',
    qualityMode: AI_RAG_QUALITY_MODE.PRECISION,
    isOnline: true,
    dependencies: precision.dependencies,
  });

  assert.equal(fastResult.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(precisionResult.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.deepEqual(fast.calls, ['local:8']);
  assert.deepEqual(precision.calls, ['local:100']);
});

test('resolveAiFoodLookup can defer grounding when fallback is disabled', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    isOnline: true,
    allowGroundingFallback: false,
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

  assert.equal(result.status, 'needs_grounding');
  assert.equal(result.matchedFood, null);
  assert.equal(result.queryUsed, 'rare local dessert');
});

test('resolveAiFoodLookup fast mode disables grounding fallback by default', async () => {
  let groundedCalls = 0;

  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    qualityMode: AI_RAG_QUALITY_MODE.FAST,
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchUsda: async () => ({ foods: [] }),
      searchGrounded: async () => {
        groundedCalls += 1;
        return {
          name: 'Rare Local Dessert',
          per100g: {
            calories: 320,
            protein: 4,
            carbs: 45,
            fats: 14,
          },
        };
      },
    },
  });

  assert.equal(result.status, 'needs_grounding');
  assert.equal(groundedCalls, 0);
});

test('resolveAiGroundedBatch resolves multiple entries from one batched lookup call', async () => {
  let batchCalls = 0;

  const result = await resolveAiGroundedBatch({
    requests: [
      {
        entryKey: 'assistant-1-0',
        entryName: 'kulolo',
        groundingQuery: 'kulolo',
        sourcesTried: ['local', 'usda'],
      },
      {
        entryKey: 'assistant-1-1',
        entryName: 'ube halaya',
        groundingQuery: 'ube halaya',
        sourcesTried: ['local', 'usda'],
      },
    ],
    dependencies: {
      searchGroundedBatch: async (queries) => {
        batchCalls += 1;
        assert.deepEqual(queries, ['kulolo', 'ube halaya']);
        return {
          estimates: [
            {
              requestedFoodName: 'kulolo',
              estimate: {
                name: 'Kulolo',
                per100g: { calories: 250, protein: 1.2, carbs: 55, fats: 2.1 },
                confidence: 'low',
              },
            },
            {
              requestedFoodName: 'ube halaya',
              estimate: {
                name: 'Ube Halaya',
                per100g: { calories: 280, protein: 3.1, carbs: 48, fats: 8.5 },
                confidence: 'low',
              },
            },
          ],
        };
      },
    },
  });

  assert.equal(batchCalls, 1);
  assert.equal(result['assistant-1-0'].status, 'resolved');
  assert.equal(
    result['assistant-1-0'].usedSource,
    FOOD_SEARCH_SOURCE.AI_WEB_SEARCH
  );
  assert.equal(result['assistant-1-0'].matchedFood?.name, 'Kulolo');
  assert.equal(result['assistant-1-1'].status, 'resolved');
  assert.equal(result['assistant-1-1'].matchedFood?.name, 'Ube Halaya');
});

test('resolveAiGroundedBatch forwards timeout from quality options to batch dependency', async () => {
  let capturedTimeout = null;

  await resolveAiGroundedBatch({
    qualityMode: AI_RAG_QUALITY_MODE.PRECISION,
    timeoutMs: 12345,
    requests: [
      {
        entryKey: 'assistant-10-0',
        entryName: 'kulolo',
        groundingQuery: 'kulolo',
      },
    ],
    dependencies: {
      searchGroundedBatch: async (_queries, _signal, timeoutMs) => {
        capturedTimeout = timeoutMs;
        return {
          estimates: [
            {
              requestedFoodName: 'kulolo',
              estimate: {
                name: 'Kulolo',
                per100g: {
                  calories: 250,
                  protein: 1,
                  carbs: 55,
                  fats: 2,
                },
              },
            },
          ],
        };
      },
    },
  });

  assert.equal(capturedTimeout, 12345);
});

test('resolveAiFoodLookup forces grounded fallback when USDA fails with rate limit', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'banana',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [
        {
          id: 'local_partial',
          name: 'Banana Chips',
          category: 'carbs',
        },
      ],
      searchUsda: async () => {
        const error = new Error('Too many requests');
        error.status = 429;
        throw error;
      },
      searchGrounded: async () => ({
        name: 'Banana',
        per100g: {
          calories: 89,
          protein: 1.1,
          carbs: 22.8,
          fats: 0.3,
        },
        confidence: 'low',
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
  assert.equal(result.matchedFood?.name, 'Banana');
  assert.equal(result.matchedFood?.per100g?.calories, 89);
  assert.equal(result.fallbackUsed, true);
});

test('resolveAiFoodLookup classifies grounded safety failures with reason codes', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchUsda: async () => ({ foods: [] }),
      searchGrounded: async () => {
        throw new Error('Response blocked by safety filters (SAFETY).');
      },
    },
  });

  assert.equal(result.status, 'no_match');
  assert.equal(
    result.errorReasonsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH],
    'grounding_safety_blocked'
  );
  assert.equal(
    result.errorsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH],
    'Response blocked by safety filters (SAFETY).'
  );
});

test('resolveAiFoodLookup classifies grounded network failures with reason codes', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchUsda: async () => ({ foods: [] }),
      searchGrounded: async () => {
        throw new Error('Network error - check your connection');
      },
    },
  });

  assert.equal(result.status, 'no_match');
  assert.equal(
    result.errorReasonsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH],
    'grounding_network_error'
  );
});

test('resolveAiFoodLookup classifies grounded quota exhaustion separately from transient rate limits', async () => {
  const quotaError = new Error(
    'RESOURCE_EXHAUSTED: exceeded your current quota'
  );
  quotaError.status = 429;
  quotaError.details = {
    error: 'RESOURCE_EXHAUSTED: exceeded your current quota',
  };

  const result = await resolveAiFoodLookup({
    entryName: 'rare local dessert',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [],
      searchUsda: async () => ({ foods: [] }),
      searchGrounded: async () => {
        throw quotaError;
      },
    },
  });

  assert.equal(result.status, 'no_match');
  assert.equal(
    result.errorReasonsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH],
    'grounding_quota_exhausted'
  );
});

test('resolveAiFoodLookup uses session cache for repeated normalized queries', async () => {
  let localCalls = 0;
  let usdaCalls = 0;

  const sourcePreferenceWeights = {
    local: 1,
    usda: 1,
    ai_web_search: 1,
    estimate: 1,
  };

  const dependencies = {
    searchLocal: async () => {
      localCalls += 1;
      return [{ id: 'local_egg', name: 'Egg, whole, cooked' }];
    },
    searchUsda: async () => {
      usdaCalls += 1;
      return { foods: [{ id: 'usda_egg', name: 'Egg Whole' }] };
    },
  };

  const firstResult = await resolveAiFoodLookup({
    entryName: 'Egg whole',
    lookupTerms: ['whole egg'],
    isOnline: true,
    sourcePreferenceWeights,
    dependencies,
  });

  const localCallsAfterFirst = localCalls;
  const usdaCallsAfterFirst = usdaCalls;

  const secondResult = await resolveAiFoodLookup({
    entryName: 'Egg whole',
    lookupTerms: ['whole egg'],
    isOnline: true,
    sourcePreferenceWeights,
    dependencies,
  });

  assert.equal(localCalls, localCallsAfterFirst);
  assert.equal(usdaCalls, usdaCallsAfterFirst);
  assert.equal(firstResult.usedSource, secondResult.usedSource);
  assert.equal(firstResult.matchConfidence, secondResult.matchConfidence);
  assert.equal(firstResult.weightedMatchScore, secondResult.weightedMatchScore);
});

test('resolveAiFoodLookup session cache evicts oldest entries beyond max size', async () => {
  let localCalls = 0;

  const dependencies = {
    searchLocal: async ({ query }) => {
      localCalls += 1;
      return [{ id: `local_${query}`, name: String(query) }];
    },
    searchUsda: async () => ({ foods: [] }),
  };

  for (let index = 0; index < 201; index += 1) {
    await resolveAiFoodLookup({
      entryName: `food-${index}`,
      isOnline: false,
      dependencies,
    });
  }

  const callsAfterPriming = localCalls;

  await resolveAiFoodLookup({
    entryName: 'food-0',
    isOnline: false,
    dependencies,
  });

  assert.equal(localCalls, callsAfterPriming + 1);
});

test('resolveAiFoodLookup maps grounded confidence to differentiated score', async () => {
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
        confidence: 'high',
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
  assert.equal(result.matchScore, 0.78);
});

test('resolveAiFoodLookup does not force grounding when later term has strong match', async () => {
  const result = await resolveAiFoodLookup({
    entryName: 'term one',
    lookupTerms: ['term two'],
    isOnline: true,
    dependencies: {
      searchLocal: async ({ query }) =>
        query === 'term two'
          ? [
              {
                id: 'local_strong',
                name: 'Term Two',
                per100g: { calories: 100, protein: 1, carbs: 20, fats: 0 },
              },
            ]
          : [
              {
                id: 'local_weak',
                name: 'Syrup Mix',
                per100g: { calories: 300, protein: 0, carbs: 75, fats: 0 },
              },
            ],
      searchUsda: async () => {
        const err = new Error('USDA transient failure');
        err.status = 503;
        throw err;
      },
      searchGrounded: async () => ({
        name: 'Grounded fallback result',
        per100g: {
          calories: 100,
          protein: 1,
          carbs: 1,
          fats: 1,
        },
        confidence: 'low',
      }),
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(result.matchedFood?.name, 'Term Two');
});

test('resolveAiFoodLookup does not call USDA when local match is already strong', async () => {
  let usdaCalls = 0;

  const result = await resolveAiFoodLookup({
    entryName: 'banana',
    isOnline: true,
    dependencies: {
      searchLocal: async () => [
        {
          id: 'local_banana',
          name: 'Banana',
          per100g: { calories: 89, protein: 1.1, carbs: 23, fats: 0.3 },
        },
      ],
      searchUsda: async () => {
        usdaCalls += 1;
        return { foods: [] };
      },
    },
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.LOCAL);
  assert.equal(usdaCalls, 0);
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
  assert.equal(verifiedEntry.confidence, 'low');
});

test('resolveAiFoodEntry marks deterministic fallback penalty metadata in lookupMeta', async () => {
  const { lookupMeta } = await resolveAiFoodEntry({
    entry: {
      name: 'Street BBQ',
      grams: 180,
      calories: 320,
      protein: 22,
      carbs: 14,
      fats: 19,
      confidence: 'high',
    },
    lookupMeta: {
      status: 'no_match',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      matchConfidence: 'low',
      matchedFood: null,
    },
  });

  assert.equal(lookupMeta.verificationFallbackUsed, true);
  assert.equal(lookupMeta.confidencePenaltyApplied, true);
  assert.equal(
    lookupMeta.confidencePenaltyReason,
    'deterministic_macro_fallback'
  );
  assert.equal(lookupMeta.verificationMethod, 'derived_per100g_rescale');
  assert.equal(lookupMeta.matchConfidence, 'medium');
  assert.equal(lookupMeta.originalMatchConfidence, 'high');
  assert.equal(lookupMeta.penalizedMatchConfidence, 'medium');
});

test('dedupeExtractedFoodEntries collapses near-duplicate rice aliases and merges lookup terms', () => {
  const deduped = dedupeExtractedFoodEntries([
    {
      name: 'rice',
      grams: 100,
      calories: 130,
      protein: 2.5,
      carbs: 28,
      fats: 0.3,
      lookupTerms: ['white rice'],
      assumptions: ['steamed'],
    },
    {
      name: 'kanin',
      grams: 100,
      calories: 130,
      protein: 2.5,
      carbs: 28,
      fats: 0.3,
      lookupTerms: ['kanin cooked rice'],
      assumptions: ['plain rice'],
    },
    {
      name: 'sinangag',
      grams: 100,
      calories: 170,
      protein: 3,
      carbs: 30,
      fats: 4,
      lookupTerms: ['garlic fried rice'],
      assumptions: ['oil used'],
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.ok(Array.isArray(deduped[0].lookupTerms));
  assert.ok(deduped[0].lookupTerms.length >= 3);
  assert.ok(Array.isArray(deduped[0].assumptions));
  assert.ok(deduped[0].assumptions.length >= 3);
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
