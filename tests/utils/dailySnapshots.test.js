import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areDailySnapshotsEquivalent,
  buildDailySnapshot,
  getPreviousDateKey,
} from '../../src/utils/dailySnapshots.js';

const dateKey = '2026-03-21';

const userData = {
  age: 30,
  weight: 80,
  height: 180,
  gender: 'male',
  bodyFatEntries: [],
  bodyFatTrackingEnabled: false,
  smartTefEnabled: true,
  activityMultipliers: {
    training: 0.35,
    rest: 0.28,
  },
  stepEntries: [
    {
      date: dateKey,
      steps: 11234,
      source: 'manual',
    },
  ],
  nutritionData: {
    [dateKey]: {
      breakfast: [
        {
          id: 'food-1',
          calories: 500,
          protein: 40,
          carbs: 50,
          fats: 18,
        },
      ],
      dinner: [
        {
          id: 'food-2',
          calories: 700,
          protein: 55,
          carbs: 75,
          fats: 20,
        },
      ],
    },
  },
  trainingSessions: [
    {
      id: 'tr-1',
      date: dateKey,
      type: 'bodybuilding',
      duration: 75,
      effortType: 'intensity',
      intensity: 'moderate',
    },
  ],
  cardioSessions: [
    {
      id: 'ca-1',
      date: dateKey,
      type: 'treadmill_walk',
      duration: 35,
      effortType: 'intensity',
      intensity: 'moderate',
      stepOverlapEnabled: true,
    },
  ],
};

const trainingTypes = {
  bodybuilding: {
    label: 'Bodybuilding',
    caloriesPerHour: 220,
  },
};

const cardioTypes = {
  treadmill_walk: {
    label: 'Treadmill Walk',
    met: {
      light: 3.5,
      moderate: 4,
      vigorous: 4.5,
    },
    ambulatory: true,
    cadence: 118,
  },
};

test('buildDailySnapshot produces a complete date-scoped snapshot', () => {
  const snapshot = buildDailySnapshot({
    dateKey,
    userData,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });

  assert.equal(snapshot.date, dateKey);
  assert.equal(snapshot.intake, 1200);
  assert.equal(snapshot.stepCount, 11234);
  assert.equal(snapshot.isTrainingDay, true);
  assert.ok(Number.isFinite(snapshot.tdee));
  assert.ok(Number.isFinite(snapshot.deficit));
  assert.ok(Number.isFinite(snapshot.bmr));
  assert.ok(Number.isFinite(snapshot.stepCalories));
  assert.ok(Number.isFinite(snapshot.trainingBurn));
  assert.ok(Number.isFinite(snapshot.cardioBurn));
  assert.ok(Number.isFinite(snapshot.tef));
});

test('areDailySnapshotsEquivalent ignores createdAt/updatedAt metadata', () => {
  const base = {
    date: dateKey,
    tdee: 3000,
    intake: 2200,
    deficit: 800,
    stepCount: 10000,
    isTrainingDay: true,
    bmr: 1700,
    stepCalories: 250,
    trainingBurn: 400,
    cardioBurn: 200,
    tef: 150,
    tefMode: 'dynamic',
    createdAt: 1,
    updatedAt: 2,
  };

  const updatedMeta = {
    ...base,
    createdAt: 10,
    updatedAt: 20,
  };

  assert.equal(areDailySnapshotsEquivalent(base, updatedMeta), true);
  assert.equal(
    areDailySnapshotsEquivalent(base, { ...updatedMeta, deficit: 700 }),
    false
  );
});

test('getPreviousDateKey returns previous UTC day for valid date keys', () => {
  assert.equal(getPreviousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(getPreviousDateKey('invalid-date'), null);
});
