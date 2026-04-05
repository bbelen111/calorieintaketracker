import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenFoodFactsError, searchBarcode } from '../../src/services/openFoodFacts.js';

test('searchBarcode rejects invalid barcode format', async () => {
  await assert.rejects(
    () => searchBarcode('abc'),
    (error) =>
      error instanceof OpenFoodFactsError &&
      error.message === 'Invalid barcode format'
  );
});

test('searchBarcode maps OpenFoodFacts product to app food schema', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 1,
      product: {
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
    }),
  });

  try {
    const result = await searchBarcode('1234567890123');
    assert.equal(result.id, 'off_1234567890123');
    assert.equal(result.name, 'Test Bar');
    assert.equal(result.source, 'openfoodfacts');
    assert.equal(result.per100g.calories, 410);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
