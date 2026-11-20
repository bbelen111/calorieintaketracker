import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFoodCatalogWarmUp } from './useFoodCatalogWarmUp';
import { useEnergyMapStore } from '../store/useEnergyMapStore';
import { warmUpFoodCatalog } from '../services/foodCatalog';

vi.mock('../services/foodCatalog', () => ({
  warmUpFoodCatalog: vi.fn(async () => undefined),
}));

const setStoreLoaded = (isLoaded) => {
  act(() => {
    useEnergyMapStore.setState({ isLoaded });
  });
};

const advanceUntilWarmUp = async () => {
  // WARM_UP_DELAY_MS, then the idle fallback (jsdom has no
  // requestIdleCallback, so the hook degrades to setTimeout(0)). runAll
  // covers the timer created during the advance plus the dynamic-import
  // microtask chain behind it.
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useFoodCatalogWarmUp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setStoreLoaded(false);
    vi.mocked(warmUpFoodCatalog).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    setStoreLoaded(false);
  });

  it('does not warm up before the store hydrates', async () => {
    renderHook(() => useFoodCatalogWarmUp());

    await advanceUntilWarmUp();

    expect(warmUpFoodCatalog).not.toHaveBeenCalled();
  });

  it('warms the catalog up once, after hydration and an idle delay', async () => {
    renderHook(() => useFoodCatalogWarmUp());

    setStoreLoaded(true);
    await advanceUntilWarmUp();

    expect(warmUpFoodCatalog).toHaveBeenCalledTimes(1);

    // A remount (or a second call site) must not schedule a second warm-up:
    // the module-scoped guard keeps it once per page load.
    renderHook(() => useFoodCatalogWarmUp());
    setStoreLoaded(true);
    await advanceUntilWarmUp();

    expect(warmUpFoodCatalog).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending warm-up on unmount before the delay elapses', async () => {
    const { unmount } = renderHook(() => useFoodCatalogWarmUp());

    setStoreLoaded(true);
    await vi.advanceTimersByTimeAsync(1000); // less than WARM_UP_DELAY_MS
    unmount();
    await advanceUntilWarmUp();

    expect(warmUpFoodCatalog).not.toHaveBeenCalled();
  });
});
