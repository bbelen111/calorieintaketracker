import {
  FOOD_SEARCH_SOURCE,
  resolveAiFoodLookup,
  resolveAiGroundedBatch,
} from './foodSearch.js';
import {
  DEFAULT_ERROR_REASON_BY_SOURCE,
  FOOD_LOOKUP_ERROR_REASONS,
  getLookupErrorRecoveryHint as resolveCanonicalRecoveryHint,
  getLookupErrorReasonMessage as resolveCanonicalReasonMessage,
} from './foodLookupReasons.js';
import { RAG_TIMING } from './ragBudget.js';

const SOURCE_TRUST_MULTIPLIER = Object.freeze({
  [FOOD_SEARCH_SOURCE.LOCAL]: 1,

  [FOOD_SEARCH_SOURCE.USDA]: 0.98,

  [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: 0.75,

  estimate: 0.55,
});

const resolveSourceTrustMultiplier = (source) => {
  return SOURCE_TRUST_MULTIPLIER[source] || SOURCE_TRUST_MULTIPLIER.estimate;
};

const LOOKUP_CONCURRENCY_LIMIT = 10;

const mapWithConcurrencyLimit = async (items, limit, mapper) => {
  const safeItems = Array.isArray(items) ? items : [];

  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));

  const results = new Array(safeItems.length);

  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(normalizedLimit, safeItems.length) },

    async () => {
      while (cursor < safeItems.length) {
        const currentIndex = cursor;

        cursor += 1;

        results[currentIndex] = await mapper(
          safeItems[currentIndex],

          currentIndex
        );
      }
    }
  );

  await Promise.all(workers);

  return results;
};

export const getLookupErrorReasonMessage = (reasonCode) =>
  resolveCanonicalReasonMessage(reasonCode);

export const getLookupErrorRecoveryHint = (reasonCode) =>
  resolveCanonicalRecoveryHint(reasonCode);

export const getLookupErrorReasonsRegistry = () =>
  Object.freeze({ ...FOOD_LOOKUP_ERROR_REASONS });

export const normalizeAiLookupResult = (result, { entryName = '' } = {}) => {
  const normalizedSource = result?.usedSource || FOOD_SEARCH_SOURCE.LOCAL;

  return {
    status: result?.status || 'no_match',

    usedSource: normalizedSource,

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
              Number(result.confidenceComponents.trustMultiplier) ||
              resolveSourceTrustMultiplier(normalizedSource),

            weightedScore:
              Number(result.confidenceComponents.weightedScore) || 0,
          }
        : {
            rawScore: Number.isFinite(result?.matchScore)
              ? result.matchScore
              : 0,

            trustMultiplier: resolveSourceTrustMultiplier(normalizedSource),

            weightedScore: Number.isFinite(result?.weightedMatchScore)
              ? result.weightedMatchScore
              : 0,
          },

    sourcePreferenceWeights:
      result?.sourcePreferenceWeights &&
      typeof result.sourcePreferenceWeights === 'object'
        ? { ...result.sourcePreferenceWeights }
        : null,

    decision:
      typeof result?.decision === 'string' ? result.decision : 'no_match',

    decisionReason:
      typeof result?.decisionReason === 'string' ? result.decisionReason : null,

    dataQuality:
      typeof result?.dataQuality === 'string' ? result.dataQuality : 'missing',

    acceptedFromHistory: Boolean(result?.acceptedFromHistory),

    escalationAttempted: Boolean(result?.escalationAttempted),

    escalationReason:
      typeof result?.escalationReason === 'string'
        ? result.escalationReason
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

const buildLookupErrorMeta = (
  error,

  entryName = '',

  failedSource = FOOD_SEARCH_SOURCE.LOCAL
) => {
  const reasonCode =
    DEFAULT_ERROR_REASON_BY_SOURCE[failedSource] || 'local_search_failed';

  return {
    status: 'error',

    usedSource: failedSource,

    sourcesTried: [failedSource],

    fallbackUsed: false,

    queryUsed: String(entryName || '').trim() || null,

    matchConfidence: 'low',

    decision: 'no_match',

    decisionReason: reasonCode,

    dataQuality: 'missing',

    acceptedFromHistory: false,

    escalationAttempted: false,

    escalationReason: null,

    matchScore: 0,

    weightedMatchScore: 0,

    confidenceComponents: {
      rawScore: 0,

      trustMultiplier: resolveSourceTrustMultiplier(failedSource),

      weightedScore: 0,
    },

    matchedFood: null,

    errorsBySource: {
      [failedSource]: error?.message || 'AI lookup failed.',
    },

    errorReasonsBySource: {
      [failedSource]: reasonCode,
    },

    entryName: String(entryName || '').trim() || null,
  };
};

const resolveEntryLookupTerms = (entry) => {
  if (Array.isArray(entry?.lookupTerms)) {
    return entry.lookupTerms;
  }

  if (Array.isArray(entry?.lookup_queries)) {
    return entry.lookup_queries;
  }

  return [];
};

const STABLE_ENTRY_TOKEN_PATTERN = /:([a-z0-9]{4,16})$/;

/** Deterministic short token (6 hex chars) derived from an entry name. */
export const buildLookupContextStableToken = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16);

  if (!normalized) {
    return null;
  }

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index);
    hash |= 0;
  }

  return (hash >>> 0).toString(36).slice(0, 6);
};

/**
 * Builds the key used to attach lookup metadata to a chat entry.
 *
 * The optional `entryName` appends a deterministic stable token
 * (`msgId::index:token`) so metadata can still be correlated to the entry it
 * belongs to even if entry ordering shifts within the same assistant message.
 * Two-argument callers keep the historical positional key format unchanged.
 */
export const buildLookupContextEntryKey = (messageId, index, entryName = '') => {
  const normalizedMessageId = String(messageId || '').trim();
  const normalizedIndex = Math.max(0, Math.floor(Number(index) || 0));

  const base = normalizedMessageId
    ? `${encodeURIComponent(normalizedMessageId)}::${normalizedIndex}`
    : `::${normalizedIndex}`;

  const token = buildLookupContextStableToken(entryName);
  return token ? `${base}:${token}` : base;
};

const stripLookupContextToken = (entryKey) =>
  String(entryKey || '').trim().replace(STABLE_ENTRY_TOKEN_PATTERN, '');

export const parseLookupContextEntryKeyMessageId = (entryKey) => {
  const normalizedKey = String(entryKey || '').trim();
  if (!normalizedKey) {
    return null;
  }

  const keyWithoutToken = stripLookupContextToken(normalizedKey);
  const separatorIndex = keyWithoutToken.lastIndexOf('::');
  if (separatorIndex <= 0) {
    return normalizedKey;
  }

  const encodedMessageId = keyWithoutToken.slice(0, separatorIndex).trim();
  if (!encodedMessageId) {
    return null;
  }

  try {
    return decodeURIComponent(encodedMessageId);
  } catch {
    return encodedMessageId;
  }
};

export const parseLookupContextEntryKeyIndex = (entryKey) => {
  const normalizedKey = String(entryKey || '').trim();
  if (!normalizedKey) {
    return null;
  }

  const keyWithoutToken = stripLookupContextToken(normalizedKey);
  const separatorIndex = keyWithoutToken.lastIndexOf('::');
  if (separatorIndex < 0) {
    return null;
  }

  const rawIndex = keyWithoutToken.slice(separatorIndex + 2).trim();
  const parsed = Number(rawIndex);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const parseLookupContextEntryKeyStableToken = (entryKey) => {
  const match = STABLE_ENTRY_TOKEN_PATTERN.exec(String(entryKey || '').trim());
  return match ? match[1] : null;
};

export const resolveFoodLookupContext = async ({
  messageId,

  entries = [],

  isOnline = true,

  lookupOptions = {},

  groundedBatchTimeoutMs,

  resolveLookup = resolveAiFoodLookup,

  resolveGroundedBatch = resolveAiGroundedBatch,
} = {}) => {
  const normalizedMessageId = String(messageId || '').trim();

  if (!normalizedMessageId || !Array.isArray(entries) || entries.length === 0) {
    return {};
  }

  const normalizedLookupOptions =
    lookupOptions && typeof lookupOptions === 'object' ? lookupOptions : {};

  const shouldAllowGroundingFallback =
    typeof normalizedLookupOptions.allowGroundingFallback === 'boolean'
      ? normalizedLookupOptions.allowGroundingFallback
      : false;

  const shouldEnableDeferredGrounding =
    typeof normalizedLookupOptions.enableDeferredGrounding === 'boolean'
      ? normalizedLookupOptions.enableDeferredGrounding
      : true;

  const pairs = await mapWithConcurrencyLimit(
    entries,

    LOOKUP_CONCURRENCY_LIMIT,

    async (entry, index) => {
      const entryKey = buildLookupContextEntryKey(
        normalizedMessageId,
        index,
        entry?.name
      );

      const entryName = String(entry?.name || '').trim();

      if (!entryName) {
        return [
          entryKey,

          buildLookupErrorMeta(null, entryName, FOOD_SEARCH_SOURCE.LOCAL),
        ];
      }

      try {
        const result = await resolveLookup({
          entryName,

          lookupTerms: resolveEntryLookupTerms(entry),

          entryCategory: entry?.category || null,

          isOnline,

          allowGroundingFallback: shouldAllowGroundingFallback,

          localLimit: normalizedLookupOptions.localLimit,

          onlinePageSize: normalizedLookupOptions.onlinePageSize,

          sourcePreferenceWeights:
            normalizedLookupOptions.sourcePreferenceWeights,
        });

        return [entryKey, normalizeAiLookupResult(result, { entryName })];
      } catch (error) {
        const failedSource =
          error?.failedSource &&
          Object.values(FOOD_SEARCH_SOURCE).includes(error.failedSource)
            ? error.failedSource
            : FOOD_SEARCH_SOURCE.LOCAL;

        return [entryKey, buildLookupErrorMeta(error, entryName, failedSource)];
      }
    }
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

    timeoutMs: Number.isFinite(Number(groundedBatchTimeoutMs))
      ? Math.max(1000, Math.round(Number(groundedBatchTimeoutMs)))
      : RAG_TIMING.groundingBatchMs,
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
