import assert from 'node:assert/strict';
import test from 'node:test';

import { getStepCaloriesDetails, getStepDetails } from '../../src/utils/steps.js';

test('getStepDetails keeps rounded calories value', () => {
  const userData = { weight: 74, height: 168, gender: 'male' };
  const details = getStepDetails('10k', userData);
  const expectedRoundedCalories = Math.round(
    getStepCaloriesDetails(details.estimatedSteps, userData).calories
  );

  assert.equal(details.calories, expectedRoundedCalories);
  assert.equal(Number.isInteger(details.calories), true);
});

test('getStepDetails still exposes full calorie details payload', () => {
  const details = getStepDetails('12k-14k', {
    weight: 80,
    height: 180,
    gender: 'male',
  });

  assert.ok(Number.isFinite(details.distanceKm));
  assert.ok(Number.isFinite(details.caloriesPerMile));
  assert.ok(Number.isFinite(details.stepCount));
});
