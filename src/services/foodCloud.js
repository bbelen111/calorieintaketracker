/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

const API_BASE = (
  (typeof import.meta.env?.VITE_FOODS_API_BASE === 'string'
    ? import.meta.env.VITE_FOODS_API_BASE
    : '') || 'https://calorieintaketracker.vercel.app/api/foods'
).trim();

export class FoodsApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'FoodsApiError';
    this.status = status;
    this.details = details;
  }
}

export const FOODS_CLIENT_DEFAULT_RETRY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 2000,
  jitterMs: 0,
  timeoutMs: 15000,
});

// Mutable client retry config. Per-request callers may override it via the
// `retry` option on searchFoods/apiRequest; resetFoodsClientRetry() restores
// the module defaults (useful for tests).
export const FOODS_CLIENT_RETRY = { ...FOODS_CLIENT_DEFAULT_RETRY };

export const resetFoodsClientRetry = () => {
  Object.assign(FOODS_CLIENT_RETRY, FOODS_CLIENT_DEFAULT_RETRY);
};

// ---- in-memory query-result cache (TTL + LRU) ----
//
// Search results are repeatable reads over a rarely-changing catalog, so a
// short-lived module cache avoids redundant network/DB work for identical
// queries (typing patterns, repeated favourites lookups, paging back/forth).
// Purged by TTL and capped by entry count; never persisted — the persisted
// cache (cache-on-select) lives in `userData.cachedFoods`.

export const FOODS_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const FOODS_SEARCH_CACHE_MAX_ENTRIES = 64;

const foodsSearchCache = new Map(); // key -> { expiresAt, value }

export const clearFoodsSearchCache = () => {
  foodsSearchCache.clear();
};

export const getFoodsSearchCacheSize = () => foodsSearchCache.size;

const readFoodsSearchCache = (key) => {
  const entry = foodsSearchCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    foodsSearchCache.delete(key);
    return null;
  }
  // Refresh LRU recency on hit.
  foodsSearchCache.delete(key);
  foodsSearchCache.set(key, entry);
  return entry.value;
};

const writeFoodsSearchCache = (key, value) => {
  if (foodsSearchCache.size >= FOODS_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = foodsSearchCache.keys().next().value;
    if (oldestKey !== undefined) {
      foodsSearchCache.delete(oldestKey);
    }
  }
  foodsSearchCache.set(key, {
    expiresAt: Date.now() + FOODS_SEARCH_CACHE_TTL_MS,
    value,
  });
};

// Kept identical to the legacy client set: transient 404/408/409/425/429 plus
// 5xx and network failures (status 0) are retried. PostgREST 404 = misdeploy,
// which a bounded retry masks harmlessly during rollouts.
const FOODS_TRANSIENT_STATUS_CODES = new Set([404, 408, 409, 425, 429]);

const isTransientFoodsStatus = (status) => {
  const code = Number(status);
  return FOODS_TRANSIENT_STATUS_CODES.has(code) || (code >= 500 && code <= 599);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryClientError = (error) => {
  if (error?.externalAborted) {
    return false;
  }
  const status = Number(error?.status);
  return status === 0 || isTransientFoodsStatus(status);
};

const computeClientRetryDelayMs = (attempt, retry) => {
  const base = Math.max(0, Number(retry?.baseDelayMs) || 0);
  const max = Math.max(base, Number(retry?.maxDelayMs) || base);
  const exponential = Math.min(base * 2 ** (attempt - 1), max);
  const jitter = Math.max(0, Number(retry?.jitterMs) || 0);
  return exponential + Math.random() * jitter;
};

const resolveClientMaxAttempts = (retry) => {
  const parsed = Math.round(Number(retry?.maxAttempts));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5) : 1;
};

function round2(num) {
  return Math.round(Number(num || 0) * 100) / 100;
}

// ---- canonical catalog row 竊・app food shape ----
//
// The gateway now returns `catalogFoods`: curated per-100g rows structurally
// identical to the local sql.js catalog (`foodCatalog.mapFoodRow`). This mapper
// projects them onto the shape the rest of the pipeline expects (per100g,
// portions, previewMacros, type/source/brand) so no downstream consumer needs
// special-casing.

const parsePortions = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const mapCatalogFoodToFood = (row, index = 0) => {
  const id = String(row?.id ?? '').trim();
  const resolvedId = id || `cloud_${Date.now()}_${index}`;
  const brand = String(row?.brand ?? '').trim() || null;
  const category = String(row?.category ?? '').trim() || 'uncategorized';
  const subcategory = String(row?.subcategory ?? '').trim() || null;

  const macro = (key) => Math.max(0, Number(row?.[key]) || 0);
  const micro = (key) => {
    if (row?.[key] == null) {
      return null; // NULL = untracked (never 0-for-missing)
    }
    return Math.max(0, Number(row[key]) || 0);
  };

  const per100g = {
    calories: Math.round(macro('calories')),
    protein: round2(macro('protein')),
    carbs: round2(macro('carbs')),
    fats: round2(macro('fats')),
    fiber: micro('fiber'),
    sodium: micro('sodium') == null ? null : Math.round(micro('sodium')),
    saturatedFats: micro('saturated_fats'),
    sugars: micro('sugars'),
  };

  const portions = parsePortions(row?.portions)
    .map((p) => ({
      id: String(p?.id ?? ''),
      label: String(p?.label ?? ''),
      grams: Math.round(Number(p?.grams) || 0),
    }))
    .filter((p) => p.id && p.grams > 0);

  const servingPortion = portions.find((p) => p.grams !== 100) || null;

  return {
    id: resolvedId,
    name: String(row?.name ?? '').trim() || `Food ${resolvedId}`,
    brand,
    category,
    subcategory,
    per100g,
    previewMacros: {
      calories: per100g.calories,
      protein: per100g.protein,
      carbs: per100g.carbs,
      fats: per100g.fats,
      servingInfo: servingPortion ? servingPortion.label : 'per serving',
    },
    portions,
    type: brand ? 'Brand' : 'Generic',
    source: 'cloud',
  };
};

function createCombinedAbortSignal(externalSignal, timeoutMs) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  if (!externalSignal) {
    return {
      signal: timeoutController.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  const mergedController = new AbortController();

  const abortMerged = () => mergedController.abort();
  const abortExternal = () => mergedController.abort();

  timeoutController.signal.addEventListener('abort', abortMerged, {
    once: true,
  });
  externalSignal.addEventListener('abort', abortExternal, { once: true });

  return {
    signal: mergedController.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener('abort', abortMerged);
      externalSignal.removeEventListener('abort', abortExternal);
    },
  };
}

async function apiRequest(action, params = {}, options = {}) {
  const resolvedBase = API_BASE || '/api/foods';

  if (Capacitor.isNativePlatform() && resolvedBase.startsWith('/')) {
    throw new FoodsApiError(
      'Online food catalog API base not configured for native. Set VITE_FOODS_API_BASE to your deployed URL.',
      0
    );
  }

  const url = resolvedBase.startsWith('http')
    ? new URL(resolvedBase)
    : new URL(resolvedBase, window.location.origin);

  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const retry = { ...FOODS_CLIENT_RETRY, ...(options.retry || {}) };
  const maxAttempts = resolveClientMaxAttempts(retry);
  const timeoutMs = Math.max(1, Number(retry.timeoutMs) || 15000);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Fresh timeout per attempt so a slow/flaky attempt cannot carry a stale,
    // already-aborted signal into the next retry.
    const { signal, cleanup } = createCombinedAbortSignal(
      options.signal,
      timeoutMs
    );

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal,
      });

      cleanup();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        lastError = new FoodsApiError(
          errorData.error || `Request failed: ${response.status}`,
          response.status,
          errorData
        );
      } else {
        return response.json();
      }
    } catch (error) {
      cleanup();

      if (error?.name === 'AbortError') {
        // A caller-initiated abort must never be retried; only the per-attempt
        // timeout is treated as transient (408).
        const externallyAborted = Boolean(options.signal?.aborted);
        lastError = new FoodsApiError(
          externallyAborted ? 'Request aborted' : 'Request timed out',
          externallyAborted ? 0 : 408
        );
        if (externallyAborted) {
          lastError.externalAborted = true;
        }
      } else if (error instanceof FoodsApiError) {
        lastError = error;
      } else {
        lastError = new FoodsApiError(
          'Network error - check your connection',
          0,
          error?.message
        );
      }
    }

    if (attempt < maxAttempts && shouldRetryClientError(lastError)) {
      const delayMs = computeClientRetryDelayMs(attempt, retry);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      continue;
    }

    throw lastError;
  }
}

export async function searchFoods(
  query,
  { page = 1, pageSize = 20, signal, retry } = {}
) {
  const normalizedQuery = String(query ?? '').trim();
  if (normalizedQuery.length < 2) {
    return { foods: [], totalResults: 0, page: 1 };
  }

  const parsedPage = Number.parseInt(String(page), 10);
  const parsedPageSize = Number.parseInt(String(pageSize), 10);
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safePageSize = Number.isFinite(parsedPageSize)
    ? Math.min(Math.max(parsedPageSize, 1), 50)
    : 20;

  const cacheKey = `${normalizedQuery}|${safePage}|${safePageSize}`;
  const cached = readFoodsSearchCache(cacheKey);
  if (cached) {
    // Fresh copy so callers cannot mutate the shared cached result.
    return { ...cached, foods: Array.from(cached.foods) };
  }

  const data = await apiRequest(
    'search',
    {
      query: normalizedQuery,
      page: safePage,
      pageSize: safePageSize,
    },
    {
      signal,
      retry,
    }
  );

  // Canonical cloud rows are the contract; the legacy `foods` FDC envelope is
  // only for old native builds and is not decoded here.
  const catalogRows = Array.isArray(data?.catalogFoods)
    ? data.catalogFoods
    : [];
  const foods = catalogRows.map((row, index) =>
    mapCatalogFoodToFood(row, index)
  );

  const totalResults = Number.parseInt(
    String(data?.totalHits ?? foods.length),
    10
  );

  const result = {
    foods,
    totalResults: Number.isFinite(totalResults) ? totalResults : foods.length,
    page: safePage,
  };
  writeFoodsSearchCache(cacheKey, result);
  return result;
}
