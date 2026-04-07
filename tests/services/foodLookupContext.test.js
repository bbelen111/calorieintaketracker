import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAiLookupResult,
  resolveFoodLookupContext,
} from '../../src/services/foodLookupContext.js';
import { FOOD_SEARCH_SOURCE } from '../../src/services/foodSearch.js';

test('normalizeAiLookupResult returns normalized safe shape', () => {
  const result = normalizeAiLookupResult(
    {
      status: 'resolved',
      usedSource: FOOD_SEARCH_SOURCE.USDA,
      sourcesTried: ['local', 'usda'],
      fallbackUsed: true,
      queryUsed: 'cacao tablet',
      matchConfidence: 'high',
      matchScore: 0.91,
      matchedFood: {
        name: 'Cacao Tablet',
        brand: 'Local Brand',
        category: 'fats',
        subcategory: 'cacao',
        per100g: {
          calories: 400,
          protein: 12,
          carbs: 30,
          fats: 25,
        },
      },
      errorsBySource: {},
    },
    { entryName: 'tableya' }
  );

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.matchConfidence, 'high');
  assert.equal(result.matchedFood?.name, 'Cacao Tablet');
  assert.equal(result.entryName, 'tableya');
});

test('resolveFoodLookupContext returns keyed lookup metadata for entries', async () => {
  const context = await resolveFoodLookupContext({
    messageId: 'assistant-1',
    isOnline: true,
    entries: [
      { name: 'Chicken breast', lookupTerms: ['grilled chicken breast'] },
      { name: 'White rice' },
    ],
    resolveLookup: async ({ entryName }) => {
      if (entryName.toLowerCase().includes('chicken')) {
        return {
          status: 'resolved',
          usedSource: FOOD_SEARCH_SOURCE.LOCAL,
          sourcesTried: ['local'],
          fallbackUsed: false,
          queryUsed: 'grilled chicken breast',
          matchConfidence: 'high',
          matchScore: 0.92,
          matchedFood: {
            name: 'Chicken Breast',
            category: 'protein',
            subcategory: 'poultry',
            per100g: {
              calories: 165,
              protein: 31,
              carbs: 0,
              fats: 3.6,
            },
          },
          errorsBySource: {},
        };
      }

      return {
        status: 'no_match',
        usedSource: FOOD_SEARCH_SOURCE.LOCAL,
        sourcesTried: ['local'],
        fallbackUsed: false,
        queryUsed: entryName,
        matchConfidence: 'low',
        matchScore: 0.24,
        matchedFood: null,
        errorsBySource: {},
      };
    },
  });

  assert.deepEqual(Object.keys(context), ['assistant-1-0', 'assistant-1-1']);
  assert.equal(context['assistant-1-0'].status, 'resolved');
  assert.equal(context['assistant-1-0'].matchConfidence, 'high');
  assert.equal(context['assistant-1-1'].status, 'no_match');
});

test('resolveFoodLookupContext returns empty object for invalid input', async () => {
  const context = await resolveFoodLookupContext({
    messageId: '',
    entries: [{ name: 'Eggs' }],
    resolveLookup: async () => {
      throw new Error('should not execute');
    },
  });

  assert.deepEqual(context, {});
});
