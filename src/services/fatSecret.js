/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';
/**
 * FatSecret API Service
 *
 * Communicates with our serverless proxy at /api/fatsecret
 * Handles search, food details, barcode lookup, and response mapping
 */

// Use env override for native builds or custom deployments
const API_BASE = (
  import.meta.env.VITE_FATSECRET_API_BASE ||
  'https://calorieintaketracker.vercel.app/api/fatsecret'
).trim();

/**
 * Custom error class for API errors
 */
export class FatSecretError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'FatSecretError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Make request to our FatSecret proxy
 */
async function apiRequest(action, params = {}) {
  const resolvedBase = API_BASE || '/api/fatsecret';

  if (Capacitor.isNativePlatform() && resolvedBase.startsWith('/')) {
    throw new FatSecretError(
      'FatSecret API base not configured for native. Set VITE_FATSECRET_API_BASE to your deployed URL.',
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
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new FatSecretError(
        errorData.error || `Request failed: ${response.status}`,
        response.status,
        errorData
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new FatSecretError('Request timed out', 408);
    }

    if (error instanceof FatSecretError) {
      throw error;
    }

    // Network error (offline, etc.)
    throw new FatSecretError(
      'Network error - check your connection',
      0,
      error.message
    );
  }
}

/**
 * Search for foods by text query
 * @param {string} query - Search term
 * @param {number} page - Page number (0-indexed)
 * @returns {Promise<{foods: Array, totalResults: number, pageNumber: number}>}
 */
export async function searchFoods(query, page = 0) {
  if (!query || query.trim().length < 2) {
    return { foods: [], totalResults: 0, pageNumber: 0 };
  }

  const data = await apiRequest('search', { query: query.trim(), page });

  // Handle empty results
  if (!data.foods || !data.foods.food) {
    return { foods: [], totalResults: 0, pageNumber: 0 };
  }

  // Normalize: API returns object if single result, array if multiple
  const foodArray = Array.isArray(data.foods.food)
    ? data.foods.food
    : [data.foods.food];

  return {
    foods: foodArray.map(mapSearchResultToPreview),
    totalResults: parseInt(data.foods.total_results, 10) || 0,
    pageNumber: parseInt(data.foods.page_number, 10) || 0,
  };
}

/**
 * Get detailed food information by FatSecret food_id
 * @param {string} foodId - FatSecret food ID
 * @returns {Promise<Object>} Full food details
 */
export async function getFoodDetails(foodId) {
  const data = await apiRequest('get', { food_id: foodId });

  if (!data.food) {
    throw new FatSecretError('Food not found', 404);
  }

  return mapDetailedFoodToLocal(data.food);
}

/**
 * Look up food by barcode (UPC/EAN)
 * @param {string} barcode - Product barcode
 * @returns {Promise<Object>} Full food details
 */
export async function searchBarcode(barcode) {
  const cleanBarcode = barcode.replace(/\D/g, '');

  if (!cleanBarcode || cleanBarcode.length < 8) {
    throw new FatSecretError('Invalid barcode format', 400);
  }

  const data = await apiRequest('barcode', { barcode: cleanBarcode });

  if (!data.food) {
    throw new FatSecretError('Barcode not found in database', 404);
  }

  return mapDetailedFoodToLocal(data.food);
}

/**
 * Get autocomplete suggestions (faster than full search)
 * @param {string} query - Partial search term
 * @returns {Promise<string[]>} Array of suggestion strings
 */
export async function getAutocomplete(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const data = await apiRequest('autocomplete', { query: query.trim() });

  if (!data.suggestions || !data.suggestions.suggestion) {
    return [];
  }

  const suggestions = data.suggestions.suggestion;
  return Array.isArray(suggestions) ? suggestions : [suggestions];
}

// ============================================
// MAPPING FUNCTIONS (API → App Schema)
// ============================================

/**
 * Map search result to preview format (minimal data for list display)
 * Note: Search results have limited macro data - need getFoodDetails for full info
 */
function mapSearchResultToPreview(apiFood) {
  // Parse the description string for basic macro info
  // Format: "Per 100g - Calories: 250kcal | Fat: 10.00g | Carbs: 20.00g | Protein: 15.00g"
  const desc = apiFood.food_description || '';
  const macros = parseDescriptionMacros(desc);

  return {
    id: `fs_${apiFood.food_id}`,
    fatSecretId: apiFood.food_id,
    name: apiFood.food_name,
    brand: apiFood.brand_name || null,
    type: apiFood.food_type, // 'Generic' or 'Brand'
    // Preview macros (may be per serving, not per 100g)
    previewMacros: macros,
    // Flag that this needs detail fetch for accurate per100g data
    needsDetailFetch: true,
    source: 'fatsecret',
  };
}

/**
 * Parse macro info from FatSecret description string
 */
function parseDescriptionMacros(description) {
  const result = {
    servingInfo: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
  };

  if (!description) return result;

  // Extract serving info (e.g., "Per 100g" or "Per 1 slice")
  const servingMatch = description.match(/^Per\s+([^-]+)/i);
  if (servingMatch) {
    result.servingInfo = servingMatch[1].trim();
  }

  // Extract calories
  const calMatch = description.match(/Calories:\s*([\d.]+)/i);
  if (calMatch) result.calories = parseFloat(calMatch[1]) || 0;

  // Extract fat
  const fatMatch = description.match(/Fat:\s*([\d.]+)/i);
  if (fatMatch) result.fats = parseFloat(fatMatch[1]) || 0;

  // Extract carbs
  const carbMatch = description.match(/Carbs:\s*([\d.]+)/i);
  if (carbMatch) result.carbs = parseFloat(carbMatch[1]) || 0;

  // Extract protein
  const protMatch = description.match(/Protein:\s*([\d.]+)/i);
  if (protMatch) result.protein = parseFloat(protMatch[1]) || 0;

  return result;
}

/**
 * Map detailed food response to local app schema
 * This is the full mapping used when caching a food
 */
function mapDetailedFoodToLocal(apiFood) {
  const servings = apiFood.servings?.serving;
  const servingArray = Array.isArray(servings)
    ? servings
    : servings
      ? [servings]
      : [];

  // Find "per 100g" serving if available, otherwise use first serving
  const per100gServing = servingArray.find(
    (s) =>
      s.serving_description?.toLowerCase().includes('100g') ||
      s.serving_description?.toLowerCase().includes('100 g') ||
      s.metric_serving_amount === '100.000'
  );

  const defaultServing = servingArray[0];
  const referenceServing = per100gServing || defaultServing;

  // Calculate per-100g values
  let per100g;

  if (per100gServing) {
    // Direct per-100g data available
    per100g = {
      calories: parseFloat(per100gServing.calories) || 0,
      protein: parseFloat(per100gServing.protein) || 0,
      carbs: parseFloat(per100gServing.carbohydrate) || 0,
      fats: parseFloat(per100gServing.fat) || 0,
    };
  } else if (referenceServing) {
    // Calculate from serving size
    const servingGrams =
      parseFloat(referenceServing.metric_serving_amount) ||
      parseFloat(referenceServing.serving_weight_grams) ||
      100;

    const multiplier = 100 / servingGrams;

    per100g = {
      calories: Math.round(
        (parseFloat(referenceServing.calories) || 0) * multiplier
      ),
      protein: round2((parseFloat(referenceServing.protein) || 0) * multiplier),
      carbs: round2(
        (parseFloat(referenceServing.carbohydrate) || 0) * multiplier
      ),
      fats: round2((parseFloat(referenceServing.fat) || 0) * multiplier),
    };
  } else {
    // Fallback - no serving data
    per100g = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  }

  // Map servings to portions array
  const portions = servingArray.map((serving, idx) => {
    const grams =
      parseFloat(serving.metric_serving_amount) ||
      parseFloat(serving.serving_weight_grams) ||
      null;

    return {
      id: `p_${serving.serving_id || idx}`,
      label: serving.serving_description || `Serving ${idx + 1}`,
      grams: grams ? Math.round(grams) : null,
      // Store original serving macros for quick lookup
      macros: {
        calories: parseFloat(serving.calories) || 0,
        protein: parseFloat(serving.protein) || 0,
        carbs: parseFloat(serving.carbohydrate) || 0,
        fats: parseFloat(serving.fat) || 0,
      },
    };
  });

  // Ensure we always have a "100g" portion option
  if (!portions.some((p) => p.grams === 100)) {
    portions.unshift({
      id: 'p_100g',
      label: '100g',
      grams: 100,
      macros: per100g,
    });
  }

  return {
    id: `fs_${apiFood.food_id}`,
    fatSecretId: apiFood.food_id,
    name: apiFood.food_name,
    brand: apiFood.brand_name || null,
    category: 'cached', // Mark as cached/online food
    subcategory: apiFood.food_type === 'Brand' ? 'branded' : 'generic',
    per100g,
    portions,
    source: 'fatsecret',
    cachedAt: Date.now(),
  };
}

/**
 * Round to 2 decimal places
 */
function round2(num) {
  return Math.round(num * 100) / 100;
}

// ============================================
// CACHE UTILITIES
// ============================================

/**
 * Check if a food object is from online source
 */
export function isOnlineFood(food) {
  return food?.source === 'fatsecret' || food?.id?.startsWith('fs_');
}

/**
 * Add food to cache array (with deduplication)
 * @param {Array} cachedFoods - Existing cache array
 * @param {Object} newFood - Food to add
 * @returns {Array} Updated cache array
 */
export function addToFoodCache(cachedFoods, newFood) {
  if (!newFood || !newFood.id) return cachedFoods;

  const existingIndex = cachedFoods.findIndex((f) => f.id === newFood.id);

  if (existingIndex >= 0) {
    // Update existing entry (refresh cachedAt timestamp)
    const updated = [...cachedFoods];
    updated[existingIndex] = { ...newFood, cachedAt: Date.now() };
    return updated;
  }

  // Add new entry at the beginning (most recent first)
  return [{ ...newFood, cachedAt: Date.now() }, ...cachedFoods];
}

/**
 * Limit cache size by removing oldest entries
 * @param {Array} cachedFoods - Cache array
 * @param {number} maxSize - Maximum entries to keep
 * @returns {Array} Trimmed cache array
 */
export function trimFoodCache(cachedFoods, maxSize = 200) {
  if (cachedFoods.length <= maxSize) return cachedFoods;

  // Sort by cachedAt descending, keep most recent
  return [...cachedFoods]
    .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0))
    .slice(0, maxSize);
}
