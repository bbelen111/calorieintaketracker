/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

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

    return nutrientId === 1003 || nutrientNumber === '203' || nutrientName === 'protein';
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

  const per100g = {
    calories: Math.max(0, Math.round(servingMacros.calories * per100gFactor)),
    protein: Math.max(0, round2(servingMacros.protein * per100gFactor)),
    carbs: Math.max(0, round2(servingMacros.carbs * per100gFactor)),
    fats: Math.max(0, round2(servingMacros.fats * per100gFactor)),
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
    portions.push({
      id: 'p_serving',
      label: servingInfo.label,
      grams: Math.round(servingInfo.servingGrams),
      macros: {
        calories: Math.max(0, Math.round(servingMacros.calories)),
        protein: Math.max(0, round2(servingMacros.protein)),
        carbs: Math.max(0, round2(servingMacros.carbs)),
        fats: Math.max(0, round2(servingMacros.fats)),
      },
    });
  }

  const brand = String(food?.brandOwner || food?.brandName || '').trim();

  return {
    id: `usda_${resolvedId}`,
    name: String(food?.description || '').trim() || `USDA Food ${resolvedId}`,
    brand: brand || null,
    category: 'cached',
    subcategory: isBranded ? 'branded' : 'generic',
    per100g,
    previewMacros: {
      ...servingMacros,
      servingInfo: servingInfo.label,
    },
    portions,
    type: isBranded ? 'Brand' : 'Generic',
    source: 'usda',
    cachedAt: Date.now(),
  };
}

async function apiRequest(action, params = {}) {
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new USDAFoodError(
        errorData.error || `Request failed: ${response.status}`,
        response.status,
        errorData
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error?.name === 'AbortError') {
      throw new USDAFoodError('Request timed out', 408);
    }

    if (error instanceof USDAFoodError) {
      throw error;
    }

    throw new USDAFoodError(
      'Network error - check your connection',
      0,
      error?.message
    );
  }
}

export async function searchFoods(query, { page = 1, pageSize = 20 } = {}) {
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

  const data = await apiRequest('search', {
    query: normalizedQuery,
    page: safePage,
    pageSize: safePageSize,
  });

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
