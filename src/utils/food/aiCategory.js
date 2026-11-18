// Category resolution for AI-produced food entries.
//
// One resolver shared by the chat entry card (what the tag shows) and the
// Food Search modal (what gets saved/logged), so the two can never disagree - they
// used to: the modal inferred a category from macros while the card fell straight
// through to a hard-coded 'custom' tag, so a plain omelette was labelled "Custom".

// What a food *is*. These are the only categories an AI estimate can claim.
const FOOD_TYPE_CATEGORY_KEYS = new Set([
  'protein',
  'carbs',
  'vegetables',
  'fats',
  'supplements',
]);

// Provenance categories: they describe how a food entry was *made* (user-created
// or hand-entered), not what it is.
const PROVENANCE_CATEGORY_KEYS = new Set(['custom', 'manual']);

const normalizeCategory = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * Dominant-macro category, or `null` when the entry carries no macros at all
 * (nothing to infer from - callers decide what "unknown" means for them).
 */
export const inferCategoryFromMacros = (entry) => {
  const protein = Math.max(0, Number(entry?.protein) || 0);
  const carbs = Math.max(0, Number(entry?.carbs) || 0);
  const fats = Math.max(0, Number(entry?.fats) || 0);

  if (protein <= 0 && carbs <= 0 && fats <= 0) {
    return null;
  }

  if (protein >= carbs && protein >= fats) {
    return 'protein';
  }
  if (carbs >= protein && carbs >= fats) {
    return 'carbs';
  }
  return 'fats';
};

/**
 * Resolution order:
 *  1. the model's own category, but only a food-type one - a model answering
 *     "custom"/"manual" for e.g. a homemade omelette says nothing about the food;
 *  2. the matched database food's category (any known key: a matched food that
 *     really is a user's custom food is legitimately "custom");
 *  3. inferred from the macros.
 * Returns `null` when none of those applies, so a UI can omit the tag rather than
 * invent one.
 */
export const resolveAiEntryCategory = (entry, lookupMeta = null) => {
  const explicit = normalizeCategory(entry?.category);
  if (FOOD_TYPE_CATEGORY_KEYS.has(explicit)) {
    return explicit;
  }

  const matched = normalizeCategory(lookupMeta?.matchedFood?.category);
  if (
    FOOD_TYPE_CATEGORY_KEYS.has(matched) ||
    PROVENANCE_CATEGORY_KEYS.has(matched)
  ) {
    return matched;
  }

  return inferCategoryFromMacros(entry);
};
