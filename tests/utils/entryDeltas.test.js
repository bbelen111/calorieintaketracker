import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSignedDelta,
  getPreviousEntryDelta,
  getWindowAverageDeviation,
} from '../../src/utils/measurements/weight.js';

const weightEntries = [
  { date: '2026-01-01', weight: 74 },
  { date: '2026-01-02', weight: 74.4 },
  { date: '2026-01-08', weight: 73.8 },
];

const bodyFatEntries = [
  { date: '2026-01-01', bodyFat: 18 },
  { date: '2026-01-02', bodyFat: 17.6 },
];

test('getPreviousEntryDelta reports the change since the previous sample', () => {
  assert.deepEqual(
    getPreviousEntryDelta(weightEntries, '2026-01-02', 'weight'),
    {
      currentValue: 74.4,
      previousValue: 74,
      previousDate: '2026-01-01',
      delta: 0.4,
      spanDays: 1,
    }
  );
});

test('getPreviousEntryDelta discloses an irregular sampling span', () => {
  // Weigh-ins are not daily: the card has to say the delta covers 6 days.
  const delta = getPreviousEntryDelta(weightEntries, '2026-01-08', 'weight');

  assert.equal(delta.spanDays, 6);
  assert.equal(delta.delta, -0.6);
  assert.equal(delta.previousDate, '2026-01-02');
});

test('getPreviousEntryDelta works on body fat entries through valueField', () => {
  const delta = getPreviousEntryDelta(bodyFatEntries, '2026-01-02', 'bodyFat');

  assert.equal(delta.delta, -0.4);
  assert.equal(delta.spanDays, 1);
});

test('getPreviousEntryDelta returns null without an honest comparison', () => {
  // First sample in the list: nothing earlier to compare against.
  assert.equal(
    getPreviousEntryDelta(weightEntries, '2026-01-01', 'weight'),
    null
  );
  // Unknown date and non-canonical key.
  assert.equal(
    getPreviousEntryDelta(weightEntries, '2026-02-01', 'weight'),
    null
  );
  assert.equal(
    getPreviousEntryDelta(weightEntries, '2026-1-2', 'weight'),
    null
  );
  assert.equal(getPreviousEntryDelta(weightEntries, null, 'weight'), null);
  // Non-finite value on either side of the comparison.
  assert.equal(
    getPreviousEntryDelta(
      [
        { date: '2026-01-01', weight: 74 },
        { date: '2026-01-02', weight: 'n/a' },
      ],
      '2026-01-02',
      'weight'
    ),
    null
  );
});

test('getWindowAverageDeviation compares a reading with its own 7-day trend', () => {
  // Window [2025-12-27 .. 2026-01-02]: 74 held flat to 01-01, then 74.4.
  // Integral: 74*5 + ((74 + 74.4)/2)*1 + 74.4*1 = 518.6 over 7 days
  // => 74.086 -> 74.1; deviation = 74.4 - 74.1 = 0.3
  assert.equal(
    getWindowAverageDeviation(weightEntries, '2026-01-02', 7, 'weight'),
    0.3
  );
});

test('getWindowAverageDeviation works on body fat entries', () => {
  // Integral: 18*5 + 17.8 + 17.6 = 125.4 over 7 days => 17.914 -> 17.9;
  // deviation = 17.6 - 17.9 = -0.3
  assert.equal(
    getWindowAverageDeviation(bodyFatEntries, '2026-01-02', 7, 'bodyFat'),
    -0.3
  );
});

test('getWindowAverageDeviation refuses a single-sample window', () => {
  // The flat-hold makes a lone sample's average equal to the value, so the
  // deviation would always be a vacuous 0.0.
  assert.equal(
    getWindowAverageDeviation(
      [{ date: '2026-01-02', weight: 74.4 }],
      '2026-01-02',
      7,
      'weight'
    ),
    null
  );
  assert.equal(
    getWindowAverageDeviation(weightEntries, '2026-01-01', 7, 'weight'),
    null
  );
});

test('getWindowAverageDeviation returns null for unknown dates and windows', () => {
  assert.equal(
    getWindowAverageDeviation(weightEntries, '2026-03-01', 7, 'weight'),
    null
  );
  assert.equal(
    getWindowAverageDeviation(weightEntries, 'not-a-date', 7, 'weight'),
    null
  );
  assert.equal(
    getWindowAverageDeviation(weightEntries, '2026-01-02', 0, 'weight'),
    null
  );
});

test('formatSignedDelta renders an explicit sign, one decimal and unit', () => {
  assert.equal(formatSignedDelta(0.4, 'kg'), '+0.4 kg');
  assert.equal(formatSignedDelta(-0.4, 'kg'), '-0.4 kg');
  assert.equal(formatSignedDelta(-0.4, '%', ''), '-0.4%');
  assert.equal(formatSignedDelta(0, 'kg'), '0.0 kg');
  assert.equal(formatSignedDelta(1, 'kg'), '+1.0 kg');
  assert.equal(formatSignedDelta(1.25, 'kg'), '+1.3 kg');
});

test('formatSignedDelta returns an empty string for non-finite input', () => {
  assert.equal(formatSignedDelta(undefined, 'kg'), '');
  assert.equal(formatSignedDelta(Number.NaN, 'kg'), '');
  assert.equal(formatSignedDelta('n/a', 'kg'), '');
});
