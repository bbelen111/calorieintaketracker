import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDateKeyLocal,
  formatDateKeyUtc,
  getWindowDateKeys,
} from '../../src/utils/data/dateKeys.js';

test('formatDateKeyLocal matches JS local calendar components', () => {
  const date = new Date('2026-03-01T23:30:00-08:00');
  const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  assert.equal(formatDateKeyLocal(date), expected);
});

test('formatDateKeyUtc resolves UTC date key deterministically at timezone boundaries', () => {
  const date = new Date('2026-03-01T23:30:00-08:00');

  assert.equal(formatDateKeyUtc(date), '2026-03-02');
});

test('date key formatters return null for invalid input', () => {
  assert.equal(formatDateKeyLocal(null), null);
  assert.equal(formatDateKeyUtc(undefined), null);
  assert.equal(formatDateKeyLocal(new Date('invalid')), null);
});

test('getWindowDateKeys returns exactly n consecutive keys ending at the anchor', () => {
  assert.deepEqual(getWindowDateKeys('2026-03-05', 3), [
    '2026-03-03',
    '2026-03-04',
    '2026-03-05',
  ]);

  const single = getWindowDateKeys('2026-06-15', 1);
  assert.equal(single.length, 1);
  assert.equal(single[0], '2026-06-15');
});

test('getWindowDateKeys crosses month and year boundaries via UTC arithmetic', () => {
  assert.deepEqual(getWindowDateKeys('2026-03-01', 3), [
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
  ]);

  assert.deepEqual(getWindowDateKeys('2026-01-01', 2), [
    '2025-12-31',
    '2026-01-01',
  ]);
});

test('getWindowDateKeys handles leap-day windows', () => {
  assert.deepEqual(getWindowDateKeys('2024-03-01', 3), [
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
  ]);
});

test('getWindowDateKeys returns [] for invalid anchors or window sizes', () => {
  assert.deepEqual(getWindowDateKeys(null, 7), []);
  assert.deepEqual(getWindowDateKeys(undefined, 7), []);
  assert.deepEqual(getWindowDateKeys('not-a-date', 7), []);
  assert.deepEqual(getWindowDateKeys('2026-02-31', 7), []);
  assert.deepEqual(getWindowDateKeys('2026-03-05', 0), []);
  assert.deepEqual(getWindowDateKeys('2026-03-05', -2), []);
  assert.deepEqual(getWindowDateKeys('2026-03-05', Number.NaN), []);
  assert.deepEqual(getWindowDateKeys('2026-03-05', 2.9), [
    '2026-03-04',
    '2026-03-05',
  ]);
});
