import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePortionUnit,
  resolveEntryGrams,
  scaleMacrosFromPer100g,
} from '../../src/utils/food/portionNormalization.js';

test('normalizePortionUnit lowercases and trims values', () => {
  assert.equal(normalizePortionUnit('  TbSp  '), 'tbsp');
  assert.equal(normalizePortionUnit(null), '');
});

test('resolveEntryGrams prioritizes explicit grams', () => {
  const resolved = resolveEntryGrams({ grams: 185, quantity: 2, unit: 'cup' });

  assert.equal(resolved.grams, 185);
  assert.equal(resolved.method, 'explicit_grams');
  assert.equal(resolved.assumed, false);
});

test('resolveEntryGrams resolves quantity and unit when grams missing', () => {
  const resolved = resolveEntryGrams({ quantity: 2, unit: 'tbsp' });

  assert.equal(resolved.grams, 30);
  assert.equal(resolved.method, 'quantity_unit:tbsp');
  assert.equal(resolved.assumed, true);
});

test('resolveEntryGrams falls back to default grams for unknown units', () => {
  const resolved = resolveEntryGrams(
    { quantity: 3, unit: 'scoop' },
    { fallbackGrams: 120 }
  );

  assert.equal(resolved.grams, 120);
  assert.equal(resolved.method, 'fallback_default');
  assert.equal(resolved.assumed, true);
});

test('scaleMacrosFromPer100g scales and rounds correctly', () => {
  const scaled = scaleMacrosFromPer100g(
    { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
    150
  );

  assert.deepEqual(scaled, {
    calories: 248,
    protein: 46.5,
    carbs: 0,
    fats: 5.4,
  });
});
