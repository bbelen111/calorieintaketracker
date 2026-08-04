import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateStepsBySource,
  buildHealthConnectFallbackReadWindow,
  buildHealthConnectStepReadWindow,
} from '../../src/utils/healthConnectWindow.js';

test('buildHealthConnectStepReadWindow returns a same-day window for normal times', () => {
  const referenceDate = new Date(2026, 0, 15, 14, 30, 45, 123);
  const window = buildHealthConnectStepReadWindow(referenceDate);

  assert.ok(window);

  const start = new Date(window.startDate);
  const end = new Date(window.endDate);

  assert.equal(start.getFullYear(), referenceDate.getFullYear());
  assert.equal(start.getMonth(), referenceDate.getMonth());
  assert.equal(start.getDate(), referenceDate.getDate());
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 1);
  assert.ok(end > start);
  assert.equal(end.getTime(), referenceDate.getTime());
});

test('buildHealthConnectStepReadWindow nudges an exact-midnight boundary forward', () => {
  const referenceDate = new Date(2026, 0, 15, 0, 0, 0, 0);
  const window = buildHealthConnectStepReadWindow(referenceDate);

  assert.ok(window);

  const start = new Date(window.startDate);
  const end = new Date(window.endDate);

  assert.ok(end > start);
  assert.equal(end.getTime() - start.getTime(), 1);
});

test('buildHealthConnectStepReadWindow returns null for invalid input', () => {
  assert.equal(buildHealthConnectStepReadWindow(new Date('invalid')), null);
});

test('buildHealthConnectFallbackReadWindow returns a rolling 24 hour window', () => {
  const referenceDate = new Date(2026, 0, 15, 14, 30, 45, 123);
  const window = buildHealthConnectFallbackReadWindow(referenceDate);

  assert.ok(window);

  const start = new Date(window.startDate);
  const end = new Date(window.endDate);

  assert.equal(end.getTime(), referenceDate.getTime());
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test('aggregateStepsBySource returns 0 for empty or missing samples', () => {
  assert.equal(aggregateStepsBySource(null), 0);
  assert.equal(aggregateStepsBySource({}), 0);
  assert.equal(aggregateStepsBySource({ samples: [] }), 0);
});

test('aggregateStepsBySource sums steps within a single source', () => {
  const result = {
    samples: [
      { value: 1000, sourceId: 'com.samsung.health' },
      { value: 500, sourceId: 'com.samsung.health' },
    ],
  };

  assert.equal(aggregateStepsBySource(result), 1500);
});

test('aggregateStepsBySource takes the max across multiple sources to avoid double counting', () => {
  const result = {
    samples: [
      { value: 3000, sourceId: 'com.samsung.health' },
      { value: 2800, sourceId: 'com.google.android.apps.fitness' },
      { value: 2500, sourceName: 'Fitbit' },
    ],
  };

  assert.equal(aggregateStepsBySource(result), 3000);
});

test('aggregateStepsBySource falls back to count field and unknown source key', () => {
  const result = {
    samples: [{ count: 1200 }, { count: 800 }],
  };

  assert.equal(aggregateStepsBySource(result), 2000);
});
