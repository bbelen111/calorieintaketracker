import {
  resolveEntryGrams,
  scaleMacrosFromPer100g,
} from '../utils/food/portionNormalization.js';
import { getRagSourcePreferenceWeightsForCategory } from './ragTelemetry.js';

export const FOOD_SEARCH_SOURCE = {
  LOCAL: 'local',
  USDA: 'usda',
  AI_WEB_SEARCH: 'ai_web_search',
};

export const FOOD_SEARCH_SOURCE_LABELS = {
  [FOOD_SEARCH_SOURCE.LOCAL]: 'Local',
  [FOOD_SEARCH_SOURCE.USDA]: 'USDA',
  [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: 'Web',
};

export const getFoodSearchSourceLabel = (source) => {
  return FOOD_SEARCH_SOURCE_LABELS[source] || 'Unknown';
};

const ONLINE_QUERY_MIN_LENGTH = 2;
const AI_LOCAL_LIMIT = 25;
const AI_ONLINE_PAGE_SIZE = 20;

const AI_SCORE_THRESHOLD = Object.freeze({
  high: 0.88,
  medium: 0.72,
  low: 0.55,
});

const DEDUPE_NAME_ALIAS_MAP = Object.freeze({
  kanin: 'rice',
  sinangag: 'rice',
  'garlic fried rice': 'rice',
  'fried rice': 'rice',
});

const SOURCE_TRUST_MULTIPLIER = Object.freeze({
  [FOOD_SEARCH_SOURCE.LOCAL]: 1,
  [FOOD_SEARCH_SOURCE.USDA]: 0.98,
  [FOOD_SEARCH_SOURCE.AI_WEB_SEARCH]: 0.75,
  estimate: 0.55,
});

const SOURCE_ERROR_REASON = Object.freeze({
  LOCAL_SEARCH_FAILED: 'local_search_failed',
  USDA_SEARCH_FAILED: 'usda_search_failed',
  USDA_SEARCH_ABORTED: 'usda_search_aborted',
  GROUNDING_NETWORK_ERROR: 'grounding_network_error',
  GROUNDING_RATE_LIMIT: 'grounding_rate_limit',
  GROUNDING_QUOTA_EXHAUSTED: 'grounding_quota_exhausted',
  GROUNDING_SAFETY_BLOCKED: 'grounding_safety_blocked',
  GROUNDING_INVALID_RESPONSE: 'grounding_invalid_response',
  GROUNDING_TIMEOUT: 'grounding_timeout',
  GROUNDING_UNKNOWN: 'grounding_unknown_error',
});

let aiLookupSessionCache = new Map();

const normalizeQuery = (query) => String(query ?? '').trim();

const normalizeTokenString = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => {
  const normalized = normalizeTokenString(value);
  return normalized ? normalized.split(' ') : [];
};

const dedupeTerms = (terms) => {
  const unique = [];
  const seen = new Set();

  terms.forEach((term) => {
    const normalized = normalizeTokenString(term);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(term);
  });

  return unique;
};

const resolveConfidencePenalty = (confidence) => {
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high') return 'medium';
  if (normalized === 'medium') return 'low';
  return 'low';
};

const resolveCanonicalFoodLabel = (value) => {
  const normalized = normalizeTokenString(value);
  if (!normalized) {
    return '';
  }

  if (DEDUPE_NAME_ALIAS_MAP[normalized]) {
    return DEDUPE_NAME_ALIAS_MAP[normalized];
  }

  for (const [alias, canonical] of Object.entries(DEDUPE_NAME_ALIAS_MAP)) {
    if (normalized.includes(alias)) {
      return canonical;
    }
  }

  return normalized;
};

export const dedupeExtractedFoodEntries = (entries = []) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const byCanonicalKey = new Map();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const name = String(entry.name || '').trim();
    const lookupTerms = Array.isArray(entry.lookupTerms)
      ? entry.lookupTerms
      : Array.isArray(entry.lookup_queries)
        ? entry.lookup_queries
        : [];

    const canonicalName =
      resolveCanonicalFoodLabel(name) ||
      resolveCanonicalFoodLabel(lookupTerms[0]) ||
      'unknown_food';

    const existing = byCanonicalKey.get(canonicalName);
    if (!existing) {
      byCanonicalKey.set(canonicalName, {
        ...entry,
        lookupTerms: dedupeTerms(lookupTerms),
        assumptions: Array.isArray(entry.assumptions)
          ? [...new Set(entry.assumptions)]
          : [],
      });
      return;
    }

    const mergedLookupTerms = dedupeTerms([
      ...(Array.isArray(existing.lookupTerms) ? existing.lookupTerms : []),
      ...lookupTerms,
    ]);
    const mergedAssumptions = [
      ...new Set([
        ...(Array.isArray(existing.assumptions) ? existing.assumptions : []),
        ...(Array.isArray(entry.assumptions) ? entry.assumptions : []),
      ]),
    ];

    const mergedEntry = {
      ...existing,
      lookupTerms: mergedLookupTerms,
      assumptions: mergedAssumptions,
      rationale: existing.rationale || entry.rationale || null,
      category: existing.category || entry.category,
    };

    byCanonicalKey.set(canonicalName, mergedEntry);
  });

  return Array.from(byCanonicalKey.values());
};

const cloneLookupResult = (result) => JSON.parse(JSON.stringify(result));

const resolveSourceTrustMultiplier = (source) => {
  return SOURCE_TRUST_MULTIPLIER[source] || SOURCE_TRUST_MULTIPLIER.estimate;
};

const resolveWeightedConfidence = ({
  score,
  source,
  sourcePreferenceWeights = null,
}) => {
  const rawScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  const baseTrustMultiplier = resolveSourceTrustMultiplier(source);
  const preferenceMultiplier =
    sourcePreferenceWeights && Number.isFinite(sourcePreferenceWeights[source])
      ? sourcePreferenceWeights[source]
      : 1;
  const trustMultiplier = Number(
    Math.max(
      0.6,
      Math.min(1.5, baseTrustMultiplier * preferenceMultiplier)
    ).toFixed(4)
  );
  const weightedScore = Math.max(
    0,
    Math.min(1, Number((rawScore * trustMultiplier).toFixed(4)))
  );

  return {
    confidence: resolveAiConfidence(weightedScore),
    rawScore,
    trustMultiplier,
    weightedScore,
  };
};

const buildAiLookupCacheKey = ({
  entryName = '',
  lookupTerms = [],
  entryCategory = null,
  isOnline = true,
  localLimit = AI_LOCAL_LIMIT,
  onlinePageSize = AI_ONLINE_PAGE_SIZE,
  sourcePreferenceWeights = null,
} = {}) => {
  const normalizedEntry = normalizeTokenString(entryName);
  const normalizedTerms = dedupeTerms(
    (Array.isArray(lookupTerms) ? lookupTerms : []).map((term) =>
      normalizeTokenString(term)
    )
  );

  return JSON.stringify({
    entry: normalizedEntry,
    terms: normalizedTerms,
    category:
      String(entryCategory || '')
        .trim()
        .toLowerCase() || null,
    isOnline: Boolean(isOnline),
    localLimit: Number(localLimit) || AI_LOCAL_LIMIT,
    onlinePageSize: Number(onlinePageSize) || AI_ONLINE_PAGE_SIZE,
    sourcePreferenceWeights:
      sourcePreferenceWeights && typeof sourcePreferenceWeights === 'object'
        ? sourcePreferenceWeights
        : null,
  });
};

export const resetAiLookupSessionCache = () => {
  aiLookupSessionCache = new Map();
};

const toErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message ?? '').trim();
  return message || fallbackMessage;
};

const resolveGroundingFailureReason = (error) => {
  const statusCode = Number(error?.status);
  const message = String(error?.message || '')
    .toLowerCase()
    .trim();
  const details =
    error?.details && typeof error.details === 'object'
      ? JSON.stringify(error.details).toLowerCase()
      : String(error?.details || '').toLowerCase();
  const errorText = `${message} ${details}`.trim();

  const hasQuotaSignal =
    errorText.includes('quota') ||
    errorText.includes('resource_exhausted') ||
    errorText.includes('daily limit') ||
    errorText.includes('billing') ||
    errorText.includes('exceeded your current quota');

  if ((statusCode === 429 || statusCode === 403) && hasQuotaSignal) {
    return SOURCE_ERROR_REASON.GROUNDING_QUOTA_EXHAUSTED;
  }

  if (statusCode === 429) {
    return SOURCE_ERROR_REASON.GROUNDING_RATE_LIMIT;
  }

  if (statusCode === 408 || error?.name === 'AbortError') {
    return SOURCE_ERROR_REASON.GROUNDING_TIMEOUT;
  }

  if (!message) {
    return SOURCE_ERROR_REASON.GROUNDING_UNKNOWN;
  }

  if (
    message.includes('safety') ||
    message.includes('blocked by safety') ||
    message.includes('promptfeedback')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_SAFETY_BLOCKED;
  }

  if (
    message.includes('invalid parser format') ||
    message.includes('no usable nutrition data') ||
    message.includes('no readable text') ||
    message.includes('malformed')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_INVALID_RESPONSE;
  }

  if (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('connection')
  ) {
    return SOURCE_ERROR_REASON.GROUNDING_NETWORK_ERROR;
  }

  return SOURCE_ERROR_REASON.GROUNDING_UNKNOWN;
};

const buildDefaultResult = () => ({
  results: [],
  source: FOOD_SEARCH_SOURCE.LOCAL,
  sourcesTried: [],
  fallbackUsed: false,
  errorsBySource: {},
  errorReasonsBySource: {},
});

const loadSearchLocal = async () => {
  const module = await import('./foodCatalog.js');
  return module.searchFoods;
};

const loadGetFoodsByIds = async () => {
  const module = await import('./foodCatalog.js');
  return module.getFoodsByIds;
};

const loadSearchUsda = async () => {
  const module = await import('./usda.js');
  return module.searchFoods;
};

const loadGroundedMacroLookup = async () => {
  const module = await import('./gemini.js');
  return module.fetchMacrosWithGrounding;
};

const resolveAiConfidence = (score) => {
  if (!Number.isFinite(score) || score <= 0) {
    return 'low';
  }
  if (score >= AI_SCORE_THRESHOLD.high) {
    return 'high';
  }
  if (score >= AI_SCORE_THRESHOLD.medium) {
    return 'medium';
  }
  return 'low';
};

const buildNameMatchScore = (query, food) => {
  const normalizedQuery = normalizeTokenString(query);
  if (!normalizedQuery) {
    return 0;
  }

  const foodName = normalizeTokenString(food?.name);
  const foodBrand = normalizeTokenString(food?.brand);
  const foodCombined = normalizeTokenString([foodName, foodBrand].join(' '));

  if (!foodCombined) {
    return 0;
  }

  if (foodName === normalizedQuery || foodCombined === normalizedQuery) {
    return 1;
  }

  const queryTokens = tokenize(normalizedQuery);
  const foodTokens = tokenize(foodCombined);

  if (queryTokens.length === 0 || foodTokens.length === 0) {
    return 0;
  }

  const querySet = new Set(queryTokens);
  const foodSet = new Set(foodTokens);

  let overlapCount = 0;
  querySet.forEach((token) => {
    if (foodSet.has(token)) {
      overlapCount += 1;
    }
  });

  const recall = overlapCount / querySet.size;
  const precision = overlapCount / foodSet.size;
  const jaccard = overlapCount / (querySet.size + foodSet.size - overlapCount);
  const containsBonus =
    foodCombined.includes(normalizedQuery) || normalizedQuery.includes(foodName)
      ? 0.16
      : 0;
  const startsWithBonus = foodName.startsWith(normalizedQuery) ? 0.08 : 0;

  const score =
    recall * 0.55 +
    precision * 0.2 +
    jaccard * 0.15 +
    containsBonus +
    startsWithBonus;

  return Math.max(0, Math.min(1, score));
};

const pickBestMatch = (query, results = []) => {
  let best = null;

  results.forEach((food) => {
    const score = buildNameMatchScore(query, food);
    if (!best || score > best.score) {
      best = { food, score };
    }
  });

  if (!best) {
    return null;
  }

  return {
    food: best.food,
    score: best.score,
    confidence: resolveAiConfidence(best.score),
  };
};

const searchOnlineHierarchy = async ({
  query,
  page,
  pageSize,
  dependencies,
}) => {
  const sourcesTried = [];
  const errorsBySource = {};
  const errorReasonsBySource = {};

  sourcesTried.push(FOOD_SEARCH_SOURCE.USDA);
  try {
    const usdaResult = await dependencies.searchUsda(query, {
      page,
      pageSize,
    });
    const usdaFoods = Array.isArray(usdaResult?.foods) ? usdaResult.foods : [];

    if (usdaFoods.length > 0) {
      return {
        results: usdaFoods,
        source: FOOD_SEARCH_SOURCE.USDA,
        sourcesTried,
        errorsBySource,
        errorReasonsBySource,
      };
    }
  } catch (error) {
    errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
      error,
      'USDA search failed.'
    );
    errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA] =
      SOURCE_ERROR_REASON.USDA_SEARCH_FAILED;
  }

  return {
    results: [],
    source: FOOD_SEARCH_SOURCE.USDA,
    sourcesTried,
    errorsBySource,
    errorReasonsBySource,
  };
};

const loadDependencies = async ({
  includeLocal = true,
  includeGetFoodsByIds = false,
  includeGrounding = false,
  dependencies = {},
} = {}) => {
  const resolvedSearchLocal = includeLocal
    ? dependencies.searchLocal || (await loadSearchLocal())
    : dependencies.searchLocal;
  const resolvedSearchUsda =
    dependencies.searchUsda || (await loadSearchUsda());
  const resolvedGetFoodsByIds =
    includeLocal && includeGetFoodsByIds
      ? dependencies.getFoodsByIds || (await loadGetFoodsByIds())
      : dependencies.getFoodsByIds;
  const resolvedGroundedLookup = includeGrounding
    ? dependencies.searchGrounded || (await loadGroundedMacroLookup())
    : dependencies.searchGrounded;

  return {
    searchLocal: resolvedSearchLocal,
    searchUsda: resolvedSearchUsda,
    getFoodsByIds: resolvedGetFoodsByIds,
    searchGrounded: resolvedGroundedLookup,
  };
};

export const searchFoodsLocal = async ({
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  limit = 500,
  offset = 0,
  pinnedFoodIds = [],
  dependencies = {},
} = {}) => {
  const normalizedQuery = normalizeQuery(query);
  const normalizedOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 500));
  const normalizedPinnedFoodIds = Array.from(
    new Set(
      (Array.isArray(pinnedFoodIds) ? pinnedFoodIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  );
  const resolvedDependencies = await loadDependencies({
    includeLocal: true,
    includeGetFoodsByIds:
      normalizedPinnedFoodIds.length > 0 && normalizedOffset === 0,
    dependencies,
  });

  const localResults = await resolvedDependencies.searchLocal({
    query: normalizedQuery,
    category,
    subcategory,
    sortBy,
    sortOrder,
    limit: normalizedLimit,
    offset: normalizedOffset,
  });

  const pinnedRows =
    normalizedOffset === 0 &&
    normalizedPinnedFoodIds.length > 0 &&
    typeof resolvedDependencies.getFoodsByIds === 'function'
      ? await resolvedDependencies.getFoodsByIds(normalizedPinnedFoodIds)
      : [];

  const safeLocalResults = Array.isArray(localResults) ? localResults : [];

  const mergedById = new Map();
  (Array.isArray(pinnedRows) ? pinnedRows : []).forEach((food) => {
    if (!food?.id) return;
    mergedById.set(food.id, food);
  });
  safeLocalResults.forEach((food) => {
    if (!food?.id || mergedById.has(food.id)) return;
    mergedById.set(food.id, food);
  });

  const localRowsCount = safeLocalResults.length;
  const hasMoreLocal = localRowsCount >= normalizedLimit;

  return {
    results: Array.from(mergedById.values()),
    localRowsCount,
    localOffset: normalizedOffset,
    nextOffset: normalizedOffset + localRowsCount,
    hasMoreLocal,
    source: FOOD_SEARCH_SOURCE.LOCAL,
    sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
    fallbackUsed: false,
    errorsBySource: {},
    errorReasonsBySource: {},
  };
};

export const searchFoodsOnline = async ({
  query = '',
  onlinePage = 1,
  onlinePageSize = 20,
  dependencies = {},
} = {}) => {
  const normalizedQuery = normalizeQuery(query);
  const resolvedDependencies = await loadDependencies({
    includeLocal: false,
    dependencies,
  });

  if (!normalizedQuery || normalizedQuery.length < ONLINE_QUERY_MIN_LENGTH) {
    return {
      ...buildDefaultResult(),
      source: FOOD_SEARCH_SOURCE.USDA,
    };
  }

  const onlineResult = await searchOnlineHierarchy({
    query: normalizedQuery,
    page: onlinePage,
    pageSize: onlinePageSize,
    dependencies: resolvedDependencies,
  });

  return {
    results: onlineResult.results,
    source: onlineResult.source,
    sourcesTried: onlineResult.sourcesTried,
    fallbackUsed: false,
    errorsBySource: onlineResult.errorsBySource,
    errorReasonsBySource: onlineResult.errorReasonsBySource || {},
  };
};

export const resolveAiFoodLookup = async ({
  entryName = '',
  lookupTerms = [],
  entryCategory = null,
  isOnline = true,
  localLimit = AI_LOCAL_LIMIT,
  onlinePageSize = AI_ONLINE_PAGE_SIZE,
  sourcePreferenceWeights = null,
  dependencies = {},
} = {}) => {
  const cacheKey = buildAiLookupCacheKey({
    entryName,
    lookupTerms,
    entryCategory,
    isOnline,
    localLimit,
    onlinePageSize,
    sourcePreferenceWeights,
  });

  const cachedResult = aiLookupSessionCache.get(cacheKey);
  if (cachedResult) {
    return cloneLookupResult(cachedResult);
  }

  const primaryTerm = normalizeQuery(entryName);
  const terms = dedupeTerms([primaryTerm, ...(lookupTerms || [])]).slice(0, 6);

  if (terms.length === 0) {
    const noQueryResult = {
      status: 'no_query',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: null,
      sourcesTried: [],
      fallbackUsed: false,
      matchedFood: null,
      errorsBySource: {},
      errorReasonsBySource: {},
      matchConfidence: 'low',
      matchScore: 0,
      weightedMatchScore: 0,
      confidenceComponents: {
        rawScore: 0,
        trustMultiplier: resolveSourceTrustMultiplier(FOOD_SEARCH_SOURCE.LOCAL),
        weightedScore: 0,
      },
    };

    aiLookupSessionCache.set(cacheKey, noQueryResult);
    return cloneLookupResult(noQueryResult);
  }

  const resolvedDependencies = await loadDependencies({
    includeLocal: true,
    includeGrounding: true,
    dependencies,
  });

  const effectiveSourcePreferenceWeights =
    sourcePreferenceWeights ||
    (await getRagSourcePreferenceWeightsForCategory(
      entryCategory || 'uncategorized'
    ));

  const sourcesTried = [];
  const errorsBySource = {};
  const errorReasonsBySource = {};
  let bestMatch = null;

  const maybeKeepBest = ({ match, source, queryUsed }) => {
    if (!match?.food) {
      return;
    }

    const weightedConfidence = resolveWeightedConfidence({
      score: match.score,
      source,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
    });

    const candidate = {
      source,
      queryUsed,
      food: match.food,
      score: match.score,
      confidence: weightedConfidence.confidence,
      weightedScore: weightedConfidence.weightedScore,
      confidenceComponents: {
        rawScore: weightedConfidence.rawScore,
        trustMultiplier: weightedConfidence.trustMultiplier,
        weightedScore: weightedConfidence.weightedScore,
      },
    };

    if (
      !bestMatch ||
      candidate.weightedScore > bestMatch.weightedScore ||
      (candidate.weightedScore === bestMatch.weightedScore &&
        candidate.score > bestMatch.score)
    ) {
      bestMatch = candidate;
    }
  };

  for (const term of terms) {
    const shouldQueryUsda =
      isOnline && (!bestMatch || bestMatch.score < AI_SCORE_THRESHOLD.medium);
    const termPromises = [];
    const usdaAbortController =
      shouldQueryUsda && typeof AbortController !== 'undefined'
        ? new AbortController()
        : null;

    if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.LOCAL)) {
      sourcesTried.push(FOOD_SEARCH_SOURCE.LOCAL);
    }

    termPromises.push(
      resolvedDependencies
        .searchLocal({
          query: term,
          limit: localLimit,
        })
        .then((localResult) => {
          const localMatch = pickBestMatch(term, localResult);
          if (
            localMatch?.score >= AI_SCORE_THRESHOLD.medium &&
            usdaAbortController
          ) {
            usdaAbortController.abort();
          }

          return {
            source: FOOD_SEARCH_SOURCE.LOCAL,
            queryUsed: term,
            match: localMatch,
          };
        })
        .catch((error) => {
          errorsBySource[FOOD_SEARCH_SOURCE.LOCAL] = toErrorMessage(
            error,
            'Local search failed.'
          );
          errorReasonsBySource[FOOD_SEARCH_SOURCE.LOCAL] =
            SOURCE_ERROR_REASON.LOCAL_SEARCH_FAILED;
          return null;
        })
    );

    if (shouldQueryUsda) {
      if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.USDA)) {
        sourcesTried.push(FOOD_SEARCH_SOURCE.USDA);
      }

      termPromises.push(
        resolvedDependencies
          .searchUsda(term, {
            page: 1,
            pageSize: onlinePageSize,
            signal: usdaAbortController?.signal,
          })
          .then((usdaResult) => {
            const usdaFoods = Array.isArray(usdaResult?.foods)
              ? usdaResult.foods
              : [];
            const usdaMatch = pickBestMatch(term, usdaFoods);

            return {
              source: FOOD_SEARCH_SOURCE.USDA,
              queryUsed: term,
              match: usdaMatch,
            };
          })
          .catch((error) => {
            if (error?.name === 'AbortError') {
              errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA] =
                SOURCE_ERROR_REASON.USDA_SEARCH_ABORTED;
              return null;
            }

            errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
              error,
              'USDA search failed.'
            );
            errorReasonsBySource[FOOD_SEARCH_SOURCE.USDA] =
              SOURCE_ERROR_REASON.USDA_SEARCH_FAILED;
            return null;
          })
      );
    }

    const termResults = await Promise.all(termPromises);
    termResults.forEach((item) => {
      if (!item) return;
      maybeKeepBest(item);
    });

    if (bestMatch?.score >= AI_SCORE_THRESHOLD.high) {
      break;
    }
  }

  const shouldUseGrounding =
    isOnline && (!bestMatch || bestMatch.score < AI_SCORE_THRESHOLD.low);

  if (
    shouldUseGrounding &&
    typeof resolvedDependencies.searchGrounded === 'function'
  ) {
    if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH)) {
      sourcesTried.push(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
    }

    const groundedQuery = terms[0] || primaryTerm;

    try {
      const groundedEstimate =
        await resolvedDependencies.searchGrounded(groundedQuery);

      const groundedPer100g = groundedEstimate?.per100g;
      const hasGroundedMacros =
        groundedPer100g && typeof groundedPer100g === 'object';

      if (hasGroundedMacros) {
        const weightedConfidence = resolveWeightedConfidence({
          score: AI_SCORE_THRESHOLD.low,
          source: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          sourcePreferenceWeights: effectiveSourcePreferenceWeights,
        });

        const groundedResult = {
          status: 'resolved',
          usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          queryUsed: groundedQuery,
          sourcesTried,
          fallbackUsed: true,
          matchedFood: {
            name: groundedEstimate?.name || primaryTerm || groundedQuery,
            brand: null,
            category: null,
            subcategory: 'grounded_estimate',
            per100g: {
              calories: Number(groundedPer100g.calories) || 0,
              protein: Number(groundedPer100g.protein) || 0,
              carbs: Number(groundedPer100g.carbs) || 0,
              fats: Number(groundedPer100g.fats) || 0,
            },
          },
          errorsBySource,
          errorReasonsBySource,
          matchConfidence:
            groundedEstimate?.confidence || weightedConfidence.confidence,
          matchScore: AI_SCORE_THRESHOLD.low,
          weightedMatchScore: weightedConfidence.weightedScore,
          confidenceComponents: {
            rawScore: weightedConfidence.rawScore,
            trustMultiplier: weightedConfidence.trustMultiplier,
            weightedScore: weightedConfidence.weightedScore,
          },
        };

        aiLookupSessionCache.set(cacheKey, groundedResult);
        return cloneLookupResult(groundedResult);
      }
    } catch (error) {
      errorsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH] = toErrorMessage(
        error,
        'Grounded web lookup failed.'
      );
      errorReasonsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH] =
        resolveGroundingFailureReason(error);
    }
  }

  if (!bestMatch || bestMatch.score < AI_SCORE_THRESHOLD.low) {
    const lowConfidence = resolveWeightedConfidence({
      score: Number(bestMatch?.score || 0),
      source: bestMatch?.source || FOOD_SEARCH_SOURCE.LOCAL,
      sourcePreferenceWeights: effectiveSourcePreferenceWeights,
    });

    const noMatchResult = {
      status: bestMatch ? 'weak_match' : 'no_match',
      usedSource: bestMatch?.source || FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: bestMatch?.queryUsed || null,
      sourcesTried,
      fallbackUsed: sourcesTried.length > 1,
      matchedFood: null,
      errorsBySource,
      errorReasonsBySource,
      matchConfidence: lowConfidence.confidence,
      matchScore: Number(bestMatch?.score || 0),
      weightedMatchScore: lowConfidence.weightedScore,
      confidenceComponents: {
        rawScore: lowConfidence.rawScore,
        trustMultiplier: lowConfidence.trustMultiplier,
        weightedScore: lowConfidence.weightedScore,
      },
    };

    aiLookupSessionCache.set(cacheKey, noMatchResult);
    return cloneLookupResult(noMatchResult);
  }

  const weightedConfidence = resolveWeightedConfidence({
    score: bestMatch.score,
    source: bestMatch.source,
    sourcePreferenceWeights: effectiveSourcePreferenceWeights,
  });

  const resolvedResult = {
    status: 'resolved',
    usedSource: bestMatch.source,
    queryUsed: bestMatch.queryUsed,
    sourcesTried,
    fallbackUsed: bestMatch.source !== FOOD_SEARCH_SOURCE.LOCAL,
    matchedFood: {
      name: bestMatch.food.name,
      brand: bestMatch.food.brand || null,
      category: bestMatch.food.category || null,
      subcategory: bestMatch.food.subcategory || null,
      per100g:
        bestMatch.food?.per100g && typeof bestMatch.food.per100g === 'object'
          ? {
              calories: Number(bestMatch.food.per100g.calories) || 0,
              protein: Number(bestMatch.food.per100g.protein) || 0,
              carbs: Number(bestMatch.food.per100g.carbs) || 0,
              fats: Number(bestMatch.food.per100g.fats) || 0,
            }
          : null,
    },
    errorsBySource,
    errorReasonsBySource,
    matchConfidence: weightedConfidence.confidence,
    matchScore: Number(bestMatch.score),
    weightedMatchScore: weightedConfidence.weightedScore,
    confidenceComponents: {
      rawScore: weightedConfidence.rawScore,
      trustMultiplier: weightedConfidence.trustMultiplier,
      weightedScore: weightedConfidence.weightedScore,
    },
  };

  aiLookupSessionCache.set(cacheKey, resolvedResult);
  return cloneLookupResult(resolvedResult);
};

export const resolveAiFoodEntry = async ({
  entry,
  isOnline = true,
  lookupMeta = null,
  dependencies = {},
} = {}) => {
  if (!entry || typeof entry !== 'object') {
    return {
      verifiedEntry: null,
      lookupMeta: null,
    };
  }

  const resolvedLookupMeta =
    lookupMeta ||
    (await resolveAiFoodLookup({
      entryName: entry.name,
      lookupTerms: Array.isArray(entry.lookupTerms) ? entry.lookupTerms : [],
      isOnline,
      dependencies,
    }));

  const gramsResolution = resolveEntryGrams(entry, {
    fallbackGrams: 100,
  });
  const grams = gramsResolution.grams;

  const hasLookupPer100g =
    resolvedLookupMeta?.status === 'resolved' &&
    resolvedLookupMeta?.matchedFood?.per100g &&
    grams > 0;

  const fallbackVerificationUsed = !hasLookupPer100g;
  const originalConfidence = hasLookupPer100g
    ? resolvedLookupMeta?.matchConfidence || 'high'
    : entry?.confidence || 'medium';
  const fallbackPenaltyConfidence =
    resolveConfidencePenalty(originalConfidence);

  const basePer100g = hasLookupPer100g
    ? resolvedLookupMeta.matchedFood.per100g
    : {
        calories:
          grams > 0
            ? ((Number(entry?.calories) || 0) * 100) / grams
            : Number(entry?.calories) || 0,
        protein:
          grams > 0
            ? ((Number(entry?.protein) || 0) * 100) / grams
            : Number(entry?.protein) || 0,
        carbs:
          grams > 0
            ? ((Number(entry?.carbs) || 0) * 100) / grams
            : Number(entry?.carbs) || 0,
        fats:
          grams > 0
            ? ((Number(entry?.fats) || 0) * 100) / grams
            : Number(entry?.fats) || 0,
      };

  const scaledMacros = scaleMacrosFromPer100g(basePer100g, grams);

  const verifiedEntry = {
    name: String(entry?.name || '').trim() || 'Food entry',
    grams,
    calories: scaledMacros.calories,
    protein: scaledMacros.protein,
    carbs: scaledMacros.carbs,
    fats: scaledMacros.fats,
    confidence: hasLookupPer100g
      ? resolvedLookupMeta?.matchConfidence || 'high'
      : fallbackPenaltyConfidence,
    rationale: entry?.rationale || null,
    assumptions: Array.isArray(entry?.assumptions) ? entry.assumptions : [],
    lookupTerms: Array.isArray(entry?.lookupTerms) ? entry.lookupTerms : [],
    ...(entry?.category ? { category: entry.category } : {}),
    source: hasLookupPer100g
      ? resolvedLookupMeta?.usedSource || FOOD_SEARCH_SOURCE.LOCAL
      : 'estimate',
    portionResolutionMethod: gramsResolution.method,
    portionAssumed: gramsResolution.assumed,
  };

  return {
    verifiedEntry,
    lookupMeta: {
      ...(resolvedLookupMeta && typeof resolvedLookupMeta === 'object'
        ? resolvedLookupMeta
        : {}),
      matchConfidence: hasLookupPer100g
        ? resolvedLookupMeta?.matchConfidence || 'high'
        : fallbackPenaltyConfidence,
      originalMatchConfidence: originalConfidence,
      penalizedMatchConfidence: fallbackVerificationUsed
        ? fallbackPenaltyConfidence
        : null,
      confidencePenaltyApplied: fallbackVerificationUsed,
      confidencePenaltyReason: fallbackVerificationUsed
        ? 'deterministic_macro_fallback'
        : null,
      verificationFallbackUsed: fallbackVerificationUsed,
      verificationMethod: fallbackVerificationUsed
        ? 'derived_per100g_rescale'
        : 'lookup_per100g',
      fallbackDerivedPer100g: fallbackVerificationUsed,
    },
  };
};

export const searchFoodsHierarchically = async ({
  mode = 'local',
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  limit = 500,
  onlinePage = 1,
  onlinePageSize = 20,
  dependencies = {},
} = {}) => {
  // Legacy wrapper kept for compatibility while call sites migrate.
  if (mode === 'online') {
    return searchFoodsOnline({
      query,
      onlinePage: onlinePage || 1,
      onlinePageSize,
      dependencies,
    });
  }

  return searchFoodsLocal({
    query,
    category,
    subcategory,
    sortBy,
    sortOrder,
    limit,
    dependencies,
  });
};
