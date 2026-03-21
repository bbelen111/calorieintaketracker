import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  saveEnergyMapData,
} from '../../src/utils/storage.js';
import {
  deleteHistoryDocumentsFromDexie,
  loadAllHistoryDocuments,
} from '../../src/utils/historyDatabase.js';

const PROFILE_KEY = 'energyMapData_profile';

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

test('saveEnergyMapData writes profile payload and attempts Dexie history persistence', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      age: 29,
      theme: 'dark',
      weightEntries: [{ date: '2026-03-20', weight: 80.5 }],
    };

    await saveEnergyMapData(payload);

    const profileRes = await Preferences.get({ key: PROFILE_KEY });

    assert.ok(profileRes.value, 'Expected profile payload to be persisted');

    const profile = JSON.parse(profileRes.value);

    assert.equal(profile.age, 29);
    assert.equal(profile.theme, 'dark');
    assert.equal(profile.weightEntries, undefined);
    assert.equal(profile.cachedFoods, undefined);

    const historySnapshot = await loadAllHistoryDocuments();
    if (historySnapshot.available) {
      assert.equal(
        historySnapshot.hasAnyHistory,
        true,
        'Expected Dexie history to contain persisted documents'
      );
    }
  });
});

test('loadEnergyMapData returns defaults when storage is empty', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const loaded = await loadEnergyMapData();
    const defaults = getDefaultEnergyMapData();

    assert.equal(loaded.age, defaults.age);
    assert.equal(loaded.height, defaults.height);
    assert.deepEqual(loaded.weightEntries, defaults.weightEntries);
    assert.deepEqual(loaded.nutritionData, defaults.nutritionData);
  });
});

test('loadEnergyMapData merges profile data and keeps default history when unavailable', async () => {
  await withWindowStorage(async () => {
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ age: 34, theme: 'light', stepGoal: 12000 }),
    });
    await clearDexieHistory();

    const loaded = await loadEnergyMapData();

    assert.equal(loaded.age, 34);
    assert.equal(loaded.theme, 'light');
    assert.equal(loaded.stepGoal, 12000);
    assert.deepEqual(loaded.weightEntries, []);
    assert.deepEqual(loaded.nutritionData, {});
  });
});

test('saveEnergyMapData warns when Dexie history write is unavailable', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

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

    const historySnapshot = await loadAllHistoryDocuments();
    const failureWarn = warnCalls.find(
      (args) => args[0] === 'One or more storage save operations failed'
    );

    if (historySnapshot.available) {
      assert.equal(
        failureWarn,
        undefined,
        'Did not expect warning when Dexie is available'
      );
    } else {
      assert.ok(
        failureWarn,
        'Expected warning when history persistence is unavailable'
      );
    }

    const profileRes = await Preferences.get({ key: PROFILE_KEY });
    assert.ok(profileRes.value, 'Profile write should still succeed');
  });
});

test('saveEnergyMapData trims and deduplicates cached foods before Dexie persistence', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

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

    assert.ok(profileRes.value, 'Expected profile payload to be persisted');

    const profile = JSON.parse(profileRes.value);

    assert.equal(
      profile.cachedFoods,
      undefined,
      'cachedFoods should not be persisted in profile payload'
    );

    const historySnapshot = await loadAllHistoryDocuments();
    if (historySnapshot.available) {
      const cachedFoodDocs = historySnapshot.documents.filter((document) =>
        String(document?.id).startsWith('cachedFoods:')
      );

      assert.ok(
        cachedFoodDocs.length <= 500,
        'cachedFoods should be capped to MAX_CACHED_FOODS'
      );

      const ids = cachedFoodDocs
        .map((document) => document?.payload?.entry?.id)
        .filter(Boolean);
      assert.equal(
        ids.length,
        new Set(ids).size,
        'cachedFoods should be deduplicated by identity'
      );
    }
  });
});

test('saveEnergyMapData skips redundant Preferences writes for unchanged payloads', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

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
