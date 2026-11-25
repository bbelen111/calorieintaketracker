import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAiEntryNutrition,
  buildFallbackFoodFromEntry,
  pickManualRelogIdentity,
  resolveFoodForRelog,
} from '../../src/utils/food/loggedEntry.js';
import { scaleMacrosFromPer100g } from '../../src/utils/food/portionNormalization.js';

const OMELETTE_CARD = {
  name: 'egg omelette',
  grams: 150,
  calories: 216,
  protein: 18,
  carbs: 1.5,
  fats: 15,
  fiber: 0,
  sodium: 70,
  saturatedFats: 3,
  sugars: 0.6,
};

const NUTRITION_KEYS = [
  'calories',
  'protein',
  'carbs',
  'fats',
  'fiber',
  'sodium',
  'saturatedFats',
  'sugars',
];

const pickNutrition = (value) =>
  Object.fromEntries(NUTRITION_KEYS.map((key) => [key, value[key]]));

test('buildAiEntryNutrition logs exactly what the card shows', () => {
  const nutrition = buildAiEntryNutrition({
    ...OMELETTE_CARD,
    // A database match with different numbers must not replace the card's.
    lookupMeta: {
      status: 'resolved',
      matchConfidence: 'high',
      matchedFood: {
        per100g: { calories: 159, protein: 11.4, carbs: 2.3, fats: 11.4 },
      },
    },
  });

  assert.equal(nutrition.grams, 150);
  assert.deepEqual(pickNutrition(nutrition), pickNutrition(OMELETTE_CARD));
});

test('buildAiEntryNutrition keeps untracked micros untracked', () => {
  const nutrition = buildAiEntryNutrition({
    ...OMELETTE_CARD,
    fiber: 0,
    sodium: null,
    saturatedFats: undefined,
    sugars: '',
  });

  assert.equal(nutrition.fiber, 0);
  assert.equal('sodium' in nutrition, false);
  assert.equal('saturatedFats' in nutrition, false);
  assert.equal('sugars' in nutrition, false);
});

test('buildFallbackFoodFromEntry keeps the logged category and identity', () => {
  const food = buildFallbackFoodFromEntry({
    ...OMELETTE_CARD,
    id: 7,
    foodId: 'ai_1_0',
    category: 'protein',
    subcategory: 'eggs',
  });

  assert.equal(food.id, 'ai_1_0');
  assert.equal(food.category, 'protein');
  assert.equal(food.subcategory, 'eggs');
});

test('buildFallbackFoodFromEntry never invents a category', () => {
  const food = buildFallbackFoodFromEntry({ ...OMELETTE_CARD, id: 7 });

  assert.equal(food.id, 'manual_7');
  assert.equal(food.category, null);
});

test('buildFallbackFoodFromEntry reproduces the entry at its logged grams', () => {
  [
    OMELETTE_CARD,
    { ...OMELETTE_CARD, grams: 137, calories: 217, protein: 17.9 },
    { ...OMELETTE_CARD, grams: 999, calories: 1001, sodium: 1003 },
  ].forEach((entry) => {
    const food = buildFallbackFoodFromEntry(entry);

    assert.deepEqual(
      pickNutrition(scaleMacrosFromPer100g(food.per100g, entry.grams)),
      pickNutrition(entry)
    );
  });
});

test('buildFallbackFoodFromEntry leaves missing micros null', () => {
  const food = buildFallbackFoodFromEntry({
    name: 'Toast',
    grams: 50,
    calories: 130,
    sodium: null,
  });

  assert.equal(food.per100g.sodium, null);
  assert.equal(food.per100g.fiber, null);
});

const PER_100G = { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 };

const relogEntry = (foodId, overrides = {}) => ({
  id: 1,
  foodId,
  name: 'Logged name',
  grams: 200,
  calories: 260,
  protein: 5.4,
  carbs: 56,
  fats: 0.6,
  ...overrides,
});

test('resolveFoodForRelog uses the live recipe', async () => {
  const food = await resolveFoodForRelog(relogEntry('recipe_1'), {
    recipes: [
      {
        id: 'recipe_1',
        name: 'Renamed bowl',
        servings: 1,
        ingredients: [{ id: 'a', name: 'Rice', grams: 300, per100g: PER_100G }],
      },
    ],
  });

  assert.equal(food.name, 'Renamed bowl');
  assert.equal(food.isRecipe, true);
});

test('resolveFoodForRelog uses a saved custom food with its portions', async () => {
  const food = await resolveFoodForRelog(relogEntry('user_1'), {
    favourites: [
      {
        id: 9,
        foodId: 'user_1',
        name: 'My bar',
        source: 'user',
        isCustom: true,
        per100g: PER_100G,
        portions: [{ id: 'bar', label: '1 bar', grams: 60 }],
      },
    ],
    getCatalogFoodById: async () => null,
  });

  assert.equal(food.id, 'user_1');
  assert.equal(food.name, 'My bar');
  assert.equal(food.portions.length, 1);
});

test('resolveFoodForRelog prefers the catalog over a favourite of its food', async () => {
  const catalogFood = { id: 'usda_1', name: 'Catalog rice', per100g: PER_100G };

  const food = await resolveFoodForRelog(relogEntry('usda_1'), {
    favourites: [
      { id: 9, foodId: 'usda_1', name: 'Saved rice', grams: 100, calories: 1 },
    ],
    getCatalogFoodById: async (id) => (id === 'usda_1' ? catalogFood : null),
  });

  assert.equal(food, catalogFood);
});

test('resolveFoodForRelog falls back to a cached online food', async () => {
  const cachedFood = { id: 'off_1', name: 'Soda', per100g: PER_100G };
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const food = await resolveFoodForRelog(relogEntry('off_1'), {
      cachedFoods: [cachedFood],
      getCatalogFoodById: async () => {
        throw new Error('catalog unavailable');
      },
    });

    assert.equal(food, cachedFood);
  } finally {
    console.warn = originalWarn;
  }
});

test('resolveFoodForRelog rebuilds an unknown food and carries its metadata', async () => {
  const food = await resolveFoodForRelog(
    relogEntry('ai_1_0', {
      source: 'ai',
      subcategory: 'eggs',
      category: 'protein',
      aiLookupUsed: false,
      aiLookupSource: null,
    }),
    { getCatalogFoodById: async () => null }
  );

  assert.equal(food.id, 'ai_1_0');
  assert.equal(food.name, 'Logged name');
  assert.equal(food.category, 'protein');
  assert.equal(food.per100g.calories, 130);
  assert.deepEqual(food.entryMetadata, {
    source: 'ai',
    subcategory: 'eggs',
    aiLookupUsed: false,
  });
});

test('pickManualRelogIdentity keeps identity only while the name matches', () => {
  const entry = {
    id: 3,
    name: 'Latte',
    foodId: 'ai_1_0',
    brand: 'Cafe',
    category: 'carbs',
    source: 'ai',
    calories: 120,
  };

  assert.deepEqual(pickManualRelogIdentity(entry, ' Latte '), {
    foodId: 'ai_1_0',
    brand: 'Cafe',
    category: 'carbs',
    source: 'ai',
  });
  assert.deepEqual(pickManualRelogIdentity(entry, 'Mocha'), {});
  assert.deepEqual(pickManualRelogIdentity(null, 'Latte'), {});
});
