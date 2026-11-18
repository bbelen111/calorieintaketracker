import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferCategoryFromMacros,
  resolveAiEntryCategory,
} from '../../src/utils/food/aiCategory.js';

// The regression this guards: "3 egg omelette" (18g protein, no category from the
// model, no category on the matched food) was tagged "Custom".
const omelette = { name: '3 egg omelette', protein: 18, carbs: 1.8, fats: 5.2 };

test('inferCategoryFromMacros picks the dominant macro', () => {
  assert.equal(inferCategoryFromMacros(omelette), 'protein');
  assert.equal(
    inferCategoryFromMacros({ protein: 2, carbs: 30, fats: 1 }),
    'carbs'
  );
  assert.equal(
    inferCategoryFromMacros({ protein: 2, carbs: 3, fats: 20 }),
    'fats'
  );
});

test('inferCategoryFromMacros returns null with no macros to infer from', () => {
  assert.equal(inferCategoryFromMacros({}), null);
  assert.equal(
    inferCategoryFromMacros({ protein: 0, carbs: 0, fats: 0 }),
    null
  );
  assert.equal(
    inferCategoryFromMacros({ protein: -4, carbs: 'x', fats: null }),
    null
  );
  assert.equal(inferCategoryFromMacros(null), null);
});

test('a food-type category from the model is trusted (case/whitespace tolerant)', () => {
  assert.equal(
    resolveAiEntryCategory({ ...omelette, category: 'vegetables' }),
    'vegetables'
  );
  assert.equal(
    resolveAiEntryCategory({ ...omelette, category: ' Carbs ' }),
    'carbs'
  );
});

test('a missing category falls back to the matched food, then to macros', () => {
  assert.equal(
    resolveAiEntryCategory(omelette, { matchedFood: { category: 'fats' } }),
    'fats'
  );
  assert.equal(
    resolveAiEntryCategory(omelette, { matchedFood: { category: null } }),
    'protein'
  );
  assert.equal(resolveAiEntryCategory(omelette, null), 'protein');
  assert.equal(resolveAiEntryCategory(omelette), 'protein');
});

test('"custom"/"manual" from the model is ignored - it is provenance, not a food type', () => {
  assert.equal(
    resolveAiEntryCategory({ ...omelette, category: 'custom' }),
    'protein'
  );
  assert.equal(
    resolveAiEntryCategory({ ...omelette, category: 'manual' }),
    'protein'
  );
});

test('a matched food that really is custom/manual keeps that category', () => {
  assert.equal(
    resolveAiEntryCategory(omelette, { matchedFood: { category: 'custom' } }),
    'custom'
  );
  assert.equal(
    resolveAiEntryCategory(omelette, { matchedFood: { category: 'manual' } }),
    'manual'
  );
});

test('unknown everywhere resolves to null so the UI can omit the tag', () => {
  assert.equal(resolveAiEntryCategory({ name: 'mystery' }), null);
  assert.equal(
    resolveAiEntryCategory(
      { name: 'mystery', category: 'nonsense' },
      { matchedFood: { category: 'also-nonsense' } }
    ),
    null
  );
});
