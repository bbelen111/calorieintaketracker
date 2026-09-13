import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runDayTurnoverSnapshots,
  runResumeDayTurnoverCatchUp,
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../src/store/useEnergyMapStore.js';
import { getPreviousDateKey } from '../../src/utils/calculations/dailySnapshots.js';

// @capacitor/preferences' web implementation reads window.localStorage, which
// does not exist in Node \u2014 mirror the shim used by tests/utils/storage.test.js.
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
  globalThis.window = { localStorage: createMemoryLocalStorage() };

  try {
    await run();
  } finally {
    globalThis.window = originalWindow;
  }
};

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const waitForLoaded = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (useEnergyMapStore.getState().isLoaded) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

let setupCompleted = false;

const ensureStoreSetup = async () => {
  if (!setupCompleted) {
    setupEnergyMapStore();
    setupCompleted = true;
  }
  assert.ok(await waitForLoaded(), 'store did not finish hydrating (isLoaded)');
};

// Suppress console.warn noise from expected Dexie-unavailable / Preferences
// warnings while the debounced save runs in the Node test environment.
let originalConsoleWarn;

test.beforeEach(() => {
  originalConsoleWarn = console.warn;
  console.warn = () => {};
});

test.afterEach(() => {
  console.warn = originalConsoleWarn;
});

test('day turnover finalizes the previous day and seeds today', async () => {
  await withWindowStorage(async () => {
    await ensureStoreSetup();

    const todayDateKey = getTodayDateKey();
    const previousDateKey = getPreviousDateKey(todayDateKey);

    runDayTurnoverSnapshots(previousDateKey, todayDateKey);

    const { userData } = useEnergyMapStore.getState();
    assert.ok(
      userData.dailySnapshots[previousDateKey],
      'previous day snapshot must exist after the turnover'
    );
    assert.ok(
      userData.dailySnapshots[todayDateKey],
      'today snapshot must exist after the turnover'
    );
    assert.equal(userData.dailySnapshots[todayDateKey].date, todayDateKey);
    assert.equal(
      userData.dailySnapshots[previousDateKey].date,
      previousDateKey
    );
  });
});

test('day turnover is idempotent - repeated calls do not churn state', async () => {
  await withWindowStorage(async () => {
    await ensureStoreSetup();

    const todayDateKey = getTodayDateKey();
    const previousDateKey = getPreviousDateKey(todayDateKey);

    runDayTurnoverSnapshots(previousDateKey, todayDateKey);
    const before = useEnergyMapStore.getState().userData;

    // Repeated turnover must be a no-op: the rebuilt snapshot has to compare
    // equivalent to the stored one (metadata excluded). If rebuilds ever
    // diverge, the midnight rollover would recurse forever - the exact
    // mechanism that froze the app at the 12:00 AM turnover.
    runDayTurnoverSnapshots(previousDateKey, todayDateKey);
    runDayTurnoverSnapshots(previousDateKey, todayDateKey);
    const after = useEnergyMapStore.getState().userData;

    assert.equal(after, before, 'userData reference must be unchanged');
  });
});

test('day turnover ignores invalid date keys without throwing', async () => {
  await withWindowStorage(async () => {
    await ensureStoreSetup();

    const before = useEnergyMapStore.getState().userData;

    assert.doesNotThrow(() => {
      runDayTurnoverSnapshots('garbage', 'garbage');
      runDayTurnoverSnapshots(null, null);
    });

    // Regex-invalid keys must be dropped by normalizeDateKey - never written.
    assert.equal(
      useEnergyMapStore.getState().userData.dailySnapshots.garbage,
      undefined
    );
    assert.equal(
      useEnergyMapStore.getState().userData,
      before,
      'invalid keys must not churn the store'
    );
  });
});

test('turnover reflects new data logged for the previous day', async () => {
  await withWindowStorage(async () => {
    await ensureStoreSetup();

    const todayDateKey = getTodayDateKey();
    const previousDateKey = getPreviousDateKey(todayDateKey);

    runDayTurnoverSnapshots(previousDateKey, todayDateKey);
    const baseline =
      useEnergyMapStore.getState().userData.dailySnapshots[previousDateKey];

    useEnergyMapStore.getState().addCardioSession({
      date: previousDateKey,
      type: 'treadmill_walk',
      duration: 30,
      intensity: 'moderate',
      effortType: 'intensity',
    });

    runDayTurnoverSnapshots(previousDateKey, todayDateKey);
    const updated =
      useEnergyMapStore.getState().userData.dailySnapshots[previousDateKey];

    assert.ok(updated, 'previous day snapshot must exist');
    assert.ok(
      updated.cardioBurn > baseline.cardioBurn,
      'finalized snapshot must pick up the newly logged cardio burn'
    );
  });
});

test('resume catch-up seeds snapshots and marks the observed day current', async () => {
  await withWindowStorage(async () => {
    await ensureStoreSetup();

    const result = runResumeDayTurnoverCatchUp();
    assert.equal(result, true);

    const todayDateKey = getTodayDateKey();
    const previousDateKey = getPreviousDateKey(todayDateKey);
    const { userData } = useEnergyMapStore.getState();

    assert.ok(
      userData.dailySnapshots[previousDateKey],
      'resume catch-up must finalize the previous day'
    );
    assert.ok(
      userData.dailySnapshots[todayDateKey],
      'resume catch-up must seed today'
    );

    // Calling it again is safe and stays current (no re-rollover churn).
    const before = useEnergyMapStore.getState().userData;
    runResumeDayTurnoverCatchUp();
    assert.equal(useEnergyMapStore.getState().userData, before);
  });
});
