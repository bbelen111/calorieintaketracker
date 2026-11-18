import assert from 'node:assert/strict';
import test from 'node:test';

import { Preferences } from '@capacitor/preferences';
import {
  DEFAULT_FONT_SCALE_KEY,
  DEFAULT_UI_DENSITY_KEY,
  DENSITY_OPTIONS,
  FONT_SCALE_CSS_VAR,
  FONT_SCALE_OPTIONS,
  UI_DENSITY_CSS_VAR,
  applyUiScale,
  normalizeFontScaleKey,
  normalizeUiDensityKey,
  resolveFontScale,
  resolveUiDensity,
} from '../../src/constants/appearance/uiScale.js';
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

test('option sets are well-formed: unique keys, positive scales, a 1x default', () => {
  for (const [options, defaultKey] of [
    [FONT_SCALE_OPTIONS, DEFAULT_FONT_SCALE_KEY],
    [DENSITY_OPTIONS, DEFAULT_UI_DENSITY_KEY],
  ]) {
    const keys = options.map((option) => option.key);
    assert.equal(new Set(keys).size, keys.length, 'keys are unique');
    for (const option of options) {
      assert.ok(option.scale > 0, `${option.key} scale is positive`);
      assert.ok(option.label.length > 0, `${option.key} has a label`);
    }
    assert.equal(options.find((option) => option.key === defaultKey)?.scale, 1);
  }
});

test('the scales are ordered, so the segmented rows read small -> large', () => {
  const ascending = (options) =>
    options.every(
      (option, i) => i === 0 || option.scale > options[i - 1].scale
    );
  assert.ok(ascending(FONT_SCALE_OPTIONS));
  assert.ok(ascending(DENSITY_OPTIONS));
});

test('normalize accepts a valid key (case/whitespace tolerant) and defaults the rest', () => {
  assert.equal(normalizeFontScaleKey(' LARGE '), 'large');
  assert.equal(normalizeFontScaleKey('xlarge'), 'xlarge');
  assert.equal(normalizeUiDensityKey('Compact'), 'compact');

  for (const bad of [undefined, null, '', 'huge', 1.5, {}, []]) {
    assert.equal(normalizeFontScaleKey(bad), DEFAULT_FONT_SCALE_KEY);
    assert.equal(normalizeUiDensityKey(bad), DEFAULT_UI_DENSITY_KEY);
  }
});

test('resolve maps a key to its multiplier and never throws on garbage', () => {
  assert.equal(resolveFontScale('small'), 0.9);
  assert.equal(resolveFontScale('xlarge'), 1.25);
  assert.equal(resolveUiDensity('compact'), 0.88);
  assert.equal(resolveUiDensity('comfortable'), 1.12);

  assert.equal(resolveFontScale('nonsense'), 1);
  assert.equal(resolveUiDensity(undefined), 1);
});

test('applyUiScale publishes both multipliers on the root element', () => {
  const written = {};
  const root = {
    style: { setProperty: (name, value) => (written[name] = value) },
  };

  applyUiScale({ fontScale: 'large', uiDensity: 'compact' }, root);

  assert.equal(written[FONT_SCALE_CSS_VAR], '1.12');
  assert.equal(written[UI_DENSITY_CSS_VAR], '0.88');
});

test('applyUiScale falls back to 1x for bad values and tolerates a missing root', () => {
  const written = {};
  const root = {
    style: { setProperty: (name, value) => (written[name] = value) },
  };

  applyUiScale({ fontScale: 'bogus', uiDensity: null }, root);
  assert.equal(written[FONT_SCALE_CSS_VAR], '1');
  assert.equal(written[UI_DENSITY_CSS_VAR], '1');

  assert.doesNotThrow(() => applyUiScale({}, null));
  assert.doesNotThrow(() => applyUiScale({}, {}));
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

test('storage defaults include the display-scale keys at their 1x defaults', () => {
  const defaults = getDefaultEnergyMapData();
  assert.equal(defaults.fontScale, DEFAULT_FONT_SCALE_KEY);
  assert.equal(defaults.uiDensity, DEFAULT_UI_DENSITY_KEY);
});

test('loadEnergyMapData keeps valid display-scale keys and sanitizes corrupt ones', async () => {
  await withWindowStorage(async () => {
    await clearDexieHistory();

    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ fontScale: 'xlarge', uiDensity: 'comfortable' }),
    });
    const valid = await loadEnergyMapData();
    assert.equal(valid.fontScale, 'xlarge');
    assert.equal(valid.uiDensity, 'comfortable');

    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ fontScale: 'galactic', uiDensity: 42 }),
    });
    const corrupt = await loadEnergyMapData();
    assert.equal(corrupt.fontScale, DEFAULT_FONT_SCALE_KEY);
    assert.equal(corrupt.uiDensity, DEFAULT_UI_DENSITY_KEY);

    // An older profile saved before these settings existed.
    await Preferences.set({
      key: PROFILE_KEY,
      value: JSON.stringify({ age: 30 }),
    });
    const legacy = await loadEnergyMapData();
    assert.equal(legacy.fontScale, DEFAULT_FONT_SCALE_KEY);
    assert.equal(legacy.uiDensity, DEFAULT_UI_DENSITY_KEY);
  });
});
