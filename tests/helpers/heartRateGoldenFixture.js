/**
 * Golden regression fixture for the heart-rate work.
 *
 * Every HR phase promises that a user's numbers do not move unless the change
 * is intended. This fixture pins the full `calculateCalorieBreakdown` and
 * `buildDailySnapshot` output for scenarios that exercise every burn path
 * (intensity + in-range heart-rate sessions, EPOC carry-in, step overlap,
 * Smart TEF, crude AT). The expected values live in
 * `tests/fixtures/heartRateGolden.json` and were captured from the code BEFORE
 * any heart-rate change; `tests/utils/heartRateGolden.test.js` asserts the live
 * output still matches them.
 *
 * Re-capturing the JSON is only legitimate when a change is MEANT to move these
 * numbers - say so in the commit and explain which field moved and why.
 */
import {
  calculateBMR,
  calculateCalorieBreakdown,
} from '../../src/utils/calculations/calculations.js';
import { buildDailySnapshot } from '../../src/utils/calculations/dailySnapshots.js';
import { cardioTypes } from '../../src/constants/cardio/cardioTypes.js';

export const GOLDEN_DATE_KEY = '2026-03-10';
const PREVIOUS_DATE_KEY = '2026-03-09';

const TRAINING_TYPES = {
  trainingtype_1: { label: 'Bodybuilding', caloriesPerHour: 220 },
  trainingtype_4: { label: 'CrossFit', caloriesPerHour: 300 },
};

const buildSession = ({
  date,
  startTime,
  duration,
  type,
  intensity = 'moderate',
  effortType = 'intensity',
  averageHeartRate,
  stepOverlapEnabled,
  id,
}) => {
  const startedAt = new Date(`${date}T${startTime}:00`).getTime();
  const session = {
    id,
    date,
    startTime,
    startedAt,
    endedAt: startedAt + duration * 60 * 1000,
    duration,
    type,
    intensity,
    effortType,
  };
  if (averageHeartRate !== undefined) {
    session.averageHeartRate = averageHeartRate;
  }
  if (stepOverlapEnabled !== undefined) {
    session.stepOverlapEnabled = stepOverlapEnabled;
  }
  return session;
};

const SESSIONS = {
  cardio: [
    buildSession({
      id: 'c1',
      date: GOLDEN_DATE_KEY,
      startTime: '07:00',
      duration: 30,
      type: 'treadmill_run',
      intensity: 'vigorous',
      stepOverlapEnabled: true,
    }),
    // In-range heart-rate session with the default stored intensity, so no
    // planned HR change (bounds, stale-intensity cadence) may move it.
    buildSession({
      id: 'c2',
      date: GOLDEN_DATE_KEY,
      startTime: '17:30',
      duration: 45,
      type: 'bike_outdoor',
      effortType: 'heartRate',
      averageHeartRate: 145,
      stepOverlapEnabled: false,
    }),
    // Previous evening: drives EPOC carry-in into the golden day.
    buildSession({
      id: 'c3',
      date: PREVIOUS_DATE_KEY,
      startTime: '21:00',
      duration: 60,
      type: 'rowing',
      intensity: 'vigorous',
      stepOverlapEnabled: false,
    }),
  ],
  training: [
    buildSession({
      id: 't1',
      date: GOLDEN_DATE_KEY,
      startTime: '12:00',
      duration: 60,
      type: 'trainingtype_1',
      intensity: 'vigorous',
    }),
    buildSession({
      id: 't2',
      date: GOLDEN_DATE_KEY,
      startTime: '19:00',
      duration: 45,
      type: 'trainingtype_4',
      effortType: 'heartRate',
      averageHeartRate: 150,
    }),
  ],
};

const buildCrudeSnapshots = () => {
  const snapshots = {};
  for (let offset = 1; offset <= 12; offset += 1) {
    const date = new Date(`${GOLDEN_DATE_KEY}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    snapshots[key] = {
      date: key,
      goalAtSnapshot: 'cutting',
      selectedGoal: 'cutting',
      tdee: 2600,
      intake: 2100,
    };
  }
  return snapshots;
};

const NUTRITION = {
  [GOLDEN_DATE_KEY]: {
    breakfast: [
      {
        id: 'n1',
        name: 'Oats',
        grams: 100,
        calories: 380,
        protein: 13,
        carbs: 67,
        fats: 7,
        fiber: 10,
        sodium: 5,
        saturatedFats: 1.2,
        sugars: 1,
      },
    ],
    dinner: [
      {
        id: 'n2',
        name: 'Chicken breast, raw',
        grams: 250,
        calories: 300,
        protein: 56,
        carbs: 0,
        fats: 6.5,
      },
    ],
  },
};

const BASE_USER = {
  age: 30,
  weight: 80,
  height: 180,
  gender: 'male',
  bodyFatEntries: [],
  bodyFatTrackingEnabled: false,
  activityMultipliers: { training: 0.2, rest: 0.22 },
  cardioSessions: SESSIONS.cardio,
  trainingSessions: SESSIONS.training,
  stepEntries: [{ date: GOLDEN_DATE_KEY, steps: 9000, source: 'manual' }],
  weightEntries: [],
  nutritionData: NUTRITION,
  dailyNeatOverrides: {},
  dailySnapshots: {},
  smartTefEnabled: false,
  adaptiveThermogenesisEnabled: false,
  adaptiveThermogenesisSmartMode: false,
  epocEnabled: true,
  epocCarryoverHours: 6,
  selectedGoal: 'maintenance',
  goalChangedAt: Date.UTC(2026, 0, 1),
};

export const GOLDEN_SCENARIOS = {
  maleTrainingDay: {
    userData: BASE_USER,
    steps: 9000,
    isTrainingDay: true,
  },
  femaleSmartTefCrudeAt: {
    userData: {
      ...BASE_USER,
      age: 41,
      weight: 62,
      height: 165,
      gender: 'female',
      smartTefEnabled: true,
      adaptiveThermogenesisEnabled: true,
      selectedGoal: 'cutting',
      dailySnapshots: buildCrudeSnapshots(),
    },
    steps: 7200,
    isTrainingDay: true,
    tefContext: {
      mode: 'dynamic',
      totals: { protein: 69, carbs: 67, fats: 13.5 },
    },
  },
  restDayNoSessions: {
    userData: {
      ...BASE_USER,
      cardioSessions: [],
      trainingSessions: [],
      stepEntries: [{ date: GOLDEN_DATE_KEY, steps: 4000, source: 'manual' }],
    },
    steps: 4000,
    isTrainingDay: false,
  },
};

const stripSnapshotMetadata = (snapshot) => {
  if (!snapshot) {
    return snapshot;
  }
  const rest = { ...snapshot };
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
};

/** Live outputs for every scenario, as a JSON-safe object. */
export const computeGoldenOutputs = () => {
  const outputs = {};
  Object.entries(GOLDEN_SCENARIOS).forEach(([name, scenario]) => {
    const bmr = calculateBMR(scenario.userData);
    const breakdown = calculateCalorieBreakdown({
      steps: scenario.steps,
      isTrainingDay: scenario.isTrainingDay,
      userData: scenario.userData,
      bmr,
      cardioTypes,
      trainingTypes: TRAINING_TYPES,
      tefContext: scenario.tefContext,
      dateKey: GOLDEN_DATE_KEY,
    });
    const snapshot = buildDailySnapshot({
      dateKey: GOLDEN_DATE_KEY,
      userData: scenario.userData,
      trainingTypes: TRAINING_TYPES,
      cardioTypes,
      bmr,
      goalKey: scenario.userData.selectedGoal,
    });
    outputs[name] = {
      breakdown: JSON.parse(JSON.stringify(breakdown)),
      snapshot: JSON.parse(JSON.stringify(stripSnapshotMetadata(snapshot))),
    };
  });
  return outputs;
};
