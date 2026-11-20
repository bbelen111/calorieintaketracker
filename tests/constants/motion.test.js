import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  DEFAULT_MOTION_PREFERENCE_KEY,
  MOTION_ATTRIBUTE,
  MOTION_MODES,
  MOTION_PREFERENCE_OPTIONS,
  isMotionMode,
  normalizeMotionPreferenceKey,
  resolveMotionMode,
} from '../../src/constants/appearance/motion.js';
import {
  getMotionMode,
  isMotionOff,
  prefersReducedMotion,
  resetMotionMode,
  resolveScrollBehavior,
  setMotionMode,
  subscribeMotionMode,
} from '../../src/utils/visuals/motionPreference.js';
import {
  getDefaultEnergyMapData,
  loadEnergyMapData,
} from '../../src/utils/data/storage.js';
import {
  deleteHistoryDocumentsFromDexie,
  loadAllHistoryDocuments,
} from '../../src/utils/data/historyDatabase.js';
import { withWindowStorage } from '../helpers/capacitorShims.js';

const PROFILE_KEY = 'energyMapData_profile';

// The runtime store reads the device setting through `window.matchMedia` when no
// mode has been published. Node has no window, so drive it explicitly.
const withDeviceReduceMotion = (matches, fn) => {
  const previous = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches }) };
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previous;
    }
  }
};

test.afterEach(() => resetMotionMode());

test('options: Auto first and default, then Full / Reduced / Off', () => {
  assert.deepEqual(
    MOTION_PREFERENCE_OPTIONS.map((option) => option.key),
    ['system', 'full', 'reduced', 'off']
  );
  assert.equal(DEFAULT_MOTION_PREFERENCE_KEY, 'system');
  for (const option of MOTION_PREFERENCE_OPTIONS) {
    assert.ok(option.label.length > 0);
  }
});

test('normalize accepts a valid key (case/whitespace tolerant) and defaults the rest', () => {
  assert.equal(normalizeMotionPreferenceKey(' OFF '), 'off');
  assert.equal(normalizeMotionPreferenceKey('Reduced'), 'reduced');
  for (const bad of [undefined, null, '', 'turbo', 3, {}, []]) {
    assert.equal(normalizeMotionPreferenceKey(bad), 'system');
  }
});

test('resolve: Auto follows the device, an explicit choice ignores it', () => {
  assert.equal(resolveMotionMode('system', false), MOTION_MODES.FULL);
  assert.equal(resolveMotionMode('system', true), MOTION_MODES.REDUCED);

  // Explicit choices win over the device flag, in both directions.
  assert.equal(resolveMotionMode('full', true), MOTION_MODES.FULL);
  assert.equal(resolveMotionMode('reduced', false), MOTION_MODES.REDUCED);
  assert.equal(resolveMotionMode('off', false), MOTION_MODES.OFF);
  assert.equal(resolveMotionMode('off', true), MOTION_MODES.OFF);

  // Garbage behaves as Auto.
  assert.equal(resolveMotionMode('bogus', true), MOTION_MODES.REDUCED);
  assert.equal(resolveMotionMode(undefined), MOTION_MODES.FULL);
});

test('isMotionMode recognises only the three resolved modes', () => {
  for (const mode of ['full', 'reduced', 'off']) {
    assert.equal(isMotionMode(mode), true);
  }
  // `system` is a preference, never a resolved mode.
  for (const notMode of ['system', '', null, undefined, 'FULL']) {
    assert.equal(isMotionMode(notMode), false);
  }
});

test('before a mode is published the runtime reads the device setting live', () => {
  withDeviceReduceMotion(true, () => {
    assert.equal(getMotionMode(), 'reduced');
    assert.equal(prefersReducedMotion(), true);
  });
  withDeviceReduceMotion(false, () => {
    assert.equal(getMotionMode(), 'full');
    assert.equal(prefersReducedMotion(), false);
  });
  // No window at all (Node / SSR): animate.
  assert.equal(getMotionMode(), 'full');
});

test('a published mode overrides the device setting', () => {
  withDeviceReduceMotion(true, () => {
    setMotionMode('full');
    assert.equal(getMotionMode(), 'full');
    assert.equal(prefersReducedMotion(), false);
  });
  withDeviceReduceMotion(false, () => {
    setMotionMode('off');
    assert.equal(isMotionOff(), true);
    assert.equal(prefersReducedMotion(), true);
    setMotionMode('reduced');
    assert.equal(isMotionOff(), false);
    assert.equal(prefersReducedMotion(), true);
  });
});

test('setMotionMode writes the data-motion attribute and ignores unknown values', () => {
  const attributes = {};
  const root = { setAttribute: (name, value) => (attributes[name] = value) };

  setMotionMode('reduced', root);
  assert.equal(attributes[MOTION_ATTRIBUTE], 'reduced');

  setMotionMode('turbo', root);
  assert.equal(attributes[MOTION_ATTRIBUTE], 'reduced');
  assert.equal(getMotionMode(), 'reduced');

  assert.doesNotThrow(() => setMotionMode('off', null));
  assert.doesNotThrow(() => setMotionMode('off', {}));
});

test('subscribers are told once per actual change, and can unsubscribe', () => {
  let calls = 0;
  const unsubscribe = subscribeMotionMode(() => (calls += 1));

  setMotionMode('reduced');
  setMotionMode('reduced'); // no change
  setMotionMode('off');
  assert.equal(calls, 2);

  unsubscribe();
  setMotionMode('full');
  assert.equal(calls, 2);
});

test('smooth scrolling becomes instant exactly when motion is reduced or off', () => {
  setMotionMode('full');
  assert.equal(resolveScrollBehavior('smooth'), 'smooth');
  assert.equal(resolveScrollBehavior(), 'smooth');

  setMotionMode('reduced');
  assert.equal(resolveScrollBehavior('smooth'), 'instant');

  setMotionMode('off');
  assert.equal(resolveScrollBehavior('smooth'), 'instant');

  // An explicit instant/auto request is never changed.
  assert.equal(resolveScrollBehavior('instant'), 'instant');
  assert.equal(resolveScrollBehavior('auto'), 'auto');
});

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

test('storage defaults to Auto', () => {
  assert.equal(
    getDefaultEnergyMapData().motionPreference,
    DEFAULT_MOTION_PREFERENCE_KEY
  );
});

test('loadEnergyMapData keeps a valid animations preference and sanitizes corrupt/legacy ones', async () => {
  await withWindowStorage(async () => {
    await clearDexieHistory();

    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ motionPreference: 'off' }),
    });
    assert.equal((await loadEnergyMapData()).motionPreference, 'off');

    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ motionPreference: 'ludicrous' }),
    });
    assert.equal((await loadEnergyMapData()).motionPreference, 'system');

    // A profile saved before the setting existed.
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ age: 30 }),
    });
    assert.equal((await loadEnergyMapData()).motionPreference, 'system');
  });
});
