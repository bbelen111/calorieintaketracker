import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateNDayWeightAverage,
  calculateWeightTrend,
} from '../../src/utils/measurements/weight.js';
import {
  calculateNDayBodyFatAverage,
  calculateBodyFatTrend,
} from '../../src/utils/measurements/bodyFat.js';
import { getTodayDateKey } from '../../src/utils/data/dateKeys.js';

const addDays = (dateKey, days) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test('calculateNDayWeightAverage integrates trapezoidally across the exact window', () => {
  const entries = [
    { date: '2026-03-01', weight: 80 },
    { date: '2026-03-11', weight: 81 },
  ];

  // Window [03-01 .. 03-15] integrates to 03-16 (exclusive): flat 80 up to
  // 03-01, ramp to 81 by 03-11 ((80+81)/2*10 = 805), flat 81 for 5 days
  // (405) => 1210 / 15 days = 80.67 -> 80.7
  assert.equal(calculateNDayWeightAverage(entries, 15, '2026-03-15'), 80.7);
});

test('calculateNDayWeightAverage excludes entries just outside the exact n-day window', () => {
  const entries = [
    { date: '2026-03-01', weight: 80 }, // 7 days before anchor day -> outside
    { date: '2026-03-08', weight: 82 },
  ];

  assert.equal(calculateNDayWeightAverage(entries, 7, '2026-03-08'), 82);
});

test('calculateNDayWeightAverage anchors to today when no end date is passed', () => {
  const today = getTodayDateKey();
  const entries = [{ date: addDays(today, -2), weight: 70 }];

  assert.equal(calculateNDayWeightAverage(entries, 7), 70);
});

test('calculateNDayWeightAverage returns null when the window holds no data', () => {
  const entries = [
    { date: '2026-01-01', weight: 80 },
    { date: '2026-01-02', weight: 80.2 },
  ];

  assert.equal(calculateNDayWeightAverage(entries, 7, '2026-03-08'), null);
});

test('calculateNDayBodyFatAverage integrates trapezoidally and honours empty windows', () => {
  const entries = [
    { date: '2026-03-05', bodyFat: 20 },
    { date: '2026-03-09', bodyFat: 18 },
  ];

  // Window [03-04 .. 03-10] integrates to 03-11 (exclusive): flat 20 for one
  // day (03-04→05), ramp to 18 across four days ((20+18)/2*4 = 76), flat 18
  // for two days (36) => 132 / 7 days = 18.86 -> 18.9
  assert.equal(calculateNDayBodyFatAverage(entries, 7, '2026-03-10'), 18.9);
  assert.equal(calculateNDayBodyFatAverage(entries, 7, '2026-06-01'), null);
});

test('calculateWeightTrend uses the last-two fallback only within the capped span', () => {
  const closeEntries = [
    { date: '2026-03-01', weight: 80 },
    { date: '2026-03-09', weight: 80.8 },
  ];
  const closeTrend = calculateWeightTrend(closeEntries, 5);
  assert.notEqual(closeTrend.label, 'Need more data');
  assert.equal(closeTrend.isStaleFallback, false);

  const staleEntries = [
    { date: '2026-03-01', weight: 80 },
    { date: '2026-03-21', weight: 82 },
  ];
  const staleTrend = calculateWeightTrend(staleEntries, 5);
  assert.equal(staleTrend.label, 'Need more data');
  assert.equal(staleTrend.delta, 0);
  assert.equal(staleTrend.weeklyRate, 0);
  assert.equal(staleTrend.direction, 'flat');
  assert.equal(staleTrend.isStaleFallback, true);
});

test('calculateBodyFatTrend mirrors the capped fallback behaviour', () => {
  const closeEntries = [
    { date: '2026-03-01', bodyFat: 20 },
    { date: '2026-03-08', bodyFat: 19.6 },
  ];
  const closeTrend = calculateBodyFatTrend(closeEntries, 5);
  assert.notEqual(closeTrend.label, 'Need more data');
  assert.equal(closeTrend.isStaleFallback, false);

  const staleEntries = [
    { date: '2026-03-01', bodyFat: 20 },
    { date: '2026-03-25', bodyFat: 18 },
  ];
  const staleTrend = calculateBodyFatTrend(staleEntries, 5);
  assert.equal(staleTrend.label, 'Need more data');
  assert.equal(staleTrend.isStaleFallback, true);
});
