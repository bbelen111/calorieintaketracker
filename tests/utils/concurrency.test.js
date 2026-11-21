import test from 'node:test';
import assert from 'node:assert/strict';

import { mapWithConcurrencyLimit } from '../../src/utils/concurrency.js';

test('mapWithConcurrencyLimit preserves input order regardless of completion order', async () => {
  const results = await mapWithConcurrencyLimit(
    [1, 2, 3, 4, 5],
    2,
    async (value) => {
      // Later items resolve first to prove the mapping is order-stable.
      await new Promise((resolve) => setTimeout(resolve, (5 - value) * 5));
      return value * 10;
    }
  );

  assert.deepEqual(results, [10, 20, 30, 40, 50]);
});

test('mapWithConcurrencyLimit never exceeds the configured concurrency', async () => {
  let inFlight = 0;
  let peakInFlight = 0;

  await mapWithConcurrencyLimit(
    Array.from({ length: 12 }, (_, index) => index),
    3,
    async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return null;
    }
  );

  assert.equal(peakInFlight <= 3, true);
});

test('mapWithConcurrencyLimit handles empty input and non-array values', async () => {
  assert.deepEqual(await mapWithConcurrencyLimit([], 5, async () => 1), []);
  assert.deepEqual(await mapWithConcurrencyLimit(null, 5, async () => 1), []);
});
