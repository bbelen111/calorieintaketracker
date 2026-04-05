export function addToFoodCache(cachedFoods = [], newFood) {
  if (!newFood || !newFood.id) {
    return Array.isArray(cachedFoods) ? cachedFoods : [];
  }

  const baseCache = Array.isArray(cachedFoods) ? cachedFoods : [];
  const existingIndex = baseCache.findIndex((food) => food?.id === newFood.id);

  if (existingIndex >= 0) {
    const updated = [...baseCache];
    updated[existingIndex] = { ...newFood, cachedAt: Date.now() };
    return updated;
  }

  return [{ ...newFood, cachedAt: Date.now() }, ...baseCache];
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
