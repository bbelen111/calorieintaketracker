import {
  FOOD_SEARCH_SOURCE,
  resolveAiFoodLookup,
  resolveAiGroundedBatch,
} from './foodSearch.js';
import {
  AI_RAG_QUALITY_MODE,
  getAiRagQualityPreset,
  normalizeAiRagQualityMode,
} from './aiRagQuality.js';

const LOOKUP_ERROR_REASON_MESSAGES = Object.freeze({
  local_search_failed: "We couldn't find a match in the local food database.",
  usda_search_failed: 'Online nutrition database lookup failed.',
  usda_search_aborted: 'Found a stronger match and stopped the extra lookup.',
  grounding_network_error: 'Web search hit a connection problem.',
  grounding_rate_limit:
    "We're looking up too many items right now. Please retry shortly.",
  grounding_quota_exhausted:
    "We've reached the current web lookup limit. Please try again later.",
  grounding_safety_blocked: 'Web search was blocked by safety checks.',
  grounding_invalid_response:
    'Web search returned incomplete nutrition details.',
  grounding_timeout: 'Web search took too long to finish.',
  grounding_unknown_error: 'Web search failed. Please try again.',
});

const LOOKUP_ERROR_RECOVERY_HINTS = Object.freeze({
  local_search_failed: 'Try again in a moment, or log manually if needed.',
  usda_search_failed: 'Wait a bit and retry, or enter nutrition manually.',
  usda_search_aborted: 'No action needed — we found a better match.',
  grounding_network_error: 'Check your internet connection, then retry.',
  grounding_rate_limit: 'Wait a moment, then retry.',
  grounding_quota_exhausted:
    'Try again later, or enter nutrition manually for now.',
  grounding_safety_blocked:
    "Use simpler wording and retry (for example: '2 slices pizza').",
  grounding_invalid_response:
    'Retry once. If it still fails, enter this item manually.',
  grounding_timeout: 'Retry now, or include fewer foods in one message.',
  grounding_unknown_error: 'Retry once. If it keeps failing, enter manually.',
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
    sourcePreferenceWeights:
      result?.sourcePreferenceWeights &&
      typeof result.sourcePreferenceWeights === 'object'
        ? { ...result.sourcePreferenceWeights }
        : null,
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
  qualityMode = AI_RAG_QUALITY_MODE.BALANCED,
  lookupOptions = {},
  groundedBatchTimeoutMs,
  resolveLookup = resolveAiFoodLookup,
  resolveGroundedBatch = resolveAiGroundedBatch,
} = {}) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId || !Array.isArray(entries) || entries.length === 0) {
    return {};
  }

  const resolvedQualityMode = normalizeAiRagQualityMode(qualityMode);
  const qualityPreset = getAiRagQualityPreset(resolvedQualityMode);
  const normalizedLookupOptions =
    lookupOptions && typeof lookupOptions === 'object' ? lookupOptions : {};
  const shouldAllowGroundingFallback =
    typeof normalizedLookupOptions.allowGroundingFallback === 'boolean'
      ? normalizedLookupOptions.allowGroundingFallback
      : false;
  const shouldEnableDeferredGrounding =
    typeof normalizedLookupOptions.enableDeferredGrounding === 'boolean'
      ? normalizedLookupOptions.enableDeferredGrounding
      : qualityPreset.enableDeferredGrounding;

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
          qualityMode: resolvedQualityMode,
          isOnline,
          allowGroundingFallback: shouldAllowGroundingFallback,
          localLimit: normalizedLookupOptions.localLimit,
          onlinePageSize: normalizedLookupOptions.onlinePageSize,
          sourcePreferenceWeights: normalizedLookupOptions.sourcePreferenceWeights,
        });

        return [entryKey, normalizeAiLookupResult(result, { entryName })];
      } catch (error) {
        return [entryKey, buildLookupErrorMeta(error, entryName)];
      }
    })
  );
  const contextByKey = Object.fromEntries(pairs);

  if (
    !isOnline ||
    !shouldEnableDeferredGrounding ||
    typeof resolveGroundedBatch !== 'function'
  ) {
    return contextByKey;
  }

  const deferredGroundingRequests = Object.entries(contextByKey)
    .filter(([, meta]) => meta?.status === 'needs_grounding')
    .map(([entryKey, meta]) => ({
      entryKey,
      entryName: meta.entryName || '',
      groundingQuery: meta.queryUsed || meta.entryName || '',
      sourcesTried: Array.isArray(meta.sourcesTried) ? meta.sourcesTried : [],
      errorsBySource:
        meta.errorsBySource && typeof meta.errorsBySource === 'object'
          ? meta.errorsBySource
          : {},
      errorReasonsBySource:
        meta.errorReasonsBySource &&
        typeof meta.errorReasonsBySource === 'object'
          ? meta.errorReasonsBySource
          : {},
      sourcePreferenceWeights:
        meta.sourcePreferenceWeights &&
        typeof meta.sourcePreferenceWeights === 'object'
          ? meta.sourcePreferenceWeights
          : null,
    }));

  if (deferredGroundingRequests.length === 0) {
    return contextByKey;
  }

  const groundedResultsByKey = await resolveGroundedBatch({
    requests: deferredGroundingRequests,
    qualityMode: resolvedQualityMode,
    timeoutMs: groundedBatchTimeoutMs,
  });

  Object.entries(groundedResultsByKey || {}).forEach(([entryKey, result]) => {
    if (!Object.prototype.hasOwnProperty.call(contextByKey, entryKey)) {
      return;
    }

    const merged = normalizeAiLookupResult(result, {
      entryName: contextByKey[entryKey]?.entryName || '',
    });
    contextByKey[entryKey] = merged;
  });

  return contextByKey;
};
