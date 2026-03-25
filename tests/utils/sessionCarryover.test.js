import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateCarryoverByDate,
  getCarryoverForDateFromSessions,
} from '../../src/utils/sessionCarryover.js';

test('allocateCarryoverByDate splits calories across midnight boundary', () => {
  const anchor = new Date('2026-03-21T23:30:00').getTime();
  const allocations = allocateCarryoverByDate({
    anchorMs: anchor,
    windowMinutes: 120,
    totalCalories: 60,
  });

  assert.equal(allocations.length, 2);
  const dayOne = allocations.find((item) => item.dateKey === '2026-03-21');
  const dayTwo = allocations.find((item) => item.dateKey === '2026-03-22');

  assert.ok(dayOne);
  assert.ok(dayTwo);
  assert.equal(Math.round(dayOne.overlapMinutes), 30);
  assert.equal(Math.round(dayTwo.overlapMinutes), 90);
  assert.equal(dayOne.calories + dayTwo.calories, 60);
});

test('getCarryoverForDateFromSessions aggregates date-targeted allocations', () => {
  const startedAt = new Date('2026-03-21T23:30:00').getTime();

  const result = getCarryoverForDateFromSessions({
    dateKey: '2026-03-22',
    sessions: [
      {
        id: 'session-1',
        date: '2026-03-21',
        type: 'trainingtype_1',
        startTime: '23:30',
        startedAt,
        endedAt: startedAt + 30 * 60 * 1000,
        duration: 30,
        epocCalories: 60,
        epocCarryoverMinutes: 120,
      },
    ],
  });

  assert.ok(result.totalCalories > 0);
  assert.equal(result.sourceSessionsCount, 1);
  assert.equal(result.allocations[0].dateKey, '2026-03-22');
});
