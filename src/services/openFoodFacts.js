/* eslint-disable no-undef */
import { Capacitor } from '@capacitor/core';

const API_BASE = (
  (typeof import.meta.env?.VITE_OPENFOODFACTS_API_BASE === 'string'
    ? import.meta.env.VITE_OPENFOODFACTS_API_BASE
    : '') || 'https://calorieintaketracker.vercel.app/api/openfoodfacts'
).trim();

export class OpenFoodFactsError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'OpenFoodFactsError';
    this.status = status;
    this.details = details;
  }
}

function round2(num) {
  return Math.round(Number(num || 0) * 100) / 100;
}

function normalizeBarcode(barcode) {
  return String(barcode ?? '')
    .replace(/\D/g, '')
    .trim();
}

function parseServingGrams(product) {
  const directQuantity = Number(product?.serving_quantity);
  if (
    Number.isFinite(directQuantity) &&
    directQuantity > 0 &&
    String(product?.serving_quantity_unit || '').toLowerCase() === 'g'
  ) {
    return Math.round(directQuantity);
  }

  const servingSize = String(product?.serving_size || '').trim();
  const match = servingSize.match(/([\d.,]+)\s*g\b/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function mapProductToFood(product, barcode) {
  const nutriments = product?.nutriments || {};

  const per100g = {
    calories: Math.max(
      0,
      Math.round(Number(nutriments['energy-kcal_100g']) || 0)
    ),
    protein: Math.max(0, round2(nutriments.proteins_100g)),
    carbs: Math.max(0, round2(nutriments.carbohydrates_100g)),
    fats: Math.max(0, round2(nutriments.fat_100g)),
  };

  const servingGrams = parseServingGrams(product);
  const portions = [
    {
      id: 'p_100g',
      label: '100g',
      grams: 100,
      macros: per100g,
    },
  ];

  if (servingGrams && servingGrams !== 100) {
    const factor = servingGrams / 100;
    portions.push({
      id: 'p_serving',
      label: product?.serving_size || `${servingGrams}g`,
      grams: servingGrams,
      macros: {
        calories: Math.max(0, Math.round(per100g.calories * factor)),
        protein: Math.max(0, round2(per100g.protein * factor)),
        carbs: Math.max(0, round2(per100g.carbs * factor)),
        fats: Math.max(0, round2(per100g.fats * factor)),
      },
    });
  }

  const productName = String(product?.product_name || '').trim();
  const brandName = String(product?.brands || '').trim();

  return {
    id: `off_${barcode}`,
    barcode,
    name: productName || `Barcode ${barcode}`,
    brand: brandName || null,
    category: 'cached',
    subcategory: brandName ? 'branded' : 'generic',
    per100g,
    portions,
    source: 'openfoodfacts',
    cachedAt: Date.now(),
  };
}

async function apiRequest(action, params = {}) {
  const resolvedBase = API_BASE || '/api/openfoodfacts';

  if (Capacitor.isNativePlatform() && resolvedBase.startsWith('/')) {
    throw new OpenFoodFactsError(
      'OpenFoodFacts API base not configured for native. Set VITE_OPENFOODFACTS_API_BASE to your deployed URL.',
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
      throw new OpenFoodFactsError(
        errorData.error || `Request failed: ${response.status}`,
        response.status,
        errorData
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error?.name === 'AbortError') {
      throw new OpenFoodFactsError('Request timed out', 408);
    }

    if (error instanceof OpenFoodFactsError) {
      throw error;
    }

    throw new OpenFoodFactsError(
      'Network error - check your connection',
      0,
      error?.message
    );
  }
}

export async function searchBarcode(barcode) {
  const cleanBarcode = normalizeBarcode(barcode);
  if (!cleanBarcode || cleanBarcode.length < 8) {
    throw new OpenFoodFactsError('Invalid barcode format', 400);
  }

  const data = await apiRequest('barcode', { barcode: cleanBarcode });
  if (!data?.product) {
    throw new OpenFoodFactsError('Barcode not found in database', 404, data);
  }

  return mapProductToFood(data.product, cleanBarcode);
}
