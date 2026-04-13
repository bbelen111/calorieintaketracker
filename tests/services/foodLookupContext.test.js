import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLookupErrorReasonMessage,
  getLookupErrorRecoveryHint,
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
      weightedMatchScore: 0.89,
      confidenceComponents: {
        rawScore: 0.91,
        trustMultiplier: 0.98,
        weightedScore: 0.89,
      },
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
      errorReasonsBySource: {
        [FOOD_SEARCH_SOURCE.USDA]: 'usda_search_failed',
      },
    },
    { entryName: 'tableya' }
  );

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedSource, FOOD_SEARCH_SOURCE.USDA);
  assert.equal(result.matchConfidence, 'high');
  assert.equal(result.weightedMatchScore, 0.89);
  assert.equal(result.confidenceComponents?.trustMultiplier, 0.98);
  assert.equal(result.matchedFood?.name, 'Cacao Tablet');
  assert.equal(
    result.errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA],
    'usda_search_failed'
  );
  assert.equal(result.entryName, 'tableya');
});

test('getLookupErrorReasonMessage returns user-facing labels for known reason codes', () => {
  assert.equal(
    getLookupErrorReasonMessage('grounding_safety_blocked'),
    'Web grounding was blocked by safety filters.'
  );
  assert.equal(
    getLookupErrorReasonMessage('grounding_network_error'),
    'Web grounding failed due to a network issue.'
  );
  assert.equal(
    getLookupErrorReasonMessage('grounding_quota_exhausted'),
    'Web grounding quota is exhausted right now. Please try again later.'
  );
  assert.equal(getLookupErrorReasonMessage('unknown_reason_code'), null);
});

test('getLookupErrorRecoveryHint returns actionable suggestions for known reason codes', () => {
  assert.equal(
    getLookupErrorRecoveryHint('grounding_network_error'),
    'Check your internet connection, then retry.'
  );
  assert.equal(
    getLookupErrorRecoveryHint('grounding_rate_limit'),
    'Wait a few seconds, then retry the same entry.'
  );
  assert.equal(
    getLookupErrorRecoveryHint('grounding_quota_exhausted'),
    'Try again later, or use local/manual entry while provider quota resets.'
  );
  assert.equal(
    getLookupErrorRecoveryHint('usda_search_aborted'),
    null
  );
  assert.equal(getLookupErrorRecoveryHint('unknown_reason_code'), null);
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

test('resolveFoodLookupContext preserves successful siblings when one entry lookup fails', async () => {
  const context = await resolveFoodLookupContext({
    messageId: 'assistant-2',
    isOnline: true,
    entries: [{ name: 'Chicken breast' }, { name: 'Unknown snack' }],
    resolveLookup: async ({ entryName }) => {
      if (entryName === 'Unknown snack') {
        throw new Error('lookup timeout');
      }

      return {
        status: 'resolved',
        usedSource: FOOD_SEARCH_SOURCE.LOCAL,
        sourcesTried: ['local'],
        fallbackUsed: false,
        queryUsed: entryName,
        matchConfidence: 'high',
        matchScore: 0.9,
        weightedMatchScore: 0.9,
        confidenceComponents: {
          rawScore: 0.9,
          trustMultiplier: 1,
          weightedScore: 0.9,
        },
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
    },
  });

  assert.equal(context['assistant-2-0'].status, 'resolved');
  assert.equal(context['assistant-2-0'].matchConfidence, 'high');
  assert.equal(context['assistant-2-1'].status, 'error');
  assert.equal(
    context['assistant-2-1'].errorsBySource[FOOD_SEARCH_SOURCE.LOCAL],
    'lookup timeout'
  );
  assert.equal(
    context['assistant-2-1'].errorReasonsBySource[FOOD_SEARCH_SOURCE.LOCAL],
    'local_search_failed'
  );
});

test('resolveFoodLookupContext resolves deferred grounding entries in one batched call', async () => {
  let groundedBatchCalls = 0;

  const context = await resolveFoodLookupContext({
    messageId: 'assistant-3',
    isOnline: true,
    entries: [{ name: 'Kulolo' }, { name: 'Ube Halaya' }],
    resolveLookup: async ({ entryName }) => ({
      status: 'needs_grounding',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL, FOOD_SEARCH_SOURCE.USDA],
      fallbackUsed: false,
      queryUsed: entryName,
      matchConfidence: 'low',
      matchScore: 0,
      weightedMatchScore: 0,
      matchedFood: null,
      errorsBySource: {},
      errorReasonsBySource: {},
    }),
    resolveGroundedBatch: async ({ requests }) => {
      groundedBatchCalls += 1;
      assert.equal(requests.length, 2);

      return {
        'assistant-3-0': {
          status: 'resolved',
          usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          sourcesTried: [
            FOOD_SEARCH_SOURCE.LOCAL,
            FOOD_SEARCH_SOURCE.USDA,
            FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          ],
          fallbackUsed: true,
          queryUsed: 'Kulolo',
          matchConfidence: 'low',
          matchScore: 0.55,
          weightedMatchScore: 0.41,
          confidenceComponents: {
            rawScore: 0.55,
            trustMultiplier: 0.75,
            weightedScore: 0.41,
          },
          matchedFood: {
            name: 'Kulolo',
            per100g: {
              calories: 250,
              protein: 1,
              carbs: 55,
              fats: 2,
            },
          },
          errorsBySource: {},
          errorReasonsBySource: {},
        },
        'assistant-3-1': {
          status: 'resolved',
          usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          sourcesTried: [
            FOOD_SEARCH_SOURCE.LOCAL,
            FOOD_SEARCH_SOURCE.USDA,
            FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          ],
          fallbackUsed: true,
          queryUsed: 'Ube Halaya',
          matchConfidence: 'low',
          matchScore: 0.55,
          weightedMatchScore: 0.41,
          confidenceComponents: {
            rawScore: 0.55,
            trustMultiplier: 0.75,
            weightedScore: 0.41,
          },
          matchedFood: {
            name: 'Ube Halaya',
            per100g: {
              calories: 280,
              protein: 3,
              carbs: 48,
              fats: 9,
            },
          },
          errorsBySource: {},
          errorReasonsBySource: {},
        },
      };
    },
  });

  assert.equal(groundedBatchCalls, 1);
  assert.equal(context['assistant-3-0'].status, 'resolved');
  assert.equal(
    context['assistant-3-0'].usedSource,
    FOOD_SEARCH_SOURCE.AI_WEB_SEARCH
  );
  assert.equal(context['assistant-3-1'].status, 'resolved');
  assert.equal(context['assistant-3-1'].matchedFood?.name, 'Ube Halaya');
});
