import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateMacroRecommendations,
  constrainMacroSplitForTarget,
  createMacroTriangleGeometry,
  EMPTY_MACRO_LOCKS,
  getUnlockedMacroKeys,
  getUnlockedMacroRatio,
  hasAnyMacroLock,
  macroSplitFromConstrainedTrianglePoint,
  macroSplitFromTrianglePoint,
  macroSplitFromUnlockedRatio,
  macroSplitToConstrainedTrianglePoint,
  macroSplitToTrianglePoint,
  normalizeMacroLocks,
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
  assert.ok(
    Math.abs(normalized.protein + normalized.carbs + normalized.fats - 1) < 1e-6
  );
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
    const split = macroSplitFromConstrainedTrianglePoint(
      point,
      geometry,
      options
    );
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
  const point = macroSplitToConstrainedTrianglePoint(
    inputSplit,
    geometry,
    options
  );
  const outputSplit = macroSplitFromConstrainedTrianglePoint(
    point,
    geometry,
    options
  );

  assert.ok(Math.abs(outputSplit.protein - constrainedInput.protein) < 0.03);
  assert.ok(Math.abs(outputSplit.carbs - constrainedInput.carbs) < 0.03);
  assert.ok(Math.abs(outputSplit.fats - constrainedInput.fats) < 0.03);
});

test('normalizeMacroLocks coerces values and enforces max two locks', () => {
  const empty = normalizeMacroLocks(undefined);
  assert.deepEqual(empty, EMPTY_MACRO_LOCKS);
  assert.equal(hasAnyMacroLock(empty), false);

  const single = normalizeMacroLocks({ protein: 180, carbs: null, fats: 0 });
  assert.equal(single.protein, 180);
  assert.equal(single.fats, 0);
  assert.equal(single.carbs, null);
  assert.equal(hasAnyMacroLock(single), true);

  // More than 2 locks: later keys dropped (protein/carbs win)
  const three = normalizeMacroLocks({ protein: 1, carbs: 2, fats: 3 });
  assert.equal(three.protein, 1);
  assert.equal(three.carbs, 2);
  assert.equal(three.fats, null);

  // Negative / non-finite values are dropped
  const invalid = normalizeMacroLocks({ protein: -5, carbs: NaN, fats: 20 });
  assert.equal(invalid.protein, null);
  assert.equal(invalid.carbs, null);
  assert.equal(invalid.fats, 20);
});

test('single macro lock holds grams fixed and redistributes residual to unlocked macros', () => {
  const base = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
  });
  const lockedProtein = base.grams.protein;

  const locked = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: null },
  });

  assert.equal(locked.grams.protein, lockedProtein);
  assert.equal(
    locked.calories.protein + locked.calories.carbs + locked.calories.fats,
    2500
  );
  assert.ok(locked.macroLocks.lockedKeys.includes('protein'));
});

test('unlocked grams round-trip through locked redistribution (calorie-ratio identity)', () => {
  // Regression guard for the one-lock slider: when the unlocked macros already
  // fill the residual calorie budget, redistribution used to re-scale them by
  // gram-count ratio instead of calorie ratio, making the thumb drift and snap
  // to an arbitrary value on release. Unlocked grams must now round-trip
  // (within rounding) so the slider position is preserved.
  const targetCalories = 2500;
  const lockedProtein = 180; // 720 kcal
  const residualCalories = 2500 - 720; // 1780 kcal
  const carbsGrams = 200; // 800 kcal
  const fatsGrams = (residualCalories - 800) / 9; // ~108.9g, 980 kcal

  const recommendation = calculateMacroRecommendations({
    targetCalories,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: null },
  });

  const lockedCalories =
    recommendation.grams.protein * 4 +
    recommendation.grams.carbs * 4 +
    recommendation.grams.fats * 9;
  assert.equal(recommendation.grams.protein, lockedProtein);
  assert.equal(Math.round(lockedCalories), targetCalories);

  // Build a split whose calories exactly match our chosen grams, then verify
  // redistribution preserves the calorie ratio (and thus the grams).
  const calorieSplit = normalizeMacroRecommendationSplit({
    protein: lockedProtein * 4,
    carbs: carbsGrams * 4,
    fats: fatsGrams * 9,
  });
  const roundTrip = calculateMacroRecommendations({
    targetCalories,
    macroSplit: calorieSplit,
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: null },
  });

  assert.ok(Math.abs(roundTrip.grams.carbs - carbsGrams) < 0.5);
  assert.ok(Math.abs(roundTrip.grams.fats - fatsGrams) < 0.5);
});

test('two macro locks hold both grams fixed and carbs absorbs the remainder', () => {
  const base = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
  });
  const lockedProtein = base.grams.protein;
  const lockedFats = base.grams.fats;

  const locked = calculateMacroRecommendations({
    targetCalories: 2500,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: lockedFats },
  });

  assert.equal(locked.grams.protein, lockedProtein);
  assert.equal(locked.grams.fats, lockedFats);
  assert.equal(
    locked.calories.protein + locked.calories.carbs + locked.calories.fats,
    2500
  );
  assert.ok(locked.macroLocks.lockedKeys.includes('protein'));
  assert.ok(locked.macroLocks.lockedKeys.includes('fats'));
});

test('locked grams stay stable across calorie target changes', () => {
  const lockedProtein = 180;
  const lockedFats = 70;

  const low = calculateMacroRecommendations({
    targetCalories: 2200,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: lockedFats },
  });
  const high = calculateMacroRecommendations({
    targetCalories: 2800,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: lockedFats },
  });

  assert.equal(low.grams.protein, lockedProtein);
  assert.equal(low.grams.fats, lockedFats);
  assert.equal(high.grams.protein, lockedProtein);
  assert.equal(high.grams.fats, lockedFats);
  // Carbs absorb the calorie delta
  assert.ok(high.grams.carbs > low.grams.carbs);
});

test('locked grams relax to safety bounds when calorie target is too low', () => {
  const lockedProtein = 200;
  const lockedFats = 100;

  const low = calculateMacroRecommendations({
    targetCalories: 1200,
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    userData: { weight: 70 },
    macroLocks: { protein: lockedProtein, carbs: null, fats: lockedFats },
  });

  // Protein floor for 70kg is 112g; 200g lock must relax
  assert.ok(low.grams.protein < lockedProtein);
  assert.ok(low.macroLocks.relaxedKeys.includes('protein'));
  assert.ok(low.macroLocks.lockWarnings.includes('protein_lock_relaxed'));
});

test('getUnlockedMacroKeys returns the two unlocked macros in canonical order', () => {
  assert.deepEqual(
    getUnlockedMacroKeys({ protein: 180, carbs: null, fats: null }),
    ['carbs', 'fats']
  );
  assert.deepEqual(
    getUnlockedMacroKeys({ protein: null, carbs: 200, fats: null }),
    ['protein', 'fats']
  );
  assert.deepEqual(
    getUnlockedMacroKeys({ protein: null, carbs: null, fats: 70 }),
    ['protein', 'carbs']
  );
  assert.deepEqual(getUnlockedMacroKeys(EMPTY_MACRO_LOCKS), [
    'protein',
    'carbs',
    'fats',
  ]);
  assert.deepEqual(
    getUnlockedMacroKeys({ protein: 180, carbs: 200, fats: null }),
    ['fats']
  );
});

test('getUnlockedMacroRatio extracts calorie-weighted ratio from final grams', () => {
  // Protein locked; carbs 200g (800 kcal) vs fats 100g (900 kcal) → 800/1700
  const ratio = getUnlockedMacroRatio({
    grams: { protein: 180, carbs: 200, fats: 100 },
    macroLocks: { protein: 180, carbs: null, fats: null },
  });
  assert.ok(Math.abs(ratio - 800 / 1700) < 1e-6);

  // Fats locked; protein 150g (600 kcal) vs carbs 250g (1000 kcal) → 600/1600
  const ratio2 = getUnlockedMacroRatio({
    grams: { protein: 150, carbs: 250, fats: 70 },
    macroLocks: { protein: null, carbs: null, fats: 70 },
  });
  assert.ok(Math.abs(ratio2 - 600 / 1600) < 1e-6);

  // Zero unlocked grams falls back to 0.5
  assert.equal(
    getUnlockedMacroRatio({
      grams: { protein: 180, carbs: 0, fats: 0 },
      macroLocks: { protein: 180, carbs: null, fats: null },
    }),
    0.5
  );

  // Fewer than two unlocked macros falls back to 0.5
  assert.equal(
    getUnlockedMacroRatio({
      grams: { protein: 180, carbs: 200, fats: 100 },
      macroLocks: { protein: 180, carbs: 200, fats: null },
    }),
    0.5
  );
});

test('macroSplitFromUnlockedRatio builds split with locked share preserved', () => {
  const split = macroSplitFromUnlockedRatio({
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    macroLocks: { protein: 180, carbs: null, fats: null },
    ratio: 0.25,
  });

  // Protein share preserved (0.3), carbs/fats split 25/75 of remaining 0.7
  assert.ok(Math.abs(split.protein - 0.3) < 1e-6);
  assert.ok(Math.abs(split.carbs - 0.7 * 0.25) < 1e-6);
  assert.ok(Math.abs(split.fats - 0.7 * 0.75) < 1e-6);
  assert.ok(Math.abs(split.protein + split.carbs + split.fats - 1) < 1e-6);
});

test('macroSplitFromUnlockedRatio clamps ratio and handles edge cases', () => {
  // Ratio clamped to [0, 1]
  const clamped = macroSplitFromUnlockedRatio({
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    macroLocks: { protein: 180, carbs: null, fats: null },
    ratio: 1.5,
  });
  assert.equal(clamped.carbs, 0.7);
  assert.equal(clamped.fats, 0);

  // Fewer than two unlocked macros returns normalized input split
  const twoLocks = macroSplitFromUnlockedRatio({
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    macroLocks: { protein: 180, carbs: 200, fats: null },
    ratio: 0.5,
  });
  assert.deepEqual(twoLocks, { protein: 0.3, carbs: 0.4, fats: 0.3 });

  // No locks (3 unlocked): returns normalized input split unchanged
  const noLocks = macroSplitFromUnlockedRatio({
    macroSplit: { protein: 0.3, carbs: 0.4, fats: 0.3 },
    macroLocks: EMPTY_MACRO_LOCKS,
    ratio: 0.2,
  });
  assert.deepEqual(noLocks, { protein: 0.3, carbs: 0.4, fats: 0.3 });
});
