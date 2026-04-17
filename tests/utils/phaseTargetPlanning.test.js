import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeasibleDateBands,
  deriveTargetCreationModePayload,
  estimateGoalModeProjection,
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

test('buildFeasibleDateBands separates strict, lenient, and blocked windows', () => {
  const bands = buildFeasibleDateBands({
    startDate: '2026-04-01',
    minEndDate: '2026-04-02',
    maxEndDate: '2026-04-12',
    startWeightKg: 80,
    targetWeightKg: 79,
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
  assert.ok(Number.isFinite(projection.predictedBodyFatDeltaPercent));
});
