import {
  getFoodById as getFoodByIdFromCatalog,
  searchFoods as searchFoodsFromCatalog,
} from '../../services/foodCatalog.js';

// Compatibility export retained for legacy call sites.
// Foods are now loaded from SQLite via async helpers.
export const FOOD_DATABASE = [];

export const FOOD_CATEGORIES = {
  protein: { label: 'Proteins', color: 'red' },
  carbs: { label: 'Carbs', color: 'amber' },
  vegetables: { label: 'Vegetables', color: 'green' },
  fats: { label: 'Fats', color: 'yellow' },
  supplements: { label: 'Supplements', color: 'purple' },
  custom: { label: 'Custom', color: 'blue' },
  manual: { label: 'Manual', color: 'indigo' },
};

// Helper to search foods
export const searchFoods = (query) => {
  return searchFoodsFromCatalog({ query });
};

// Helper to get food by ID
export const getFoodById = (id) => {
  return getFoodByIdFromCatalog(id);
};
