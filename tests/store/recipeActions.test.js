import assert from 'node:assert/strict';
import test from 'node:test';

import {
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../src/store/useEnergyMapStore.js';
import { buildRecipeFood } from '../../src/utils/food/recipe.js';
import { installWindowStorage } from '../helpers/capacitorShims.js';

const originalWindow = globalThis.window;
const originalConsoleWarn = console.warn;
installWindowStorage();
console.warn = () => {};

test.after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  console.warn = originalConsoleWarn;
  globalThis.window = originalWindow;
});

let setupCompleted = false;
const ensureStoreSetup = async () => {
  if (!setupCompleted) {
    setupEnergyMapStore();
    setupCompleted = true;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (useEnergyMapStore.getState().isLoaded) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('store did not finish hydrating');
};

const state = () => useEnergyMapStore.getState();

const clearRecipes = () => {
  [...(state().userData.recipes ?? [])].forEach((recipe) =>
    state().removeRecipe(recipe.id)
  );
};

const RICE = {
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fats: 0.3,
  fiber: 0.4,
  sodium: 1,
  saturatedFats: 0.1,
  sugars: 0.1,
};

const makeRecipe = (overrides = {}) => ({
  id: 'recipe_test_1',
  name: 'Rice bowl',
  category: 'custom',
  tags: [],
  servings: 2,
  cookedWeightGrams: null,
  ingredients: [
    {
      id: 'rice',
      foodId: 'usda_rice',
      name: 'Rice',
      grams: 300,
      per100g: RICE,
    },
  ],
  portions: [],
  ...overrides,
});

test('addRecipe stores a normalised recipe and exposes it as derived state', async () => {
  await ensureStoreSetup();
  clearRecipes();

  const before = Date.now();
  assert.equal(state().addRecipe(makeRecipe({ name: '  Rice bowl  ' })), true);

  assert.equal(state().recipes.length, 1);
  assert.equal(state().recipes, state().userData.recipes);

  const [saved] = state().recipes;
  assert.equal(saved.name, 'Rice bowl');
  assert.ok(saved.createdAt >= before);
  assert.ok(saved.updatedAt >= before);
  assert.ok(buildRecipeFood(saved), 'a saved recipe must derive into a food');
});

test('addRecipe rejects recipes that cannot be priced and leaves state alone', async () => {
  await ensureStoreSetup();
  clearRecipes();
  const userDataBefore = state().userData;

  assert.equal(state().addRecipe(null), false);
  assert.equal(state().addRecipe(makeRecipe({ name: '' })), false);
  assert.equal(state().addRecipe(makeRecipe({ ingredients: [] })), false);

  assert.equal(state().userData, userDataBefore);
});

test('addRecipe with an existing id replaces instead of duplicating', async () => {
  await ensureStoreSetup();
  clearRecipes();

  state().addRecipe(makeRecipe());
  state().addRecipe(makeRecipe({ name: 'Rice bowl v2' }));

  assert.equal(state().recipes.length, 1);
  assert.equal(state().recipes[0].name, 'Rice bowl v2');
});

test('updateRecipe merges changes, keeps id and creation time, bumps updatedAt', async () => {
  await ensureStoreSetup();
  clearRecipes();

  state().addRecipe(makeRecipe());
  const original = state().recipes[0];
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(
    state().updateRecipe('recipe_test_1', {
      id: 'recipe_hijacked',
      createdAt: 1,
      servings: 3,
      name: 'Big rice bowl',
    }),
    true
  );

  const updated = state().recipes[0];
  assert.equal(updated.id, 'recipe_test_1');
  assert.equal(updated.createdAt, original.createdAt);
  assert.ok(updated.updatedAt > original.updatedAt);
  assert.equal(updated.servings, 3);
  assert.equal(updated.name, 'Big rice bowl');
  assert.equal(updated.ingredients.length, 1);
});

test('updateRecipe refuses an edit that would leave an invalid recipe', async () => {
  await ensureStoreSetup();
  clearRecipes();

  state().addRecipe(makeRecipe());
  const userDataBefore = state().userData;

  assert.equal(
    state().updateRecipe('recipe_test_1', { ingredients: [] }),
    false
  );
  assert.equal(state().updateRecipe('recipe_test_1', { name: '' }), false);
  assert.equal(state().updateRecipe('recipe_missing', { name: 'x' }), false);
  assert.equal(state().updateRecipe('recipe_test_1', null), false);

  assert.equal(state().userData, userDataBefore);
});

test('removeRecipe deletes only that recipe and is a no-op for unknown ids', async () => {
  await ensureStoreSetup();
  clearRecipes();

  state().addRecipe(makeRecipe());
  state().addRecipe(makeRecipe({ id: 'recipe_test_2', name: 'Second' }));

  const userDataBefore = state().userData;
  assert.equal(state().removeRecipe('recipe_nope'), false);
  assert.equal(state().userData, userDataBefore);

  assert.equal(state().removeRecipe('recipe_test_1'), true);
  assert.deepEqual(
    state().recipes.map((recipe) => recipe.id),
    ['recipe_test_2']
  );
});

test('recipe changes never touch logged food, so history cannot be rewritten', async () => {
  await ensureStoreSetup();
  clearRecipes();

  state().addRecipe(makeRecipe());
  const nutritionBefore = state().userData.nutritionData;
  const snapshotsBefore = state().userData.dailySnapshots;

  state().updateRecipe('recipe_test_1', { servings: 4 });
  state().removeRecipe('recipe_test_1');

  assert.equal(state().userData.nutritionData, nutritionBefore);
  assert.equal(state().userData.dailySnapshots, snapshotsBefore);
});
