import assert from 'node:assert/strict';
import test from 'node:test';

import {
  setupEnergyMapStore,
  useEnergyMapStore,
} from '../../src/store/useEnergyMapStore.js';
import { getPreviousDateKey } from '../../src/utils/calculations/dailySnapshots.js';
import {
  getTodayDateKey,
  installWindowStorage,
} from '../helpers/capacitorShims.js';

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

const shift = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('synced backfill updates existing snapshots and never seeds untracked days', async () => {
  await ensureStoreSetup();
  const today = getTodayDateKey();
  const yesterday = getPreviousDateKey(today);
  const untracked = shift(today, -20);
  const store = useEnergyMapStore.getState();

  store.upsertDailySnapshot(yesterday);
  assert.ok(useEnergyMapStore.getState().userData.dailySnapshots[yesterday]);
  assert.equal(
    useEnergyMapStore.getState().userData.dailySnapshots[untracked],
    undefined
  );

  const changed = store.saveHeartRateEntries([
    { date: untracked, restingHr: 61, restingHrMethod: 'device', avgHr: 72 },
    { date: yesterday, restingHr: 58, restingHrMethod: 'device', maxHr: 171 },
  ]);
  assert.deepEqual(changed.sort(), [untracked, yesterday].sort());

  const { userData } = useEnergyMapStore.getState();
  assert.equal(
    userData.dailySnapshots[untracked],
    undefined,
    'a synced day the user never tracked must not get a snapshot'
  );
  assert.equal(userData.dailySnapshots[yesterday].restingHr, 58);
  assert.equal(userData.dailySnapshots[yesterday].maxHr, 171);
  assert.equal(
    userData.heartRateEntries.find((entry) => entry.date === untracked).avgHr,
    72
  );

  // Re-syncing the same values is a no-op (no store write)
  const before = useEnergyMapStore.getState().userData;
  assert.deepEqual(
    useEnergyMapStore
      .getState()
      .saveHeartRateEntries([
        {
          date: yesterday,
          restingHr: 58,
          restingHrMethod: 'device',
          maxHr: 171,
        },
      ]),
    []
  );
  assert.equal(useEnergyMapStore.getState().userData, before);
});

test('manual resting HR survives a sync and refreshes today', async () => {
  await ensureStoreSetup();
  const today = getTodayDateKey();
  const store = useEnergyMapStore.getState();

  store.setManualRestingHeartRate(today, 52);
  let entry = useEnergyMapStore
    .getState()
    .userData.heartRateEntries.find((item) => item.date === today);
  assert.equal(entry.restingHr, 52);
  assert.equal(entry.restingHrMethod, 'manual');
  assert.equal(
    useEnergyMapStore.getState().userData.dailySnapshots[today].restingHr,
    52
  );

  useEnergyMapStore
    .getState()
    .saveHeartRateEntries([
      { date: today, restingHr: 59, restingHrMethod: 'device', avgHr: 75 },
    ]);
  entry = useEnergyMapStore
    .getState()
    .userData.heartRateEntries.find((item) => item.date === today);
  assert.equal(entry.restingHr, 52, 'manual value must win over the sync');
  assert.equal(entry.avgHr, 75);

  // Clearing the manual reading keeps the synced aggregate
  useEnergyMapStore.getState().setManualRestingHeartRate(today, null);
  entry = useEnergyMapStore
    .getState()
    .userData.heartRateEntries.find((item) => item.date === today);
  assert.equal(entry.restingHr, null);
  assert.equal(entry.avgHr, 75);
});

test('max HR / VO2 max settings are validated; invalid means auto', async () => {
  await ensureStoreSetup();
  const store = useEnergyMapStore.getState();

  store.handleUserDataChange('maxHeartRateCustom', 195);
  assert.equal(useEnergyMapStore.getState().userData.maxHeartRateCustom, 195);
  assert.equal(useEnergyMapStore.getState().heartRateProfile.maxHr, 195);
  assert.equal(
    useEnergyMapStore.getState().heartRateProfile.maxHrSource,
    'custom'
  );

  useEnergyMapStore.getState().handleUserDataChange('maxHeartRateCustom', 400);
  assert.equal(useEnergyMapStore.getState().userData.maxHeartRateCustom, null);

  useEnergyMapStore.getState().handleUserDataChange('vo2MaxCustom', '51.26');
  assert.equal(useEnergyMapStore.getState().userData.vo2MaxCustom, 51.3);
  useEnergyMapStore.getState().handleUserDataChange('vo2MaxCustom', null);
  assert.equal(useEnergyMapStore.getState().userData.vo2MaxCustom, null);
});
