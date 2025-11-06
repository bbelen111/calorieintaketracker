// Food database with nutritional information per 100g
// All values are per 100 grams of the food item

export const FOOD_DATABASE = [
  // Proteins - Meat
  {
    id: 'chicken_breast',
    name: 'Chicken Breast',
    category: 'protein',
    subcategory: 'poultry',
    per100g: {
      calories: 165,
      protein: 31,
      carbs: 0,
      fats: 3.6,
    },
  },
  {
    id: 'chicken_thigh',
    name: 'Chicken Thigh',
    category: 'protein',
    subcategory: 'poultry',
    per100g: {
      calories: 209,
      protein: 26,
      carbs: 0,
      fats: 10.9,
    },
  },
  {
    id: 'ground_beef',
    name: 'Ground Beef (80/20)',
    category: 'protein',
    subcategory: 'beef',
    per100g: {
      calories: 254,
      protein: 17.2,
      carbs: 0,
      fats: 20,
    },
  },
  {
    id: 'ground_beef_lean',
    name: 'Ground Beef (90/10)',
    category: 'protein',
    subcategory: 'beef',
    per100g: {
      calories: 176,
      protein: 20,
      carbs: 0,
      fats: 10,
    },
  },
  {
    id: 'steak_sirloin',
    name: 'Sirloin Steak',
    category: 'protein',
    subcategory: 'beef',
    per100g: {
      calories: 271,
      protein: 25,
      carbs: 0,
      fats: 18,
    },
  },
  {
    id: 'salmon',
    name: 'Salmon',
    category: 'protein',
    subcategory: 'fish',
    per100g: {
      calories: 208,
      protein: 20,
      carbs: 0,
      fats: 13,
    },
  },
  {
    id: 'tuna',
    name: 'Tuna',
    category: 'protein',
    subcategory: 'fish',
    per100g: {
      calories: 144,
      protein: 30,
      carbs: 0,
      fats: 1,
    },
  },
  {
    id: 'tilapia',
    name: 'Tilapia',
    category: 'protein',
    subcategory: 'fish',
    per100g: {
      calories: 129,
      protein: 26,
      carbs: 0,
      fats: 2.7,
    },
  },
  {
    id: 'pork_chop',
    name: 'Pork Chop',
    category: 'protein',
    subcategory: 'pork',
    per100g: {
      calories: 231,
      protein: 25.7,
      carbs: 0,
      fats: 13.9,
    },
  },
  {
    id: 'turkey_breast',
    name: 'Turkey Breast',
    category: 'protein',
    subcategory: 'poultry',
    per100g: {
      calories: 135,
      protein: 30,
      carbs: 0,
      fats: 1,
    },
  },

  // Proteins - Eggs & Dairy
  {
    id: 'eggs_whole',
    name: 'Whole Eggs',
    category: 'protein',
    subcategory: 'eggs',
    per100g: {
      calories: 155,
      protein: 13,
      carbs: 1.1,
      fats: 11,
    },
  },
  {
    id: 'egg_whites',
    name: 'Egg Whites',
    category: 'protein',
    subcategory: 'eggs',
    per100g: {
      calories: 52,
      protein: 11,
      carbs: 0.7,
      fats: 0.2,
    },
  },
  {
    id: 'greek_yogurt',
    name: 'Greek Yogurt (Non-fat)',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 59,
      protein: 10,
      carbs: 3.6,
      fats: 0.4,
    },
  },
  {
    id: 'cottage_cheese',
    name: 'Cottage Cheese (Low-fat)',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 72,
      protein: 12,
      carbs: 4.3,
      fats: 1,
    },
  },
  {
    id: 'milk_whole',
    name: 'Whole Milk',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 61,
      protein: 3.2,
      carbs: 4.8,
      fats: 3.3,
    },
  },
  {
    id: 'milk_skim',
    name: 'Skim Milk',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 34,
      protein: 3.4,
      carbs: 5,
      fats: 0.1,
    },
  },
  {
    id: 'cheese_cheddar',
    name: 'Cheddar Cheese',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 403,
      protein: 25,
      carbs: 1.3,
      fats: 33,
    },
  },
  {
    id: 'cheese_mozzarella',
    name: 'Mozzarella Cheese',
    category: 'protein',
    subcategory: 'dairy',
    per100g: {
      calories: 280,
      protein: 28,
      carbs: 2.2,
      fats: 17,
    },
  },

  // Carbs - Grains
  {
    id: 'white_rice_cooked',
    name: 'White Rice (Cooked)',
    category: 'carbs',
    subcategory: 'grains',
    per100g: {
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fats: 0.3,
    },
  },
  {
    id: 'brown_rice_cooked',
    name: 'Brown Rice (Cooked)',
    category: 'carbs',
    subcategory: 'grains',
    per100g: {
      calories: 112,
      protein: 2.6,
      carbs: 24,
      fats: 0.9,
    },
  },
  {
    id: 'pasta_cooked',
    name: 'Pasta (Cooked)',
    category: 'carbs',
    subcategory: 'grains',
    per100g: {
      calories: 131,
      protein: 5,
      carbs: 25,
      fats: 1.1,
    },
  },
  {
    id: 'quinoa_cooked',
    name: 'Quinoa (Cooked)',
    category: 'carbs',
    subcategory: 'grains',
    per100g: {
      calories: 120,
      protein: 4.4,
      carbs: 21,
      fats: 1.9,
    },
  },
  {
    id: 'oats_dry',
    name: 'Oats (Dry)',
    category: 'carbs',
    subcategory: 'grains',
    per100g: {
      calories: 389,
      protein: 16.9,
      carbs: 66,
      fats: 6.9,
    },
  },
  {
    id: 'bread_white',
    name: 'White Bread',
    category: 'carbs',
    subcategory: 'bread',
    per100g: {
      calories: 265,
      protein: 9,
      carbs: 49,
      fats: 3.2,
    },
  },
  {
    id: 'bread_whole_wheat',
    name: 'Whole Wheat Bread',
    category: 'carbs',
    subcategory: 'bread',
    per100g: {
      calories: 247,
      protein: 13,
      carbs: 41,
      fats: 3.4,
    },
  },

  // Carbs - Potatoes
  {
    id: 'potato_baked',
    name: 'Baked Potato',
    category: 'carbs',
    subcategory: 'potato',
    per100g: {
      calories: 93,
      protein: 2.5,
      carbs: 21,
      fats: 0.1,
    },
  },
  {
    id: 'sweet_potato',
    name: 'Sweet Potato',
    category: 'carbs',
    subcategory: 'potato',
    per100g: {
      calories: 86,
      protein: 1.6,
      carbs: 20,
      fats: 0.1,
    },
  },

  // Fruits
  {
    id: 'banana',
    name: 'Banana',
    category: 'carbs',
    subcategory: 'fruit',
    per100g: {
      calories: 89,
      protein: 1.1,
      carbs: 23,
      fats: 0.3,
    },
  },
  {
    id: 'apple',
    name: 'Apple',
    category: 'carbs',
    subcategory: 'fruit',
    per100g: {
      calories: 52,
      protein: 0.3,
      carbs: 14,
      fats: 0.2,
    },
  },
  {
    id: 'orange',
    name: 'Orange',
    category: 'carbs',
    subcategory: 'fruit',
    per100g: {
      calories: 47,
      protein: 0.9,
      carbs: 12,
      fats: 0.1,
    },
  },
  {
    id: 'strawberries',
    name: 'Strawberries',
    category: 'carbs',
    subcategory: 'fruit',
    per100g: {
      calories: 32,
      protein: 0.7,
      carbs: 8,
      fats: 0.3,
    },
  },
  {
    id: 'blueberries',
    name: 'Blueberries',
    category: 'carbs',
    subcategory: 'fruit',
    per100g: {
      calories: 57,
      protein: 0.7,
      carbs: 14,
      fats: 0.3,
    },
  },

  // Vegetables
  {
    id: 'broccoli',
    name: 'Broccoli',
    category: 'vegetables',
    subcategory: 'green',
    per100g: {
      calories: 34,
      protein: 2.8,
      carbs: 7,
      fats: 0.4,
    },
  },
  {
    id: 'spinach',
    name: 'Spinach',
    category: 'vegetables',
    subcategory: 'green',
    per100g: {
      calories: 23,
      protein: 2.9,
      carbs: 3.6,
      fats: 0.4,
    },
  },
  {
    id: 'carrots',
    name: 'Carrots',
    category: 'vegetables',
    subcategory: 'root',
    per100g: {
      calories: 41,
      protein: 0.9,
      carbs: 10,
      fats: 0.2,
    },
  },
  {
    id: 'tomatoes',
    name: 'Tomatoes',
    category: 'vegetables',
    subcategory: 'other',
    per100g: {
      calories: 18,
      protein: 0.9,
      carbs: 3.9,
      fats: 0.2,
    },
  },
  {
    id: 'bell_pepper',
    name: 'Bell Pepper',
    category: 'vegetables',
    subcategory: 'other',
    per100g: {
      calories: 31,
      protein: 1,
      carbs: 6,
      fats: 0.3,
    },
  },

  // Fats
  {
    id: 'avocado',
    name: 'Avocado',
    category: 'fats',
    subcategory: 'fruit',
    per100g: {
      calories: 160,
      protein: 2,
      carbs: 9,
      fats: 15,
    },
  },
  {
    id: 'olive_oil',
    name: 'Olive Oil',
    category: 'fats',
    subcategory: 'oil',
    per100g: {
      calories: 884,
      protein: 0,
      carbs: 0,
      fats: 100,
    },
  },
  {
    id: 'butter',
    name: 'Butter',
    category: 'fats',
    subcategory: 'dairy',
    per100g: {
      calories: 717,
      protein: 0.9,
      carbs: 0.1,
      fats: 81,
    },
  },
  {
    id: 'almonds',
    name: 'Almonds',
    category: 'fats',
    subcategory: 'nuts',
    per100g: {
      calories: 579,
      protein: 21,
      carbs: 22,
      fats: 50,
    },
  },
  {
    id: 'peanut_butter',
    name: 'Peanut Butter',
    category: 'fats',
    subcategory: 'nuts',
    per100g: {
      calories: 588,
      protein: 25,
      carbs: 20,
      fats: 50,
    },
  },
  {
    id: 'walnuts',
    name: 'Walnuts',
    category: 'fats',
    subcategory: 'nuts',
    per100g: {
      calories: 654,
      protein: 15,
      carbs: 14,
      fats: 65,
    },
  },

  // Protein Supplements
  {
    id: 'whey_protein',
    name: 'Whey Protein Powder',
    category: 'supplements',
    subcategory: 'protein',
    per100g: {
      calories: 400,
      protein: 80,
      carbs: 8,
      fats: 5,
    },
  },
];

export const FOOD_CATEGORIES = {
  protein: { label: 'Proteins', color: 'red' },
  carbs: { label: 'Carbs', color: 'amber' },
  vegetables: { label: 'Vegetables', color: 'green' },
  fats: { label: 'Fats', color: 'yellow' },
  supplements: { label: 'Supplements', color: 'purple' },
};

// Helper to search foods
export const searchFoods = (query) => {
  if (!query || query.trim().length === 0) {
    return FOOD_DATABASE;
  }

  const lowerQuery = query.toLowerCase();
  return FOOD_DATABASE.filter((food) =>
    food.name.toLowerCase().includes(lowerQuery)
  );
};

// Helper to get food by ID
export const getFoodById = (id) => {
  return FOOD_DATABASE.find((food) => food.id === id);
};
