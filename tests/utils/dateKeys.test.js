import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDateKeyLocal,
  formatDateKeyUtc,
} from '../../src/utils/dateKeys.js';

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
