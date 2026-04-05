import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateMacroRecommendations,
  constrainMacroSplitForTarget,
  createMacroTriangleGeometry,
  macroSplitFromConstrainedTrianglePoint,
  macroSplitFromTrianglePoint,
  macroSplitToConstrainedTrianglePoint,
  macroSplitToTrianglePoint,
  normalizeMacroRecommendationSplit,
  projectMacroSplitToConstraints,
} from '../../src/utils/calculations/macroRecommendations.js';

test('normalizeMacroRecommendationSplit falls back to defaults when invalid', () => {
  const split = normalizeMacroRecommendationSplit({
    protein: -2,
    carbs: null,
    fats: undefined,
  });

  assert.deepEqual(split, {
    protein: 0.3,
    carbs: 0.4,
    fats: 0.3,
  });
});

test('calculateMacroRecommendations applies bounded constraints with bodyweight fallback', () => {
  const recommendation = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
  });

  assert.equal(recommendation.grams.protein, 187.5);
  assert.equal(recommendation.grams.fats, 83.3);
  assert.equal(recommendation.ranges.protein.min, 112);
  assert.equal(recommendation.ranges.protein.max, 196);
  assert.equal(recommendation.ranges.fats.min, 42);
  assert.equal(recommendation.ranges.fats.max, 112);
  assert.equal(recommendation.bounds.leanMassKg, null);
  assert.equal(recommendation.bounds.massForProteinKg, 70);
  assert.equal(
    recommendation.calories.protein +
      recommendation.calories.carbs +
      recommendation.calories.fats,
    2500
  );
});

test('calculateMacroRecommendations uses body-fat-derived lean mass for protein bounds', () => {
  const recommendation = calculateMacroRecommendations({
    targetCalories: 2300,
    macroSplit: { protein: 0.2, carbs: 0.5, fats: 0.3 },
    userData: {
      weight: 80,
      bodyFatTrackingEnabled: true,
      bodyFatEntries: [{ date: '2026-03-28', bodyFat: 20 }],
    },
  });

  assert.equal(recommendation.bounds.massForProteinKg, 64);
  assert.equal(recommendation.bounds.leanMassKg, 64);
  assert.equal(recommendation.ranges.protein.min, 102);
  assert.equal(recommendation.ranges.protein.max, 179);
});

test('macro triangle conversion keeps split stable through point conversion', () => {
  const geometry = createMacroTriangleGeometry();
  const inputSplit = { protein: 0.25, carbs: 0.45, fats: 0.3 };
  const point = macroSplitToTrianglePoint(inputSplit, geometry);
  const outputSplit = macroSplitFromTrianglePoint(point, geometry);

  assert.ok(Math.abs(outputSplit.protein - inputSplit.protein) < 0.02);
  assert.ok(Math.abs(outputSplit.carbs - inputSplit.carbs) < 0.02);
  assert.ok(Math.abs(outputSplit.fats - inputSplit.fats) < 0.02);
});

test('constraint projection preserves protein-first then fat floor and relaxes carb floor when needed', () => {
  const constrained = projectMacroSplitToConstraints({
    targetCalories: 900,
    macroSplit: { protein: 0.1, carbs: 0.8, fats: 0.1 },
    userData: {
      weight: 80,
      bodyFatTrackingEnabled: false,
    },
  });

  assert.equal(constrained.grams.protein, 128);
  assert.equal(constrained.grams.fats, 48);
  assert.ok(constrained.grams.carbs < 50);
  assert.ok(constrained.warnings.includes('carb_soft_floor_relaxed'));
  assert.equal(
    constrained.calories.protein +
      constrained.calories.carbs +
      constrained.calories.fats,
    900
  );
});

test('triangle split can be constrained for a target before persistence', () => {
  const constrainedSplit = constrainMacroSplitForTarget({
    targetCalories: 2200,
    macroSplit: { protein: 0.05, carbs: 0.85, fats: 0.1 },
    userData: { weight: 75 },
  });

  const normalized = normalizeMacroRecommendationSplit(constrainedSplit);
  assert.ok(normalized.protein > 0.2);
  assert.ok(normalized.fats > 0.1);
  assert.ok(Math.abs(normalized.protein + normalized.carbs + normalized.fats - 1) < 1e-6);
});

test('constrained triangle mapping keeps full-surface interaction within bounds', () => {
  const geometry = createMacroTriangleGeometry();
  const options = {
    targetCalories: 2200,
    userData: { weight: 80 },
  };
  const recommendationAtCenter = calculateMacroRecommendations({
    targetCalories: options.targetCalories,
    macroSplit: { protein: 1 / 3, carbs: 1 / 3, fats: 1 / 3 },
    userData: options.userData,
  });
  const bounds = recommendationAtCenter.bounds;

  const testPoints = [
    geometry.vertices.protein,
    geometry.vertices.fats,
    geometry.vertices.carbs,
    { x: geometry.width / 2, y: geometry.height / 2 },
  ];

  for (const point of testPoints) {
    const split = macroSplitFromConstrainedTrianglePoint(point, geometry, options);
    const recommendation = calculateMacroRecommendations({
      targetCalories: options.targetCalories,
      macroSplit: split,
      userData: options.userData,
    });

    assert.ok(recommendation.grams.protein >= bounds.protein.min - 0.2);
    assert.ok(recommendation.grams.protein <= bounds.protein.max + 0.2);
    assert.ok(recommendation.grams.fats >= bounds.fats.min - 0.2);
    assert.ok(recommendation.grams.fats <= bounds.fats.max + 0.2);
  }
});

test('constrained triangle has stable point conversion for constrained split', () => {
  const geometry = createMacroTriangleGeometry();
  const options = {
    targetCalories: 2400,
    userData: { weight: 78 },
  };

  const inputSplit = { protein: 0.2, carbs: 0.55, fats: 0.25 };
  const constrainedInput = calculateMacroRecommendations({
    targetCalories: options.targetCalories,
    macroSplit: inputSplit,
    userData: options.userData,
  }).constrainedSplit;
  const point = macroSplitToConstrainedTrianglePoint(inputSplit, geometry, options);
  const outputSplit = macroSplitFromConstrainedTrianglePoint(
    point,
    geometry,
    options
  );

  assert.ok(Math.abs(outputSplit.protein - constrainedInput.protein) < 0.03);
  assert.ok(Math.abs(outputSplit.carbs - constrainedInput.carbs) < 0.03);
  assert.ok(Math.abs(outputSplit.fats - constrainedInput.fats) < 0.03);
});
