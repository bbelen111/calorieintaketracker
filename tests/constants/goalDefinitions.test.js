import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOAL_DEFINITIONS,
  GOAL_KEYS,
  isGoalKey,
  getGoalDirectionThreshold,
  getGoalRateBand,
  getTrendLabelThresholds,
  kcalPerDayToKgPerWeek,
  resolveGoalForDailyDelta,
} from '../../src/constants/goals/goalDefinitions.js';
import { resolveGoalCalorieDelta } from '../../src/utils/calculations/calculations.js';
import { calculateGoalAlignment } from '../../src/utils/calculations/goalAlignment.js';
import { PHASE_TEMPLATES } from '../../src/constants/phases/phaseTemplates.js';
import { calculateBodyFatTrend } from '../../src/utils/measurements/bodyFat.js';
import { calculateWeightTrend } from '../../src/utils/measurements/weight.js';

// The verdict text and band labels (`trackerHelpers.jsx`) are pinned against
// this table in `src/utils/visuals/trackerHelpers.spec.js` (UI tier: JSX).

test('a planned daily change is classified into all five goals', () => {
  assert.equal(resolveGoalForDailyDelta(0), 'maintenance');
  assert.equal(resolveGoalForDailyDelta(99), 'maintenance');
  assert.equal(resolveGoalForDailyDelta(-99), 'maintenance');
  assert.equal(resolveGoalForDailyDelta(100), 'bulking');
  assert.equal(resolveGoalForDailyDelta(499), 'bulking');
  // An aggressive goal starts at its own delta.
  assert.equal(resolveGoalForDailyDelta(500), 'aggressive_bulk');
  assert.equal(resolveGoalForDailyDelta(692), 'aggressive_bulk');
  assert.equal(resolveGoalForDailyDelta(-100), 'cutting');
  assert.equal(resolveGoalForDailyDelta(-499), 'cutting');
  assert.equal(resolveGoalForDailyDelta(-500), 'aggressive_cut');
  assert.equal(resolveGoalForDailyDelta(Number.NaN), 'maintenance');
});

test('every goal’s own calorie change classifies back to that goal', () => {
  GOAL_KEYS.forEach((key) => {
    assert.equal(resolveGoalForDailyDelta(resolveGoalCalorieDelta(key)), key);
  });
});

test('every goal’s own calorie change sits inside its own weight band', () => {
  // Aggressive Bulk at +500 kcal (0.45 kg/wk) used to sit below its 0.5 floor.
  GOAL_KEYS.forEach((key) => {
    const goal = GOAL_DEFINITIONS[key];
    const speed = Math.abs(kcalPerDayToKgPerWeek(goal.calorieDelta));
    assert.ok(speed >= goal.weeklyRateKg.min, key);
    assert.ok(speed <= goal.weeklyRateKg.max, key);
    assert.notEqual(
      calculateGoalAlignment(
        kcalPerDayToKgPerWeek(goal.calorieDelta),
        key,
        'weight'
      ).alignment,
      'poor',
      key
    );
  });
});

test('moderate and aggressive bands meet exactly at the aggressive delta', () => {
  const edge = kcalPerDayToKgPerWeek(500);
  assert.equal(GOAL_DEFINITIONS.bulking.weeklyRateKg.max, edge);
  assert.equal(GOAL_DEFINITIONS.aggressive_bulk.weeklyRateKg.min, edge);
  assert.equal(GOAL_DEFINITIONS.cutting.weeklyRateKg.max, edge);
  assert.equal(GOAL_DEFINITIONS.aggressive_cut.weeklyRateKg.min, edge);
});

test('calculateGoalAlignment judges a +692 kcal plan as an Aggressive Bulk', () => {
  const rate = kcalPerDayToKgPerWeek(692);
  assert.equal(
    calculateGoalAlignment(rate, 'aggressive_bulk', 'weight').description,
    'On track'
  );
  // Judged as a Lean Bulk, the same plan is "too fast".
  assert.equal(
    calculateGoalAlignment(rate, 'bulking', 'weight').description,
    'Slightly too fast'
  );
});

test('body-fat bands are the ones the Body Fat trend sheet always documented', () => {
  assert.deepEqual(getGoalRateBand('bulking', 'bodyFat'), {
    min: 0.08,
    max: 0.15,
    direction: 'up',
  });
  assert.deepEqual(getGoalRateBand('aggressive_cut', 'bodyFat'), {
    min: 0.15,
    max: 0.3,
    direction: 'down',
  });
  assert.deepEqual(getGoalRateBand('maintenance', 'bodyFat'), {
    min: 0,
    max: 0.1,
    direction: 'flat',
  });
  assert.equal(getGoalRateBand('bulk', 'bodyFat'), null);
  // Moderate and aggressive meet; no gap, no overlap.
  assert.equal(
    getGoalRateBand('bulking', 'bodyFat').max,
    getGoalRateBand('aggressive_bulk', 'bodyFat').min
  );
});

test('the "flat" zone ends where the slowest band starts', () => {
  assert.equal(getGoalDirectionThreshold('weight'), 0.1);
  assert.equal(getGoalDirectionThreshold('bodyFat'), 0.08);
  // +0.09 %/wk is inside Lean Bulk's 0.08-0.15 band: graded within it, not
  // "Not progressing as expected" as the old 0.1 flat zone made it.
  assert.equal(
    calculateGoalAlignment(0.09, 'bulking', 'bodyFat').description,
    'Within acceptable range'
  );
});

test('isGoalKey accepts exactly the five goals', () => {
  assert.deepEqual(GOAL_KEYS, [
    'aggressive_bulk',
    'bulking',
    'maintenance',
    'cutting',
    'aggressive_cut',
  ]);
  assert.equal(isGoalKey('bulking'), true);
  assert.equal(isGoalKey('bulk'), false);
  assert.equal(isGoalKey('hasOwnProperty'), false);
  assert.equal(isGoalKey(undefined), false);
});

test('a target-mode template’s goal is the goal its own plan lands in', () => {
  PHASE_TEMPLATES.filter((t) => t.creationMode === 'target').forEach((t) => {
    const kcalPerDay = Math.round(
      (t.targetWeightChange * 7700) / t.suggestedDuration
    );
    assert.equal(t.goalType, resolveGoalForDailyDelta(kcalPerDay), t.id);
  });
});

test('trend label edges: weight unchanged, body fat sized from its own bands', () => {
  assert.deepEqual(getTrendLabelThresholds('weight'), {
    stable: 0.1,
    gradual: 0.45,
    moderate: 0.8,
    aggressive: 1.2,
  });
  assert.deepEqual(getTrendLabelThresholds('bodyFat'), {
    stable: 0.08,
    gradual: 0.15,
    moderate: 0.24,
    aggressive: 0.36,
  });
});

test('body-fat trend labels follow the body-fat bands', () => {
  const trend = (start, end, days) =>
    calculateBodyFatTrend(
      [
        { date: '2026-01-01', bodyFat: start },
        {
          date: new Date(Date.UTC(2026, 0, 1 + days))
            .toISOString()
            .slice(0, 10),
          bodyFat: end,
        },
      ],
      days
    );

  // A Lean Bulk's +0.09 %/wk used to read "Stable".
  assert.equal(trend(20, 20.9, 70).label, 'Gradual body fat gain');
  assert.equal(trend(20, 20.4, 14).label, 'Moderate body fat gain'); // 0.2
  assert.equal(trend(20, 19.4, 14).label, 'Aggressive body fat loss'); // -0.3
  assert.equal(trend(20, 21, 14).label, 'Severe body fat gain'); // 0.5
  assert.equal(trend(20, 20.05, 14).label, 'Stable'); // 0.025
});

test('weight trend labels keep their long-standing edges', () => {
  const trend = (start, end, days) =>
    calculateWeightTrend(
      [
        { date: '2026-01-01', weight: start },
        {
          date: new Date(Date.UTC(2026, 0, 1 + days))
            .toISOString()
            .slice(0, 10),
          weight: end,
        },
      ],
      days
    );

  assert.equal(trend(80, 80.1, 14).label, 'Stable'); // 0.05
  assert.equal(trend(80, 80.6, 14).label, 'Gradual weight gain'); // 0.3
  assert.equal(trend(80, 81, 14).label, 'Moderate weight gain'); // 0.5
  assert.equal(trend(80, 78, 14).label, 'Aggressive weight loss'); // -1.0
  assert.equal(trend(80, 77, 14).label, 'Severe weight loss'); // -1.5
});
