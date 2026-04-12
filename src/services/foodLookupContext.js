import { FOOD_SEARCH_SOURCE, resolveAiFoodLookup } from './foodSearch.js';

const LOOKUP_ERROR_REASON_MESSAGES = Object.freeze({
  local_search_failed: 'Local database lookup failed.',
  usda_search_failed: 'USDA lookup failed.',
  usda_search_aborted:
    'USDA lookup stopped early because a stronger match was found.',
  grounding_network_error: 'Web grounding failed due to a network issue.',
  grounding_rate_limit: 'Web grounding hit a rate limit. Please retry shortly.',
  grounding_quota_exhausted:
    'Web grounding quota is exhausted right now. Please try again later.',
  grounding_safety_blocked: 'Web grounding was blocked by safety filters.',
  grounding_invalid_response: 'Web grounding returned unusable nutrition data.',
  grounding_timeout: 'Web grounding timed out before finishing.',
  grounding_unknown_error: 'Web grounding failed for an unknown reason.',
});

const LOOKUP_ERROR_RECOVERY_HINTS = Object.freeze({
  local_search_failed:
    'Try again in a moment, or log manually if this keeps happening.',
  usda_search_failed:
    'Retry shortly or switch to local/manual entry while online search recovers.',
  usda_search_aborted: null,
  grounding_network_error: 'Check your internet connection, then retry.',
  grounding_rate_limit: 'Wait a few seconds, then retry the same entry.',
  grounding_quota_exhausted:
    'Try again later, or use local/manual entry while provider quota resets.',
  grounding_safety_blocked:
    'Rephrase the food description with neutral wording and retry.',
  grounding_invalid_response:
    'Retry once; if it persists, use manual entry for this item.',
  grounding_timeout:
    'Retry now or reduce message complexity (fewer foods per prompt).',
  grounding_unknown_error:
    'Retry once, then use manual entry if the issue persists.',
});

export const getLookupErrorReasonMessage = (reasonCode) => {
  const normalizedReason = String(reasonCode || '').trim();
  if (!normalizedReason) {
    return null;
  }

  return LOOKUP_ERROR_REASON_MESSAGES[normalizedReason] || null;
};

export const getLookupErrorRecoveryHint = (reasonCode) => {
  const normalizedReason = String(reasonCode || '').trim();
  if (!normalizedReason) {
    return null;
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      LOOKUP_ERROR_RECOVERY_HINTS,
      normalizedReason
    )
  ) {
    return null;
  }

  return LOOKUP_ERROR_RECOVERY_HINTS[normalizedReason] || null;
};

export const normalizeAiLookupResult = (result, { entryName = '' } = {}) => {
  return {
    status: result?.status || 'no_match',
    usedSource: result?.usedSource || FOOD_SEARCH_SOURCE.LOCAL,
    sourcesTried: Array.isArray(result?.sourcesTried)
      ? result.sourcesTried
      : [],
    fallbackUsed: Boolean(result?.fallbackUsed),
    queryUsed: typeof result?.queryUsed === 'string' ? result.queryUsed : null,
    matchConfidence: result?.matchConfidence || 'low',
    matchScore: Number.isFinite(result?.matchScore) ? result.matchScore : 0,
    weightedMatchScore: Number.isFinite(result?.weightedMatchScore)
      ? result.weightedMatchScore
      : 0,
    confidenceComponents:
      result?.confidenceComponents &&
      typeof result.confidenceComponents === 'object'
        ? {
            rawScore: Number(result.confidenceComponents.rawScore) || 0,
            trustMultiplier:
              Number(result.confidenceComponents.trustMultiplier) || 0,
            weightedScore:
              Number(result.confidenceComponents.weightedScore) || 0,
          }
        : {
            rawScore: Number.isFinite(result?.matchScore)
              ? result.matchScore
              : 0,
            trustMultiplier: 0,
            weightedScore: Number.isFinite(result?.weightedMatchScore)
              ? result.weightedMatchScore
              : 0,
          },
    matchedFood: result?.matchedFood
      ? {
          name: result.matchedFood.name,
          brand: result.matchedFood.brand || null,
          category: result.matchedFood.category || null,
          subcategory: result.matchedFood.subcategory || null,
          per100g:
            result.matchedFood.per100g &&
            typeof result.matchedFood.per100g === 'object'
              ? {
                  calories: Number(result.matchedFood.per100g.calories) || 0,
                  protein: Number(result.matchedFood.per100g.protein) || 0,
                  carbs: Number(result.matchedFood.per100g.carbs) || 0,
                  fats: Number(result.matchedFood.per100g.fats) || 0,
                }
              : null,
        }
      : null,
    errorsBySource: result?.errorsBySource || {},
    errorReasonsBySource: result?.errorReasonsBySource || {},
    entryName: String(entryName || '').trim() || null,
  };
};

const buildLookupErrorMeta = (error, entryName = '') => ({
  status: 'error',
  usedSource: FOOD_SEARCH_SOURCE.LOCAL,
  sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
  fallbackUsed: false,
  queryUsed: String(entryName || '').trim() || null,
  matchConfidence: 'low',
  matchScore: 0,
  weightedMatchScore: 0,
  confidenceComponents: {
    rawScore: 0,
    trustMultiplier: 0,
    weightedScore: 0,
  },
  matchedFood: null,
  errorsBySource: {
    [FOOD_SEARCH_SOURCE.LOCAL]: error?.message || 'AI lookup failed.',
  },
  errorReasonsBySource: {
    [FOOD_SEARCH_SOURCE.LOCAL]: 'local_search_failed',
  },
  entryName: String(entryName || '').trim() || null,
});

const resolveEntryLookupTerms = (entry) => {
  if (Array.isArray(entry?.lookupTerms)) {
    return entry.lookupTerms;
  }

  if (Array.isArray(entry?.lookup_queries)) {
    return entry.lookup_queries;
  }

  return [];
};

export const resolveFoodLookupContext = async ({
  messageId,
  entries = [],
  isOnline = true,
  resolveLookup = resolveAiFoodLookup,
} = {}) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId || !Array.isArray(entries) || entries.length === 0) {
    return {};
  }

  const pairs = await Promise.all(
    entries.map(async (entry, index) => {
      const entryKey = `${normalizedMessageId}-${index}`;
      const entryName = String(entry?.name || '').trim();

      if (!entryName) {
        return [entryKey, buildLookupErrorMeta(null, entryName)];
      }

      try {
        const result = await resolveLookup({
          entryName,
          lookupTerms: resolveEntryLookupTerms(entry),
          entryCategory: entry?.category || null,
          isOnline,
        });

        return [entryKey, normalizeAiLookupResult(result, { entryName })];
      } catch (error) {
        return [entryKey, buildLookupErrorMeta(error, entryName)];
      }
    })
  );

  return Object.fromEntries(pairs);
};
