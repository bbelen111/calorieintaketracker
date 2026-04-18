import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeasibleDateBands,
  deriveTargetCreationModePayload,
  estimateGoalModeProjection,
  PHASE_TARGET_PLANNING_ERROR,
  getAggressivenessBandDisplayLabel,
  estimateRequiredDailyEnergyDelta,
} from '../../src/utils/calculations/phaseTargetPlanning.js';

test('estimateRequiredDailyEnergyDelta calculates deficit for weight-loss target', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-05-01',
    startWeightKg: 80,
    targetWeightKg: 77,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight');
  assert.equal(result.recommendedGoalType, 'cutting');
  assert.ok(result.requiredDailyDeltaCalories < 0);
  assert.equal(result.aggressivenessBand, 'strict');
});

test('estimateRequiredDailyEnergyDelta supports body-fat-only targeting when weight anchor exists', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-06-01',
    startWeightKg: 82,
    startBodyFatPercent: 20,
    targetBodyFatPercent: 17,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'bodyFat');
  assert.equal(result.recommendedGoalType, 'cutting');
  assert.ok(Number.isFinite(result.totalDeltaCalories));
});

test('estimateRequiredDailyEnergyDelta treats slow long-horizon targets as lenient', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2027-03-27',
    startWeightKg: 80,
    targetWeightKg: 79,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight');
  assert.equal(result.recommendedGoalType, 'maintenance');
  assert.equal(result.aggressivenessBand, 'lenient');
  assert.ok(Math.abs(result.requiredDailyDeltaCalories) < 100);
});

test('estimateRequiredDailyEnergyDelta still blocks overly aggressive timelines', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-04-02',
    startWeightKg: 80,
    targetWeightKg: 75,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight');
  assert.equal(result.recommendedGoalType, 'cutting');
  assert.equal(result.aggressivenessBand, 'blocked');
});

test('estimateRequiredDailyEnergyDelta classifies reasonable bulking pace as strict/lenient', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-05-01',
    startWeightKg: 70,
    targetWeightKg: 74,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight');
  assert.equal(result.recommendedGoalType, 'bulking');
  assert.ok(result.requiredDailyDeltaCalories > 0);
  assert.ok(
    result.aggressivenessBand === 'strict' ||
      result.aggressivenessBand === 'lenient'
  );
});

test('estimateRequiredDailyEnergyDelta blocks extremely aggressive bulking timelines', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-04-11',
    startWeightKg: 70,
    targetWeightKg: 72,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight');
  assert.equal(result.recommendedGoalType, 'bulking');
  assert.equal(result.aggressivenessBand, 'blocked');
});

test('buildFeasibleDateBands separates strict, lenient, and blocked windows', () => {
  const bands = buildFeasibleDateBands({
    startDate: '2026-04-01',
    minEndDate: '2026-04-02',
    maxEndDate: '2026-04-12',
    startWeightKg: 80,
    targetWeightKg: 79,
    includeDateKeys: true,
    includeEvaluations: true,
  });

  assert.ok(Array.isArray(bands.strictDateKeys));
  assert.ok(Array.isArray(bands.lenientDateKeys));
  assert.ok(Array.isArray(bands.blockedDateKeys));
  assert.ok(Array.isArray(bands.evaluations));
  assert.equal(
    bands.strictDateKeys.length +
      bands.lenientDateKeys.length +
      bands.blockedDateKeys.length,
    bands.evaluations.length
  );
  assert.equal(
    bands.strictCount + bands.lenientCount + bands.blockedCount,
    bands.evaluations.length
  );
  assert.ok(
    bands.feasibleMinDateKey === null ||
      typeof bands.feasibleMinDateKey === 'string'
  );
  assert.ok(
    bands.feasibleMaxDateKey === null ||
      typeof bands.feasibleMaxDateKey === 'string'
  );
});

test('deriveTargetCreationModePayload returns smart calorie plan metadata', () => {
  const payload = deriveTargetCreationModePayload({
    startDate: '2026-04-01',
    endDate: '2026-07-01',
    startWeightKg: 70,
    targetWeightKg: 74,
  });

  assert.ok(payload);
  assert.equal(payload.creationMode, 'target');
  assert.equal(payload.targetMetric, 'weight');
  assert.equal(payload.recommendedGoalType, 'bulking');
  assert.ok(
    Number.isFinite(payload.smartCaloriePlan.requiredDailyDeltaCalories)
  );
  assert.ok(payload.smartCaloriePlan.daySpan > 0);
});

test('estimateGoalModeProjection returns projected weight/body-fat deltas for goal mode', () => {
  const projection = estimateGoalModeProjection({
    startDate: '2026-04-01',
    endDate: '2026-04-15',
    goalType: 'cutting',
    currentWeightKg: 80,
  });

  assert.ok(projection);
  assert.equal(projection.daySpan, 14);
  assert.equal(projection.dailyDelta, -300);
  assert.ok(projection.predictedWeightDeltaKg < 0);
  assert.ok(Number.isFinite(projection.predictedWeightDeltaPercent));
  assert.equal(
    projection.predictedBodyFatDeltaPercent,
    projection.predictedWeightDeltaPercent
  );
});

test('estimateRequiredDailyEnergyDelta prioritizes weight target when both weight and body-fat targets are provided', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-05-01',
    startWeightKg: 80,
    targetWeightKg: 79,
    startBodyFatPercent: 20,
    targetBodyFatPercent: 19,
  });

  assert.ok(result);
  assert.equal(result.targetMetric, 'weight_and_body_fat');
  assert.equal(result.totalDeltaCalories, -7700);
  assert.ok(Number.isFinite(result.components.weightDeltaKcal));
  assert.ok(Number.isFinite(result.components.bodyFatDeltaKcal));
});

test('estimateRequiredDailyEnergyDelta uses midpoint mass for body-fat-only energy delta when target weight is provided', () => {
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-01',
    endDate: '2026-05-01',
    startWeightKg: 80,
    targetWeightKg: 70,
    startBodyFatPercent: 25,
    targetBodyFatPercent: 20,
  });

  assert.ok(result);
  // Midpoint mass = 75kg; BF delta = -5% => -0.05 * 75 * 7700 = -28875
  assert.equal(result.components.bodyFatDeltaKcal, -28875);
});

test('estimateRequiredDailyEnergyDelta can expose diagnostics error code for invalid date range', () => {
  const diagnostics = {};
  const result = estimateRequiredDailyEnergyDelta({
    startDate: '2026-04-10',
    endDate: '2026-04-01',
    startWeightKg: 80,
    targetWeightKg: 79,
    diagnostics,
  });

  assert.equal(result, null);
  assert.equal(
    diagnostics.errorCode,
    PHASE_TARGET_PLANNING_ERROR.INVALID_DATE_RANGE
  );
});

test('buildFeasibleDateBands does not materialize evaluations unless requested', () => {
  const bands = buildFeasibleDateBands({
    startDate: '2026-04-01',
    minEndDate: '2026-04-02',
    maxEndDate: '2026-04-12',
    startWeightKg: 80,
    targetWeightKg: 79,
  });

  assert.deepEqual(bands.evaluations, []);
});

test('getAggressivenessBandDisplayLabel returns pace labels for strict/lenient/blocked', () => {
  assert.equal(
    getAggressivenessBandDisplayLabel({
      aggressivenessBand: 'strict',
      requiredDailyDeltaCalories: -450,
    }),
    'Optimal pace'
  );

  assert.equal(
    getAggressivenessBandDisplayLabel({
      aggressivenessBand: 'lenient',
      requiredDailyDeltaCalories: 75,
    }),
    'Sustainable pace'
  );

  assert.equal(
    getAggressivenessBandDisplayLabel({
      aggressivenessBand: 'lenient',
      requiredDailyDeltaCalories: 700,
    }),
    'Aggressive pace'
  );

  assert.equal(
    getAggressivenessBandDisplayLabel({
      aggressivenessBand: 'blocked',
      requiredDailyDeltaCalories: 1500,
    }),
    'Too fast'
  );
});
