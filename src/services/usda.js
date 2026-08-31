/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';
import {
  normalizeNutrients,
  scaleNutrientValues,
} from '../constants/nutrients/nutrients.js';

const API_BASE = (
  (typeof import.meta.env?.VITE_USDA_API_BASE === 'string'
    ? import.meta.env.VITE_USDA_API_BASE
    : '') || 'https://calorieintaketracker.vercel.app/api/usda'
).trim();

export class USDAFoodError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'USDAFoodError';
    this.status = status;
    this.details = details;
  }
}

export const USDA_CLIENT_DEFAULT_RETRY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 2000,
  jitterMs: 0,
  timeoutMs: 15000,
});

// Mutable client retry config. Per-request callers may override it via the
// `retry` option on searchFoods/apiRequest; resetUsdaClientRetry() restores
// the module defaults (useful for tests).
export const USDA_CLIENT_RETRY = { ...USDA_CLIENT_DEFAULT_RETRY };

export const resetUsdaClientRetry = () => {
  Object.assign(USDA_CLIENT_RETRY, USDA_CLIENT_DEFAULT_RETRY);
};

// Mirrors the proxy transient set (api/usda.js): FoodData Central edge/WAF
// throttling intermittently surfaces as HTTP 404 in addition to 408/409/425/
// 429/5xx, and network failures (status 0) are transient by nature.
const USDA_TRANSIENT_STATUS_CODES = new Set([404, 408, 409, 425, 429]);

const isTransientUsdaStatus = (status) => {
  const code = Number(status);
  return USDA_TRANSIENT_STATUS_CODES.has(code) || (code >= 500 && code <= 599);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryClientError = (error) => {
  if (error?.externalAborted) {
    return false;
  }
  const status = Number(error?.status);
  return status === 0 || isTransientUsdaStatus(status);
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

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNutrientName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getNutrientValue(food, matcher) {
  const nutrients = Array.isArray(food?.foodNutrients)
    ? food.foodNutrients
    : [];

  for (const nutrient of nutrients) {
    if (!nutrient || typeof nutrient !== 'object') {
      continue;
    }

    if (!matcher(nutrient)) {
      continue;
    }

    const numericValue = Number(nutrient.value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return 0;
}

// Null-aware variant: returns null (untracked) when no matching nutrient value
// exists, so sources can distinguish "measured 0" from "no data".
function getNutrientValueOrNull(food, matcher) {
  const nutrients = Array.isArray(food?.foodNutrients)
    ? food.foodNutrients
    : [];

  for (const nutrient of nutrients) {
    if (!nutrient || typeof nutrient !== 'object') {
      continue;
    }

    if (!matcher(nutrient)) {
      continue;
    }

    const numericValue = Number(nutrient.value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
}

// Tiered USDA nutrient matchers: nutrientNumber first (stable across FDC
// datasets), nutrientId fallback, then normalized name patterns. Branded rows
// often lack nutrientNumber, so the name tier stays essential.
const USDA_NUTRIENT_MATCHERS = {
  fiber: { number: '291', id: 1079, name: 'fiber, total dietary' },
  sodium: { number: '307', id: 1093, name: 'sodium' },
  saturatedFats: {
    number: '606',
    id: 1258,
    name: 'fatty acids, total saturated',
  },
  sugars: {
    number: '269',
    id: 2000,
    name: 'sugars, total including nlea',
  },
};

function getUsdaMicroNutrients(food) {
  const raw = {};

  Object.entries(USDA_NUTRIENT_MATCHERS).forEach(([key, matcher]) => {
    raw[key] = getNutrientValueOrNull(food, (nutrient) => {
      const nutrientId = Number(nutrient.nutrientId);
      const nutrientNumber = String(nutrient.nutrientNumber ?? '').trim();
      const nutrientName = normalizeNutrientName(nutrient.nutrientName);

      return (
        nutrientNumber === matcher.number ||
        nutrientId === matcher.id ||
        (matcher.name && nutrientName.includes(matcher.name))
      );
    });
  });

  return raw;
}

function getMacroProfile(food) {
  const calories = getNutrientValue(food, (nutrient) => {
    const nutrientId = Number(nutrient.nutrientId);
    const nutrientNumber = String(nutrient.nutrientNumber ?? '').trim();
    const nutrientName = normalizeNutrientName(nutrient.nutrientName);
    const unitName = String(nutrient.unitName ?? '').toUpperCase();

    return (
      nutrientId === 1008 ||
      nutrientId === 2047 ||
      nutrientNumber === '208' ||
      (nutrientName.includes('energy') && unitName === 'KCAL')
    );
  });

  const protein = getNutrientValue(food, (nutrient) => {
    const nutrientId = Number(nutrient.nutrientId);
    const nutrientNumber = String(nutrient.nutrientNumber ?? '').trim();
    const nutrientName = normalizeNutrientName(nutrient.nutrientName);

    return (
      nutrientId === 1003 ||
      nutrientNumber === '203' ||
      nutrientName === 'protein'
    );
  });

  const carbs = getNutrientValue(food, (nutrient) => {
    const nutrientId = Number(nutrient.nutrientId);
    const nutrientNumber = String(nutrient.nutrientNumber ?? '').trim();
    const nutrientName = normalizeNutrientName(nutrient.nutrientName);

    return (
      nutrientId === 1005 ||
      nutrientNumber === '205' ||
      nutrientName.includes('carbohydrate, by difference') ||
      nutrientName === 'carbohydrate'
    );
  });

  const fats = getNutrientValue(food, (nutrient) => {
    const nutrientId = Number(nutrient.nutrientId);
    const nutrientNumber = String(nutrient.nutrientNumber ?? '').trim();
    const nutrientName = normalizeNutrientName(nutrient.nutrientName);

    return (
      nutrientId === 1004 ||
      nutrientNumber === '204' ||
      nutrientName.includes('total lipid (fat)') ||
      nutrientName === 'fat'
    );
  });

  return {
    calories: Math.max(0, Math.round(calories)),
    protein: Math.max(0, round2(protein)),
    carbs: Math.max(0, round2(carbs)),
    fats: Math.max(0, round2(fats)),
  };
}

function resolveServingInfo(food) {
  const servingSize = toFiniteNumber(food?.servingSize);
  const servingUnit = String(food?.servingSizeUnit || '').trim();
  const householdServing = String(food?.householdServingFullText || '').trim();

  const hasGramServing =
    servingSize > 0 && /^g(ram|rams)?$/i.test(servingUnit || 'g');

  if (hasGramServing) {
    return {
      hasGramServing,
      servingGrams: servingSize,
      label: `${Math.round(servingSize)}g serving`,
    };
  }

  if (householdServing) {
    return {
      hasGramServing: false,
      servingGrams: null,
      label: householdServing,
    };
  }

  if (servingSize > 0 && servingUnit) {
    return {
      hasGramServing: false,
      servingGrams: null,
      label: `${round2(servingSize)} ${servingUnit}`,
    };
  }

  return {
    hasGramServing: false,
    servingGrams: null,
    label: 'per serving',
  };
}

function mapUsdaFoodToFood(food, index = 0) {
  const fdcId = String(food?.fdcId ?? '').trim();
  const resolvedId = fdcId || `search_${Date.now()}_${index}`;
  const dataType = String(food?.dataType || '').trim();
  const isBranded = dataType.toLowerCase() === 'branded';

  const servingInfo = resolveServingInfo(food);
  const servingMacros = getMacroProfile(food);

  const per100gFactor =
    servingInfo.hasGramServing && servingInfo.servingGrams > 0
      ? 100 / servingInfo.servingGrams
      : 1;

  const per100gMacros = {
    calories: Math.max(0, Math.round(servingMacros.calories * per100gFactor)),
    protein: Math.max(0, round2(servingMacros.protein * per100gFactor)),
    carbs: Math.max(0, round2(servingMacros.carbs * per100gFactor)),
    fats: Math.max(0, round2(servingMacros.fats * per100gFactor)),
  };

  // Micros follow the same serving->per100g scale as the macros, then get the
  // US invariant scope (US "carb by difference" includes fiber).
  const microPer100g = normalizeNutrients(
    scaleNutrientValues(getUsdaMicroNutrients(food), per100gFactor),
    {
      parentTotals: {
        fats: per100gMacros.fats,
        carbs: per100gMacros.carbs,
      },
      source: 'usda',
    }
  ).nutrients;

  const per100g = {
    ...per100gMacros,
    ...microPer100g,
  };

  const portions = [
    {
      id: 'p_100g',
      label: '100g',
      grams: 100,
      macros: per100g,
    },
  ];

  if (
    servingInfo.hasGramServing &&
    servingInfo.servingGrams > 0 &&
    Math.round(servingInfo.servingGrams) !== 100
  ) {
    const servingFactor = servingInfo.servingGrams / 100;
    portions.push({
      id: 'p_serving',
      label: servingInfo.label,
      grams: Math.round(servingInfo.servingGrams),
      macros: {
        calories: Math.max(0, Math.round(servingMacros.calories)),
        protein: Math.max(0, round2(servingMacros.protein)),
        carbs: Math.max(0, round2(servingMacros.carbs)),
        fats: Math.max(0, round2(servingMacros.fats)),
        ...scaleNutrientValues(
          {
            fiber: per100g.fiber,
            sodium: per100g.sodium,
            saturatedFats: per100g.saturatedFats,
            sugars: per100g.sugars,
          },
          servingFactor
        ),
      },
    });
  }

  const brand = String(food?.brandOwner || food?.brandName || '').trim();

  return {
    id: `usda_${resolvedId}`,
    name: String(food?.description || '').trim() || `USDA Food ${resolvedId}`,
    brand: brand || null,
    category: null,
    subcategory: isBranded ? 'branded' : 'generic',
    per100g,
    previewMacros: {
      ...servingMacros,
      servingInfo: servingInfo.label,
    },
    portions,
    type: isBranded ? 'Brand' : 'Generic',
    source: 'usda',
  };
}

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
  const resolvedBase = API_BASE || '/api/usda';

  if (Capacitor.isNativePlatform() && resolvedBase.startsWith('/')) {
    throw new USDAFoodError(
      'USDA API base not configured for native. Set VITE_USDA_API_BASE to your deployed URL.',
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

  const retry = { ...USDA_CLIENT_RETRY, ...(options.retry || {}) };
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
        lastError = new USDAFoodError(
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
        lastError = new USDAFoodError(
          externallyAborted ? 'Request aborted' : 'Request timed out',
          externallyAborted ? 0 : 408
        );
        if (externallyAborted) {
          lastError.externalAborted = true;
        }
      } else if (error instanceof USDAFoodError) {
        lastError = error;
      } else {
        lastError = new USDAFoodError(
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

  const foods = (Array.isArray(data?.foods) ? data.foods : []).map(
    (food, index) => mapUsdaFoodToFood(food, index)
  );

  const totalResults = Number.parseInt(
    String(data?.totalHits ?? foods.length),
    10
  );

  return {
    foods,
    totalResults: Number.isFinite(totalResults) ? totalResults : foods.length,
    page: safePage,
  };
}
