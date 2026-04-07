import {
  resolveEntryGrams,
  scaleMacrosFromPer100g,
} from '../utils/food/portionNormalization.js';

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

const toErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message ?? '').trim();
  return message || fallbackMessage;
};

const buildDefaultResult = () => ({
  results: [],
  source: FOOD_SEARCH_SOURCE.LOCAL,
  sourcesTried: [],
  fallbackUsed: false,
  errorsBySource: {},
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
      };
    }
  } catch (error) {
    errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
      error,
      'USDA search failed.'
    );
  }

  return {
    results: [],
    source: FOOD_SEARCH_SOURCE.USDA,
    sourcesTried,
    errorsBySource,
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
  };
};

export const resolveAiFoodLookup = async ({
  entryName = '',
  lookupTerms = [],
  isOnline = true,
  localLimit = AI_LOCAL_LIMIT,
  onlinePageSize = AI_ONLINE_PAGE_SIZE,
  dependencies = {},
} = {}) => {
  const primaryTerm = normalizeQuery(entryName);
  const terms = dedupeTerms([primaryTerm, ...(lookupTerms || [])]).slice(0, 6);

  if (terms.length === 0) {
    return {
      status: 'no_query',
      usedSource: FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: null,
      sourcesTried: [],
      fallbackUsed: false,
      matchedFood: null,
      errorsBySource: {},
      matchConfidence: 'low',
      matchScore: 0,
    };
  }

  const resolvedDependencies = await loadDependencies({
    includeLocal: true,
    includeGrounding: true,
    dependencies,
  });

  const sourcesTried = [];
  const errorsBySource = {};
  let bestMatch = null;

  const maybeKeepBest = ({ match, source, queryUsed }) => {
    if (!match?.food) {
      return;
    }

    const candidate = {
      source,
      queryUsed,
      food: match.food,
      score: match.score,
      confidence: match.confidence,
    };

    if (!bestMatch || candidate.score > bestMatch.score) {
      bestMatch = candidate;
    }
  };

  for (const term of terms) {
    if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.LOCAL)) {
      sourcesTried.push(FOOD_SEARCH_SOURCE.LOCAL);
    }

    try {
      const localResult = await resolvedDependencies.searchLocal({
        query: term,
        limit: localLimit,
      });
      const localMatch = pickBestMatch(term, localResult);
      maybeKeepBest({
        match: localMatch,
        source: FOOD_SEARCH_SOURCE.LOCAL,
        queryUsed: term,
      });

      if (localMatch?.score >= AI_SCORE_THRESHOLD.high) {
        break;
      }
    } catch (error) {
      errorsBySource[FOOD_SEARCH_SOURCE.LOCAL] = toErrorMessage(
        error,
        'Local search failed.'
      );
    }
  }

  const shouldSkipOnline =
    !isOnline || (bestMatch && bestMatch.score >= AI_SCORE_THRESHOLD.medium);

  if (!shouldSkipOnline) {
    for (const term of terms) {
      if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.USDA)) {
        sourcesTried.push(FOOD_SEARCH_SOURCE.USDA);
      }

      try {
        const usdaResult = await resolvedDependencies.searchUsda(term, {
          page: 1,
          pageSize: onlinePageSize,
        });
        const usdaFoods = Array.isArray(usdaResult?.foods)
          ? usdaResult.foods
          : [];
        const usdaMatch = pickBestMatch(term, usdaFoods);

        maybeKeepBest({
          match: usdaMatch,
          source: FOOD_SEARCH_SOURCE.USDA,
          queryUsed: term,
        });

        if (usdaMatch?.score >= AI_SCORE_THRESHOLD.high) {
          break;
        }
      } catch (error) {
        errorsBySource[FOOD_SEARCH_SOURCE.USDA] = toErrorMessage(
          error,
          'USDA search failed.'
        );
      }
    }
  }

  const shouldUseGrounding =
    isOnline && (!bestMatch || bestMatch.score < AI_SCORE_THRESHOLD.low);

  if (shouldUseGrounding && typeof resolvedDependencies.searchGrounded === 'function') {
    if (!sourcesTried.includes(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH)) {
      sourcesTried.push(FOOD_SEARCH_SOURCE.AI_WEB_SEARCH);
    }

    const groundedQuery = terms[0] || primaryTerm;

    try {
      const groundedResult = await resolvedDependencies.searchGrounded(
        groundedQuery
      );

      const groundedPer100g = groundedResult?.per100g;
      const hasGroundedMacros =
        groundedPer100g && typeof groundedPer100g === 'object';

      if (hasGroundedMacros) {
        return {
          status: 'resolved',
          usedSource: FOOD_SEARCH_SOURCE.AI_WEB_SEARCH,
          queryUsed: groundedQuery,
          sourcesTried,
          fallbackUsed: true,
          matchedFood: {
            name: groundedResult?.name || primaryTerm || groundedQuery,
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
          matchConfidence: groundedResult?.confidence || 'low',
          matchScore: AI_SCORE_THRESHOLD.low,
        };
      }
    } catch (error) {
      errorsBySource[FOOD_SEARCH_SOURCE.AI_WEB_SEARCH] = toErrorMessage(
        error,
        'Grounded web lookup failed.'
      );
    }
  }

  if (!bestMatch || bestMatch.score < AI_SCORE_THRESHOLD.low) {
    return {
      status: bestMatch ? 'weak_match' : 'no_match',
      usedSource: bestMatch?.source || FOOD_SEARCH_SOURCE.LOCAL,
      queryUsed: bestMatch?.queryUsed || null,
      sourcesTried,
      fallbackUsed: sourcesTried.length > 1,
      matchedFood: null,
      errorsBySource,
      matchConfidence: bestMatch?.confidence || 'low',
      matchScore: Number(bestMatch?.score || 0),
    };
  }

  return {
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
    matchConfidence: bestMatch.confidence,
    matchScore: Number(bestMatch.score),
  };
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

  const basePer100g = hasLookupPer100g
    ? resolvedLookupMeta.matchedFood.per100g
    : {
        calories: grams > 0 ? ((Number(entry?.calories) || 0) * 100) / grams : Number(entry?.calories) || 0,
        protein: grams > 0 ? ((Number(entry?.protein) || 0) * 100) / grams : Number(entry?.protein) || 0,
        carbs: grams > 0 ? ((Number(entry?.carbs) || 0) * 100) / grams : Number(entry?.carbs) || 0,
        fats: grams > 0 ? ((Number(entry?.fats) || 0) * 100) / grams : Number(entry?.fats) || 0,
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
      : entry?.confidence || 'medium',
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
    lookupMeta: resolvedLookupMeta,
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
