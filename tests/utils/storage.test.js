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
const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
    assert.equal(loaded.selectedGoal, defaults.selectedGoal);
    assert.ok(Number.isFinite(loaded.goalChangedAt));
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

test('save/loadEnergyMapData round-trips phaseLogV2 via sharded history documents', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      phaseLogV2: {
        version: 2,
        phasesById: {
          'phase-1': {
            id: 'phase-1',
            name: 'Mini Cut',
            startDate: '2026-03-01',
            goalType: 'cutting',
            status: 'active',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        },
        phaseOrder: ['phase-1'],
        activePhaseId: 'phase-1',
        logsById: {
          'phase-1:2026-03-21': {
            id: 'phase-1:2026-03-21',
            phaseId: 'phase-1',
            date: '2026-03-21',
            links: {
              weightEntryId: '2026-03-21',
              bodyFatEntryId: null,
              nutritionDayKey: '2026-03-21',
              stepEntryId: null,
              trainingSessionIds: [],
            },
            notes: 'Log note',
            metadata: {},
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        },
        logIdsByPhaseId: {
          'phase-1': ['phase-1:2026-03-21'],
        },
        logIdByPhaseDate: {
          'phase-1': {
            '2026-03-21': 'phase-1:2026-03-21',
          },
        },
      },
    };

    await saveEnergyMapData(payload);

    const historySnapshot = await loadAllHistoryDocuments();
    if (historySnapshot.available) {
      const phaseDocs = historySnapshot.documents.filter((document) =>
        String(document?.id).startsWith('phaseLogV2:')
      );
      assert.ok(
        phaseDocs.length >= 3,
        'Expected phaseLogV2 to be persisted as sharded documents'
      );
    }

    const loaded = await loadEnergyMapData();
    if (historySnapshot.available) {
      assert.equal(loaded.phaseLogV2.activePhaseId, 'phase-1');
      assert.equal(loaded.phaseLogV2.phaseOrder[0], 'phase-1');
      assert.equal(
        loaded.phaseLogV2.logsById['phase-1:2026-03-21'].notes,
        'Log note'
      );
    } else {
      assert.equal(
        loaded.phaseLogV2.activePhaseId,
        null,
        'Expected default phase state when Dexie is unavailable'
      );
    }
  });
});

test('loadEnergyMapData normalizes cardio session overlap toggle defaults for existing payloads', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    await saveEnergyMapData({
      ...getDefaultEnergyMapData(),
      cardioSessions: [
        {
          id: 1,
          date: getTodayDateKey(),
          type: 'treadmill_walk',
          duration: 30,
          intensity: 'moderate',
          effortType: 'intensity',
        },
        {
          id: 2,
          date: getTodayDateKey(),
          type: 'bike_stationary',
          duration: 30,
          intensity: 'moderate',
          effortType: 'intensity',
        },
      ],
    });

    const historySnapshot = await loadAllHistoryDocuments();
    const loaded = await loadEnergyMapData();

    if (historySnapshot.available) {
      const walk = loaded.cardioSessions.find((session) => session.id === '1');
      const bike = loaded.cardioSessions.find((session) => session.id === '2');

      assert.equal(walk?.stepOverlapEnabled, true);
      assert.equal(bike?.stepOverlapEnabled, false);
    } else {
      assert.deepEqual(loaded.cardioSessions, []);
    }
  });
});

test('save/loadEnergyMapData round-trips trainingSessions via sharded history documents', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      trainingSessions: [
        {
          id: 'train-1',
          date: getTodayDateKey(),
          type: 'trainingtype_1',
          duration: 90,
          effortType: 'intensity',
          intensity: 'moderate',
        },
      ],
    };

    await saveEnergyMapData(payload);

    const historySnapshot = await loadAllHistoryDocuments();
    if (historySnapshot.available) {
      const trainingDocs = historySnapshot.documents.filter((document) =>
        String(document?.id).startsWith('trainingSessions:')
      );
      assert.ok(trainingDocs.length >= 1);
    }

    const loaded = await loadEnergyMapData();
    if (historySnapshot.available) {
      assert.equal(loaded.trainingSessions.length, 1);
      assert.equal(loaded.trainingSessions[0].type, 'trainingtype_1');
      assert.equal(loaded.trainingSessions[0].duration, 90);
    }
  });
});

test('save/loadEnergyMapData round-trips dailySnapshots via sharded history documents', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      dailySnapshots: {
        '2026-03-20': {
          date: '2026-03-20',
          tdee: 3012,
          intake: 2200,
          deficit: 812,
          stepCount: 9876,
          isTrainingDay: true,
          bmr: 1720,
          stepCalories: 220,
          trainingBurn: 500,
          cardioBurn: 180,
          tef: 145,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      },
    };

    await saveEnergyMapData(payload);

    const historySnapshot = await loadAllHistoryDocuments();
    if (historySnapshot.available) {
      const snapshotDocs = historySnapshot.documents.filter((document) =>
        String(document?.id).startsWith('dailySnapshots:')
      );
      assert.ok(snapshotDocs.length >= 1);
    }

    const loaded = await loadEnergyMapData();
    if (historySnapshot.available) {
      assert.equal(loaded.dailySnapshots['2026-03-20']?.tdee, 3012);
      assert.equal(loaded.dailySnapshots['2026-03-20']?.deficit, 812);
    } else {
      assert.deepEqual(loaded.dailySnapshots, {});
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

test('save/loadEnergyMapData persists selectedGoal and goalChangedAt in profile scope', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      selectedGoal: 'cutting',
      goalChangedAt: 1700000000000,
      weightEntries: [{ date: '2026-03-22', weight: 79.2 }],
    };

    await saveEnergyMapData(payload);

    const loaded = await loadEnergyMapData();
    assert.equal(loaded.selectedGoal, 'cutting');
    assert.equal(loaded.goalChangedAt, 1700000000000);
  });
});

test('save/loadEnergyMapData persists adaptive thermogenesis profile fields', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await clearDexieHistory();

    const payload = {
      ...getDefaultEnergyMapData(),
      adaptiveThermogenesisEnabled: true,
      adaptiveThermogenesisSmartMode: true,
      weightEntries: [{ date: '2026-03-22', weight: 79.2 }],
    };

    await saveEnergyMapData(payload);

    const loaded = await loadEnergyMapData();
    assert.equal(loaded.adaptiveThermogenesisEnabled, true);
    assert.equal(loaded.adaptiveThermogenesisSmartMode, true);
  });
});
