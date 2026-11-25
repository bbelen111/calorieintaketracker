import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
  saveEnergyMapData,
} from '../../src/utils/data/storage.js';
import {
  buildFullExportPayload,
  parseFullExportText,
} from '../../src/utils/data/fullExport.js';
import { DEFAULT_UNIT_PREFERENCES } from '../../src/constants/units/units.js';
import { withWindowStorage } from '../helpers/capacitorShims.js';

const PROFILE_KEY = 'energyMapData_profile';

const CHOSEN = {
  bodyWeight: 'st',
  height: 'ft',
  distance: 'mi',
  foodWeight: 'oz',
  energy: 'kJ',
};

let originalConsoleWarn;
test.beforeEach(() => {
  originalConsoleWarn = console.warn;
  console.warn = () => {};
});
test.afterEach(() => {
  console.warn = originalConsoleWarn;
});

const loadProfile = async (profile) => {
  await Preferences.set({ key: PROFILE_KEY, value: JSON.stringify(profile) });
  return loadEnergyMapData();
};

test('a profile saved before units existed loads as metric', async () => {
  await withWindowStorage(async () => {
    const loaded = await loadProfile({ age: 40, weight: 80 });

    assert.deepEqual(loaded.unitPreferences, DEFAULT_UNIT_PREFERENCES);
    assert.equal(loaded.weight, 80);
  });
});

test('loading repairs bad unit preferences one key at a time', async () => {
  await withWindowStorage(async () => {
    const loaded = await loadProfile({
      unitPreferences: { bodyWeight: 'lb', height: 'furlong', energy: 7 },
    });

    assert.deepEqual(loaded.unitPreferences, {
      ...DEFAULT_UNIT_PREFERENCES,
      bodyWeight: 'lb',
    });
  });
});

test('unit preferences persist and load back', async () => {
  await withWindowStorage(async () => {
    await Preferences.remove({ key: PROFILE_KEY });
    await saveEnergyMapData({
      ...getDefaultEnergyMapData(),
      unitPreferences: CHOSEN,
    });

    const loaded = await loadEnergyMapData();

    assert.deepEqual(loaded.unitPreferences, CHOSEN);
  });
});

test('a full export carries the units and keeps values metric', () => {
  const payload = buildFullExportPayload({
    ...getDefaultEnergyMapData(),
    weight: 80,
    unitPreferences: CHOSEN,
  });

  const parsed = parseFullExportText(JSON.stringify(payload));

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data.unitPreferences, CHOSEN);
  assert.equal(parsed.data.weight, 80);
});
