// Recipes: a user-built food assembled from existing foods.
//
// A saved recipe keeps its ingredient list (so it stays editable) but is
// *derived* into an ordinary food object by `buildRecipeFood` - `per100g` plus a
// "1 serving" portion - so search, favourites, the portion modal, logging and
// daily snapshots all treat it like any other food. Nothing here is persisted
// except the recipe itself (`userData.recipes`); per-100g values and portions
// are always recomputed, so a fix to this module fixes every saved recipe.
//
// Ingredient values are SNAPSHOTS taken when the ingredient was added: catalog
// rows can change between app versions and cached/custom foods can disappear,
// so a recipe never depends on its source foods staying put.
//
// Micro nutrients keep the app-wide null semantic (`null` = untracked): if ANY
// ingredient has no value for a micro, the recipe's value is `null` rather than
// a partial sum that would read as a measured number.
import {
  NUTRIENT_BOUNDS,
  NUTRIENT_KEYS,
} from '../../constants/nutrients/nutrients.js';
import { scaleMacrosFromPer100g } from './portionNormalization.js';

export const RECIPE_ID_PREFIX = 'recipe_';
export const RECIPE_SOURCE = 'recipe';
export const RECIPE_SERVING_PORTION_ID = 'recipe_serving';

export const RECIPE_MIN_SERVINGS = 1;
export const RECIPE_MAX_SERVINGS = 99;
export const RECIPE_MAX_INGREDIENTS = 40;
export const RECIPE_MAX_INGREDIENT_GRAMS = 10000;
export const RECIPE_MAX_COOKED_WEIGHT_GRAMS = 20000;
// Mirrors FoodPortionModal's gram wheel (MAX_GRAMS = 1000). Keep a serving
// within it so a logged serving can always be re-opened and edited in grams.
export const RECIPE_MAX_SERVING_GRAMS = 1000;

const PER_100G_DECIMALS = 3;
const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fats'];

const roundTo = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toFiniteNumberOrNull = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPositiveNumberOrNull = (value, max = Infinity) => {
  const parsed = toFiniteNumberOrNull(value);
  if (parsed == null || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, max);
};

const toTrimmedStringOrNull = (value) => {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toTimestampOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return toTrimmedStringOrNull(value);
};

const randomSuffix = () => Math.random().toString(36).slice(2, 9);

export const createRecipeId = () =>
  `${RECIPE_ID_PREFIX}${Date.now().toString(36)}_${randomSuffix()}`;

export const isRecipeFood = (food) =>
  food?.isRecipe === true || food?.source === RECIPE_SOURCE;

export const isRecipeId = (value) =>
  typeof value === 'string' && value.startsWith(RECIPE_ID_PREFIX);

// --- Normalisation -----------------------------------------------------------

const normalizePer100g = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const per100g = {};
  MACRO_KEYS.forEach((key) => {
    const value = toFiniteNumberOrNull(raw[key]);
    per100g[key] = value != null && value > 0 ? value : 0;
  });
  NUTRIENT_KEYS.forEach((key) => {
    const value = toFiniteNumberOrNull(raw[key]);
    per100g[key] = value == null ? null : Math.max(0, value);
  });
  return per100g;
};

export const normalizeRecipeIngredient = (raw, index = 0) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const grams = toPositiveNumberOrNull(raw.grams, RECIPE_MAX_INGREDIENT_GRAMS);
  const per100g = normalizePer100g(raw.per100g);
  if (grams == null || per100g == null) {
    return null;
  }

  return {
    id: toTrimmedStringOrNull(raw.id) ?? `ingredient_${index + 1}`,
    foodId: toTrimmedStringOrNull(raw.foodId),
    name: toTrimmedStringOrNull(raw.name) ?? 'Ingredient',
    brand: toTrimmedStringOrNull(raw.brand),
    source: toTrimmedStringOrNull(raw.source),
    category: toTrimmedStringOrNull(raw.category),
    grams: roundTo(grams, 1),
    per100g,
    portionLabel: toTrimmedStringOrNull(raw.portionLabel),
  };
};

const normalizeExtraPortions = (raw) => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set([RECIPE_SERVING_PORTION_ID]);
  const portions = [];
  raw.forEach((portion, index) => {
    const label = toTrimmedStringOrNull(portion?.label);
    const grams = toPositiveNumberOrNull(portion?.grams);
    if (!label || grams == null) {
      return;
    }
    const id = toTrimmedStringOrNull(portion?.id) ?? `portion_${index + 1}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    portions.push({ id, label, grams });
  });
  return portions;
};

/**
 * Coerce stored/untrusted data into a canonical recipe, or `null` when it can
 * not describe one (no id, no name, or no usable ingredient). Ingredients that
 * are themselves unusable are dropped; everything else is clamped to bounds.
 */
export const normalizeRecipe = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const id = toTrimmedStringOrNull(raw.id);
  const name = toTrimmedStringOrNull(raw.name);
  if (!id || !name) {
    return null;
  }

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((ingredient, index) => normalizeRecipeIngredient(ingredient, index))
    .filter(Boolean)
    .slice(0, RECIPE_MAX_INGREDIENTS);
  if (ingredients.length === 0) {
    return null;
  }

  const servings = Math.min(
    RECIPE_MAX_SERVINGS,
    Math.max(RECIPE_MIN_SERVINGS, Math.round(Number(raw.servings) || 1))
  );

  return {
    id,
    name,
    category: toTrimmedStringOrNull(raw.category) ?? 'custom',
    tags: (Array.isArray(raw.tags) ? raw.tags : [])
      .map(toTrimmedStringOrNull)
      .filter(Boolean),
    servings,
    cookedWeightGrams: toPositiveNumberOrNull(
      raw.cookedWeightGrams,
      RECIPE_MAX_COOKED_WEIGHT_GRAMS
    ),
    ingredients,
    portions: normalizeExtraPortions(raw.portions),
    createdAt: toTimestampOrNull(raw.createdAt),
    updatedAt: toTimestampOrNull(raw.updatedAt),
  };
};

/** Normalise a stored list; invalid rows and duplicate ids are dropped. */
export const normalizeRecipes = (raw) => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const recipes = [];
  raw.forEach((candidate) => {
    const recipe = normalizeRecipe(candidate);
    if (!recipe || seen.has(recipe.id)) {
      return;
    }
    seen.add(recipe.id);
    recipes.push(recipe);
  });
  return recipes;
};

// --- Calculation -------------------------------------------------------------

/**
 * Totals for the WHOLE recipe at full precision (no display rounding), so the
 * per-100g and per-serving values derived from them do not accumulate error.
 * Lenient on purpose: it also prices an in-progress builder draft, skipping
 * ingredients that have no positive grams or no nutrition snapshot.
 *
 * `totalGrams` is the cooked weight when one was given, otherwise the sum of
 * the ingredient weights.
 */
export const computeRecipeTotals = (recipe) => {
  const ingredients = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
    : [];

  const totals = {
    ingredientCount: 0,
    ingredientGrams: 0,
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
  };
  const microSums = {};
  const microUntracked = {};
  NUTRIENT_KEYS.forEach((key) => {
    microSums[key] = 0;
    microUntracked[key] = false;
  });

  ingredients.forEach((ingredient) => {
    const grams = toFiniteNumberOrNull(ingredient?.grams);
    const per100g = ingredient?.per100g;
    if (
      grams == null ||
      grams <= 0 ||
      !per100g ||
      typeof per100g !== 'object'
    ) {
      return;
    }

    const factor = grams / 100;
    totals.ingredientCount += 1;
    totals.ingredientGrams += grams;
    MACRO_KEYS.forEach((key) => {
      totals[key] +=
        Math.max(0, toFiniteNumberOrNull(per100g[key]) ?? 0) * factor;
    });
    NUTRIENT_KEYS.forEach((key) => {
      const value = toFiniteNumberOrNull(per100g[key]);
      if (value == null) {
        microUntracked[key] = true;
      } else {
        microSums[key] += Math.max(0, value) * factor;
      }
    });
  });

  const cookedWeight = toPositiveNumberOrNull(
    recipe?.cookedWeightGrams,
    RECIPE_MAX_COOKED_WEIGHT_GRAMS
  );

  const micros = {};
  NUTRIENT_KEYS.forEach((key) => {
    micros[key] =
      totals.ingredientCount === 0 || microUntracked[key]
        ? null
        : microSums[key];
  });

  return {
    ...totals,
    totalGrams: cookedWeight ?? totals.ingredientGrams,
    ...micros,
  };
};

export const getRecipeServings = (recipe) =>
  Math.min(
    RECIPE_MAX_SERVINGS,
    Math.max(RECIPE_MIN_SERVINGS, Math.round(Number(recipe?.servings) || 1))
  );

export const getRecipeServingGrams = (recipe) => {
  const { totalGrams } = computeRecipeTotals(recipe);
  return totalGrams > 0 ? totalGrams / getRecipeServings(recipe) : 0;
};

/**
 * Derive the ordinary food object for a recipe. Returns `null` when the recipe
 * is invalid or weighs nothing. `isCustom: true` marks it as user-owned data;
 * anything that must tell recipes apart checks `isRecipe` / `source` first
 * (see `resolveFoodSourceType`).
 */
export const buildRecipeFood = (recipe) => {
  const normalized = normalizeRecipe(recipe);
  if (!normalized) {
    return null;
  }

  const totals = computeRecipeTotals(normalized);
  if (totals.totalGrams <= 0) {
    return null;
  }

  const per100 = (value) =>
    roundTo((value / totals.totalGrams) * 100, PER_100G_DECIMALS);

  const per100g = {};
  MACRO_KEYS.forEach((key) => {
    per100g[key] = per100(totals[key]);
  });
  NUTRIENT_KEYS.forEach((key) => {
    const value = totals[key];
    per100g[key] =
      value == null
        ? null
        : Math.min(per100(value), NUTRIENT_BOUNDS[key]?.max ?? Infinity);
  });

  const servingGrams = totals.totalGrams / normalized.servings;

  return {
    id: normalized.id,
    name: normalized.name,
    brand: null,
    category: normalized.category,
    subcategory: null,
    tags: [...normalized.tags, RECIPE_SOURCE],
    source: RECIPE_SOURCE,
    isCustom: true,
    isRecipe: true,
    recipeId: normalized.id,
    servings: normalized.servings,
    servingGrams: roundTo(servingGrams, PER_100G_DECIMALS),
    totalGrams: roundTo(totals.totalGrams, 1),
    ingredientCount: normalized.ingredients.length,
    per100g,
    portions: [
      {
        id: RECIPE_SERVING_PORTION_ID,
        label: '1 serving',
        grams: roundTo(servingGrams, PER_100G_DECIMALS),
      },
      ...normalized.portions,
    ],
    createdAt: normalized.createdAt,
  };
};

/**
 * Macros + micros for ONE serving, produced by the same scaling the portion
 * modal applies when that serving is logged, so the builder preview and the
 * logged entry agree (to the whole kilocalorie the modal rounds to).
 */
export const getRecipePerServing = (recipe) => {
  const food = buildRecipeFood(recipe);
  if (!food) {
    return null;
  }
  return scaleMacrosFromPer100g(food.per100g, food.servingGrams);
};

/**
 * Turn a saved favourite into a pickable food (`{ id, name, per100g, ... }`).
 * Favourites usually carry the source food's `per100g`; older ones only kept
 * the macros of the grams they were saved at, so those are scaled back to 100 g.
 * Returns `null` for favourites that cannot give a per-gram basis (manual
 * entries with no weight) and for recipes, which cannot be nested.
 */
export const favouriteToIngredientFood = (favourite) => {
  if (!favourite || typeof favourite !== 'object') {
    return null;
  }
  if (favourite.isRecipe === true || favourite.source === RECIPE_SOURCE) {
    return null;
  }

  const foodId = toTrimmedStringOrNull(favourite.foodId);
  if (isRecipeId(foodId)) {
    return null;
  }

  let per100g = normalizePer100g(favourite.per100g);
  if (!per100g) {
    const grams = toPositiveNumberOrNull(favourite.grams);
    if (grams == null) {
      return null;
    }
    const scale = (value) =>
      Math.max(0, toFiniteNumberOrNull(value) ?? 0) * (100 / grams);
    per100g = {};
    MACRO_KEYS.forEach((key) => {
      per100g[key] = scale(favourite[key]);
    });
    NUTRIENT_KEYS.forEach((key) => {
      per100g[key] =
        toFiniteNumberOrNull(favourite[key]) == null
          ? null
          : scale(favourite[key]);
    });
  }

  return {
    id: foodId ?? `favourite_${favourite.id ?? Date.now()}`,
    name: toTrimmedStringOrNull(favourite.name) ?? 'Favourite',
    brand: toTrimmedStringOrNull(favourite.brand),
    category: toTrimmedStringOrNull(favourite.category) ?? 'custom',
    source: toTrimmedStringOrNull(favourite.source),
    isCustom: favourite.isCustom === true,
    per100g,
    portions: Array.isArray(favourite.portions) ? favourite.portions : [],
  };
};

/**
 * Where the portion wheel should start for a food: a recipe opens on one
 * serving's weight (so "Log entry" logs exactly one serving); anything else
 * returns `null` and keeps the portion modal's own default.
 */
export const getRecipeStartGrams = (food) => {
  if (!isRecipeFood(food)) {
    return null;
  }
  const servingGrams = toPositiveNumberOrNull(food.servingGrams);
  return servingGrams == null
    ? null
    : Math.min(servingGrams, RECIPE_MAX_SERVING_GRAMS);
};

export const getRecipeIngredientCalories = (ingredient) => {
  const grams = toFiniteNumberOrNull(ingredient?.grams) ?? 0;
  const calories = toFiniteNumberOrNull(ingredient?.per100g?.calories) ?? 0;
  return Math.max(0, Math.round((calories * grams) / 100));
};

/**
 * Snapshot a picked food + chosen weight into a recipe ingredient. `food` is
 * any search/favourite/cached/custom food (needs `per100g`); returns `null`
 * when it is unusable.
 */
export const buildRecipeIngredient = ({ food, grams, portionLabel } = {}) =>
  normalizeRecipeIngredient({
    id: `ingredient_${Date.now().toString(36)}_${randomSuffix()}`,
    foodId: food?.id ?? null,
    name: food?.name,
    brand: food?.brand ?? null,
    source: food?.source ?? null,
    category: food?.category ?? null,
    grams,
    per100g: food?.per100g,
    portionLabel,
  });

// --- Validation --------------------------------------------------------------

/**
 * Validate a builder draft `{ name, servings, cookedWeightGrams, ingredients }`.
 * Returns `{ isValid, errors, totalGrams, servingGrams, suggestedServings }`;
 * `errors` only contains the keys that failed (`name`, `ingredients`,
 * `servings`, `cookedWeight`, `servingWeight`).
 */
export const validateRecipeDraft = (draft) => {
  const errors = {};

  if (!toTrimmedStringOrNull(draft?.name)) {
    errors.name = 'Give your recipe a name.';
  }

  const totals = computeRecipeTotals(draft);
  if (totals.ingredientCount === 0) {
    errors.ingredients = 'Add at least one ingredient.';
  } else if (totals.ingredientCount > RECIPE_MAX_INGREDIENTS) {
    errors.ingredients = `A recipe can have up to ${RECIPE_MAX_INGREDIENTS} ingredients.`;
  }

  const rawServings = Number(draft?.servings);
  const servings = Math.round(rawServings);
  if (
    !Number.isFinite(rawServings) ||
    servings < RECIPE_MIN_SERVINGS ||
    servings > RECIPE_MAX_SERVINGS
  ) {
    errors.servings = `Servings must be between ${RECIPE_MIN_SERVINGS} and ${RECIPE_MAX_SERVINGS}.`;
  }

  const rawCooked = draft?.cookedWeightGrams;
  if (rawCooked != null && rawCooked !== '') {
    const cooked = Number(rawCooked);
    if (
      !Number.isFinite(cooked) ||
      cooked <= 0 ||
      cooked > RECIPE_MAX_COOKED_WEIGHT_GRAMS
    ) {
      errors.cookedWeight = `Cooked weight must be between 1 and ${RECIPE_MAX_COOKED_WEIGHT_GRAMS} g.`;
    }
  }

  const safeServings = errors.servings ? 1 : servings;
  const servingGrams =
    totals.totalGrams > 0 ? totals.totalGrams / safeServings : 0;
  const suggestedServings = Math.min(
    RECIPE_MAX_SERVINGS,
    Math.max(1, Math.ceil(totals.totalGrams / RECIPE_MAX_SERVING_GRAMS))
  );

  if (!errors.servings && servingGrams > RECIPE_MAX_SERVING_GRAMS) {
    errors.servingWeight = `Each serving would weigh ${Math.round(servingGrams)} g. Use at least ${suggestedServings} servings to keep a serving under ${RECIPE_MAX_SERVING_GRAMS} g.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    totalGrams: totals.totalGrams,
    servingGrams,
    suggestedServings,
  };
};
