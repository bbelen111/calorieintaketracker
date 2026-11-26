import test from 'node:test';
import assert from 'node:assert/strict';

import { goals } from '../../src/constants/goals/goals.js';
import { DEFAULT_UNIT_PREFERENCES } from '../../src/constants/units/units.js';
import { createUnitFormatter } from '../../src/utils/units/unitFormatter.js';
import {
  describeActiveGoalTarget,
  describeGoal,
} from '../../src/utils/units/goalDescription.js';
import {
  describeGoalTarget,
  formatSignedKcal,
} from '../../src/utils/calculations/dayLedgerPresentation.js';
import { buildHeroActionModel } from '../../src/utils/calculations/heroActionMetrics.js';
import { formatEnergyFieldValue } from '../../src/utils/food/nutrientPicker.js';
import { getSortLabel } from '../../src/utils/food/foodListing.js';

const KJ_PREFERENCES = { ...DEFAULT_UNIT_PREFERENCES, energy: 'kJ' };
const KJ = createUnitFormatter(KJ_PREFERENCES);
const METRIC = createUnitFormatter(DEFAULT_UNIT_PREFERENCES);

const hero = (metric, inputs = {}, userData = {}) =>
  buildHeroActionModel({
    metric,
    userData: { unitPreferences: KJ_PREFERENCES, ...userData },
    todayKey: '2026-03-10',
    ...inputs,
  });

test('hero energy metrics are written in kilojoules', () => {
  const calories = hero('calories', { consumed: 500, calorieTarget: 2000 });
  assert.equal(calories.value, '2,092 / 8,368');
  assert.equal(calories.unit, 'kJ');
  assert.equal(calories.shortLabel, 'Energy');
  // Progress is a ratio of the stored kcal.
  assert.equal(calories.progress, 25);

  const left = hero('caloriesLeft', { consumed: 500.4, calorieTarget: 2000 });
  // The exact 1499.6 kcal, not the rounded 1500.
  assert.equal(left.value, '6,274');
  assert.equal(left.unit, 'kJ left');

  const burn = hero('burn', { exerciseBurn: 100 });
  assert.equal(burn.unit, 'kJ burned');
  assert.equal(burn.value, '418');
});

test('hero energy metrics are unchanged in kcal', () => {
  const model = buildHeroActionModel({
    metric: 'calories',
    userData: {},
    consumed: 500.4,
    calorieTarget: 2000,
  });
  assert.equal(model.value, '500 / 2,000');
  assert.equal(model.ariaLabel, 'Calories today, 500 of 2000 kcal. Add meal');
});

test('ledger text converts from kcal', () => {
  assert.equal(formatSignedKcal(300), '+300');
  assert.equal(formatSignedKcal(300, KJ), '+1,255');
  assert.equal(formatSignedKcal(-120, KJ), '-502');
  assert.equal(formatSignedKcal(undefined, KJ), '—');
  assert.equal(describeGoalTarget(300), '300 kcal deficit');
  assert.equal(describeGoalTarget(-500, KJ), '2,092 kJ surplus');
});

test('goal descriptions keep their text in kcal and convert in kJ', () => {
  assert.equal(
    describeGoal('cutting', goals.cutting, METRIC),
    '-300 kcal deficit'
  );
  assert.equal(describeGoal('cutting', goals.cutting, KJ), '-1,255 kJ deficit');
  assert.equal(
    describeGoal('aggressive_bulk', goals.aggressive_bulk, KJ),
    '+2,092 kJ surplus'
  );
  assert.equal(describeGoal('maintenance', goals.maintenance, KJ), 'At TDEE');
});

test('the active goal target writes a phase-owned delta out', () => {
  // Matches the goal: identical to describeGoal.
  assert.equal(
    describeActiveGoalTarget('cutting', goals.cutting, METRIC, 300),
    '-300 kcal deficit'
  );
  assert.equal(
    describeActiveGoalTarget('cutting', goals.cutting, METRIC, null),
    '-300 kcal deficit'
  );
  // A phase's smart delta differs from the nominal one.
  assert.equal(
    describeActiveGoalTarget('cutting', goals.cutting, METRIC, 550),
    '-550 kcal deficit'
  );
  assert.equal(
    describeActiveGoalTarget('bulking', goals.bulking, KJ, -400),
    '+1,674 kJ surplus'
  );
  assert.equal(
    describeActiveGoalTarget('cutting', goals.cutting, METRIC, 0),
    'At TDEE'
  );
});

test('form energy fields and sort labels follow the unit', () => {
  assert.equal(formatEnergyFieldValue('250', METRIC.energy), '250 kcal');
  assert.equal(formatEnergyFieldValue('202.2', KJ.energy), '846 kJ');
  assert.equal(formatEnergyFieldValue('', KJ.energy), '0 kJ');
  assert.equal(getSortLabel('calories', 'asc', KJ.energy.noun), 'Energy ↑');
  assert.equal(getSortLabel('protein', 'desc', KJ.energy.noun), 'Protein ↓');
  assert.equal(getSortLabel('calories', 'asc'), 'Calories ↑');
});
