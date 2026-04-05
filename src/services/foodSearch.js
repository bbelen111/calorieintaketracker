export const FOOD_SEARCH_SOURCE = {
  LOCAL: 'local',
  FATSECRET: 'fatsecret',
  OPENFOODFACTS: 'openfoodfacts',
};

export const FOOD_SEARCH_SOURCE_LABELS = {
  [FOOD_SEARCH_SOURCE.LOCAL]: 'Local',
  [FOOD_SEARCH_SOURCE.FATSECRET]: 'FatSecret',
  [FOOD_SEARCH_SOURCE.OPENFOODFACTS]: 'OpenFoodFacts',
};

export const getFoodSearchSourceLabel = (source) => {
  return FOOD_SEARCH_SOURCE_LABELS[source] || 'Unknown';
};

const ONLINE_QUERY_MIN_LENGTH = 2;

const normalizeQuery = (query) => String(query ?? '').trim();

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

const loadSearchFatSecret = async () => {
  const module = await import('./fatSecret.js');
  return module.searchFoods;
};

const loadSearchOpenFoodFacts = async () => {
  const module = await import('./openFoodFacts.js');
  return module.searchFoods;
};

const searchOnlineHierarchy = async ({
  query,
  page,
  pageSize,
  dependencies,
}) => {
  const sourcesTried = [];
  const errorsBySource = {};

  sourcesTried.push(FOOD_SEARCH_SOURCE.FATSECRET);
  try {
    const fatSecretResult = await dependencies.searchFatSecret(query, page);
    const fatSecretFoods = Array.isArray(fatSecretResult?.foods)
      ? fatSecretResult.foods
      : [];

    if (fatSecretFoods.length > 0) {
      return {
        results: fatSecretFoods,
        source: FOOD_SEARCH_SOURCE.FATSECRET,
        sourcesTried,
        errorsBySource,
      };
    }
  } catch (error) {
    errorsBySource[FOOD_SEARCH_SOURCE.FATSECRET] = toErrorMessage(
      error,
      'FatSecret search failed.'
    );
  }

  sourcesTried.push(FOOD_SEARCH_SOURCE.OPENFOODFACTS);
  try {
    const openFoodFactsResult = await dependencies.searchOpenFoodFacts(query, {
      page,
      pageSize,
    });
    const openFoodFactsFoods = Array.isArray(openFoodFactsResult?.foods)
      ? openFoodFactsResult.foods
      : [];

    if (openFoodFactsFoods.length > 0) {
      return {
        results: openFoodFactsFoods,
        source: FOOD_SEARCH_SOURCE.OPENFOODFACTS,
        sourcesTried,
        errorsBySource,
      };
    }
  } catch (error) {
    errorsBySource[FOOD_SEARCH_SOURCE.OPENFOODFACTS] = toErrorMessage(
      error,
      'OpenFoodFacts search failed.'
    );
  }

  return {
    results: [],
    source: FOOD_SEARCH_SOURCE.FATSECRET,
    sourcesTried,
    errorsBySource,
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
  isOnline = true,
  minLocalResults = 1,
  onlinePage = 0,
  onlinePageSize = 20,
  dependencies = {},
} = {}) => {
  const resolvedMode = mode === 'online' ? 'online' : 'local';
  const normalizedQuery = normalizeQuery(query);
  const resolvedSearchLocal =
    resolvedMode === 'local'
      ? dependencies.searchLocal || (await loadSearchLocal())
      : dependencies.searchLocal;
  const resolvedSearchFatSecret =
    dependencies.searchFatSecret || (await loadSearchFatSecret());
  const resolvedSearchOpenFoodFacts =
    dependencies.searchOpenFoodFacts || (await loadSearchOpenFoodFacts());

  const resolvedDependencies = {
    searchLocal: resolvedSearchLocal,
    searchFatSecret: resolvedSearchFatSecret,
    searchOpenFoodFacts: resolvedSearchOpenFoodFacts,
  };

  if (!normalizedQuery && resolvedMode === 'online') {
    return {
      ...buildDefaultResult(),
      source: FOOD_SEARCH_SOURCE.FATSECRET,
    };
  }

  if (
    normalizedQuery.length < ONLINE_QUERY_MIN_LENGTH &&
    resolvedMode === 'online'
  ) {
    return {
      ...buildDefaultResult(),
      source: FOOD_SEARCH_SOURCE.FATSECRET,
    };
  }

  if (resolvedMode === 'local') {
    const localResults = await resolvedDependencies.searchLocal({
      query: normalizedQuery,
      category,
      subcategory,
      sortBy,
      sortOrder,
      limit,
    });

    const safeLocalResults = Array.isArray(localResults) ? localResults : [];

    const hasEnoughLocalResults = safeLocalResults.length >= minLocalResults;
    const shouldSkipOnlineFallback =
      hasEnoughLocalResults ||
      !isOnline ||
      normalizedQuery.length < ONLINE_QUERY_MIN_LENGTH;

    if (shouldSkipOnlineFallback) {
      return {
        results: safeLocalResults,
        source: FOOD_SEARCH_SOURCE.LOCAL,
        sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
        fallbackUsed: false,
        errorsBySource: {},
      };
    }

    const onlineResult = await searchOnlineHierarchy({
      query: normalizedQuery,
      page: onlinePage,
      pageSize: onlinePageSize,
      dependencies: resolvedDependencies,
    });

    if (onlineResult.results.length > 0) {
      return {
        results: onlineResult.results,
        source: onlineResult.source,
        sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL, ...onlineResult.sourcesTried],
        fallbackUsed: true,
        errorsBySource: onlineResult.errorsBySource,
      };
    }

    return {
      results: [],
      source: FOOD_SEARCH_SOURCE.LOCAL,
      sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL, ...onlineResult.sourcesTried],
      fallbackUsed: true,
      errorsBySource: onlineResult.errorsBySource,
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
    fallbackUsed:
      onlineResult.source === FOOD_SEARCH_SOURCE.OPENFOODFACTS &&
      onlineResult.results.length > 0,
    errorsBySource: onlineResult.errorsBySource,
  };
};
