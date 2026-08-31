import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NUTRIENT_KEYS,
  EMPTY_NUTRIENTS,
  normalizeNutrientValue,
  normalizeNutrients,
  convertOpenFoodFactsSodium,
  accumulateNutrientTotals,
  computeNutrientCoverage,
  formatNutrientValue,
} from '../../src/constants/nutrients/nutrients.js';

test('NUTRIENT_KEYS covers the four added nutrients in canonical order', () => {
  assert.deepEqual(NUTRIENT_KEYS, [
    'fiber',
    'sodium',
    'saturatedFats',
    'sugars',
  ]);
});

test('normalizeNutrientValue keeps null / empty as untracked and rounds per unit', () => {
  assert.equal(normalizeNutrientValue(null, 'fiber'), null);
  assert.equal(normalizeNutrientValue('', 'sodium'), null);
  assert.equal(normalizeNutrientValue(undefined, 'sugars'), null);
  assert.equal(normalizeNutrientValue('not-a-number', 'fiber'), null);

  // grams -> 1 decimal
  assert.equal(normalizeNutrientValue(3.25, 'fiber'), 3.3);
  assert.equal(normalizeNutrientValue(0, 'saturatedFats'), 0);
  // mg -> whole integer
  assert.equal(normalizeNutrientValue(200.4, 'sodium'), 200);
  assert.equal(normalizeNutrientValue(0.5, 'sodium'), 1);
});

test('normalizeNutrientValue clamps to canonical bounds', () => {
  assert.equal(normalizeNutrientValue(50000, 'sodium'), 10000);
  assert.equal(normalizeNutrientValue(-5, 'sodium'), 0);
  assert.equal(normalizeNutrientValue(-1, 'fiber'), 0);
  assert.equal(normalizeNutrientValue(99999, 'fiber'), 1000);
});

test('normalizeNutrients defaults all nutrients to null when input empty', () => {
  const { nutrients, relaxedKeys, warnings } = normalizeNutrients(null);
  assert.deepEqual(nutrients, { ...EMPTY_NUTRIENTS });
  assert.deepEqual(relaxedKeys, []);
  assert.deepEqual(warnings, []);
});

test('normalizeNutrients applies saturated-fat invariant regardless of source', () => {
  const { nutrients, relaxedKeys } = normalizeNutrients(
    { fiber: 2, sodium: 10, saturatedFats: 15, sugars: 3 },
    { parentTotals: { fats: 10, carbs: 20 }, source: 'off' }
  );
  assert.equal(nutrients.saturatedFats, 10);
  assert.ok(relaxedKeys.includes('saturatedFats'));
});

test('normalizeNutrients allows EU-style fiber above net carbs (off source)', () => {
  // Oats example: net carbs 20g, fiber 10g, sugars 2g - legitimately legal.
  const { nutrients, relaxedKeys } = normalizeNutrients(
    { fiber: 10, sodium: null, saturatedFats: 1, sugars: 2 },
    { parentTotals: { fats: 5, carbs: 20 }, source: 'off' }
  );
  assert.equal(nutrients.fiber, 10);
  assert.ok(!relaxedKeys.includes('fiber'));
});

test('normalizeNutrients clamps sugars to carbs on large violations', () => {
  const { nutrients, relaxedKeys } = normalizeNutrients(
    { fiber: 1, sodium: 0, saturatedFats: 1, sugars: 30 },
    { parentTotals: { fats: 5, carbs: 20 }, source: 'off' }
  );
  assert.equal(nutrients.sugars, 20);
  assert.ok(relaxedKeys.includes('sugars'));
});

test('normalizeNutrients tolerates minor sugars/carbs label rounding', () => {
  const { nutrients, relaxedKeys } = normalizeNutrients(
    { fiber: 1, sodium: 0, saturatedFats: 1, sugars: 20.8 },
    { parentTotals: { fats: 5, carbs: 20 }, source: 'off' }
  );
  assert.equal(nutrients.sugars, 20.8);
  assert.ok(!relaxedKeys.includes('sugars'));
});

test('normalizeNutrients applies fiber residual clamp only for US sources', () => {
  const payload = {
    fiber: 15,
    sodium: null,
    saturatedFats: 1,
    sugars: 20,
  };
  const parents = { fats: 5, carbs: 30 };

  const usda = normalizeNutrients(payload, {
    parentTotals: parents,
    source: 'usda',
  });
  assert.equal(usda.nutrients.fiber, 10);
  assert.ok(usda.relaxedKeys.includes('fiber'));

  const off = normalizeNutrients(payload, {
    parentTotals: parents,
    source: 'off',
  });
  assert.equal(off.nutrients.fiber, 15);
  assert.ok(!off.relaxedKeys.includes('fiber'));
});

test('normalizeNutrients skips invariants when parents unknown', () => {
  const { nutrients, relaxedKeys, warnings } = normalizeNutrients(
    { fiber: 15, sodium: 500, saturatedFats: 40, sugars: 25 },
    { source: 'usda' }
  );
  assert.equal(nutrients.saturatedFats, 40);
  assert.equal(nutrients.fiber, 15);
  assert.deepEqual(relaxedKeys, []);
  assert.deepEqual(warnings, []);
});

test('convertOpenFoodFactsSodium converts grams to milligrams by default', () => {
  // Live OFF API shape: sodium_100g in grams with explicit unit marker.
  assert.equal(
    convertOpenFoodFactsSodium({ sodium_100g: 0.0428, sodium_unit: 'g' }),
    43
  );
  assert.equal(
    convertOpenFoodFactsSodium({ sodium_100g: 0.5, sodium_unit: 'g' }),
    500
  );
  // Missing unit falls back to OFF's gram convention (never treat as mg).
  assert.equal(convertOpenFoodFactsSodium({ sodium_100g: 0.35 }), 350);
});

test('convertOpenFoodFactsSodium respects an explicit milligrams unit', () => {
  assert.equal(
    convertOpenFoodFactsSodium({ sodium_100g: 42.8, sodium_unit: 'mg' }),
    43
  );
  assert.equal(
    convertOpenFoodFactsSodium({ sodium_100g: 350, sodium_unit: 'mg' }),
    350
  );
});

test('convertOpenFoodFactsSodium falls back to salt via NaCl mass ratio', () => {
  assert.equal(convertOpenFoodFactsSodium({ salt_100g: 1.4 }), 551);
  assert.equal(convertOpenFoodFactsSodium({ salt_100g: 0.5 }), 197);
});

test('convertOpenFoodFactsSodium returns null when neither sodium nor salt present', () => {
  assert.equal(convertOpenFoodFactsSodium({ fat_100g: 5 }), null);
  assert.equal(convertOpenFoodFactsSodium({}), null);
  assert.equal(convertOpenFoodFactsSodium(null), null);
});

test('accumulateNutrientTotals sums known values and preserves null for untracked', () => {
  const acc = accumulateNutrientTotals({}, { sodium: 200, sugars: 5 });
  const acc2 = accumulateNutrientTotals(acc, { sodium: 100, fiber: 3.25 });
  assert.equal(acc2.sodium, 300);
  assert.equal(acc2.sugars, 5);
  assert.equal(acc2.fiber, 3.3);
  assert.equal(acc2.saturatedFats, null);
});

test('computeNutrientCoverage flags partial sums when entries mix known + null', () => {
  const coverage = computeNutrientCoverage([
    { sodium: 200, fiber: null },
    { sodium: null, fiber: 3 },
    { sodium: 100, fiber: 2 },
  ]);
  assert.deepEqual(coverage.sodium, {
    knownCount: 2,
    untrackedCount: 1,
    hasUntracked: true,
  });
  assert.deepEqual(coverage.fiber, {
    knownCount: 2,
    untrackedCount: 1,
    hasUntracked: true,
  });
  assert.deepEqual(coverage.sugars, {
    knownCount: 0,
    untrackedCount: 3,
    hasUntracked: false,
  });
});

test('formatNutrientValue renders units, blanks and decimals per canonical meta', () => {
  assert.equal(formatNutrientValue(null, 'sodium'), '—');
  assert.equal(formatNutrientValue(200, 'sodium'), '200 mg');
  assert.equal(formatNutrientValue(3.25, 'fiber'), '3.3 g');
  assert.equal(formatNutrientValue(0, 'saturatedFats'), '0.0 g');
  assert.equal(formatNutrientValue(0, 'sodium', { unit: false }), '0');
});