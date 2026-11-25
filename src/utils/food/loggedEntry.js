// Logged nutrition entries are denormalised snapshots: what the user saw when
// logging must be what gets stored, and what they see again when editing.

import {
  NUTRIENT_KEYS,
  normalizeNutrientValue,
} from '../../constants/nutrients/nutrients.js';
import { buildRecipeFood, favouriteToIngredientFood } from './recipe.js';

const DEFAULT_PORTION_GRAMS = 100;
// Fine enough that scaling back to the logged grams reproduces the entry.
const PER_100G_PRECISION = 1000;
// What an entry records about itself that the portion picker can't rebuild.
const ENTRY_METADATA_KEYS = [
  'source',
  'subcategory',
  'aiLookupUsed',
  'aiLookupSource',
];
// What carries over when a weightless entry is logged again by hand.
const MANUAL_RELOG_KEYS = ['foodId', 'brand', 'category', 'source'];

const pickDefined = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => value?.[key] != null).map((key) => [key, value[key]])
  );

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const roundTenth = (value) => Math.round(value * 10) / 10;

/**
 * Nutrition an AI chat entry is logged (or favourited) with: exactly what its
 * card shows. Any database substitution already happened in
 * `resolveAiFoodEntry`, so it must not happen a second time here. Untracked
 * micro nutrients are left out, never turned into 0.
 */
export const buildAiEntryNutrition = (entry) => {
  const grams = Number(entry?.grams);
  const nutrition = {
    grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
    calories: Math.round(toNonNegativeNumber(entry?.calories)),
    protein: roundTenth(toNonNegativeNumber(entry?.protein)),
    carbs: roundTenth(toNonNegativeNumber(entry?.carbs)),
    fats: roundTenth(toNonNegativeNumber(entry?.fats)),
  };

  NUTRIENT_KEYS.forEach((key) => {
    const value = normalizeNutrientValue(entry?.[key], key);
    if (value != null) {
      nutrition[key] = value;
    }
  });

  return nutrition;
};

/**
 * Rebuilds an editable food from a logged entry whose source food can't be
 * looked up (AI, online, barcode, custom, deleted recipe). Identity and
 * category come from the entry itself; an unknown category stays unknown.
 */
export const buildFallbackFoodFromEntry = (entry) => {
  const grams =
    Number.isFinite(entry?.grams) && entry.grams > 0
      ? entry.grams
      : DEFAULT_PORTION_GRAMS;
  const toPer100g = (value) =>
    Math.round(
      ((toNonNegativeNumber(value) * 100) / grams) * PER_100G_PRECISION
    ) / PER_100G_PRECISION;

  const per100g = {
    calories: toPer100g(entry?.calories),
    protein: toPer100g(entry?.protein),
    carbs: toPer100g(entry?.carbs),
    fats: toPer100g(entry?.fats),
  };
  NUTRIENT_KEYS.forEach((key) => {
    const value = entry?.[key];
    per100g[key] = value == null || value === '' ? null : toPer100g(value);
  });

  return {
    id: entry?.foodId || `manual_${entry?.id ?? Date.now()}`,
    name: String(entry?.name ?? '').trim() || 'Custom food',
    brand: entry?.brand || null,
    category: entry?.category || null,
    subcategory: entry?.subcategory || null,
    per100g,
    portions: [],
  };
};

const isSavedCustomFood = (favourite) =>
  (favourite?.source === 'user' || favourite?.isCustom === true) &&
  favourite.source !== 'manual' &&
  favourite.category !== 'manual';

/**
 * The food to open the portion picker on when logging an entry again. A food
 * that can still be looked up is used as it is now (so its portions are offered);
 * otherwise it is rebuilt from the entry, carrying `entryMetadata` for the new log.
 */
export const resolveFoodForRelog = async (
  entry,
  { recipes, favourites, cachedFoods, getCatalogFoodById } = {}
) => {
  const foodId = entry?.foodId;

  if (foodId) {
    const recipeFood = buildRecipeFood(
      (recipes ?? []).find((recipe) => recipe?.id === foodId)
    );
    if (recipeFood) {
      return recipeFood;
    }

    const customFood = favouriteToIngredientFood(
      (favourites ?? []).find(
        (favourite) =>
          favourite?.foodId === foodId && isSavedCustomFood(favourite)
      )
    );
    if (customFood) {
      return customFood;
    }

    try {
      const catalogFood = await getCatalogFoodById?.(foodId);
      if (catalogFood) {
        return catalogFood;
      }
    } catch (error) {
      console.warn('Food catalog lookup failed for a recent food', error);
    }

    const cachedFood = (cachedFoods ?? []).find(
      (food) => food?.id === foodId && food.per100g
    );
    if (cachedFood) {
      return cachedFood;
    }
  }

  return {
    ...buildFallbackFoodFromEntry(entry),
    entryMetadata: pickDefined(entry, ENTRY_METADATA_KEYS),
  };
};

/**
 * Identity a hand-logged repeat of `entry` keeps. A renamed food is a different
 * food, so it keeps nothing.
 */
export const pickManualRelogIdentity = (entry, name) =>
  entry && String(entry.name ?? '').trim() === String(name ?? '').trim()
    ? pickDefined(entry, MANUAL_RELOG_KEYS)
    : {};
