import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECIPE_ID_PREFIX,
  RECIPE_MAX_SERVINGS,
  RECIPE_SERVING_PORTION_ID,
  buildRecipeFood,
  buildRecipeIngredient,
  computeRecipeTotals,
  createRecipeId,
  favouriteToIngredientFood,
  getRecipeIngredientCalories,
  getRecipePerServing,
  getRecipeServingGrams,
  getRecipeStartGrams,
  isRecipeFood,
  isRecipeId,
  normalizeRecipe,
  normalizeRecipes,
  validateRecipeDraft,
} from '../../src/utils/food/recipe.js';
import { scaleMacrosFromPer100g } from '../../src/utils/food/portionNormalization.js';

const BEEF_PER_100G = {
  calories: 250,
  protein: 26,
  carbs: 0,
  fats: 15,
  fiber: 0,
  sodium: 72,
  saturatedFats: 6,
  sugars: 0,
};

const RICE_PER_100G = {
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fats: 0.3,
  fiber: 0.4,
  sodium: 1,
  saturatedFats: 0.1,
  sugars: 0.1,
};

const ingredient = (id, name, grams, per100g, extra = {}) => ({
  id,
  foodId: `food_${id}`,
  name,
  grams,
  per100g,
  ...extra,
});

const beefBowl = (overrides = {}) => ({
  id: 'recipe_beef_bowl',
  name: 'Beef bowl',
  category: 'custom',
  tags: [],
  servings: 2,
  cookedWeightGrams: null,
  ingredients: [
    ingredient('beef', 'Beef', 150, BEEF_PER_100G),
    ingredient('rice', 'Rice', 200, RICE_PER_100G),
  ],
  portions: [],
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: null,
  ...overrides,
});

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

test('computeRecipeTotals sums ingredient contributions at full precision', () => {
  const totals = computeRecipeTotals(beefBowl());

  assert.equal(totals.ingredientCount, 2);
  assert.equal(totals.ingredientGrams, 350);
  assert.equal(totals.totalGrams, 350);
  approx(totals.calories, 635); // 150 g beef = 375, 200 g rice = 260
  approx(totals.protein, 44.4);
  approx(totals.carbs, 56);
  approx(totals.fats, 23.1);
  approx(totals.fiber, 0.8);
  approx(totals.sodium, 110);
});

test('computeRecipeTotals uses the cooked weight for totalGrams only', () => {
  const totals = computeRecipeTotals(beefBowl({ cookedWeightGrams: 300 }));

  assert.equal(totals.ingredientGrams, 350);
  assert.equal(totals.totalGrams, 300);
  approx(totals.calories, 635);
});

test('computeRecipeTotals skips unusable ingredients and tolerates junk input', () => {
  const totals = computeRecipeTotals({
    ingredients: [
      ingredient('ok', 'Rice', 100, RICE_PER_100G),
      ingredient('zero', 'Nothing', 0, RICE_PER_100G),
      { id: 'no-nutrition', name: 'Mystery', grams: 50 },
      null,
    ],
  });

  assert.equal(totals.ingredientCount, 1);
  approx(totals.calories, 130);

  const empty = computeRecipeTotals(undefined);
  assert.equal(empty.ingredientCount, 0);
  assert.equal(empty.totalGrams, 0);
  assert.equal(empty.fiber, null);
});

test('a micro nutrient is null as soon as any ingredient has none for it', () => {
  const totals = computeRecipeTotals(
    beefBowl({
      ingredients: [
        ingredient('beef', 'Beef', 150, BEEF_PER_100G),
        ingredient('sauce', 'Mystery sauce', 30, {
          ...RICE_PER_100G,
          fiber: null,
          sodium: 900,
        }),
      ],
    })
  );

  assert.equal(totals.fiber, null, 'untracked fiber must not read as a sum');
  approx(totals.sodium, 72 * 1.5 + 900 * 0.3);
  assert.notEqual(totals.saturatedFats, null);
});

test('a measured zero stays zero rather than becoming untracked', () => {
  const totals = computeRecipeTotals(
    beefBowl({ ingredients: [ingredient('beef', 'Beef', 100, BEEF_PER_100G)] })
  );

  assert.equal(totals.fiber, 0);
  assert.equal(totals.sugars, 0);
});

test('buildRecipeFood flattens a recipe into an ordinary food', () => {
  const food = buildRecipeFood(beefBowl());

  assert.equal(food.id, 'recipe_beef_bowl');
  assert.equal(food.name, 'Beef bowl');
  assert.equal(food.source, 'recipe');
  assert.equal(food.isRecipe, true);
  assert.equal(food.isCustom, true);
  assert.ok(food.tags.includes('recipe'));
  assert.equal(food.servings, 2);
  assert.equal(food.servingGrams, 175);
  assert.equal(food.totalGrams, 350);
  assert.equal(food.ingredientCount, 2);

  // 635 kcal over 350 g, kept at 3 decimals (not rounded to a whole number).
  assert.equal(food.per100g.calories, 181.429);
  assert.equal(food.per100g.fiber, 0.229);
  assert.equal(food.portions[0].id, RECIPE_SERVING_PORTION_ID);
  assert.equal(food.portions[0].label, '1 serving');
  assert.equal(food.portions[0].grams, 175);
});

test('logging one serving gives the per-serving calories within rounding', () => {
  const recipe = beefBowl();
  const food = buildRecipeFood(recipe);
  const logged = scaleMacrosFromPer100g(food.per100g, food.portions[0].grams);

  // 635 / 2 = 317.5; the portion modal rounds to whole kcal.
  assert.ok(Math.abs(logged.calories - 317.5) <= 1);
  approx(logged.protein, 22.2, 0.1);
  assert.deepEqual(getRecipePerServing(recipe), logged);
});

test('the cooked weight changes per-100g values but not the serving', () => {
  const raw = buildRecipeFood(beefBowl());
  const cooked = buildRecipeFood(beefBowl({ cookedWeightGrams: 300 }));

  assert.notEqual(raw.per100g.calories, cooked.per100g.calories);
  assert.equal(cooked.servingGrams, 150);

  const rawServing = getRecipePerServing(beefBowl());
  const cookedServing = getRecipePerServing(
    beefBowl({ cookedWeightGrams: 300 })
  );
  assert.ok(Math.abs(rawServing.calories - cookedServing.calories) <= 1);
  approx(getRecipeServingGrams(beefBowl({ cookedWeightGrams: 300 })), 150);
});

test('buildRecipeFood keeps extra user portions after the serving portion', () => {
  const food = buildRecipeFood(
    beefBowl({
      portions: [
        { id: 'bowl', label: 'Big bowl', grams: 400 },
        { id: RECIPE_SERVING_PORTION_ID, label: 'Sneaky', grams: 1 },
        { id: 'bad', label: '', grams: 100 },
      ],
    })
  );

  assert.deepEqual(
    food.portions.map((portion) => portion.id),
    [RECIPE_SERVING_PORTION_ID, 'bowl']
  );
});

test('buildRecipeFood returns null for recipes that cannot be priced', () => {
  assert.equal(buildRecipeFood(null), null);
  assert.equal(buildRecipeFood(beefBowl({ name: '   ' })), null);
  assert.equal(buildRecipeFood(beefBowl({ ingredients: [] })), null);
  assert.equal(
    buildRecipeFood(
      beefBowl({ ingredients: [ingredient('x', 'X', 0, BEEF_PER_100G)] })
    ),
    null
  );
});

test('normalizeRecipe clamps servings and drops bad optional fields', () => {
  assert.equal(
    normalizeRecipe(beefBowl({ servings: 500 })).servings,
    RECIPE_MAX_SERVINGS
  );
  assert.equal(normalizeRecipe(beefBowl({ servings: 0 })).servings, 1);
  assert.equal(normalizeRecipe(beefBowl({ servings: 'abc' })).servings, 1);
  assert.equal(normalizeRecipe(beefBowl({ servings: 2.6 })).servings, 3);
  assert.equal(
    normalizeRecipe(beefBowl({ cookedWeightGrams: -5 })).cookedWeightGrams,
    null
  );
  assert.equal(
    normalizeRecipe(beefBowl({ cookedWeightGrams: '420' })).cookedWeightGrams,
    420
  );
  assert.equal(normalizeRecipe(beefBowl({ category: '' })).category, 'custom');
});

test('normalizeRecipe rejects recipes with no id, name or usable ingredient', () => {
  assert.equal(normalizeRecipe(null), null);
  assert.equal(normalizeRecipe('beef'), null);
  assert.equal(normalizeRecipe(beefBowl({ id: '' })), null);
  assert.equal(normalizeRecipe(beefBowl({ name: '' })), null);
  assert.equal(
    normalizeRecipe(
      beefBowl({
        ingredients: [
          { id: 'a', name: 'A', grams: 100 },
          ingredient('b', 'B', -1, BEEF_PER_100G),
        ],
      })
    ),
    null
  );
});

test('normalizeRecipe preserves a null micro and zeroes bad macros', () => {
  const recipe = normalizeRecipe(
    beefBowl({
      ingredients: [
        ingredient('a', 'A', 100, {
          calories: 'junk',
          protein: -4,
          carbs: 10,
          fats: null,
          fiber: null,
          sodium: '55',
        }),
      ],
    })
  );

  const { per100g } = recipe.ingredients[0];
  assert.equal(per100g.calories, 0);
  assert.equal(per100g.protein, 0);
  assert.equal(per100g.carbs, 10);
  assert.equal(per100g.fats, 0);
  assert.equal(per100g.fiber, null);
  assert.equal(per100g.sodium, 55);
  assert.equal(per100g.sugars, null);
});

test('normalizeRecipes drops invalid rows and duplicate ids', () => {
  const list = normalizeRecipes([
    beefBowl(),
    beefBowl({ name: 'Duplicate id' }),
    { nope: true },
    beefBowl({ id: 'recipe_two', name: 'Second' }),
  ]);

  assert.deepEqual(
    list.map((recipe) => recipe.name),
    ['Beef bowl', 'Second']
  );
  assert.deepEqual(normalizeRecipes(undefined), []);
  assert.deepEqual(normalizeRecipes('x'), []);
});

test('validateRecipeDraft reports every missing piece of an empty draft', () => {
  const result = validateRecipeDraft({
    name: ' ',
    servings: 1,
    ingredients: [],
  });

  assert.equal(result.isValid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.ingredients);
});

test('validateRecipeDraft accepts a complete draft', () => {
  const result = validateRecipeDraft(beefBowl());

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.totalGrams, 350);
  assert.equal(result.servingGrams, 175);
});

test('validateRecipeDraft blocks servings that outgrow the 1000 g wheel', () => {
  const heavy = (servings) => ({
    name: 'Stew',
    servings,
    ingredients: [ingredient('stew', 'Stew base', 1500, RICE_PER_100G)],
  });

  const one = validateRecipeDraft(heavy(1));
  assert.equal(one.isValid, false);
  assert.ok(one.errors.servingWeight);
  assert.equal(one.suggestedServings, 2);

  assert.equal(validateRecipeDraft(heavy(2)).isValid, true);
});

test('validateRecipeDraft validates servings and cooked weight bounds', () => {
  assert.ok(validateRecipeDraft(beefBowl({ servings: 0 })).errors.servings);
  assert.ok(validateRecipeDraft(beefBowl({ servings: 100 })).errors.servings);
  assert.ok(
    validateRecipeDraft(beefBowl({ cookedWeightGrams: -1 })).errors.cookedWeight
  );
  assert.equal(
    validateRecipeDraft(beefBowl({ cookedWeightGrams: '' })).isValid,
    true
  );
  assert.equal(
    validateRecipeDraft(beefBowl({ cookedWeightGrams: null })).isValid,
    true
  );
});

test('buildRecipeIngredient snapshots a picked food', () => {
  const built = buildRecipeIngredient({
    food: {
      id: 'usda_123',
      name: 'Chicken breast, raw',
      brand: null,
      source: null,
      category: 'protein',
      per100g: BEEF_PER_100G,
    },
    grams: 123.46,
    portionLabel: '1 fillet',
  });

  assert.match(built.id, /^ingredient_/);
  assert.equal(built.foodId, 'usda_123');
  assert.equal(built.name, 'Chicken breast, raw');
  assert.equal(built.grams, 123.5);
  assert.equal(built.portionLabel, '1 fillet');
  assert.notEqual(
    built.per100g,
    BEEF_PER_100G,
    'must be a copy, not a reference'
  );
  assert.deepEqual(built.per100g, BEEF_PER_100G);
});

test('buildRecipeIngredient rejects foods without usable nutrition or weight', () => {
  assert.equal(
    buildRecipeIngredient({ food: { id: 'a', name: 'A' }, grams: 100 }),
    null
  );
  assert.equal(
    buildRecipeIngredient({
      food: { id: 'a', name: 'A', per100g: BEEF_PER_100G },
      grams: 0,
    }),
    null
  );
  assert.equal(buildRecipeIngredient(), null);
});

test('recipe id and food helpers', () => {
  const first = createRecipeId();
  const second = createRecipeId();

  assert.ok(first.startsWith(RECIPE_ID_PREFIX));
  assert.notEqual(first, second);
  assert.equal(isRecipeId(first), true);
  assert.equal(isRecipeId('user_123'), false);
  assert.equal(isRecipeId(null), false);

  assert.equal(isRecipeFood({ isRecipe: true }), true);
  assert.equal(isRecipeFood({ source: 'recipe' }), true);
  assert.equal(isRecipeFood({ source: 'user', isCustom: true }), false);
  assert.equal(isRecipeFood(null), false);
});

test('getRecipeStartGrams opens a recipe on one serving, and only a recipe', () => {
  const food = buildRecipeFood(beefBowl());

  assert.equal(getRecipeStartGrams(food), 175);
  assert.equal(
    getRecipeStartGrams({ id: 'usda_rice', per100g: RICE_PER_100G }),
    null
  );
  assert.equal(getRecipeStartGrams(null), null);
  assert.equal(
    getRecipeStartGrams({ isRecipe: true }),
    null,
    'no serving weight yet'
  );
});

test('getRecipeStartGrams never starts past the portion wheel', () => {
  const huge = { isRecipe: true, servingGrams: 2500 };

  assert.equal(getRecipeStartGrams(huge), 1000);
});

test('favouriteToIngredientFood prefers the stored per-100g basis', () => {
  const food = favouriteToIngredientFood({
    id: 1700000000000,
    foodId: 'usda_chicken',
    name: 'Chicken breast',
    category: 'protein',
    grams: 200,
    calories: 999,
    per100g: BEEF_PER_100G,
    portions: [{ id: 'p', label: '1 fillet', grams: 150 }],
  });

  assert.equal(food.id, 'usda_chicken');
  assert.equal(food.per100g.calories, 250);
  assert.equal(food.portions.length, 1);
});

test('favouriteToIngredientFood scales legacy favourites back to 100 g', () => {
  const food = favouriteToIngredientFood({
    id: 42,
    name: 'Old favourite',
    grams: 50,
    calories: 100,
    protein: 10,
    carbs: 5,
    fats: 2,
    fiber: 1,
    sodium: null,
  });

  assert.equal(food.id, 'favourite_42');
  assert.equal(food.per100g.calories, 200);
  assert.equal(food.per100g.protein, 20);
  assert.equal(food.per100g.fiber, 2);
  assert.equal(food.per100g.sodium, null, 'untracked must stay untracked');
});

test('favouriteToIngredientFood skips weightless manual entries and recipes', () => {
  assert.equal(
    favouriteToIngredientFood({
      id: 1,
      name: 'Protein bar',
      calories: 200,
      grams: null,
    }),
    null
  );
  assert.equal(
    favouriteToIngredientFood({ foodId: 'recipe_abc', per100g: BEEF_PER_100G }),
    null
  );
  assert.equal(
    favouriteToIngredientFood({ isRecipe: true, per100g: BEEF_PER_100G }),
    null
  );
  assert.equal(favouriteToIngredientFood(null), null);
});

test('getRecipeIngredientCalories rounds to whole kcal and never goes negative', () => {
  assert.equal(
    getRecipeIngredientCalories(ingredient('beef', 'Beef', 150, BEEF_PER_100G)),
    375
  );
  assert.equal(
    getRecipeIngredientCalories(ingredient('rice', 'Rice', 33, RICE_PER_100G)),
    43
  );
  assert.equal(getRecipeIngredientCalories({ grams: 100 }), 0);
  assert.equal(getRecipeIngredientCalories(null), 0);
});
