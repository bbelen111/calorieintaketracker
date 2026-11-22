import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_EXPORT_FORMAT_VERSION,
  buildFullExportPayload,
} from '../../src/utils/export.js';

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
});
