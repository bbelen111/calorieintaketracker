import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  saveEnergyMapData,
} from '../../src/utils/storage.js';

const PROFILE_KEY = 'energyMapData_profile';
const HISTORY_KEY = 'energyMapData_history';

const createMemoryLocalStorage = () => {
  const store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
};

const withWindowStorage = async (run) => {
  const originalWindow = globalThis.window;
  const localStorage = createMemoryLocalStorage();
  globalThis.window = { localStorage };

  try {
    await run({ localStorage });
  } finally {
    globalThis.window = originalWindow;
  }
};

test('saveEnergyMapData writes split profile and history payloads', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await Preferences.remove({ key: HISTORY_KEY });

    const payload = {
      ...getDefaultEnergyMapData(),
      age: 29,
      theme: 'dark',
      weightEntries: [{ date: '2026-03-20', weight: 80.5 }],
    };

    await saveEnergyMapData(payload);

    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const historyRes = await Preferences.get({ key: HISTORY_KEY });

    assert.ok(profileRes.value, 'Expected profile payload to be persisted');
    assert.ok(historyRes.value, 'Expected history payload to be persisted');

    const profile = JSON.parse(profileRes.value);
    const history = JSON.parse(historyRes.value);

    assert.equal(profile.age, 29);
    assert.equal(profile.theme, 'dark');
    assert.equal(profile.weightEntries, undefined);
    assert.equal(profile.cachedFoods, undefined);

    assert.deepEqual(history.weightEntries, [
      { date: '2026-03-20', weight: 80.5 },
    ]);
    assert.ok(Array.isArray(history.cardioSessions));
    assert.ok(Array.isArray(history.cachedFoods));
  });
});

test('loadEnergyMapData returns defaults when storage is empty', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await Preferences.remove({ key: HISTORY_KEY });

    const loaded = await loadEnergyMapData();
    const defaults = getDefaultEnergyMapData();

    assert.equal(loaded.age, defaults.age);
    assert.equal(loaded.height, defaults.height);
    assert.deepEqual(loaded.weightEntries, defaults.weightEntries);
    assert.deepEqual(loaded.nutritionData, defaults.nutritionData);
  });
});

test('loadEnergyMapData merges profile and history from Preferences fallback', async () => {
  await withWindowStorage(async () => {
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ age: 34, theme: 'light', stepGoal: 12000 }),
    });

    await Preferences.set({
      key: HISTORY_KEY,
      value: JSON.stringify({
        weightEntries: [{ date: '2026-03-21', weight: 81 }],
        nutritionData: {
          '2026-03-21': {
            breakfast: [
              {
                id: 'food-1',
                name: 'Eggs',
                calories: 155,
                protein: 13,
                carbs: 1,
                fats: 11,
              },
            ],
          },
        },
      }),
    });

    const loaded = await loadEnergyMapData();

    assert.equal(loaded.age, 34);
    assert.equal(loaded.theme, 'light');
    assert.equal(loaded.stepGoal, 12000);
    assert.deepEqual(loaded.weightEntries, [
      { date: '2026-03-21', weight: 81 },
    ]);
    assert.equal(loaded.nutritionData['2026-03-21'].breakfast[0].name, 'Eggs');
    assert.equal(
      loaded.nutritionData['2026-03-21'].breakfast[0].grams,
      null,
      'Nutrition entries should be normalized with grams key'
    );
  });
});

test('saveEnergyMapData falls back to Preferences history write without warning when Dexie is unavailable', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await Preferences.remove({ key: HISTORY_KEY });

    const originalWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => {
      warnCalls.push(args);
    };

    try {
      await saveEnergyMapData({
        ...getDefaultEnergyMapData(),
        age: 26,
        weightEntries: [{ date: '2026-03-21', weight: 77.4 }],
      });
    } finally {
      console.warn = originalWarn;
    }

    const failureWarn = warnCalls.find(
      (args) => args[0] === 'One or more storage save operations failed'
    );

    assert.equal(
      failureWarn,
      undefined,
      'Did not expect warning when fallback write succeeds'
    );

    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const historyRes = await Preferences.get({ key: HISTORY_KEY });
    assert.ok(profileRes.value, 'Profile write should still succeed');
    assert.ok(historyRes.value, 'Legacy dual-write should still succeed');
  });
});

test('saveEnergyMapData trims and deduplicates cached foods before persisting', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await Preferences.remove({ key: HISTORY_KEY });

    const cachedFoods = Array.from({ length: 650 }, (_, index) => ({
      id: `food-${index % 420}`,
      name: `Food ${index % 420}`,
      calories: 100 + (index % 50),
      timestamp: 1700000000000 + index,
    }));

    await saveEnergyMapData({
      ...getDefaultEnergyMapData(),
      age: 31,
      cachedFoods,
    });

    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    const historyRes = await Preferences.get({ key: HISTORY_KEY });

    assert.ok(profileRes.value, 'Expected profile payload to be persisted');
    assert.ok(historyRes.value, 'Expected history payload to be persisted');

    const profile = JSON.parse(profileRes.value);
    const history = JSON.parse(historyRes.value);

    assert.equal(
      profile.cachedFoods,
      undefined,
      'cachedFoods should not be persisted in profile payload'
    );

    assert.ok(Array.isArray(history.cachedFoods));
    assert.ok(
      history.cachedFoods.length <= 500,
      'cachedFoods should be capped to MAX_CACHED_FOODS'
    );

    const ids = history.cachedFoods.map((food) => food?.id).filter(Boolean);
    assert.equal(
      ids.length,
      new Set(ids).size,
      'cachedFoods should be deduplicated by identity'
    );
  });
});

test('saveEnergyMapData skips redundant Preferences writes for unchanged payloads', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await Preferences.remove({ key: HISTORY_KEY });

    const originalSet = Preferences.set.bind(Preferences);
    const setCalls = [];

    Preferences.set = async (args) => {
      setCalls.push(args?.key);
      return originalSet(args);
    };

    try {
      const payload = {
        ...getDefaultEnergyMapData(),
        age: 52,
        weightEntries: [{ date: '2026-03-22', weight: 79.2 }],
      };

      await saveEnergyMapData(payload);
      const firstSaveCallCount = setCalls.length;

      await saveEnergyMapData(payload);

      assert.equal(
        setCalls.length,
        firstSaveCallCount,
        'Second save with unchanged payload should not trigger additional Preferences writes'
      );
    } finally {
      Preferences.set = originalSet;
    }
  });
});
