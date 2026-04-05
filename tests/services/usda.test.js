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
