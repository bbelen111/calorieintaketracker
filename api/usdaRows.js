// Payload builders for the /api/usda gateway.
//
// The proxy now serves the curated Supabase catalog instead of FoodData
// Central. Two envelopes are emitted per search:
//   - `catalogFoods`: the canonical per-100g row shape (new clients)
//   - `foods`:        a synthetic FDC envelope so already-shipped native
//                     builds still running the old FDC mapper keep working
//                     during the transition window (grace period only)
//
// Keep this module dependency-free and pure so it stays unit-testable under
// `node --test` (see tests/api/usdaRows.test.js).

export const CATALOG_FIELD_KEYS = [
  'id',
  'name',
  'brand',
  'category',
  'subcategory',
  'calories',
  'protein',
  'carbs',
  'fats',
  'fiber',
  'sodium',
  'saturated_fats',
  'sugars',
  'portions',
];

const toFinite = (value) => {
  if (value === null || value === undefined || value === '') {
    return null; // NULL = untracked; Number(null) would coerce to 0
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Normalize raw Supabase RPC rows to the canonical catalog payload.
 * Whitelists the 14 catalog keys (drops created_at/updated_at) and parses the
 * `portions` JSON text into an array. NULL semantics are preserved.
 */
export const toCatalogPayloadRows = (rows = []) => {
  const sourceRows = Array.isArray(rows) ? rows : [];

  return sourceRows.map((row) => {
    const out = {};

    for (const key of CATALOG_FIELD_KEYS) {
      const value = row?.[key];
      if (value === undefined || value === null) {
        out[key] = null;
      } else if (key === 'portions' && typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          out[key] = Array.isArray(parsed) ? parsed : [];
        } catch {
          out[key] = [];
        }
      } else {
        out[key] = value;
      }
    }

    return out;
  });
};

// Synthetic FoodData Central foodNutrients entries that the legacy client
// mapper (`mapUsdaFoodToFood` in src/services/usda.js) recognises via its
// tiered matchers (nutrientId first, then nutrientNumber, then name).
const LEGACY_NUTRIENT_DEFS = [
  {
    nutrientId: 1008,
    nutrientNumber: '208',
    name: 'Energy',
    unitName: 'KCAL',
    key: 'calories',
  },
  {
    nutrientId: 1003,
    nutrientNumber: '203',
    name: 'Protein',
    unitName: 'G',
    key: 'protein',
  },
  {
    nutrientId: 1005,
    nutrientNumber: '205',
    name: 'Carbohydrate, by difference',
    unitName: 'G',
    key: 'carbs',
  },
  {
    nutrientId: 1004,
    nutrientNumber: '204',
    name: 'Total lipid (fat)',
    unitName: 'G',
    key: 'fats',
  },
  {
    nutrientId: 1079,
    nutrientNumber: '291',
    name: 'Fiber, total dietary',
    unitName: 'G',
    key: 'fiber',
  },
  {
    nutrientId: 1093,
    nutrientNumber: '307',
    name: 'Sodium, Na',
    unitName: 'MG',
    key: 'sodium',
  },
  {
    nutrientId: 1258,
    nutrientNumber: '606',
    name: 'Fatty acids, total saturated',
    unitName: 'G',
    key: 'saturated_fats',
  },
  {
    nutrientId: 2000,
    nutrientNumber: '269',
    name: 'Sugars, total including NLEA',
    unitName: 'G',
    key: 'sugars',
  },
];

const extractLegacyFdcId = (id) => {
  const numericMatch = /(\d+)$/.exec(String(id ?? ''));
  return numericMatch ? numericMatch[1] : null;
};

/**
 * Build the FDC-shaped array for legacy clients. The old mapper computes
 * per100g from the servingSize (always 100g here, so values pass through
 * unchanged); NULL micros are omitted so they stay "untracked".
 */
export const toLegacyFdcRows = (rows = []) => {
  const sourceRows = Array.isArray(rows) ? rows : [];

  return sourceRows.map((row, index) => {
    const id = String(row?.id ?? '').trim();
    const fdcId =
      extractLegacyFdcId(id) || id || `search_${Date.now()}_${index}`;
    const brand = String(row?.brand ?? '').trim() || null;
    const foodNutrients = [];

    for (const def of LEGACY_NUTRIENT_DEFS) {
      const value = toFinite(row?.[def.key]);
      if (value === null) {
        continue; // NULL = untracked → omit so the legacy mapper leaves it null
      }
      foodNutrients.push({
        nutrientId: def.nutrientId,
        nutrientNumber: def.nutrientNumber,
        nutrientName: def.name,
        unitName: def.unitName,
        value,
      });
    }

    return {
      fdcId,
      description: String(row?.name ?? '').trim(),
      dataType: brand ? 'Branded' : 'Generic',
      brandOwner: brand,
      brandName: brand,
      servingSize: 100,
      servingSizeUnit: 'g',
      foodNutrients,
    };
  });
};
