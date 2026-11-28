import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STEP_RANGES,
  STEP_RANGE_PRESETS,
  areStepRangesEquivalent,
  buildStepRangeLabel,
  compareStepRanges,
  findActiveStepRangePreset,
  findMatchingStepRange,
  formatCompactStepCount,
  formatStepRangeEstimate,
  getNextSuggestedStepCount,
  getStepCaloriesDetails,
  getStepDetails,
  getStepOverlapFromCardioSessions,
  isStepBasedCardioType,
  isStepGoalMatchedByRange,
  resolveClosestStepRange,
  sortAndDedupeStepRanges,
} from '../../src/utils/calculations/steps.js';
import { getDefaultEnergyMapData } from '../../src/utils/data/storage.js';

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

test('DEFAULT_STEP_RANGES stays in sync with storage defaults and Standard preset', () => {
  const defaults = getDefaultEnergyMapData();
  assert.deepEqual(DEFAULT_STEP_RANGES, defaults.stepRanges);
  assert.equal(findActiveStepRangePreset(DEFAULT_STEP_RANGES), 'standard');
  assert.equal(STEP_RANGE_PRESETS.length, 4);
});

test('formatCompactStepCount and buildStepRangeLabel produce parseable compact strings', () => {
  assert.equal(formatCompactStepCount(500), '500');
  assert.equal(formatCompactStepCount(10000), '10k');
  assert.equal(formatCompactStepCount(12500), '12.5k');
  assert.equal(formatCompactStepCount(0), '');

  assert.equal(
    buildStepRangeLabel({ mode: 'exact', primarySteps: 15000 }),
    '15k'
  );
  assert.equal(
    buildStepRangeLabel({ mode: 'under', primarySteps: 8000 }),
    '<8k'
  );
  assert.equal(
    buildStepRangeLabel({ mode: 'over', primarySteps: 25000 }),
    '>25k'
  );
  assert.equal(
    buildStepRangeLabel({
      mode: 'range',
      primarySteps: 10000,
      secondarySteps: 12000,
    }),
    '10k-12k'
  );
  assert.equal(
    buildStepRangeLabel({
      mode: 'range',
      primarySteps: 12000,
      secondarySteps: 12000,
    }),
    null
  );
});

test('sortAndDedupeStepRanges and compareStepRanges order ranges deterministically', () => {
  const sorted = sortAndDedupeStepRanges([
    '>20k',
    '10k-12k',
    '10k',
    '<10k',
    '10k',
    '  ',
    '12k',
  ]);
  assert.deepEqual(sorted, ['<10k', '10k', '10k-12k', '12k', '>20k']);
  assert.ok(compareStepRanges('10k', '10k-12k') < 0);
});

test('areStepRangesEquivalent and findMatchingStepRange detect semantic duplicates', () => {
  assert.equal(areStepRangesEquivalent('10k', '10000'), true);
  assert.equal(areStepRangesEquivalent('>20k', '20k+'), true);
  assert.equal(areStepRangesEquivalent('10k-12k', '10k–12k'), true);
  assert.equal(areStepRangesEquivalent('<10k', '10k'), false);

  assert.equal(
    findMatchingStepRange(['<10k', '10000', '20k+'], '10k'),
    '10000'
  );
  assert.equal(
    findMatchingStepRange(['<10k', '10000', '20k+'], '>20k'),
    '20k+'
  );
  assert.equal(findMatchingStepRange(['<10k', '10k'], '15k'), null);
});

test('getNextSuggestedStepCount skips existing ranges', () => {
  assert.equal(getNextSuggestedStepCount(DEFAULT_STEP_RANGES), 15000);
  assert.equal(
    getNextSuggestedStepCount([...DEFAULT_STEP_RANGES, '15k']),
    8000
  );
});

test('isStepGoalMatchedByRange highlights exact match or single containing bracket', () => {
  assert.equal(
    isStepGoalMatchedByRange('10k', 10000, DEFAULT_STEP_RANGES),
    true
  );
  assert.equal(
    isStepGoalMatchedByRange('12k', 10000, DEFAULT_STEP_RANGES),
    false
  );

  const banded = ['<6k', '6k-8k', '8k-10k', '10k-12k', '12k-15k', '>15k'];
  assert.equal(isStepGoalMatchedByRange('8k-10k', 10000, banded), false);
  assert.equal(isStepGoalMatchedByRange('10k-12k', 10000, banded), true);
  assert.equal(isStepGoalMatchedByRange('12k-15k', 15000, banded), true);
});

test('formatStepRangeEstimate distinguishes exact counts from approximations', () => {
  assert.equal(
    formatStepRangeEstimate({ operator: 'exact' }, 10000),
    '10,000 steps'
  );
  assert.equal(
    formatStepRangeEstimate({ operator: 'lt' }, 7500),
    '~7,500 steps'
  );
  assert.equal(formatStepRangeEstimate({ operator: 'exact' }, 0), '—');
});

test('resolveClosestStepRange preserves exact/equivalent matches and remaps cleanly on preset switch', () => {
  const everyday = ['<6k', '6k', '8k', '10k', '12k', '15k', '>15k'];
  const banded = ['<6k', '6k-8k', '8k-10k', '10k-12k', '12k-15k', '>15k'];

  // Exact match preserved
  assert.equal(resolveClosestStepRange(everyday, '12k'), '12k');
  // Semantically equivalent match preserved
  assert.equal(resolveClosestStepRange(everyday, '10000'), '10k');
  // Containing bracket preferred
  assert.equal(resolveClosestStepRange(banded, '14k'), '12k-15k');
  assert.equal(resolveClosestStepRange(banded, '10k'), '10k-12k');
  // Nearest estimated step count when outside exact/bracket matches
  assert.equal(resolveClosestStepRange(everyday, '18k'), '>15k');
  assert.equal(resolveClosestStepRange(everyday, '<10k'), '8k');
  // Empty / missing fallbacks
  assert.equal(resolveClosestStepRange([], '12k'), null);
  assert.equal(resolveClosestStepRange(everyday, ''), '<6k');
});
