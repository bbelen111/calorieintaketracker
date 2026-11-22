import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEVICE_BOUND_FIELDS,
  FULL_EXPORT_FORMAT_VERSION,
  applyDeviceBoundFields,
  buildFullExportPayload,
  describeFullExportSummary,
  parseFullExportText,
} from '../../src/utils/data/fullExport.js';
import * as exportModule from '../../src/utils/export.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');

test('buildFullExportPayload wraps the data with app, version and timestamp', () => {
  const userData = {
    age: 30,
    weightEntries: [{ date: '2026-03-01', weight: 80 }],
    nutritionData: { '2026-03-01': { lunch: [{ id: 'a', calories: 500 }] } },
  };

  const payload = buildFullExportPayload(userData, NOW);

  assert.equal(payload.app, 'Energy Map');
  assert.equal(payload.formatVersion, FULL_EXPORT_FORMAT_VERSION);
  assert.equal(payload.exportedAt, NOW.toISOString());
  assert.deepEqual(payload.data, userData);
});

test('buildFullExportPayload drops the re-downloadable food cache only', () => {
  const userData = {
    cachedFoods: [{ id: 'usda_1' }],
    pinnedFoods: ['usda_1'],
    foodFavourites: [{ id: 'f1' }],
  };

  const { data } = buildFullExportPayload(userData, NOW);

  assert.equal('cachedFoods' in data, false);
  assert.deepEqual(data.pinnedFoods, ['usda_1']);
  assert.deepEqual(data.foodFavourites, [{ id: 'f1' }]);
});

test('buildFullExportPayload never mutates the live user data', () => {
  const userData = { cachedFoods: [{ id: 'x' }], age: 30 };

  buildFullExportPayload(userData, NOW);

  assert.deepEqual(userData.cachedFoods, [{ id: 'x' }]);
});

test('buildFullExportPayload returns null when there is nothing to export', () => {
  assert.equal(buildFullExportPayload(null, NOW), null);
  assert.equal(buildFullExportPayload(undefined, NOW), null);
  assert.equal(buildFullExportPayload('nope', NOW), null);
  assert.equal(buildFullExportPayload([], NOW), null);
});

test('export.js keeps re-exporting the format helpers for existing callers', () => {
  assert.equal(exportModule.buildFullExportPayload, buildFullExportPayload);
  assert.equal(
    exportModule.FULL_EXPORT_FORMAT_VERSION,
    FULL_EXPORT_FORMAT_VERSION
  );
});

const roundTrip = (userData) =>
  parseFullExportText(
    JSON.stringify(buildFullExportPayload(userData, NOW), null, 2)
  );

test('parseFullExportText round-trips what buildFullExportPayload wrote', () => {
  const userData = {
    age: 30,
    weightEntries: [{ date: '2026-03-01', weight: 80 }],
    nutritionData: {
      '2026-03-01': { lunch: [] },
      '2026-03-02': { lunch: [] },
    },
    cardioSessions: [{ id: 'c1' }],
    trainingSessions: [{ id: 't1' }, { id: 't2' }],
  };

  const parsed = roundTrip(userData);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data, userData);
  assert.deepEqual(parsed.summary, {
    exportedAt: NOW.toISOString(),
    weighIns: 1,
    loggedDays: 2,
    workouts: 3,
  });
});

test('parseFullExportText rejects text that is not JSON', () => {
  const parsed = parseFullExportText('not json {');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /valid JSON/);
});

test('parseFullExportText rejects JSON that is not an Energy Map export', () => {
  for (const text of [
    '[]',
    'null',
    '"x"',
    '{"app":"Other","data":{"a":1}}',
    '{}',
  ]) {
    const parsed = parseFullExportText(text);
    assert.equal(parsed.ok, false, text);
    assert.match(parsed.error, /isn't an Energy Map export/, text);
  }
});

test('parseFullExportText refuses an export from a newer format version', () => {
  const parsed = parseFullExportText(
    JSON.stringify({
      app: 'Energy Map',
      formatVersion: FULL_EXPORT_FORMAT_VERSION + 1,
      data: { age: 30 },
    })
  );
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /newer version/);
});

test('parseFullExportText rejects a missing or malformed format version', () => {
  for (const formatVersion of [undefined, 0, -1, 1.5, 'x']) {
    const parsed = parseFullExportText(
      JSON.stringify({ app: 'Energy Map', formatVersion, data: { age: 30 } })
    );
    assert.equal(parsed.ok, false, String(formatVersion));
    assert.match(parsed.error, /format isn't recognised/);
  }
});

test('parseFullExportText rejects an export with no data', () => {
  for (const data of [undefined, null, [], {}, 'x']) {
    const parsed = parseFullExportText(
      JSON.stringify({
        app: 'Energy Map',
        formatVersion: FULL_EXPORT_FORMAT_VERSION,
        data,
      })
    );
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /no data/);
  }
});

test('the summary tolerates missing datasets and a bad timestamp', () => {
  const parsed = parseFullExportText(
    JSON.stringify({
      app: 'Energy Map',
      formatVersion: FULL_EXPORT_FORMAT_VERSION,
      exportedAt: 'yesterday',
      data: { age: 30 },
    })
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.summary, {
    exportedAt: null,
    weighIns: 0,
    loggedDays: 0,
    workouts: 0,
  });
});

test('describeFullExportSummary reads naturally and pluralises', () => {
  assert.equal(
    describeFullExportSummary({
      exportedAt: NOW.toISOString(),
      weighIns: 45,
      loggedDays: 120,
      workouts: 30,
    }),
    '120 days of food, 45 weigh-ins and 30 workouts, exported 2026-03-10'
  );
  assert.equal(
    describeFullExportSummary({
      exportedAt: null,
      weighIns: 1,
      loggedDays: 1,
      workouts: 1,
    }),
    '1 day of food, 1 weigh-in and 1 workout'
  );
});

test('applyDeviceBoundFields keeps this device’s values over the file’s', () => {
  const current = {
    heartRateSensor: { deviceId: 'here', name: 'Here' },
    heartRateSyncEnabled: true,
  };
  const imported = {
    age: 40,
    heartRateSensor: { deviceId: 'there', name: 'There' },
    heartRateSyncEnabled: false,
  };

  const next = applyDeviceBoundFields(imported, current);

  assert.equal(next.age, 40);
  assert.deepEqual(next.heartRateSensor, current.heartRateSensor);
  assert.equal(next.heartRateSyncEnabled, true);
  // Inputs are not mutated.
  assert.equal(imported.heartRateSyncEnabled, false);
});

test('applyDeviceBoundFields drops a device-bound field this device does not have', () => {
  const next = applyDeviceBoundFields(
    { age: 40, heartRateSensor: { deviceId: 'there' } },
    { age: 30 }
  );

  assert.equal('heartRateSensor' in next, false);
  assert.deepEqual(DEVICE_BOUND_FIELDS, [
    'heartRateSensor',
    'heartRateSyncEnabled',
  ]);
});
