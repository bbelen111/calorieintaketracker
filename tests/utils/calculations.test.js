import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateBMR,
  calculateCalorieBreakdown,
  calculateCardioCalories,
  calculateTrainingSessionCalories,
  getTotalTrainingBurnForDate,
  getTrainingCalories,
} from '../../src/utils/calculations.js';

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayDateKey = getTodayDateKey();

const baseUserData = {
  age: 30,
  weight: 80,
  height: 180,
  gender: 'male',
  bodyFatEntries: [],
  bodyFatTrackingEnabled: false,
  selectedTrainingType: 'trainingtype_1',
  trainingType: {
    trainingtype_1: {
      label: 'Bodybuilding',
      caloriesPerHour: 220,
    },
  },
  trainingDuration: 1.5,
  trainingEffortType: 'intensity',
  trainingIntensity: 'moderate',
  trainingHeartRate: '',
  activityMultipliers: {
    training: 0.35,
    rest: 0.28,
  },
  cardioSessions: [],
  trainingSessions: [],
  smartTefEnabled: true,
  selectedGoal: 'cutting',
  goalChangedAt: Date.now() - 90 * 86_400_000,
  adaptiveThermogenesisEnabled: true,
  adaptiveThermogenesisSmartMode: false,
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

test('calculateBMR uses normalized details and remains stable for invalid inputs', () => {
  const bmr = calculateBMR({
    age: undefined,
    weight: null,
    height: 'not-a-number',
    gender: 'unknown',
    bodyFatEntries: [],
    bodyFatTrackingEnabled: false,
  });

  assert.equal(bmr, 1663);
});

test('heart-rate calorie calculations reject out-of-range bpm values', () => {
  const outOfRangeCardioCalories = calculateCardioCalories(
    {
      effortType: 'heartRate',
      averageHeartRate: 300,
      duration: 30,
      type: 'run',
    },
    baseUserData,
    {}
  );

  const validCardioCalories = calculateCardioCalories(
    {
      effortType: 'heartRate',
      averageHeartRate: 150,
      duration: 30,
      type: 'run',
    },
    baseUserData,
    {}
  );

  assert.equal(outOfRangeCardioCalories, 0);
  assert.ok(validCardioCalories > 0);
});

test('training heart-rate effort also enforces bpm sanity bounds', () => {
  const invalidHrTrainingCalories = getTrainingCalories(
    {
      ...baseUserData,
      trainingEffortType: 'heartRate',
      trainingHeartRate: 250,
    },
    trainingTypes
  );

  const validHrTrainingCalories = getTrainingCalories(
    {
      ...baseUserData,
      trainingEffortType: 'heartRate',
      trainingHeartRate: 160,
    },
    trainingTypes
  );

  assert.equal(invalidHrTrainingCalories, 0);
  assert.ok(validHrTrainingCalories > 0);
});

test('target smart TEF uses seeded refinement when target calories are not provided', () => {
  const bmr = calculateBMR(baseUserData);
  const breakdown = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: true,
    userData: baseUserData,
    bmr,
    cardioTypes: {},
    trainingTypes,
    tefContext: {
      mode: 'target',
      enabled: true,
    },
  });

  assert.equal(breakdown.tefMode, 'target');
  assert.equal(
    breakdown.smartTefDetails?.targetCaloriesSource,
    'subtotal-seeded'
  );
  assert.equal(breakdown.smartTefDetails?.refinementPasses, 2);
  assert.ok(breakdown.smartTefCalories > 0);
});

test('target smart TEF honors explicit target calories without refinement passes', () => {
  const bmr = calculateBMR(baseUserData);
  const breakdown = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: true,
    userData: baseUserData,
    bmr,
    cardioTypes: {},
    trainingTypes,
    tefContext: {
      mode: 'target',
      enabled: true,
      targetCalories: 3000,
    },
  });

  assert.equal(breakdown.tefMode, 'target');
  assert.equal(breakdown.smartTefDetails?.targetCaloriesSource, 'context');
  assert.equal(breakdown.smartTefDetails?.refinementPasses, 0);
  assert.equal(breakdown.smartTefDetails?.targetCalories, 3000);
});

test('target smart TEF uses bounded macro anchors in target details', () => {
  const bmr = calculateBMR({
    ...baseUserData,
    weight: 80,
    macroRecommendationSplit: {
      protein: 0.1,
      carbs: 0.8,
      fats: 0.1,
    },
  });
  const breakdown = calculateCalorieBreakdown({
    steps: 0,
    isTrainingDay: false,
    userData: {
      ...baseUserData,
      weight: 80,
      macroRecommendationSplit: {
        protein: 0.1,
        carbs: 0.8,
        fats: 0.1,
      },
    },
    bmr,
    cardioTypes: {},
    trainingTypes,
    tefContext: {
      mode: 'target',
      enabled: true,
      targetCalories: 900,
    },
  });

  assert.equal(breakdown.tefMode, 'target');
  assert.ok(breakdown.smartTefDetails?.proteinGrams >= 128);
  assert.ok(breakdown.smartTefDetails?.fatsGrams >= 48);
  assert.ok(breakdown.smartTefDetails?.carbsGrams < 50);
  assert.ok(breakdown.smartTefDetails?.bounds);
  assert.ok(
    Array.isArray(breakdown.smartTefDetails?.warnings) &&
      breakdown.smartTefDetails.warnings.includes('carb_soft_floor_relaxed')
  );
});

test('step overlap deduction lowers step calories while preserving cardio burn', () => {
  const userWithCardio = {
    ...baseUserData,
    cardioSessions: [
      {
        id: 1,
        date: todayDateKey,
        type: 'treadmill_walk',
        duration: 30,
        intensity: 'moderate',
        effortType: 'intensity',
        stepOverlapEnabled: true,
      },
    ],
  };
  const bmr = calculateBMR(userWithCardio);

  const overlapOn = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: false,
    userData: userWithCardio,
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
  });

  const overlapOff = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: false,
    userData: {
      ...userWithCardio,
      cardioSessions: [
        {
          ...userWithCardio.cardioSessions[0],
          stepOverlapEnabled: false,
        },
      ],
    },
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
  });

  assert.equal(overlapOn.cardioBurn, overlapOff.cardioBurn);
  assert.ok(overlapOn.deductedSteps > 0);
  assert.ok(overlapOn.stepCalories < overlapOff.stepCalories);
  assert.ok(
    overlapOn.remainingEstimatedSteps < overlapOn.originalEstimatedSteps
  );
});

test('training session calories are day-scoped and summed by date', () => {
  const dateA = todayDateKey;
  const dateB = '2099-01-01';
  const userWithTrainingSessions = {
    ...baseUserData,
    trainingSessions: [
      {
        id: 1,
        date: dateA,
        type: 'trainingtype_1',
        duration: 60,
        effortType: 'intensity',
        intensity: 'moderate',
      },
      {
        id: 2,
        date: dateA,
        type: 'trainingtype_1',
        duration: 30,
        effortType: 'intensity',
        intensity: 'vigorous',
      },
      {
        id: 3,
        date: dateB,
        type: 'trainingtype_1',
        duration: 120,
        effortType: 'intensity',
        intensity: 'moderate',
      },
    ],
  };

  const singleSessionCalories = calculateTrainingSessionCalories(
    userWithTrainingSessions.trainingSessions[0],
    userWithTrainingSessions,
    trainingTypes
  );
  assert.ok(singleSessionCalories > 0);

  const totalForDateA = getTotalTrainingBurnForDate(
    userWithTrainingSessions,
    trainingTypes,
    dateA
  );
  const totalForDateB = getTotalTrainingBurnForDate(
    userWithTrainingSessions,
    trainingTypes,
    dateB
  );

  assert.ok(totalForDateA > 0);
  assert.ok(totalForDateB > 0);
  assert.ok(totalForDateA !== totalForDateB);
});

test('epoc allocation includes carry-in from prior-day sessions', () => {
  const sessionStart = new Date('2026-03-21T23:30:00').getTime();
  const userWithEpocSession = {
    ...baseUserData,
    epocEnabled: true,
    epocCarryoverHours: 12,
    cardioSessions: [
      {
        id: 'epoc-carryover-cardio',
        date: '2026-03-21',
        type: 'treadmill_walk',
        duration: 30,
        effortType: 'intensity',
        intensity: 'vigorous',
        startedAt: sessionStart,
        endedAt: sessionStart + 30 * 60 * 1000,
      },
    ],
  };

  const bmr = calculateBMR(userWithEpocSession);
  const breakdown = calculateCalorieBreakdown({
    steps: 0,
    isTrainingDay: false,
    userData: userWithEpocSession,
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
    dateKey: '2026-03-22',
  });

  assert.ok(breakdown.epocCalories > 0);
  assert.ok(breakdown.epocCarryInCalories > 0);
  assert.equal(breakdown.epocFromTodaySessions, 0);
  assert.equal(breakdown.cardioBurn, 0);
});

test('epoc can be disabled in settings', () => {
  const sessionStart = new Date('2026-03-21T23:30:00').getTime();
  const userWithEpocDisabled = {
    ...baseUserData,
    epocEnabled: false,
    cardioSessions: [
      {
        id: 'epoc-disabled-cardio',
        date: '2026-03-21',
        type: 'treadmill_walk',
        duration: 30,
        effortType: 'intensity',
        intensity: 'vigorous',
        startedAt: sessionStart,
        endedAt: sessionStart + 30 * 60 * 1000,
      },
    ],
  };

  const bmr = calculateBMR(userWithEpocDisabled);
  const breakdown = calculateCalorieBreakdown({
    steps: 0,
    isTrainingDay: false,
    userData: userWithEpocDisabled,
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
    dateKey: '2026-03-22',
  });

  assert.equal(breakdown.epocCalories, 0);
  assert.equal(breakdown.epocCarryInCalories, 0);
  assert.equal(breakdown.epocFromTodaySessions, 0);
});

test('adaptive thermogenesis crude mode adjusts final tdee while preserving baseline total', () => {
  const bmr = calculateBMR(baseUserData);
  const breakdown = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: false,
    userData: baseUserData,
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
    adaptiveThermogenesisContext: { mode: 'crude' },
    dateKey: todayDateKey,
  });

  assert.equal(breakdown.adaptiveThermogenesisMode, 'crude');
  assert.equal(breakdown.adaptiveThermogenesisCorrection, -250);
  assert.equal(
    breakdown.total,
    breakdown.baselineTotal + breakdown.adaptiveThermogenesisCorrection
  );
});

test('adaptive thermogenesis smart mode returns correction from snapshot + weight divergence', () => {
  const dailySnapshots = {};
  for (let day = 1; day <= 28; day += 1) {
    const dateKey = `2026-03-${String(day).padStart(2, '0')}`;
    dailySnapshots[dateKey] = {
      date: dateKey,
      baselineTdee: 2500,
      tdee: 2500,
      intake: 2000,
    };
  }

  const userData = {
    ...baseUserData,
    goalChangedAt: Date.now() - 40 * 86_400_000,
    adaptiveThermogenesisSmartMode: true,
    dailySnapshots,
    weightEntries: [
      { date: '2026-03-01', weight: 80.0 },
      { date: '2026-03-10', weight: 79.8 },
      { date: '2026-03-18', weight: 79.5 },
      { date: '2026-03-28', weight: 79.0 },
    ],
  };

  const bmr = calculateBMR(userData);
  const breakdown = calculateCalorieBreakdown({
    steps: '10k',
    isTrainingDay: false,
    userData,
    bmr,
    cardioTypes,
    trainingTypes,
    tefContext: { mode: 'off', enabled: false },
    adaptiveThermogenesisContext: { mode: 'smart' },
    dateKey: '2026-03-28',
  });

  assert.equal(breakdown.adaptiveThermogenesisMode, 'smart');
  assert.ok(Number.isFinite(breakdown.adaptiveThermogenesisCorrection));
  assert.ok(breakdown.adaptiveThermogenesisCorrection < 0);
});
