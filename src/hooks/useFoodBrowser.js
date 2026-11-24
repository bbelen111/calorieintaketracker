import { useEffect, useMemo, useRef, useState } from 'react';
import { FOOD_CATEGORIES } from '../constants/food/foodDatabase';
import { searchFoodsLocal, searchFoodsOnline } from '../services/foodSearch';
import {
  ONLINE_FOOD_CATEGORIES,
  appendUniqueFoodsById,
  buildLocalCategoryOptions,
  buildLocalFoodList,
  buildLocalSubcategories,
  buildOnlineFoodList,
  buildOnlineServingOptions,
  getSortLabel,
  mergeFoodsById,
} from '../utils/food/foodListing';

/**
 * Browse foods the way the Food Search modal does - Local (your favourites,
 * cached, custom foods and the bundled catalog) and Online (the cloud catalog),
 * with category / subcategory / sort filters, pinned foods first and
 * progressive "Show more" - for surfaces that are not the search modal itself
 * (the recipe ingredient picker). The pure filter / sort / merge half is the
 * search modal's own (`utils/food/foodListing.js`); this hook is the stateful
 * half.
 *
 * Loading is DERIVED, not stored. Every fetched result set is tagged with the
 * request key that produced it (query + filters + pins for local, query + retry
 * for online), so "searching" is simply `results.key !== currentKey`, a stale
 * response can never be shown for a newer request, and no state is set
 * synchronously from an effect. Local results are narrowed again on the client
 * by the current filters, so rows already on screen stay consistent while the
 * next page of the catalog loads.
 */

export const FOOD_BROWSER_LIMITS = Object.freeze({
  localBatchSize: 120,
  onlineBatchSize: 80,
  localDbPageSize: 500,
  onlinePageSize: 50, // the search RPC caps pageSize at 50
  minOnlineQueryLength: 2,
  // The first local search of an open waits out the sheet's slide-in so the
  // list's heavy first mount (and the synchronous sql.js query) never competes
  // with it. Later searches start immediately.
  firstLocalSearchDelayMs: 220,
  onlineDebounceMs: 500,
});

export const OFFLINE_MESSAGE =
  'You are offline. Connect to search online foods.';

const EMPTY = [];

// Request keys carry their own parameters, so an effect can depend on the key
// alone (and stay exhaustive) instead of on every field it was built from.
const buildLocalKey = ({
  query,
  category,
  subcategory,
  sortBy,
  sortOrder,
  pinnedFoodIds,
}) =>
  JSON.stringify([
    query,
    category,
    subcategory,
    sortBy,
    sortOrder,
    pinnedFoodIds,
  ]);

const parseLocalKey = (key) => {
  const [query, category, subcategory, sortBy, sortOrder, pinnedFoodIds] =
    JSON.parse(key);
  return { query, category, subcategory, sortBy, sortOrder, pinnedFoodIds };
};

const buildOnlineKey = ({ query, nonce }) => JSON.stringify([query, nonce]);

const firstSourceError = (errorsBySource) => {
  const first = Object.values(errorsBySource ?? {}).find(Boolean);
  return first ? String(first) : null;
};

export const useFoodBrowser = ({
  isOpen = true,
  isOnline = true,
  pinnedFoodIds = EMPTY,
  cachedFoods = EMPTY,
  favouriteFoods = EMPTY,
  customFoods = EMPTY,
} = {}) => {
  const [searchMode, setSearchMode] = useState('local');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const [catalogState, setCatalogState] = useState(null);
  const [onlineState, setOnlineState] = useState(null);
  const [subcategoryState, setSubcategoryState] = useState({
    category: null,
    list: EMPTY,
  });
  const [visibleState, setVisibleState] = useState({ key: null, count: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const hasLoadedLocalRef = useRef(false);

  const trimmedQuery = query.trim();
  const pinnedKey = pinnedFoodIds.join(',');
  const canSearchOnline =
    isOnline && trimmedQuery.length >= FOOD_BROWSER_LIMITS.minOnlineQueryLength;

  const localKey = buildLocalKey({
    query: trimmedQuery,
    category: selectedCategory,
    subcategory: selectedSubcategory,
    sortBy,
    sortOrder,
    pinnedFoodIds: pinnedKey,
  });
  const onlineKey = buildOnlineKey({ query: trimmedQuery, nonce: retryNonce });

  // --- Local: the bundled catalog (first page of a query / filter set) -------
  useEffect(() => {
    if (!isOpen || searchMode !== 'local') {
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      const params = parseLocalKey(localKey);
      try {
        const result = await searchFoodsLocal({
          query: params.query,
          category: params.category,
          subcategory: params.subcategory,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          limit: FOOD_BROWSER_LIMITS.localDbPageSize,
          offset: 0,
          pinnedFoodIds: params.pinnedFoodIds
            ? params.pinnedFoodIds.split(',')
            : EMPTY,
        });
        if (cancelled) return;

        const results = Array.isArray(result?.results) ? result.results : EMPTY;
        hasLoadedLocalRef.current = true;
        setCatalogState({
          key: localKey,
          results,
          nextOffset: Number(result?.nextOffset) || results.length,
          hasMore: Boolean(result?.hasMoreLocal),
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Local food search error:', error);
        hasLoadedLocalRef.current = true;
        setCatalogState({
          key: localKey,
          results: EMPTY,
          nextOffset: 0,
          hasMore: false,
          error: 'Local database search failed.',
        });
      }
    };

    if (hasLoadedLocalRef.current) {
      // Start synchronously: deferring even one macrotask leaves a frame where
      // nothing is "searching" yet, which flashes "No foods found".
      run();
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(run, FOOD_BROWSER_LIMITS.firstLocalSearchDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, searchMode, localKey]);

  // --- Local: subcategories the catalog offers for the chosen category -------
  useEffect(() => {
    if (!isOpen || searchMode !== 'local' || !selectedCategory) {
      return undefined;
    }

    let cancelled = false;
    import('../services/foodCatalog')
      .then(({ getDistinctSubcategories }) =>
        getDistinctSubcategories(selectedCategory)
      )
      .then((list) => {
        if (cancelled) return;
        setSubcategoryState({
          category: selectedCategory,
          list: Array.isArray(list) ? list : EMPTY,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load local subcategories:', error);
        setSubcategoryState({ category: selectedCategory, list: EMPTY });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, searchMode, selectedCategory]);

  // --- Online: the cloud catalog (debounced first page) ----------------------
  useEffect(() => {
    if (!isOpen || searchMode !== 'online' || !canSearchOnline) {
      return undefined;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      const [onlineQuery] = JSON.parse(onlineKey);
      try {
        const result = await searchFoodsOnline({
          query: onlineQuery,
          onlinePage: 1,
          onlinePageSize: FOOD_BROWSER_LIMITS.onlinePageSize,
        });
        if (cancelled) return;

        const results = Array.isArray(result?.results) ? result.results : EMPTY;
        setOnlineState({
          key: onlineKey,
          results,
          page: 1,
          hasMore: results.length >= FOOD_BROWSER_LIMITS.onlinePageSize,
          error: firstSourceError(result?.errorsBySource),
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Online search error:', error);
        setOnlineState({
          key: onlineKey,
          results: EMPTY,
          page: 1,
          hasMore: false,
          error: error?.message || 'Search failed. Please try again.',
        });
      }
    }, FOOD_BROWSER_LIMITS.onlineDebounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, searchMode, canSearchOnline, onlineKey]);

  // --- Derived lists ----------------------------------------------------------
  const catalogResults = catalogState?.results ?? EMPTY;
  const catalogSubcategories =
    subcategoryState.category === selectedCategory
      ? subcategoryState.list
      : EMPTY;

  const mergedLocalFoods = useMemo(
    () =>
      mergeFoodsById(favouriteFoods, catalogResults, cachedFoods, customFoods),
    [favouriteFoods, catalogResults, cachedFoods, customFoods]
  );

  const localFoods = useMemo(
    () =>
      buildLocalFoodList({
        foods: mergedLocalFoods,
        query,
        category: selectedCategory,
        subcategory: selectedSubcategory,
        sortBy,
        sortOrder,
        pinnedIds: pinnedFoodIds,
      }),
    [
      mergedLocalFoods,
      query,
      selectedCategory,
      selectedSubcategory,
      sortBy,
      sortOrder,
      pinnedFoodIds,
    ]
  );

  const onlineResults =
    onlineState?.key === onlineKey && canSearchOnline
      ? onlineState.results
      : EMPTY;

  const onlineFoods = useMemo(
    () =>
      buildOnlineFoodList({
        foods: onlineResults,
        category: selectedCategory,
        subcategory: selectedSubcategory,
        sortBy,
        sortOrder,
      }),
    [onlineResults, selectedCategory, selectedSubcategory, sortBy, sortOrder]
  );

  const isOnlineMode = searchMode === 'online';
  const isFirstLocalLoad = !isOnlineMode && catalogState === null;
  const isLocalPending = !isOnlineMode && catalogState?.key !== localKey;
  const isOnlineSearching =
    isOnlineMode && canSearchOnline && onlineState?.key !== onlineKey;

  // Same rules as the search modal: the first load of an open shows only a
  // skeleton (never a partial list that is then covered), and a later re-search
  // keeps the current rows, falling back to the skeleton only when empty.
  const displayFoods = isOnlineMode
    ? onlineFoods
    : isFirstLocalLoad
      ? EMPTY
      : localFoods;

  const batchSize = isOnlineMode
    ? FOOD_BROWSER_LIMITS.onlineBatchSize
    : FOOD_BROWSER_LIMITS.localBatchSize;
  const viewKey = `${searchMode}:${isOnlineMode ? onlineKey : localKey}`;
  const visibleCount =
    visibleState.key === viewKey ? visibleState.count : batchSize;
  const visibleFoods = useMemo(
    () => displayFoods.slice(0, visibleCount),
    [displayFoods, visibleCount]
  );

  const showLocalSkeleton =
    !isOnlineMode &&
    (isFirstLocalLoad || (isLocalPending && visibleFoods.length === 0));

  const serverHasMore = isOnlineMode
    ? onlineState?.key === onlineKey && Boolean(onlineState?.hasMore)
    : catalogState?.key === localKey && Boolean(catalogState?.hasMore);
  const hasMore = visibleCount < displayFoods.length || serverHasMore;

  const categoryOptions = isOnlineMode
    ? ONLINE_FOOD_CATEGORIES
    : buildLocalCategoryOptions(FOOD_CATEGORIES, cachedFoods.length > 0);

  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return EMPTY;
    return isOnlineMode
      ? buildOnlineServingOptions({
          category: selectedCategory,
          foods: onlineResults,
        })
      : buildLocalSubcategories({
          category: selectedCategory,
          foods: mergedLocalFoods,
          catalogSubcategories,
        });
  }, [
    catalogSubcategories,
    isOnlineMode,
    mergedLocalFoods,
    onlineResults,
    selectedCategory,
  ]);

  const localError = !isOnlineMode ? (catalogState?.error ?? null) : null;
  const onlineError = !isOnlineMode
    ? null
    : !isOnline
      ? OFFLINE_MESSAGE
      : onlineState?.key === onlineKey
        ? onlineState.error
        : null;

  // --- Actions ---------------------------------------------------------------
  const selectMode = (mode) => {
    if (mode === searchMode) return;
    // Local and online filters mean different things (category vs type), so a
    // mode switch starts them fresh, exactly like the search modal.
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSearchMode(mode);
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSortBy('name');
    setSortOrder('asc');
  };

  const hasActiveFilters = Boolean(
    selectedCategory ||
    selectedSubcategory ||
    sortBy !== 'name' ||
    sortOrder !== 'asc'
  );

  const retryOnline = () => setRetryNonce((current) => current + 1);

  const loadMore = async () => {
    const nextCount = visibleCount + batchSize;
    setVisibleState({ key: viewKey, count: nextCount });

    // Still rows in memory to reveal, or a page already in flight: done.
    if (nextCount < displayFoods.length || isLoadingMore || !serverHasMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      if (isOnlineMode) {
        const requestKey = onlineKey;
        const [onlineQuery] = JSON.parse(requestKey);
        const page = (onlineState?.page ?? 1) + 1;
        const result = await searchFoodsOnline({
          query: onlineQuery,
          onlinePage: page,
          onlinePageSize: FOOD_BROWSER_LIMITS.onlinePageSize,
        });
        const rows = Array.isArray(result?.results) ? result.results : EMPTY;
        // A response for a request the user has since left is dropped.
        setOnlineState((previous) =>
          previous?.key !== requestKey
            ? previous
            : {
                ...previous,
                results: appendUniqueFoodsById(previous.results, rows),
                page,
                hasMore: rows.length >= FOOD_BROWSER_LIMITS.onlinePageSize,
              }
        );
      } else {
        const requestKey = localKey;
        const params = parseLocalKey(requestKey);
        const offset = catalogState?.nextOffset ?? 0;
        const result = await searchFoodsLocal({
          query: params.query,
          category: params.category,
          subcategory: params.subcategory,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          limit: FOOD_BROWSER_LIMITS.localDbPageSize,
          offset,
          pinnedFoodIds: params.pinnedFoodIds
            ? params.pinnedFoodIds.split(',')
            : EMPTY,
        });
        const rows = Array.isArray(result?.results) ? result.results : EMPTY;
        setCatalogState((previous) =>
          previous?.key !== requestKey
            ? previous
            : {
                ...previous,
                results: appendUniqueFoodsById(previous.results, rows),
                nextOffset: Number(result?.nextOffset) || offset + rows.length,
                hasMore: Boolean(result?.hasMoreLocal),
              }
        );
      }
    } catch (error) {
      console.error('Loading more foods failed:', error);
      const stopPaging = (previous) =>
        previous ? { ...previous, hasMore: false } : previous;
      if (isOnlineMode) {
        setOnlineState(stopPaging);
      } else {
        setCatalogState(stopPaging);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  return {
    searchMode,
    isOnlineMode,
    selectMode,
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    sortLabel: getSortLabel(sortBy, sortOrder),
    hasActiveFilters,
    clearFilters,
    categoryOptions,
    availableSubcategories,
    displayFoods,
    visibleFoods,
    hasMore,
    loadMore,
    isLoadingMore,
    isFirstLocalLoad,
    showLocalSkeleton,
    isOnlineSearching,
    localError,
    onlineError,
    retryOnline,
  };
};
