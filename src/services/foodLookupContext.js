import { FOOD_SEARCH_SOURCE, resolveAiFoodLookup } from './foodSearch.js';

export const normalizeAiLookupResult = (result, { entryName = '' } = {}) => {
  return {
    status: result?.status || 'no_match',
    usedSource: result?.usedSource || FOOD_SEARCH_SOURCE.LOCAL,
    sourcesTried: Array.isArray(result?.sourcesTried)
      ? result.sourcesTried
      : [],
    fallbackUsed: Boolean(result?.fallbackUsed),
    queryUsed: typeof result?.queryUsed === 'string' ? result.queryUsed : null,
    matchConfidence: result?.matchConfidence || 'low',
    matchScore: Number.isFinite(result?.matchScore) ? result.matchScore : 0,
    matchedFood: result?.matchedFood
      ? {
          name: result.matchedFood.name,
          brand: result.matchedFood.brand || null,
          category: result.matchedFood.category || null,
          subcategory: result.matchedFood.subcategory || null,
          per100g:
            result.matchedFood.per100g &&
            typeof result.matchedFood.per100g === 'object'
              ? {
                  calories: Number(result.matchedFood.per100g.calories) || 0,
                  protein: Number(result.matchedFood.per100g.protein) || 0,
                  carbs: Number(result.matchedFood.per100g.carbs) || 0,
                  fats: Number(result.matchedFood.per100g.fats) || 0,
                }
              : null,
        }
      : null,
    errorsBySource: result?.errorsBySource || {},
    entryName: String(entryName || '').trim() || null,
  };
};

const buildLookupErrorMeta = (error, entryName = '') => ({
  status: 'error',
  usedSource: FOOD_SEARCH_SOURCE.LOCAL,
  sourcesTried: [FOOD_SEARCH_SOURCE.LOCAL],
  fallbackUsed: false,
  queryUsed: String(entryName || '').trim() || null,
  matchConfidence: 'low',
  matchScore: 0,
  matchedFood: null,
  errorsBySource: {
    [FOOD_SEARCH_SOURCE.LOCAL]: error?.message || 'AI lookup failed.',
  },
  entryName: String(entryName || '').trim() || null,
});

const resolveEntryLookupTerms = (entry) => {
  if (Array.isArray(entry?.lookupTerms)) {
    return entry.lookupTerms;
  }

  if (Array.isArray(entry?.lookup_queries)) {
    return entry.lookup_queries;
  }

  return [];
};

export const resolveFoodLookupContext = async ({
  messageId,
  entries = [],
  isOnline = true,
  resolveLookup = resolveAiFoodLookup,
} = {}) => {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId || !Array.isArray(entries) || entries.length === 0) {
    return {};
  }

  const pairs = await Promise.all(
    entries.map(async (entry, index) => {
      const entryKey = `${normalizedMessageId}-${index}`;
      const entryName = String(entry?.name || '').trim();

      if (!entryName) {
        return [entryKey, buildLookupErrorMeta(null, entryName)];
      }

      try {
        const result = await resolveLookup({
          entryName,
          lookupTerms: resolveEntryLookupTerms(entry),
          isOnline,
        });

        return [entryKey, normalizeAiLookupResult(result, { entryName })];
      } catch (error) {
        return [entryKey, buildLookupErrorMeta(error, entryName)];
      }
    })
  );

  return Object.fromEntries(pairs);
};
