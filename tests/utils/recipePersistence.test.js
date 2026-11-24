import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  saveEnergyMapData,
} from '../../src/utils/data/storage.js';
import {
  deleteHistoryDocumentsFromDexie,
  loadAllHistoryDocuments,
} from '../../src/utils/data/historyDatabase.js';
import { withWindowStorage } from '../helpers/capacitorShims.js';

const PROFILE_KEY = 'energyMapData_profile';

const clearDexieHistory = async () => {
  const snapshot = await loadAllHistoryDocuments();
  if (!snapshot.available || snapshot.documents.length === 0) {
    return;
  }

  await deleteHistoryDocumentsFromDexie(
    snapshot.documents
      .map((document) => document?.id)
      .filter((id) => typeof id === 'string')
  );
};

let originalConsoleWarn;
test.beforeEach(() => {
  originalConsoleWarn = console.warn;
  console.warn = () => {};
});
test.afterEach(() => {
  console.warn = originalConsoleWarn;
});

const RICE = { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 };

const recipe = (overrides = {}) => ({
  id: 'recipe_persisted',
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
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  ...overrides,
});

test('recipes default to an empty list', () => {
  assert.deepEqual(getDefaultEnergyMapData().recipes, []);
});

test('recipes persist in the profile payload (not Dexie history) and load back', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    await saveEnergyMapData({
      ...getDefaultEnergyMapData(),
      recipes: [recipe()],
    });

    const stored = await Preferences.get({ key: PROFILE_KEY });
    const profile = JSON.parse(stored.value);
    assert.equal(profile.recipes.length, 1);
    assert.equal(profile.recipes[0].name, 'Rice bowl');

    const loaded = await loadEnergyMapData();
    assert.equal(loaded.recipes.length, 1);
    assert.equal(loaded.recipes[0].id, 'recipe_persisted');
    assert.equal(loaded.recipes[0].servings, 2);
    assert.equal(loaded.recipes[0].ingredients[0].grams, 300);
    assert.equal(loaded.recipes[0].ingredients[0].per100g.fiber, null);
  });
});

test('loading drops corrupt recipes and duplicate ids but keeps good ones', async () => {
  await withWindowStorage(async () => {
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({
        recipes: [
          recipe(),
          recipe({ name: 'Duplicate id' }),
          { id: 'recipe_broken', name: 'No ingredients', ingredients: [] },
          'not a recipe',
          recipe({ id: 'recipe_clamped', name: 'Clamped', servings: 9999 }),
        ],
      }),
    });
    await clearDexieHistory();

    const loaded = await loadEnergyMapData();

    assert.deepEqual(
      loaded.recipes.map((item) => item.id),
      ['recipe_persisted', 'recipe_clamped']
    );
    assert.equal(loaded.recipes[0].name, 'Rice bowl');
    assert.equal(loaded.recipes[1].servings, 99);
  });
});

test('a profile saved before recipes existed loads with an empty list', async () => {
  await withWindowStorage(async () => {
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ age: 40 }),
    });
    await clearDexieHistory();

    const loaded = await loadEnergyMapData();

    assert.equal(loaded.age, 40);
    assert.deepEqual(loaded.recipes, []);
  });
});
