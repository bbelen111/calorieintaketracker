import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getStepCaloriesDetails,
  getStepDetails,
  getStepOverlapFromCardioSessions,
  isStepBasedCardioType,
} from '../../src/utils/steps.js';

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

test('isStepBasedCardioType identifies ambulatory types and rejects non-ambulatory types', () => {
  assert.equal(
    isStepBasedCardioType('treadmill_walk', {
      label: 'Treadmill Walk',
      ambulatory: true,
      cadence: 118,
    }),
    true
  );
  assert.equal(
    isStepBasedCardioType('running_trail', {
      label: 'Trail Running',
      ambulatory: true,
      cadence: 164,
    }),
    true
  );
  assert.equal(
    isStepBasedCardioType('bike_stationary', {
      label: 'Stationary Bike',
      ambulatory: false,
      cadence: 0,
    }),
    false
  );
  assert.equal(
    isStepBasedCardioType('rowing', {
      label: 'Rowing Machine',
      ambulatory: false,
      cadence: 0,
    }),
    false
  );
});

test('getStepOverlapFromCardioSessions deducts only enabled relevant sessions and clamps at zero', () => {
  const overlap = getStepOverlapFromCardioSessions({
    estimatedSteps: 8000,
    cardioTypes: {
      treadmill_walk: {
        label: 'Treadmill Walk',
        ambulatory: true,
        cadence: 118,
      },
      running_trail: {
        label: 'Trail Running',
        ambulatory: true,
        cadence: 164,
      },
      bike_stationary: {
        label: 'Stationary Bike',
        ambulatory: false,
        cadence: 0,
      },
    },
    cardioSessions: [
      {
        id: 1,
        type: 'treadmill_walk',
        duration: 30,
        intensity: 'moderate',
        effortType: 'intensity',
        stepOverlapEnabled: true,
      },
      {
        id: 2,
        type: 'running_trail',
        duration: 20,
        intensity: 'vigorous',
        effortType: 'heartRate',
        averageHeartRate: 170,
        stepOverlapEnabled: false,
      },
      {
        id: 3,
        type: 'bike_stationary',
        duration: 40,
        intensity: 'moderate',
        effortType: 'intensity',
      },
    ],
  });

  assert.equal(overlap.originalEstimatedSteps, 8000);
  assert.ok(overlap.rawDeductedSteps > 0);
  assert.equal(overlap.stepOverlapApplicableSessionsCount, 2);
  assert.equal(overlap.stepOverlapSessionsCount, 1);
  assert.equal(overlap.remainingEstimatedSteps, 8000 - overlap.deductedSteps);
  assert.ok(overlap.remainingEstimatedSteps >= 0);
});
