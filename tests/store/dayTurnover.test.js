import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runDayTurnoverSnapshots,
  runResumeDayTurnoverCatchUp,
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../src/store/useEnergyMapStore.js';
import { getPreviousDateKey } from '../../src/utils/calculations/dailySnapshots.js';
import {
  getTodayDateKey,
  installWindowStorage,
} from '../helpers/capacitorShims.js';

// @capacitor/preferences' web implementation reads window.localStorage, which
// does not exist in Node \u2014 mirror the shim used by tests/utils/storage.test.js.
const originalWindow = globalThis.window;
const originalConsoleWarn = console.warn;

// @capacitor/preferences' web implementation reads window.localStorage, which
// does not exist in Node. Give each test a fresh in-memory shim and keep the
// shim installed for the whole file (each file runs in its own node --test
// child process) so the store's pending debounced save can never fail after
// teardown.
installWindowStorage();

// Suppress console.warn noise from expected Dexie-unavailable / Preferences
// warnings while the debounced save runs in the Node test environment.
console.warn = () => {};

// The store debounces persistence by SAVE_DEBOUNCE_MS (1000ms), so the last
// mutation's write lands after the final assertions. Let it settle inside the
// shim and the suppressed-warning window before restoring the globals --
// otherwise the pending write fires post-teardown and logs a spurious
// "storage save operations failed" warning.
test.after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  console.warn = originalConsoleWarn;
  globalThis.window = originalWindow;
});

const withWindowStorage = async (run) => {
  installWindowStorage();
  await run();
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
