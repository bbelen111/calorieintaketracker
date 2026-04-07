import test from 'node:test';
import assert from 'node:assert/strict';

import { searchFoods } from '../../src/services/usda.js';

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
    assert.equal(food.per100g.fats, 6.4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
