import { useEffect } from 'react';
import { useEnergyMapStore } from '../store/useEnergyMapStore';

// How long to wait after hydration before scheduling the warm-up. First
// paint, carousel layout and the debounced profile save all settle in here;
// warming up earlier would compete with them for the main thread.
const WARM_UP_DELAY_MS = 2500;

// requestIdleCallback timeout: even on a busy device the warm-up fires within
// this budget so a user who opens Food Search a few seconds after launch
// still finds the catalog ready.
const WARM_UP_IDLE_TIMEOUT_MS = 5000;

// Module-scoped guard: the catalog initialises once per page load, so a
// remount (or a second call site) must not schedule a second warm-up.
let hasScheduledWarmUp = false;

const scheduleIdleCallback = (callback) => {
  if (typeof window.requestIdleCallback === 'function') {
    return {
      id: window.requestIdleCallback(callback, {
        timeout: WARM_UP_IDLE_TIMEOUT_MS,
      }),
      cancel:
        typeof window.cancelIdleCallback === 'function'
          ? window.cancelIdleCallback
          : () => {},
    };
  }

  // iOS WKWebView (and jsdom) lack requestIdleCallback — degrade to a plain
  // timeout, which is correct but less polite about busy frames.
  return {
    id: window.setTimeout(callback, 0),
    cancel: window.clearTimeout,
  };
};

/**
 * Idle warm-up for the local food catalog.
 *
 * The catalog (sql.js WASM compile + 2.2 MB bundled SQLite parse) initialises
 * lazily on the FIRST food query, which makes the first Food Search open pay
 * several hundred ms at once. This hook schedules a best-effort warm-up a
 * few seconds after the store hydrates, during idle time, so the first real
 * search is instant. The import stays DYNAMIC on purpose: a static import
 * would pull the catalog (and sql.js) into the boot-critical bundle.
 *
 * Failures are swallowed — `foodCatalog` keeps its lazy first-query fallback,
 * so a failed warm-up only costs the original behavior.
 */
export const useFoodCatalogWarmUp = () => {
  const isLoaded = useEnergyMapStore((state) => state.isLoaded);

  useEffect(() => {
    if (!isLoaded || hasScheduledWarmUp) {
      return undefined;
    }

    hasScheduledWarmUp = true;

    let idleHandle = null;

    const delayTimer = window.setTimeout(() => {
      idleHandle = scheduleIdleCallback(() => {
        import('../services/foodCatalog')
          .then((module) => module.warmUpFoodCatalog())
          .catch(() => {
            // Best effort only: the first real query retries lazily.
          });
      });
    }, WARM_UP_DELAY_MS);

    return () => {
      window.clearTimeout(delayTimer);
      if (idleHandle) {
        idleHandle.cancel(idleHandle.id);
      }
    };
  }, [isLoaded]);
};
