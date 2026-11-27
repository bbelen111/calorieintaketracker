// Pure listing logic shared by every surface that browses foods the way the
// Food Search modal does (search, category / subcategory filters, sort, pinned
// foods first): `FoodSearchModal` and the recipe ingredient picker.
//
// This is the filter / sort / merge half of the search modal, moved out of it
// verbatim so the two can never drift. The stateful half (querying the catalog,
// paging, debouncing) stays with each surface.

export const SORT_LABELS = Object.freeze({
  name: 'Name',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fats: 'Fats',
});

// Online results are filtered by the catalog's `type` instead of a macro
// category.
export const ONLINE_FOOD_CATEGORIES = Object.freeze({
  Brand: { label: 'Branded', color: 'blue' },
  Generic: { label: 'Generic', color: 'slate' },
});

const FILTER_ACTIVE_CLASS_BY_COLOR = {
  red: 'bg-accent-red',
  teal: 'bg-accent-teal',
  green: 'bg-accent-green',
  yellow: 'bg-accent-yellow',
  purple: 'bg-accent-purple',
  blue: 'bg-accent-blue',
  emerald: 'bg-accent-emerald',
  slate: 'bg-accent-slate',
  indigo: 'bg-accent-indigo',
  pink: 'bg-accent-pink',
};

export const getFilterActiveClass = (color) =>
  `${FILTER_ACTIVE_CLASS_BY_COLOR[color] || 'bg-accent-slate'} text-primary-foreground`;

/** `energyNoun` names the calories sort in the user's energy unit. */
export const getSortLabel = (sortBy, sortOrder, energyNoun) => {
  const label =
    sortBy === 'calories' && energyNoun ? energyNoun : SORT_LABELS[sortBy];
  return `${label} ${sortOrder === 'asc' ? '↑' : '↓'}`;
};

export const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Query-aware name relevance: an exact name beats a prefix, a whole-word match
// beats a substring, and brand / category matches rank last.
export const scoreLocalNameRelevance = (query, food) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedName = normalizeSearchText(food?.name);
  const normalizedBrand = normalizeSearchText(food?.brand);
  const normalizedCategory = normalizeSearchText(food?.category);

  if (!normalizedName && !normalizedBrand && !normalizedCategory) {
    return 0;
  }

  if (normalizedName === normalizedQuery) return 1000;
  if (normalizedName.startsWith(normalizedQuery)) return 700;
  if (` ${normalizedName} `.includes(` ${normalizedQuery} `)) return 450;
  if (normalizedName.includes(normalizedQuery)) return 250;

  if (normalizedBrand === normalizedQuery) return 140;
  if (normalizedBrand.includes(normalizedQuery)) return 80;
  if (normalizedCategory === normalizedQuery) return 40;
  if (normalizedCategory.includes(normalizedQuery)) return 20;

  return 0;
};

/**
 * Merge food lists by id; when an id repeats, the LATER list wins. Rows without
 * an id are dropped. Order the lists from least to most authoritative.
 */
export const mergeFoodsById = (...lists) => {
  const merged = new Map();
  lists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((food) => {
      if (!food?.id) return;
      merged.set(food.id, food);
    });
  });
  return Array.from(merged.values());
};

/**
 * Append a freshly fetched page to rows already on screen. Unlike
 * `mergeFoodsById`, the EXISTING row wins, so a row never changes under the
 * user's finger when a later page repeats it.
 */
export const appendUniqueFoodsById = (baseRows, extraRows) => {
  const merged = new Map();

  (Array.isArray(baseRows) ? baseRows : []).forEach((food) => {
    if (!food?.id) return;
    merged.set(food.id, food);
  });

  (Array.isArray(extraRows) ? extraRows : []).forEach((food) => {
    if (!food?.id || merged.has(food.id)) return;
    merged.set(food.id, food);
  });

  return Array.from(merged.values());
};

// The category filter for local foods: the catalog categories, plus "Recipes"
// and "Cached" once there is at least one row of that kind to filter by.
export const buildLocalCategoryOptions = (
  baseCategories,
  hasCachedFoods,
  hasRecipes = false
) => {
  const options = { ...baseCategories };
  if (hasRecipes) {
    options.recipe = { label: 'Recipes', color: 'pink' };
  }
  if (hasCachedFoods) {
    options.cached = { label: 'Cached', color: 'purple' };
  }
  return options;
};

// Subcategories offered for the selected local category: the catalog's own list
// plus any carried by the merged foods (cached / custom rows).
export const buildLocalSubcategories = ({
  category,
  foods,
  catalogSubcategories,
}) => {
  if (!category) return [];

  const subcategories = new Set();
  (Array.isArray(catalogSubcategories) ? catalogSubcategories : []).forEach(
    (subcategory) => subcategories.add(subcategory)
  );
  (Array.isArray(foods) ? foods : []).forEach((food) => {
    if (food?.category === category && food?.subcategory) {
      subcategories.add(food.subcategory);
    }
  });
  return Array.from(subcategories).sort();
};

// For online results the second filter is the serving the preview is quoted at.
export const buildOnlineServingOptions = ({ category, foods }) => {
  if (!category) return [];

  const servings = new Set();
  (Array.isArray(foods) ? foods : []).forEach((food) => {
    if (food?.type === category) {
      const servingInfo = food.previewMacros?.servingInfo;
      if (servingInfo) {
        servings.add(servingInfo);
      }
    }
  });
  return Array.from(servings).sort();
};

/**
 * Filter, sort and pin-order merged local foods.
 *
 * - `category` / `subcategory` narrow by exact match.
 * - `query` keeps foods whose name, brand or category contains it.
 * - Sorting by name is relevance-aware while a query is typed (exact / prefix /
 *   whole-word beat substrings, then shorter names first); otherwise name order
 *   follows `sortOrder`. Macro sorts read `per100g`.
 * - Foods whose id is in `pinnedIds` always come first (stable within each
 *   group).
 */
export const buildLocalFoodList = ({
  foods,
  query = '',
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
  pinnedIds = [],
}) => {
  let results = Array.isArray(foods) ? [...foods] : [];

  if (category) {
    results = results.filter((food) => {
      if (food.category === category) {
        return true;
      }
      if (Array.isArray(food.tags) && food.tags.includes(category)) {
        return true;
      }
      if (
        category === 'custom' &&
        (food.isCustom === true ||
          food.source === 'user' ||
          food.isRecipe === true ||
          food.source === 'recipe')
      ) {
        return true;
      }
      if (
        category === 'recipe' &&
        (food.isRecipe === true || food.source === 'recipe')
      ) {
        return true;
      }
      return false;
    });
  }

  if (subcategory) {
    results = results.filter((food) => food.subcategory === subcategory);
  }

  if (String(query).trim()) {
    const lowered = String(query).toLowerCase().trim();
    results = results.filter(
      (food) =>
        String(food.name ?? '')
          .toLowerCase()
          .includes(lowered) ||
        String(food.brand ?? '')
          .toLowerCase()
          .includes(lowered) ||
        String(food.category ?? '')
          .toLowerCase()
          .includes(lowered) ||
        (Array.isArray(food.tags) &&
          food.tags.some((tag) =>
            String(tag ?? '')
              .toLowerCase()
              .includes(lowered)
          ))
    );
  }

  const normalizedQuery = normalizeSearchText(query);

  results.sort((a, b) => {
    if (sortBy === 'name') {
      if (normalizedQuery) {
        const scoreA = scoreLocalNameRelevance(normalizedQuery, a);
        const scoreB = scoreLocalNameRelevance(normalizedQuery, b);

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        const lengthA = String(a?.name ?? '').length;
        const lengthB = String(b?.name ?? '').length;
        if (lengthA !== lengthB) {
          return lengthA - lengthB;
        }

        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      }

      const compare = String(a.name ?? '').localeCompare(String(b.name ?? ''));
      return sortOrder === 'asc' ? compare : -compare;
    }

    const aValue = Number(a?.per100g?.[sortBy] ?? 0);
    const bValue = Number(b?.per100g?.[sortBy] ?? 0);
    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
  });

  const pinned = new Set(Array.isArray(pinnedIds) ? pinnedIds : []);
  if (pinned.size === 0) {
    return results;
  }

  // Array#sort is stable, so each group keeps the order established above.
  return [...results].sort((a, b) => {
    const aIsPinned = pinned.has(a.id);
    const bIsPinned = pinned.has(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });
};

/** Filter and sort online catalog results (type, serving, then macro / name). */
export const buildOnlineFoodList = ({
  foods,
  category = null,
  subcategory = null,
  sortBy = 'name',
  sortOrder = 'asc',
}) => {
  let results = Array.isArray(foods) ? [...foods] : [];

  if (category) {
    results = results.filter((food) => food.type === category);
  }

  if (subcategory) {
    results = results.filter(
      (food) => food.previewMacros?.servingInfo === subcategory
    );
  }

  return [...results].sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'name') {
      compareValue = String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
    } else {
      const aValue = Number(
        a?.previewMacros?.[sortBy] ?? a?.per100g?.[sortBy] ?? 0
      );
      const bValue = Number(
        b?.previewMacros?.[sortBy] ?? b?.per100g?.[sortBy] ?? 0
      );
      compareValue = aValue - bValue;
    }

    return sortOrder === 'asc' ? compareValue : -compareValue;
  });
};
