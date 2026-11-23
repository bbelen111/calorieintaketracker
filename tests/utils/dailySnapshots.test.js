import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areDailySnapshotsEquivalent,
  buildDailySnapshot,
  getPreviousDateKey,
  resolveSnapshotBreakdownContexts,
  resolveSnapshotGoalTarget,
} from '../../src/utils/calculations/dailySnapshots.js';
import { calculateGoalSeededBreakdown } from '../../src/utils/calculations/calculations.js';
import { getNutritionTotalsForDate } from '../../src/utils/phases/phases.js';
import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../../src/constants/activity/activityPresets.js';

const dateKey = '2026-03-21';

const userData = {
  age: 30,
  weight: 80,
  height: 180,
  gender: 'male',
  bodyFatEntries: [],
  bodyFatTrackingEnabled: false,
  selectedGoal: 'cutting',
  goalChangedAt: 1700000000000,
  smartTefEnabled: true,
  adaptiveThermogenesisEnabled: true,
  adaptiveThermogenesisSmartMode: false,
  activityMultipliers: {
    ...DEFAULT_ACTIVITY_MULTIPLIERS,
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
      type: 'trainingtype_1',
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
  trainingtype_1: {
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
  assert.equal(snapshot.goalAtSnapshot, 'cutting');
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
  assert.ok(Number.isFinite(snapshot.baselineTdee));
  assert.ok(Number.isFinite(snapshot.adaptiveThermogenesisCorrection));
  assert.equal(snapshot.adaptiveThermogenesisMode, 'crude');
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

test('buildDailySnapshot applies carryover calories allocated from prior-day timestamped sessions', () => {
  const sessionStart = new Date('2026-03-21T23:30:00').getTime();
  const withCarryover = {
    ...userData,
    epocEnabled: true,
    epocCarryoverHours: 12,
    cardioSessions: [
      {
        id: 'carryover-cardio',
        date: '2026-03-21',
        type: 'treadmill_walk',
        startTime: '23:30',
        startedAt: sessionStart,
        endedAt: sessionStart + 30 * 60 * 1000,
        duration: 30,
        effortType: 'intensity',
        intensity: 'moderate',
        stepOverlapEnabled: true,
      },
    ],
    trainingSessions: [],
    stepEntries: [
      {
        date: '2026-03-22',
        steps: 5000,
        source: 'manual',
      },
    ],
    nutritionData: {
      '2026-03-22': {},
    },
  };

  const snapshot = buildDailySnapshot({
    dateKey: '2026-03-22',
    userData: withCarryover,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });

  assert.ok(snapshot.epocCarryInCalories > 0);
  assert.ok(snapshot.epoc > 0);
  assert.equal(snapshot.epoc, snapshot.epocCardio + snapshot.epocTraining);
});

test('snapshot persists micro totals and partial coverage', () => {
  const snapshotUser = {
    ...userData,
    nutritionData: {
      [dateKey]: {
        breakfast: [
          {
            id: 'm1',
            calories: 200,
            protein: 10,
            carbs: 30,
            fats: 5,
            fiber: 3,
            sodium: 200,
            saturatedFats: 1,
            sugars: 6,
          },
          {
            id: 'm2',
            calories: 100,
            protein: 5,
            carbs: 15,
            fats: 2,
          },
        ],
        lunch: [],
        dinner: [],
      },
    },
  };

  const snapshot = buildDailySnapshot({
    dateKey,
    userData: snapshotUser,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });

  assert.equal(snapshot.micros.sodium, 200);
  assert.equal(snapshot.micros.fiber, 3);
  assert.equal(snapshot.micros.saturatedFats, 1);
  assert.equal(snapshot.micros.sugars, 6);
  // Second entry has no micros -> the day sum is partial.
  assert.equal(snapshot.microsCoverage.sodium, true);
  assert.equal(snapshot.microsCoverage.fiber, true);
});

test('snapshot micros are null when no micro data is logged that day', () => {
  const plainUser = {
    ...userData,
    nutritionData: {
      [dateKey]: {
        breakfast: [
          { id: 'p1', calories: 300, protein: 20, carbs: 40, fats: 8 },
        ],
        lunch: [],
        dinner: [],
      },
    },
  };

  const snapshot = buildDailySnapshot({
    dateKey,
    userData: plainUser,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });

  assert.equal(snapshot.micros.fiber, null);
  assert.equal(snapshot.micros.sodium, null);
  assert.equal(snapshot.microsCoverage.fiber, false);
});

test('buildDailySnapshot records the user TEF display mode', () => {
  // smartTefEnabled + default target flag -> target (the non-logger case).
  const targetSnapshot = buildDailySnapshot({
    dateKey,
    userData,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });
  assert.equal(targetSnapshot.tefMode, 'target');
  assert.ok(targetSnapshot.tef > 0);

  const dynamicSnapshot = buildDailySnapshot({
    dateKey,
    userData: { ...userData, smartTefQuickEstimatesTargetMode: false },
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });
  assert.equal(dynamicSnapshot.tefMode, 'dynamic');

  const offSnapshot = buildDailySnapshot({
    dateKey,
    userData: { ...userData, smartTefEnabled: false },
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
  });
  assert.equal(offSnapshot.tefMode, 'off');
  assert.equal(offSnapshot.tef, 0);
});

test('snapshot TDEE matches the ledger recompute for the recorded mode', () => {
  const snapshot = buildDailySnapshot({
    dateKey,
    userData,
    trainingTypes,
    cardioTypes,
    existingSnapshot: null,
    goalKey: 'cutting',
  });

  const { tefContext, adaptiveThermogenesisContext } =
    resolveSnapshotBreakdownContexts(snapshot, {
      nutritionTotals: getNutritionTotalsForDate(
        userData.nutritionData,
        dateKey
      ),
    });

  const recomputed = calculateGoalSeededBreakdown({
    steps: snapshot.stepCount,
    isTrainingDay: snapshot.isTrainingDay,
    userData,
    bmr: snapshot.bmr,
    cardioTypes,
    trainingTypes,
    tefContext,
    adaptiveThermogenesisContext,
    dateKey,
    goalKey: 'cutting',
  });

  assert.equal(recomputed.total, snapshot.tdee);
  assert.equal(recomputed.tefMode, snapshot.tefMode);
  assert.equal(Math.round(recomputed.smartTefCalories), snapshot.tef);
});

test('resolveSnapshotBreakdownContexts rebuilds recorded modes with pinned enabled flags', () => {
  assert.deepEqual(
    resolveSnapshotBreakdownContexts({
      tefMode: 'target',
      adaptiveThermogenesisMode: 'smart',
    }),
    {
      tefContext: { mode: 'target', enabled: true },
      adaptiveThermogenesisContext: { mode: 'smart' },
    }
  );

  assert.deepEqual(
    resolveSnapshotBreakdownContexts(
      { tefMode: 'dynamic', adaptiveThermogenesisMode: 'off' },
      { nutritionTotals: { protein: 1, carbs: 2, fats: 3 } }
    ),
    {
      tefContext: {
        mode: 'dynamic',
        enabled: true,
        totals: { protein: 1, carbs: 2, fats: 3 },
      },
      adaptiveThermogenesisContext: { mode: 'off', enabled: false },
    }
  );

  assert.deepEqual(resolveSnapshotBreakdownContexts({}), {
    tefContext: { mode: 'off', enabled: false },
    adaptiveThermogenesisContext: { mode: 'off', enabled: false },
  });
});

const buildFor = (overrides = {}) =>
  buildDailySnapshot({
    dateKey,
    userData,
    trainingTypes: {},
    cardioTypes: {},
    todayKey: dateKey,
    ...overrides,
  });

test("buildDailySnapshot records the day's goal target (positive = deficit)", () => {
  assert.equal(buildFor().goalTarget, 300); // userData.selectedGoal = cutting
  assert.equal(buildFor({ goalKey: 'aggressive_bulk' }).goalTarget, -500);
  assert.equal(buildFor({ goalKey: 'maintenance' }).goalTarget, 0);
});

test('buildDailySnapshot records an active phase delta instead of the nominal one', () => {
  // Phase deltas are signed calorie deltas (negative = cut), like the store's.
  assert.equal(buildFor({ goalDeltaOverride: -420 }).goalTarget, 420);
  assert.equal(buildFor({ goalDeltaOverride: 250 }).goalTarget, -250);
});

test('buildDailySnapshot: a past day keeps its recorded goal and target on rebuild', () => {
  const recorded = buildFor({ goalKey: 'aggressive_cut' });
  assert.equal(recorded.goalTarget, 500);

  // Later, the user is on a different goal and edits a meal on that old day.
  const rebuilt = buildFor({
    existingSnapshot: { ...recorded, goalAtSnapshot: 'aggressive_cut' },
    goalKey: 'maintenance',
    userData: { ...userData, selectedGoal: 'maintenance' },
    todayKey: '2026-03-25',
  });
  assert.equal(rebuilt.goalAtSnapshot, 'aggressive_cut');
  assert.equal(rebuilt.goalTarget, 500);
});

test('buildDailySnapshot: today follows the live goal on rebuild', () => {
  const morning = buildFor({ goalKey: 'cutting' });
  const evening = buildFor({
    existingSnapshot: morning,
    goalKey: 'maintenance',
    userData: { ...userData, selectedGoal: 'maintenance' },
    todayKey: dateKey,
  });
  assert.equal(evening.goalAtSnapshot, 'maintenance');
  assert.equal(evening.goalTarget, 0);
});

test('buildDailySnapshot: a legacy past snapshot keeps its goal and leaves the target unknown', () => {
  const legacy = {
    ...buildFor({ goalKey: 'cutting' }),
    goalAtSnapshot: 'bulking',
  };
  delete legacy.goalTarget;

  const rebuilt = buildFor({
    existingSnapshot: legacy,
    goalKey: 'maintenance',
    userData: { ...userData, selectedGoal: 'maintenance' },
    todayKey: '2026-03-25',
  });
  assert.equal(rebuilt.goalAtSnapshot, 'bulking');
  assert.equal(rebuilt.goalTarget, null);
  assert.deepEqual(resolveSnapshotGoalTarget(rebuilt), {
    target: -300,
    source: 'nominal',
  });
});

test('resolveSnapshotGoalTarget: recorded wins, nominal is the legacy fallback, else unknown', () => {
  assert.deepEqual(
    resolveSnapshotGoalTarget({ goalTarget: 420.4, goalAtSnapshot: 'cutting' }),
    { target: 420, source: 'recorded' }
  );
  assert.deepEqual(resolveSnapshotGoalTarget({ goalTarget: 0 }), {
    target: 0,
    source: 'recorded',
  });
  assert.deepEqual(
    resolveSnapshotGoalTarget({ goalAtSnapshot: 'maintenance' }),
    { target: 0, source: 'nominal' }
  );
  assert.equal(resolveSnapshotGoalTarget({ goalTarget: null }), null);
  assert.equal(resolveSnapshotGoalTarget({ goalAtSnapshot: 'nonsense' }), null);
  assert.equal(resolveSnapshotGoalTarget(null), null);
});
