import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FOOD_BROWSER_LIMITS,
  OFFLINE_MESSAGE,
  useFoodBrowser,
} from './useFoodBrowser';
import { searchFoodsLocal, searchFoodsOnline } from '../services/foodSearch';
import { getDistinctSubcategories } from '../services/foodCatalog';

vi.mock('../services/foodSearch', () => ({
  searchFoodsLocal: vi.fn(),
  searchFoodsOnline: vi.fn(),
}));

vi.mock('../services/foodCatalog', () => ({
  getDistinctSubcategories: vi.fn(),
  // Pulled in statically by constants/food/foodDatabase.
  searchFoods: vi.fn(),
  getFoodById: vi.fn(),
  getFoodsByIds: vi.fn(),
  warmUpFoodCatalog: vi.fn(),
}));

const food = (id, name, extra = {}) => ({
  id,
  name,
  category: 'protein',
  per100g: { calories: 100, protein: 10, carbs: 5, fats: 2 },
  ...extra,
});

const ids = (foods) => foods.map((item) => item.id);
const EMPTY = [];

const localPage = (results, extra = {}) => ({
  results,
  nextOffset: results.length,
  hasMoreLocal: false,
  ...extra,
});

// Run timers AND the promise callbacks they unlock.
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const FIRST = FOOD_BROWSER_LIMITS.firstLocalSearchDelayMs;

const renderBrowser = (props = {}) =>
  renderHook((hookProps) => useFoodBrowser(hookProps), {
    initialProps: {
      pinnedFoodIds: EMPTY,
      cachedFoods: EMPTY,
      favouriteFoods: EMPTY,
      customFoods: EMPTY,
      ...props,
    },
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(searchFoodsLocal).mockReset();
  vi.mocked(searchFoodsOnline).mockReset();
  vi.mocked(getDistinctSubcategories).mockReset();
  vi.mocked(searchFoodsLocal).mockResolvedValue(localPage([]));
  vi.mocked(searchFoodsOnline).mockResolvedValue({
    results: [],
    errorsBySource: {},
  });
  vi.mocked(getDistinctSubcategories).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFoodBrowser - local', () => {
  it('shows only a skeleton until the first catalog load lands, then the list', async () => {
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([food('b', 'Banana'), food('a', 'Apple')])
    );
    const { result } = renderBrowser();

    expect(result.current.isFirstLocalLoad).toBe(true);
    expect(result.current.showLocalSkeleton).toBe(true);
    expect(result.current.visibleFoods).toEqual([]);
    expect(searchFoodsLocal).not.toHaveBeenCalled();

    await flush(FIRST - 1);
    expect(searchFoodsLocal).not.toHaveBeenCalled();

    await flush(1);
    expect(searchFoodsLocal).toHaveBeenCalledTimes(1);
    expect(result.current.isFirstLocalLoad).toBe(false);
    expect(result.current.showLocalSkeleton).toBe(false);
    expect(ids(result.current.visibleFoods)).toEqual(['a', 'b']);
  });

  it('opens with a default browse list: empty query, first page, nothing typed', async () => {
    renderBrowser();
    await flush(FIRST);

    expect(searchFoodsLocal).toHaveBeenCalledWith({
      query: '',
      category: null,
      subcategory: null,
      sortBy: 'name',
      sortOrder: 'asc',
      limit: FOOD_BROWSER_LIMITS.localDbPageSize,
      offset: 0,
      pinnedFoodIds: [],
    });
  });

  it('merges favourites, catalog, cached and user-added foods; later sources win', async () => {
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([food('shared', 'Catalog name'), food('cat', 'Catalog only')])
    );
    const { result } = renderBrowser({
      favouriteFoods: [
        food('shared', 'Stale favourite name'),
        food('fav', 'Favourite only'),
      ],
      cachedFoods: [food('cached', 'Cached only')],
      customFoods: [food('mine', 'My own food', { isCustom: true })],
    });
    await flush(FIRST);

    expect(ids(result.current.displayFoods).sort()).toEqual(
      ['cached', 'cat', 'fav', 'mine', 'shared'].sort()
    );
    expect(
      result.current.displayFoods.find((item) => item.id === 'shared').name
    ).toBe('Catalog name');
  });

  it('lists pinned foods first and hands the pins to the catalog query', async () => {
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([food('a', 'Apple'), food('b', 'Banana'), food('c', 'Cherry')])
    );
    const { result } = renderBrowser({ pinnedFoodIds: ['c'] });
    await flush(FIRST);

    expect(ids(result.current.visibleFoods)).toEqual(['c', 'a', 'b']);
    expect(searchFoodsLocal).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedFoodIds: ['c'] })
    );
  });

  it('searches immediately after the first load and narrows rows on the client', async () => {
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([food('rice', 'Rice'), food('oats', 'Oats')])
    );
    const { result } = renderBrowser();
    await flush(FIRST);

    act(() => result.current.setQuery('rice'));

    // Rows already on screen are filtered at once, while the query is pending.
    expect(ids(result.current.visibleFoods)).toEqual(['rice']);
    await flush(0);
    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'rice', offset: 0 })
    );
  });

  it('keeps showing rows while a re-search runs, skeleton only when there are none', async () => {
    let resolveThird;
    vi.mocked(searchFoodsLocal)
      .mockResolvedValueOnce(localPage([food('rice', 'Rice')]))
      .mockResolvedValueOnce(localPage([food('rice', 'Rice')]))
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveThird = resolve))
      );
    const { result } = renderBrowser();
    await flush(FIRST);

    // A re-search whose rows are still on screen never shows the skeleton.
    act(() => result.current.setQuery('rice'));
    await flush(0);
    expect(result.current.showLocalSkeleton).toBe(false);
    expect(ids(result.current.visibleFoods)).toEqual(['rice']);

    // Nothing matches while the next query is still in flight: skeleton.
    act(() => result.current.setQuery('zzz'));
    await flush(0);
    expect(result.current.visibleFoods).toEqual([]);
    expect(result.current.showLocalSkeleton).toBe(true);

    await act(async () => resolveThird(localPage([])));
    expect(result.current.showLocalSkeleton).toBe(false);
  });

  it('filters by category and offers its subcategories', async () => {
    vi.mocked(getDistinctSubcategories).mockResolvedValue(['grains', 'fruit']);
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([
        food('a', 'Apple', { category: 'carbs', subcategory: 'fruit' }),
        food('b', 'Beef', { category: 'protein' }),
      ])
    );
    const { result } = renderBrowser();
    await flush(FIRST);

    act(() => result.current.setSelectedCategory('carbs'));
    await flush(0);

    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'carbs' })
    );
    expect(getDistinctSubcategories).toHaveBeenCalledWith('carbs');
    expect(ids(result.current.visibleFoods)).toEqual(['a']);
    expect(result.current.availableSubcategories).toEqual(['fruit', 'grains']);
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => result.current.setSelectedSubcategory('fruit'));
    await flush(0);
    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'carbs', subcategory: 'fruit' })
    );
  });

  it('offers a Cached category only once something is cached', async () => {
    const empty = renderBrowser();
    await flush(FIRST);
    expect(Object.keys(empty.result.current.categoryOptions)).not.toContain(
      'cached'
    );

    const cached = renderBrowser({ cachedFoods: [food('c', 'Cached')] });
    await flush(FIRST);
    expect(Object.keys(cached.result.current.categoryOptions)).toContain(
      'cached'
    );
  });

  it('sorts, reports the sort label and clears every filter', async () => {
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage([
        food('low', 'Low', { per100g: { calories: 50 } }),
        food('high', 'High', { per100g: { calories: 400 } }),
      ])
    );
    const { result } = renderBrowser();
    await flush(FIRST);

    act(() => {
      result.current.setSortBy('calories');
      result.current.setSortOrder('desc');
      result.current.setSelectedCategory('protein');
    });
    await flush(0);

    expect(ids(result.current.visibleFoods)).toEqual(['high', 'low']);
    expect(result.current.sortLabel).toBe('Calories ↓');

    act(() => result.current.clearFilters());
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.sortLabel).toBe('Name ↑');
    expect(result.current.selectedCategory).toBeNull();
  });

  it('reveals more rows in batches, then pages the catalog from its offset', async () => {
    const page = Array.from({ length: 150 }, (_, index) =>
      food(
        `f${String(index).padStart(3, '0')}`,
        `Food ${String(index).padStart(3, '0')}`
      )
    );
    vi.mocked(searchFoodsLocal)
      .mockResolvedValueOnce(
        localPage(page, { nextOffset: 150, hasMoreLocal: true })
      )
      .mockResolvedValueOnce(
        localPage([page[149], food('f150', 'Food 150')], {
          nextOffset: 152,
          hasMoreLocal: false,
        })
      );
    const { result } = renderBrowser();
    await flush(FIRST);

    expect(result.current.visibleFoods).toHaveLength(
      FOOD_BROWSER_LIMITS.localBatchSize
    );
    expect(result.current.hasMore).toBe(true);

    // Revealing the next batch runs past the 150 rows in memory, so it also
    // pulls the next catalog page from where the first one stopped.
    await act(async () => result.current.loadMore());
    expect(searchFoodsLocal).toHaveBeenCalledTimes(2);
    expect(searchFoodsLocal).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 150 })
    );
    // The repeated row is not duplicated; only the genuinely new one is added.
    expect(result.current.visibleFoods).toHaveLength(151);
    expect(result.current.hasMore).toBe(false);
  });

  it('reveals rows already in memory without hitting the catalog again', async () => {
    const page = Array.from({ length: 300 }, (_, index) =>
      food(
        `f${String(index).padStart(3, '0')}`,
        `Food ${String(index).padStart(3, '0')}`
      )
    );
    vi.mocked(searchFoodsLocal).mockResolvedValue(
      localPage(page, { hasMoreLocal: false })
    );
    const { result } = renderBrowser();
    await flush(FIRST);

    expect(result.current.visibleFoods).toHaveLength(120);
    await act(async () => result.current.loadMore());

    expect(result.current.visibleFoods).toHaveLength(240);
    expect(result.current.hasMore).toBe(true);
    expect(searchFoodsLocal).toHaveBeenCalledTimes(1);

    await act(async () => result.current.loadMore());
    expect(result.current.visibleFoods).toHaveLength(300);
    expect(result.current.hasMore).toBe(false);
    expect(searchFoodsLocal).toHaveBeenCalledTimes(1);
  });

  it('surfaces a catalog failure instead of an empty list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchFoodsLocal).mockRejectedValue(new Error('boom'));
    const { result } = renderBrowser();
    await flush(FIRST);

    expect(result.current.localError).toBe('Local database search failed.');
    expect(result.current.showLocalSkeleton).toBe(false);
  });

  it('does nothing while closed', async () => {
    renderBrowser({ isOpen: false });
    await flush(FIRST * 2);

    expect(searchFoodsLocal).not.toHaveBeenCalled();
  });
});

describe('useFoodBrowser - online', () => {
  const goOnline = async (result, text = 'oats') => {
    act(() => result.current.selectMode('online'));
    act(() => result.current.setQuery(text));
  };

  it('waits for two characters and debounces before calling the network', async () => {
    const { result } = renderBrowser();
    await flush(FIRST);

    await goOnline(result, 'o');
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs * 2);
    expect(searchFoodsOnline).not.toHaveBeenCalled();
    expect(result.current.isOnlineSearching).toBe(false);

    act(() => result.current.setQuery('oa'));
    expect(result.current.isOnlineSearching).toBe(true);
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs - 1);
    expect(searchFoodsOnline).not.toHaveBeenCalled();

    await flush(1);
    expect(searchFoodsOnline).toHaveBeenCalledWith({
      query: 'oa',
      onlinePage: 1,
      onlinePageSize: FOOD_BROWSER_LIMITS.onlinePageSize,
    });
    expect(result.current.isOnlineSearching).toBe(false);
  });

  it('lists the results, filters by type and sorts them', async () => {
    vi.mocked(searchFoodsOnline).mockResolvedValue({
      results: [
        food('z', 'Zed bar', { type: 'Brand' }),
        food('a', 'Alpha oats', { type: 'Generic' }),
      ],
      errorsBySource: {},
    });
    const { result } = renderBrowser();
    await flush(FIRST);
    await goOnline(result);
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);

    expect(ids(result.current.visibleFoods)).toEqual(['a', 'z']);
    expect(Object.keys(result.current.categoryOptions)).toEqual([
      'Brand',
      'Generic',
    ]);

    act(() => result.current.setSelectedCategory('Brand'));
    expect(ids(result.current.visibleFoods)).toEqual(['z']);
  });

  it('starts filters fresh when the mode changes', async () => {
    const { result } = renderBrowser();
    await flush(FIRST);

    act(() => {
      result.current.setSelectedCategory('carbs');
      result.current.setSelectedSubcategory('grains');
    });
    act(() => result.current.selectMode('online'));

    expect(result.current.selectedCategory).toBeNull();
    expect(result.current.selectedSubcategory).toBeNull();
  });

  it('says it is offline instead of searching', async () => {
    const { result } = renderBrowser({ isOnline: false });
    await flush(FIRST);
    await goOnline(result);
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs * 2);

    expect(searchFoodsOnline).not.toHaveBeenCalled();
    expect(result.current.onlineError).toBe(OFFLINE_MESSAGE);
    expect(result.current.isOnlineSearching).toBe(false);
  });

  it('drops a response for a query the user has already left', async () => {
    let resolveFirst;
    vi.mocked(searchFoodsOnline)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve))
      )
      .mockResolvedValueOnce({
        results: [food('fresh', 'Fresh oats')],
        errorsBySource: {},
      });
    const { result } = renderBrowser();
    await flush(FIRST);

    await goOnline(result, 'oa');
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);
    act(() => result.current.setQuery('oats'));
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);

    await act(async () =>
      resolveFirst({
        results: [food('stale', 'Stale result')],
        errorsBySource: {},
      })
    );

    expect(ids(result.current.visibleFoods)).toEqual(['fresh']);
  });

  it('appends the next server page and drops duplicates', async () => {
    const firstPage = Array.from(
      { length: FOOD_BROWSER_LIMITS.onlinePageSize },
      (_, index) => food(`o${index}`, `Oat ${String(index).padStart(2, '0')}`)
    );
    vi.mocked(searchFoodsOnline)
      .mockResolvedValueOnce({ results: firstPage, errorsBySource: {} })
      .mockResolvedValueOnce({
        results: [firstPage[49], food('o50', 'Oat 50')],
        errorsBySource: {},
      });
    const { result } = renderBrowser();
    await flush(FIRST);
    await goOnline(result);
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);

    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());

    expect(searchFoodsOnline).toHaveBeenLastCalledWith({
      query: 'oats',
      onlinePage: 2,
      onlinePageSize: FOOD_BROWSER_LIMITS.onlinePageSize,
    });
    expect(result.current.displayFoods).toHaveLength(51);
    expect(result.current.hasMore).toBe(false);
  });

  it('reports an error and retries on request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchFoodsOnline)
      .mockRejectedValueOnce(new Error('Service down'))
      .mockResolvedValueOnce({
        results: [food('ok', 'Oats')],
        errorsBySource: {},
      });
    const { result } = renderBrowser();
    await flush(FIRST);
    await goOnline(result);
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);

    expect(result.current.onlineError).toBe('Service down');

    act(() => result.current.retryOnline());
    await flush(FOOD_BROWSER_LIMITS.onlineDebounceMs);

    expect(result.current.onlineError).toBeNull();
    expect(ids(result.current.visibleFoods)).toEqual(['ok']);
  });
});
