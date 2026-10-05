import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffShardedHistoryField,
  getDefaultEnergyMapData,
  getPersistenceFootprint,
  primePersistenceBaseline,
  resetPersistenceTracking,
  saveEnergyMapData,
} from '../../src/utils/data/storage.js';
import { withWindowStorage } from '../helpers/capacitorShims.js';

/**
 * These cover the incremental-persistence contract introduced to remove the
 * O(entire history) serialization that made saves lag as data accumulated.
 * `diffShardedHistoryField` is the pure seam over the same diff the real save
 * path uses, so the assertions describe production behaviour without Dexie.
 */

test('a no-op field produces no shard writes', () => {
  const nutritionData = {
    '2026-01-01': { breakfast: [{ id: 'a', calories: 100 }] },
    '2026-01-02': { lunch: [{ id: 'b', calories: 200 }] },
  };

  const { documents, deletes } = diffShardedHistoryField(
    'nutritionData',
    nutritionData,
    nutritionData
  );

  assert.deepEqual(documents, []);
  assert.deepEqual(deletes, []);
});

test('editing one day writes exactly one nutritionData shard', () => {
  const previous = {
    '2026-01-01': { breakfast: [{ id: 'a' }] },
    '2026-01-02': { lunch: [{ id: 'b' }] },
  };
  const next = {
    ...previous,
    '2026-01-01': { breakfast: [{ id: 'a' }, { id: 'c' }] },
  };

  const { documents, deletes } = diffShardedHistoryField(
    'nutritionData',
    previous,
    next
  );

  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, 'nutritionData:2026-01-01');
  assert.deepEqual(deletes, []);
});

test('unknown shards are added and untouched shards are skipped by reference', () => {
  const dayOne = { breakfast: [{ id: 'a' }] };
  const dayTwo = { lunch: [{ id: 'b' }] };
  const previous = { '2026-01-01': dayOne, '2026-01-02': dayTwo };
  // New container object, but the same day-object references for 1 & 2.
  const next = {
    '2026-01-01': dayOne,
    '2026-01-02': dayTwo,
    '2026-01-03': { dinner: [{ id: 'c' }] },
  };

  const { documents, deletes } = diffShardedHistoryField(
    'nutritionData',
    previous,
    next
  );

  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, 'nutritionData:2026-01-03');
  assert.deepEqual(deletes, []);
});

test('removing a day deletes exactly one shard', () => {
  const previous = {
    '2026-01-01': { breakfast: [{ id: 'a' }] },
    '2026-01-02': { lunch: [{ id: 'b' }] },
  };
  const { '2026-01-02': removed, ...next } = previous;

  const { documents, deletes } = diffShardedHistoryField(
    'nutritionData',
    previous,
    next
  );

  assert.deepEqual(documents, []);
  assert.deepEqual(deletes, ['nutritionData:2026-01-02']);
  assert.ok(removed);
});

test('removing a session leaves the surviving session untouched', () => {
  const sessionZero = { id: 's0', duration: 10 };
  const sessionOne = { id: 's1', duration: 20 };

  const { documents, deletes } = diffShardedHistoryField(
    'cardioSessions',
    [sessionZero, sessionOne],
    [sessionZero]
  );

  assert.deepEqual(documents, []);
  assert.deepEqual(deletes, ['cardioSessions:s1']);
});

test('inserting a session rewrites only the order-shifted shard', () => {
  const existing = { id: 's0', duration: 10 };
  const inserted = { id: 's-new', duration: 5 };

  const { documents } = diffShardedHistoryField(
    'cardioSessions',
    [existing],
    [inserted, existing]
  );

  const ids = documents.map((document) => document.id).sort();
  assert.deepEqual(ids, ['cardioSessions:s-new', 'cardioSessions:s0']);
});

test('dailyNeatOverrides writes one shard per changed day', () => {
  const previous = {
    '2026-01-01': { multiplier: 0.3, presetKey: 'active', label: 'Active' },
    '2026-01-02': { multiplier: 0.22, presetKey: null, label: null },
  };
  const next = {
    '2026-01-01': { multiplier: 0.35, presetKey: 'active', label: 'Active' },
    '2026-01-02': previous['2026-01-02'],
  };

  const { documents, deletes } = diffShardedHistoryField(
    'dailyNeatOverrides',
    previous,
    next
  );

  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, 'dailyNeatOverrides:2026-01-01');
  assert.deepEqual(deletes, []);
});

test('saveEnergyMapData never JSON-stringifies whole history fields', async () => {
  await withWindowStorage(async () => {
    const payload = {
      ...getDefaultEnergyMapData(),
      weightEntries: [{ date: '2026-03-20', weight: 80.5 }],
      nutritionData: {
        '2026-03-20': { breakfast: [{ id: 'x', calories: 100 }] },
      },
    };

    const originalStringify = JSON.stringify;
    const originalWarn = console.warn;
    const stringified = [];
    console.warn = () => {};
    JSON.stringify = (value, ...rest) => {
      stringified.push(value);
      return originalStringify(value, ...rest);
    };

    try {
      await saveEnergyMapData(payload);
      await saveEnergyMapData(payload);
    } finally {
      JSON.stringify = originalStringify;
      console.warn = originalWarn;
    }

    assert.equal(stringified.includes(payload.nutritionData), false);
    assert.equal(stringified.includes(payload.weightEntries), false);
    assert.equal(stringified.includes(payload), false);
  });
});

test('primePersistenceBaseline tracks one shard per document, not per entry', () => {
  const userData = {
    ...getDefaultEnergyMapData(),
    nutritionData: {
      '2026-01-01': { breakfast: [{ id: 'a' }, { id: 'b' }] },
      '2026-01-02': { lunch: [{ id: 'c' }] },
    },
    weightEntries: [{ date: '2026-01-01', weight: 80 }],
  };

  primePersistenceBaseline(userData);
  const footprint = getPersistenceFootprint();

  // Three nutrition entries across two days -> two shards.
  assert.equal(footprint.shardsByField.nutritionData, 2);
  assert.equal(footprint.shardsByField.weightEntries, 1);
  assert.equal(footprint.trackedFields, 10);
});

test('resetPersistenceTracking clears every baseline', () => {
  primePersistenceBaseline({
    ...getDefaultEnergyMapData(),
    weightEntries: [{ date: '2026-01-01', weight: 80 }],
  });
  assert.ok(getPersistenceFootprint().totalTrackedShards > 0);

  resetPersistenceTracking();
  assert.equal(getPersistenceFootprint().totalTrackedShards, 0);
  assert.equal(getPersistenceFootprint().trackedFields, 0);
});
