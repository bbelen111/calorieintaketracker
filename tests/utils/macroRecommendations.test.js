import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateMacroRecommendations,
  createMacroTriangleGeometry,
  macroSplitFromTrianglePoint,
  macroSplitToTrianglePoint,
  normalizeMacroRecommendationSplit,
} from '../../src/utils/macroRecommendations.js';

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

test('calculateMacroRecommendations resolves grams and ranges from target calories', () => {
  const recommendation = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
  });

  assert.equal(recommendation.grams.protein, 188);
  assert.equal(recommendation.grams.carbs, 250);
  assert.equal(recommendation.grams.fats, 83);
  assert.equal(recommendation.ranges.protein.min, 188);
  assert.equal(recommendation.ranges.protein.max, 226);
  assert.equal(recommendation.ranges.fats.min, 83);
  assert.equal(recommendation.ranges.fats.max, 104);
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
