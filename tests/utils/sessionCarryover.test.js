import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateCarryoverByDate,
  getCarryoverForDateFromSessions,
} from '../../src/utils/calculations/sessionCarryover.js';

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

test('getCarryoverForDateFromSessions pre-filters sessions far outside the target day', () => {
  const recentStart = new Date('2026-03-21T23:30:00').getTime();
  const oldStart = new Date('2026-02-01T10:00:00').getTime();
  const futureStart = new Date('2026-04-01T10:00:00').getTime();
  let resolveCarryoverCalls = 0;

  const buildSession = (id, startMs) => ({
    id,
    date: '2026-02-01',
    type: 'cardio_1',
    startTime: '10:00',
    startedAt: startMs,
    endedAt: startMs + 30 * 60 * 1000,
    duration: 30,
  });

  const result = getCarryoverForDateFromSessions({
    dateKey: '2026-03-22',
    sessions: [
      // Candidate: ended before the target day, within carryover reach.
      { ...buildSession('candidate', recentStart), date: '2026-03-21' },
      // Too old even for the max EPOC window (~7 days).
      buildSession('old', oldStart),
      // Ended after the target day closed.
      buildSession('future', futureStart),
    ],
    resolveCarryover: (session) => {
      resolveCarryoverCalls += 1;
      if (session.id === 'candidate') {
        return { totalCalories: 60, windowMinutes: 120 };
      }
      return { totalCalories: 60, windowMinutes: 60 };
    },
  });

  // Only the candidate reaches the expensive resolveCarryover pricing pass.
  assert.equal(resolveCarryoverCalls, 1);
  assert.equal(result.sourceSessionsCount, 1);
  assert.equal(result.allocations[0].sessionId, 'candidate');
  assert.equal(result.allocations[0].dateKey, '2026-03-22');
});

test('getCarryoverForDateFromSessions keeps sessions carrying their own long window', () => {
  // A session with a stored carryoverMinutesField wider than the EPOC
  // ceiling must NOT be excluded by the date-distance pre-filter.
  const farBackStart = new Date('2026-03-10T08:00:00').getTime();
  const session = {
    id: 'long-window',
    date: '2026-03-10',
    type: 'cardio_1',
    startTime: '08:00',
    startedAt: farBackStart,
    endedAt: farBackStart + 30 * 60 * 1000,
    duration: 30,
    epocCalories: 100,
    epocCarryoverMinutes: 12 * 24 * 60, // 12 days — beyond the EPOC ceiling
  };

  const result = getCarryoverForDateFromSessions({
    dateKey: '2026-03-22',
    sessions: [session],
  });

  assert.equal(result.sourceSessionsCount, 1);
  assert.equal(result.allocations[0].sessionId, 'long-window');
  assert.equal(result.allocations[0].dateKey, '2026-03-22');
});
