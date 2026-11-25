import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAiEntryNutrition,
  buildFallbackFoodFromEntry,
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
