import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSignificantNameRewrite,
  mergePresentationEntriesWithVerified,
  resolveEntryNutritionFromPresentation,
} from '../../src/utils/food/aiPresentationMerge.js';

test('isSignificantNameRewrite detects low-overlap rewrites', () => {
  assert.equal(
    isSignificantNameRewrite('Chicken Breast', 'Triple Berry Smoothie'),
    true
  );
  assert.equal(
    isSignificantNameRewrite('Chicken Breast', 'Chicken breast, grilled'),
    false
  );
});

test('resolveEntryNutritionFromPresentation falls back when presented macros mismatch calories', () => {
  const verified = { calories: 200, protein: 20, carbs: 10, fats: 8 };
  const presented = { calories: 100, protein: 40, carbs: 30, fats: 20 };

  const resolved = resolveEntryNutritionFromPresentation(verified, presented);

  assert.equal(resolved.integrityIssue, true);
  assert.equal(resolved.integrityReason, 'presentation_macro_calorie_mismatch');
  assert.equal(resolved.source, 'verified_with_guardrail');
  assert.equal(resolved.calories, 200);
});

test('mergePresentationEntriesWithVerified preserves verified entry when presentation is sparse', () => {
  const verifiedEntries = [
    {
      name: 'Rice',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fats: 0.3,
      assumptions: [],
    },
    {
      name: 'Egg',
      calories: 70,
      protein: 6,
      carbs: 0.5,
      fats: 5,
      assumptions: [],
    },
  ];

  const presentationEntries = [
    {
      name: 'Steamed rice',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fats: 0.3,
      assumptions: ['plain serving'],
    },
  ];

  const result = mergePresentationEntriesWithVerified({
    verifiedEntries,
    presentationEntries,
  });

  assert.equal(result.hasPresentationLengthMismatch, true);
  assert.equal(result.hasSparsePresentationEntries, true);
  assert.equal(result.mergedEntries.length, 2);
  assert.equal(result.mergedEntries[1].name, 'Egg');
  assert.equal(result.mergedEntries[1].assumptions.length > 0, true);
  assert.equal(
    result.mergedEntries[1].assumptions.some((item) =>
      item.includes('Presentation output omitted this entry')
    ),
    true
  );
});

test('mergePresentationEntriesWithVerified suppresses significant rewrite and flags it', () => {
  const verifiedEntries = [
    {
      name: 'Chicken Breast',
      calories: 165,
      protein: 31,
      carbs: 0,
      fats: 3.6,
      assumptions: [],
    },
  ];

  const presentationEntries = [
    {
      name: 'Mango Float Dessert',
      calories: 165,
      protein: 31,
      carbs: 0,
      fats: 3.6,
      assumptions: [],
    },
  ];

  const result = mergePresentationEntriesWithVerified({
    verifiedEntries,
    presentationEntries,
  });

  assert.equal(result.mergedEntries[0].name, 'Chicken Breast');
  assert.equal(result.mergedEntries[0].nameRewriteSuppressed, true);
});

test('resolveEntryNutritionFromPresentation carries micros (presented wins, verified fallback, null preserved)', () => {
  const verified = {
    calories: 200,
    protein: 20,
    carbs: 10,
    fats: 8,
    fiber: 2,
    sodium: 200,
    saturatedFats: 1,
    sugars: 3,
  };
  const presented = {
    calories: 200,
    protein: 20,
    carbs: 10,
    fats: 8,
    sodium: 150,
    sugars: 5,
  };

  const resolved = resolveEntryNutritionFromPresentation(verified, presented);

  assert.equal(resolved.fiber, 2);
  assert.equal(resolved.sodium, 150);
  assert.equal(resolved.sugars, 5);
  assert.equal(resolved.saturatedFats, 1);
  assert.equal(resolved.integrityIssue, false);
});

test('integrity fallback keeps verified micros when presentation macros mismatch', () => {
  const verified = {
    calories: 200,
    protein: 20,
    carbs: 10,
    fats: 8,
    sodium: 200,
    fiber: 2,
  };
  const presented = {
    calories: 100,
    protein: 40,
    carbs: 30,
    fats: 20,
    sodium: 999,
  };

  const resolved = resolveEntryNutritionFromPresentation(verified, presented);

  assert.equal(resolved.integrityIssue, true);
  assert.equal(resolved.sodium, 200);
  assert.equal(resolved.fiber, 2);
});

test('mergePresentationEntriesWithVerified forwards micros into merged entries', () => {
  const verifiedEntries = [
    {
      name: 'Rice',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fats: 0.3,
      fiber: 0.4,
      sodium: 2,
      saturatedFats: null,
      sugars: 0.1,
      assumptions: [],
    },
  ];
  const presentationEntries = [
    {
      name: 'Rice',
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fats: 0.3,
      sodium: 1,
      assumptions: [],
    },
  ];

  const { mergedEntries } = mergePresentationEntriesWithVerified({
    verifiedEntries,
    presentationEntries,
  });

  assert.equal(mergedEntries[0].fiber, 0.4);
  assert.equal(mergedEntries[0].sodium, 1);
  assert.equal(mergedEntries[0].saturatedFats, null);
  assert.equal(mergedEntries[0].sugars, 0.1);
});
