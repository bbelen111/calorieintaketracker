export function addToFoodCache(cachedFoods = [], newFood) {
  if (!newFood || !newFood.id) {
    return Array.isArray(cachedFoods) ? cachedFoods : [];
  }

  const baseCache = Array.isArray(cachedFoods) ? cachedFoods : [];
  const existingIndex = baseCache.findIndex((food) => food?.id === newFood.id);
  const cachedFood = {
    ...newFood,
    category: 'cached',
    isCached: true,
    cachedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    const updated = [...baseCache];
    updated[existingIndex] = cachedFood;
    return updated;
  }

  return [cachedFood, ...baseCache];
}

export function trimFoodCache(cachedFoods = [], maxSize = 200) {
  const baseCache = Array.isArray(cachedFoods) ? cachedFoods : [];

  if (baseCache.length <= maxSize) {
    return baseCache;
  }

  return [...baseCache]
    .sort((a, b) => (b?.cachedAt || 0) - (a?.cachedAt || 0))
    .slice(0, maxSize);
}
