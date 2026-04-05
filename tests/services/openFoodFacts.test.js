import test from 'node:test';
import assert from 'node:assert/strict';

import { searchFoods } from '../../src/services/openFoodFacts.js';

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

test('searchFoods maps OpenFoodFacts products to app food schema', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      count: 1,
      products: [
        {
          code: '1234567890123',
          product_name: 'Test Bar',
          brands: 'EnergyMap',
          nutriments: {
            'energy-kcal_100g': 410,
            proteins_100g: 20.2,
            carbohydrates_100g: 45.8,
            fat_100g: 15.3,
          },
          serving_size: '50 g',
          serving_quantity: 50,
          serving_quantity_unit: 'g',
        },
      ],
    }),
  });

  try {
    const result = await searchFoods('test bar');
    assert.equal(result.totalResults, 1);
    assert.equal(result.foods.length, 1);
    assert.equal(result.foods[0].id, 'off_1234567890123');
    assert.equal(result.foods[0].name, 'Test Bar');
    assert.equal(result.foods[0].source, 'openfoodfacts');
    assert.equal(result.foods[0].per100g.calories, 410);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
