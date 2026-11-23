import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NUTRIENT_PICKER_FIELDS,
  PORTION_GRAMS_PICKER_FIELD,
  formatPickerDisplayValue,
  formatPickerValueForState,
  getStepPrecision,
  normalizePickerValue,
} from '../../src/utils/food/nutrientPicker.js';

test('the shared picker fields cover every nutrition input and a portion weight', () => {
  assert.deepEqual(Object.keys(NUTRIENT_PICKER_FIELDS).sort(), [
    'calories',
    'carbs',
    'fats',
    'fiber',
    'protein',
    'saturatedFats',
    'sodium',
    'sugars',
  ]);

  // Calories snap in 5 kcal steps; sodium uses whole milligrams.
  assert.equal(NUTRIENT_PICKER_FIELDS.calories.step, 5);
  assert.equal(NUTRIENT_PICKER_FIELDS.sodium.step, 10);
  assert.equal(PORTION_GRAMS_PICKER_FIELD.min, 1);
});

test('normalizePickerValue clamps and snaps onto the configured step', () => {
  const calories = NUTRIENT_PICKER_FIELDS.calories;
  assert.equal(normalizePickerValue(87, calories), 85);
  assert.equal(normalizePickerValue(88, calories), 90);
  assert.equal(normalizePickerValue(-10, calories), 0);
  assert.equal(normalizePickerValue(9999, calories), 5000);

  // Non-finite input falls back to the minimum.
  assert.equal(normalizePickerValue(Number.NaN, calories), 0);

  const protein = NUTRIENT_PICKER_FIELDS.protein;
  assert.equal(normalizePickerValue(10.25, protein), 10.5);
});

test('formatPickerValueForState trims the configured precision', () => {
  assert.equal(formatPickerValueForState(10, 5), '10');
  assert.equal(formatPickerValueForState(10.5, 0.5), '10.5');
  assert.equal(formatPickerValueForState(10, 0.5), '10');
  assert.equal(getStepPrecision(0.5), 1);
  assert.equal(getStepPrecision(5), 0);
});

test('formatPickerDisplayValue renders unset, integer and decimal values', () => {
  assert.equal(formatPickerDisplayValue('', 'g'), '0 g');
  assert.equal(formatPickerDisplayValue(null, 'kcal'), '0 kcal');
  assert.equal(formatPickerDisplayValue('25', 'kcal'), '25 kcal');
  assert.equal(formatPickerDisplayValue('12.5', 'g'), '12.5 g');
  assert.equal(formatPickerDisplayValue('12.34', 'g'), '12.3 g');
  assert.equal(formatPickerDisplayValue('7'), '7');
});
