import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapCatalogFoodToFood,
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

const CHICKEN_ROW = {
  id: 'usda_171077',
  name: 'Chicken breast, raw',
  brand: null,
  category: 'protein',
  subcategory: 'poultry',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fats: 2.62,
  fiber: 0,
  sodium: 45,
  saturated_fats: 0.56,
  sugars: 0,
  portions:
    '[{"id":"p_100g","label":"100g","grams":100},{"id":"portion_1","label":"1 serving (113g)","grams":113}]',
};

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

test('searchFoods maps catalog rows to app food schema', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    createJsonResponse({
      ok: true,
      status: 200,
      payload: { totalHits: 1, page: 1, catalogFoods: [CHICKEN_ROW] },
    });

  try {
    const result = await searchFoods('chicken breast');

    assert.equal(result.totalResults, 1);
    assert.equal(result.foods.length, 1);

    const [food] = result.foods;

    assert.equal(food.id, 'usda_171077');
    assert.equal(food.name, 'Chicken breast, raw');
    assert.equal(food.brand, null);
    assert.equal(food.category, 'protein');
    assert.equal(food.subcategory, 'poultry');
    assert.equal(food.source, 'usda');
    assert.equal(food.type, 'Generic');

    assert.equal(food.per100g.calories, 120);
    assert.equal(food.per100g.protein, 22.5);
    assert.equal(food.per100g.carbs, 0);
    assert.equal(food.per100g.fats, 2.62);
    assert.equal(food.per100g.fiber, 0);
    assert.equal(food.per100g.sodium, 45);
    assert.equal(food.per100g.saturatedFats, 0.56);
    assert.equal(food.per100g.sugars, 0);

    assert.equal(food.portions.length, 2);
    assert.equal(food.portions[0].id, 'p_100g');
    assert.equal(food.portions[1].label, '1 serving (113g)');
    assert.equal(food.portions[1].grams, 113);

    assert.equal(food.previewMacros.calories, 120);
    assert.equal(food.previewMacros.servingInfo, '1 serving (113g)');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods maps branded catalog rows to Brand type', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    createJsonResponse({
      ok: true,
      status: 200,
      payload: {
        totalHits: 1,
        catalogFoods: [
          {
            id: 'usda_999',
            name: 'Hershey Bar',
            brand: 'Hershey',
            category: 'uncategorized',
            subcategory: null,
            calories: 530,
            protein: 7.7,
            carbs: 60,
            fats: 29,
            fiber: null,
            sodium: null,
            saturated_fats: null,
            sugars: null,
            portions: '[{"id":"p_100g","label":"100g","grams":100}]',
          },
        ],
      },
    });

  try {
    const result = await searchFoods('hershey');

    assert.equal(result.foods.length, 1);
    const [food] = result.foods;
    assert.equal(food.id, 'usda_999');
    assert.equal(food.brand, 'Hershey');
    assert.equal(food.type, 'Brand');
    assert.equal(food.category, 'uncategorized');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods preserves NULL micro semantics from catalog rows', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    createJsonResponse({
      ok: true,
      status: 200,
      payload: {
        totalHits: 1,
        catalogFoods: [
          {
            ...CHICKEN_ROW,
            id: 'usda_111',
            fiber: null,
            sodium: null,
            saturated_fats: null,
            sugars: null,
            portions: '[{"id":"p_100g","label":"100g","grams":100}]',
          },
        ],
      },
    });

  try {
    const result = await searchFoods('chicken');
    const [food] = result.foods;
    assert.equal(food.per100g.fiber, null);
    assert.equal(food.per100g.sodium, null);
    assert.equal(food.per100g.saturatedFats, null);
    assert.equal(food.per100g.sugars, null);
    assert.equal(food.previewMacros.servingInfo, 'per serving');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchFoods returns empty foods when catalogFoods is absent', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    createJsonResponse({
      ok: true,
      status: 200,
      payload: { totalHits: 3, foods: [{ fdcId: 1 }] },
    });

  try {
    const result = await searchFoods('chicken');
    assert.deepEqual(result.foods, []);
    assert.equal(result.totalResults, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mapCatalogFoodToFood accepts portions already parsed as an array', () => {
  const food = mapCatalogFoodToFood({
    ...CHICKEN_ROW,
    portions: [
      { id: 'p_100g', label: '100g', grams: 100 },
      { id: 'portion_1', label: '1 serving (113g)', grams: 113 },
    ],
  });

  assert.equal(food.portions.length, 2);
  assert.equal(food.portions[1].grams, 113);
  assert.equal(food.previewMacros.servingInfo, '1 serving (113g)');
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
        page: 1,
        catalogFoods: [
          {
            ...CHICKEN_ROW,
            id: 'usda_40401',
            name: 'Egg Omelette',
            calories: 154,
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
      payload: { totalHits: 0, catalogFoods: [] },
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
