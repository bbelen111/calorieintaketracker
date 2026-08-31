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
          sodium_100g: 0.0428,
          sodium_unit: 'g',
          fiber_100g: 3.5,
          'saturated-fat_100g': 6.2,
          sugars_100g: 21,
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
    // Micros: sodium converted g -> mg; fiber/sat-fat/sugars as grams.
    assert.equal(result.per100g.sodium, 43);
    assert.equal(result.per100g.fiber, 3.5);
    assert.equal(result.per100g.saturatedFats, 6.2);
    assert.equal(result.per100g.sugars, 21);
    // Serving (50g) portion scales micros.
    const serving = result.portions.find((p) => p.id === 'p_serving');
    assert.equal(serving.macros.sodium, 22);
    assert.equal(serving.macros.fiber, 1.8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchBarcode derives sodium from salt when sodium field is absent', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 1,
      product: {
        code: '9876543210987',
        product_name: 'Salt-First Bar',
        brands: 'EnergyMap',
        nutriments: {
          'energy-kcal_100g': 300,
          proteins_100g: 10,
          carbohydrates_100g: 40,
          fat_100g: 8,
          salt_100g: 1.4,
          fiber_100g: 4,
        },
        serving_size: '100 g',
        serving_quantity: 100,
        serving_quantity_unit: 'g',
      },
    }),
  });

  try {
    const result = await searchBarcode('9876543210987');
    // salt 1.4g * 393.4 mg/g -> 551 mg sodium.
    assert.equal(result.per100g.sodium, 551);
    assert.equal(result.per100g.fiber, 4);
    assert.equal(result.per100g.saturatedFats, null);
    assert.equal(result.per100g.sugars, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
