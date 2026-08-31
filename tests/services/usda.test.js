import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resetUsdaClientRetry,
  searchFoods,
  USDA_CLIENT_RETRY,
  USDAFoodError,
} from '../../src/services/usda.js';

const createJsonResponse = ({ ok, status, payload = {} }) => ({
  ok,
  status,
  json: async () => payload,
});

test('searchFoods returns empty payload for short query', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async () => {
    called = true;
    throw new Error('Should not be called');
  };

  try {
    const result = await searchFoods('a');
    assert.equal(called, false);
    assert.deepEqual(result, { foods: [], totalResults: 0, page: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods maps USDA foods to app food schema', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      totalHits: 1,
      foods: [
        {
          fdcId: 12345,
          description: 'Test Chicken Bowl',
          dataType: 'Branded',
          brandOwner: 'EnergyMap Foods',
          servingSize: 50,
          servingSizeUnit: 'g',
          foodNutrients: [
            { nutrientName: 'Energy', unitName: 'KCAL', value: 110 },
            { nutrientName: 'Protein', unitName: 'G', value: 12.5 },
            {
              nutrientName: 'Carbohydrate, by difference',
              unitName: 'G',
              value: 8.4,
            },
            { nutrientName: 'Total lipid (fat)', unitName: 'G', value: 3.1 },
            {
              nutrientNumber: '291',
              unitName: 'G',
              value: 1.5,
            },
            {
              nutrientNumber: '307',
              unitName: 'MG',
              value: 100,
            },
            {
              nutrientNumber: '606',
              unitName: 'G',
              value: 2,
            },
            {
              nutrientNumber: '269',
              unitName: 'G',
              value: 3,
            },
          ],
        },
      ],
    }),
  });

  try {
    const result = await searchFoods('test chicken');

    assert.equal(result.totalResults, 1);
    assert.equal(result.foods.length, 1);

    const [food] = result.foods;

    assert.equal(food.id, 'usda_12345');
    assert.equal(food.name, 'Test Chicken Bowl');
    assert.equal(food.brand, 'EnergyMap Foods');
    assert.equal(food.source, 'usda');
    assert.equal(food.type, 'Brand');

    assert.equal(food.previewMacros.calories, 110);
    assert.equal(food.per100g.calories, 220);

    // Micro nutrients (serving 50g -> per100g factor 2, invariant-safe).
    assert.equal(food.per100g.fiber, 3);
    assert.equal(food.per100g.sodium, 200);
    assert.equal(food.per100g.saturatedFats, 4);
    assert.equal(food.per100g.sugars, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods maps nutrients by nutrientId fallback when nutrientNumber is absent', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      totalHits: 1,
      foods: [
        {
          fdcId: 777,
          description: 'Fallback Nutrient Food',
          dataType: 'Foundation',
          servingSize: 100,
          servingSizeUnit: 'g',
          foodNutrients: [
            { nutrientId: 1008, unitName: 'KCAL', value: 210 },
            { nutrientId: 1003, unitName: 'G', value: 9.2 },
            { nutrientId: 1005, unitName: 'G', value: 30.6 },
            { nutrientId: 1004, unitName: 'G', value: 6.4 },
            { nutrientName: 'Fiber, total dietary', unitName: 'G', value: 5 },
            { nutrientName: 'Sodium, Na', unitName: 'MG', value: 120 },
            {
              nutrientName: 'Fatty acids, total saturated',
              unitName: 'G',
              value: 1,
            },
            { nutrientName: 'Sugars, total including NLEA', unitName: 'G', value: 2 },
          ],
        },
      ],
    }),
  });

  try {
    const result = await searchFoods('fallback nutrients');

    assert.equal(result.foods.length, 1);
    const [food] = result.foods;
    assert.equal(food.id, 'usda_777');
    assert.equal(food.per100g.calories, 210);
    assert.equal(food.per100g.protein, 9.2);
    assert.equal(food.per100g.carbs, 30.6);
    assert.equal(food.per100g.fiber, 5);
    assert.equal(food.per100g.sodium, 120);
    assert.equal(food.per100g.saturatedFats, 1);
    assert.equal(food.per100g.sugars, 2);
    assert.equal(food.per100g.fats, 6.4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('searchFoods retries transient USDA 404 and succeeds on a later attempt', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    createJsonResponse({ ok: false, status: 404, payload: {} }),
    createJsonResponse({ ok: false, status: 404, payload: {} }),
    createJsonResponse({
      ok: true,
      status: 200,
      payload: {
        totalHits: 1,
        foods: [
          {
            fdcId: 40401,
            description: 'Egg Omelette',
            dataType: 'Generic',
            servingSize: 100,
            servingSizeUnit: 'g',
            foodNutrients: [{ nutrientId: 1008, unitName: 'KCAL', value: 154 }],
          },
        ],
      },
    }),
  ];
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    const response = responses[Math.min(fetchCalls, responses.length - 1)];
    fetchCalls += 1;
    return response;
  };

  try {
    const result = await searchFoods('egg omelette', {
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 },
    });

    assert.equal(fetchCalls, 3);
    assert.equal(result.foods.length, 1);
    assert.equal(result.foods[0].name, 'Egg Omelette');
    assert.equal(result.foods[0].previewMacros.calories, 154);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods retries network errors before giving up', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls <= 2) {
      throw new TypeError('Failed to fetch');
    }
    return createJsonResponse({
      ok: true,
      status: 200,
      payload: { totalHits: 0, foods: [] },
    });
  };

  try {
    const result = await searchFoods('chicken', {
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 },
    });

    assert.equal(fetchCalls, 3);
    assert.deepEqual(result.foods, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods does not retry non-transient USDA statuses', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createJsonResponse({
      ok: false,
      status: 403,
      payload: { error: 'Forbidden' },
    });
  };

  try {
    await assert.rejects(
      searchFoods('hand sanitizer', {
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 },
      }),
      (error) => {
        assert.ok(error instanceof USDAFoodError);
        assert.equal(error.status, 403);
        assert.equal(error.message, 'Forbidden');
        return true;
      }
    );
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods never retries when the caller aborts the request', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new globalThis.AbortController();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    controller.abort();
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    throw abortError;
  };

  try {
    await assert.rejects(
      searchFoods('omelette', {
        signal: controller.signal,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 },
      }),
      (error) => {
        assert.ok(error instanceof USDAFoodError);
        assert.equal(error.status, 0);
        assert.equal(error.message, 'Request aborted');
        return true;
      }
    );
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods retries internal timeouts with a fresh budget per attempt', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (_url, options) => {
    fetchCalls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const abortError = new Error('The operation was aborted.');
        abortError.name = 'AbortError';
        reject(abortError);
      });
    });
  };

  try {
    await assert.rejects(
      searchFoods('slow egg', {
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          jitterMs: 0,
          timeoutMs: 10,
        },
      }),
      (error) => {
        assert.ok(error instanceof USDAFoodError);
        assert.equal(error.status, 408);
        assert.equal(error.message, 'Request timed out');
        return true;
      }
    );
    assert.equal(fetchCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods respects the mutable USDA_CLIENT_RETRY config', async () => {
  const originalFetch = globalThis.fetch;
  USDA_CLIENT_RETRY.maxAttempts = 2;
  USDA_CLIENT_RETRY.baseDelayMs = 0;
  USDA_CLIENT_RETRY.maxDelayMs = 0;
  USDA_CLIENT_RETRY.jitterMs = 0;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return createJsonResponse({ ok: false, status: 404, payload: {} });
  };

  try {
    await assert.rejects(searchFoods('egg'), (error) => {
      assert.ok(error instanceof USDAFoodError);
      assert.equal(error.status, 404);
      return true;
    });
    assert.equal(fetchCalls, 2);
  } finally {
    resetUsdaClientRetry();
    globalThis.fetch = originalFetch;
  }
});
