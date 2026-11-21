import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SESSION_HEART_RATE_BPM,
  SESSION_HEART_RATE_MAX_BPM,
  SESSION_HEART_RATE_MIN_BPM,
  normalizeSessionHeartRate,
} from '../../src/constants/health/heartRate.js';
import {
  calculateCalorieBreakdown,
  calculateCardioCalories,
  calculateTrainingSessionCalories,
} from '../../src/utils/calculations/calculations.js';
import { resolveCardioSessionEpoc } from '../../src/utils/calculations/epoc.js';
import { estimateSessionStepsFromCardio } from '../../src/utils/calculations/steps.js';

const MALE = { age: 30, weight: 80, height: 180, gender: 'male' };
const FEMALE = { age: 41, weight: 62, height: 165, gender: 'female' };
const TRAINING_TYPES = {
  trainingtype_1: { label: 'Bodybuilding', caloriesPerHour: 220 },
  trainingtype_4: { label: 'CrossFit', caloriesPerHour: 300 },
};
const CARDIO_TYPES = {
  running: {
    label: 'Running',
    met: { light: 6, moderate: 8, vigorous: 11 },
    ambulatory: true,
    cadence: 160,
  },
};

// Keytel et al. 2005 (no VO2max), kJ/min -> kcal/min via / 4.184. Written out
// here independently of the implementation so a coefficient typo is caught.
const keytelKcalPerMin = ({ hr, weight, age, gender }) =>
  gender === 'female'
    ? (-20.4022 + 0.4472 * hr - 0.1263 * weight + 0.074 * age) / 4.184
    : (-55.0969 + 0.6309 * hr + 0.1988 * weight + 0.2017 * age) / 4.184;

test('normalizeSessionHeartRate: whole bpm inside 60-220, null otherwise', () => {
  assert.equal(SESSION_HEART_RATE_MIN_BPM, 60);
  assert.equal(SESSION_HEART_RATE_MAX_BPM, 220);
  assert.equal(DEFAULT_SESSION_HEART_RATE_BPM, 120);

  assert.equal(normalizeSessionHeartRate(60), 60);
  assert.equal(normalizeSessionHeartRate(220), 220);
  assert.equal(normalizeSessionHeartRate('145'), 145);
  assert.equal(normalizeSessionHeartRate(144.6), 145);

  assert.equal(normalizeSessionHeartRate(59), null);
  assert.equal(normalizeSessionHeartRate(221), null);
  assert.equal(normalizeSessionHeartRate(300), null);
  assert.equal(normalizeSessionHeartRate(0), null);
  assert.equal(normalizeSessionHeartRate(''), null);
  assert.equal(normalizeSessionHeartRate(null), null);
  assert.equal(normalizeSessionHeartRate(undefined), null);
  assert.equal(normalizeSessionHeartRate('abc'), null);
  assert.equal(normalizeSessionHeartRate(Number.NaN), null);
});

test('cardio HR burn matches the Keytel formula exactly (male + female)', () => {
  const session = {
    duration: 45,
    effortType: 'heartRate',
    averageHeartRate: 150,
    type: 'running',
  };

  assert.equal(
    calculateCardioCalories(session, MALE, CARDIO_TYPES),
    Math.round(
      keytelKcalPerMin({ hr: 150, weight: 80, age: 30, gender: 'male' }) * 45
    )
  );
  assert.equal(
    calculateCardioCalories(session, FEMALE, CARDIO_TYPES),
    Math.round(
      keytelKcalPerMin({ hr: 150, weight: 62, age: 41, gender: 'female' }) * 45
    )
  );
  // Out of range prices at 0 (unchanged behaviour, now from the shared bounds)
  assert.equal(
    calculateCardioCalories(
      { ...session, averageHeartRate: 221 },
      MALE,
      CARDIO_TYPES
    ),
    0
  );
});

test('HR-mode training session uses Keytel and ignores kcal/hr', () => {
  const session = {
    duration: 45,
    type: 'trainingtype_4',
    intensity: 'vigorous',
    effortType: 'heartRate',
    averageHeartRate: 150,
  };
  assert.equal(
    calculateTrainingSessionCalories(session, MALE, TRAINING_TYPES),
    Math.round(
      keytelKcalPerMin({ hr: 150, weight: 80, age: 30, gender: 'male' }) * 45
    )
  );
});

test('breakdown exposes per-session trainingDetails that sum to trainingBurn', () => {
  const dateKey = '2026-03-10';
  const breakdown = calculateCalorieBreakdown({
    steps: 5000,
    isTrainingDay: true,
    userData: {
      ...MALE,
      trainingSessions: [
        {
          date: dateKey,
          duration: 60,
          type: 'trainingtype_1',
          intensity: 'vigorous',
          effortType: 'intensity',
        },
        {
          date: dateKey,
          duration: 45,
          type: 'trainingtype_4',
          intensity: 'moderate',
          effortType: 'heartRate',
          averageHeartRate: 150,
        },
        // Another day's session must not leak into the lines
        {
          date: '2026-03-09',
          duration: 60,
          type: 'trainingtype_1',
          intensity: 'light',
          effortType: 'intensity',
        },
      ],
      cardioSessions: [],
      epocEnabled: false,
    },
    bmr: 1800,
    cardioTypes: CARDIO_TYPES,
    trainingTypes: TRAINING_TYPES,
    dateKey,
  });

  const { trainingDetails } = breakdown;
  assert.equal(trainingDetails.length, 2);

  const [intensityLine, heartRateLine] = trainingDetails;
  assert.deepEqual(intensityLine, {
    typeKey: 'trainingtype_1',
    typeLabel: 'Bodybuilding',
    effortType: 'intensity',
    intensityKey: 'vigorous',
    durationMinutes: 60,
    baseCaloriesPerHour: 220,
    intensityMultiplier: 1.25,
    calories: 275,
  });

  assert.equal(heartRateLine.effortType, 'heartRate');
  assert.equal(heartRateLine.typeLabel, 'CrossFit');
  assert.equal(heartRateLine.averageHeartRate, 150);
  assert.equal(heartRateLine.durationMinutes, 45);
  assert.ok(
    Math.abs(
      heartRateLine.caloriesPerMinute -
        keytelKcalPerMin({ hr: 150, weight: 80, age: 30, gender: 'male' })
    ) < 1e-9
  );

  assert.equal(
    trainingDetails.reduce((sum, line) => sum + line.calories, 0),
    breakdown.trainingBurn
  );
});

test('EPOC: an out-of-range HR falls back to the stored intensity', () => {
  const base = {
    id: 's1',
    duration: 45,
    type: 'running',
    effortType: 'heartRate',
  };
  const userData = { age: 30, epocCarryoverHours: 6 };
  const resolve = (session) =>
    resolveCardioSessionEpoc({
      session,
      exerciseCalories: 500,
      cardioType: CARDIO_TYPES.running,
      userData,
    });

  // 300 bpm used to read as "vigorous" (300 / 190 >= 0.85); it is a typo.
  const outOfRange = resolve({
    ...base,
    averageHeartRate: 300,
    intensity: 'light',
  });
  const storedLight = resolve({
    ...base,
    effortType: 'intensity',
    intensity: 'light',
  });
  assert.equal(outOfRange.details.intensity, 'light');
  assert.equal(outOfRange.totalCalories, storedLight.totalCalories);

  // In range still classifies from %HRmax (220 - age): 170 / 190 = 0.89
  const inRange = resolve({
    ...base,
    averageHeartRate: 170,
    intensity: 'light',
  });
  assert.equal(inRange.details.intensity, 'vigorous');
});

test('step overlap: HR sessions ignore a stale stored intensity', () => {
  const session = {
    type: 'running',
    duration: 30,
    effortType: 'heartRate',
    averageHeartRate: 140,
  };
  const withStaleVigorous = estimateSessionStepsFromCardio(
    { ...session, intensity: 'vigorous' },
    CARDIO_TYPES
  );
  const withModerate = estimateSessionStepsFromCardio(
    { ...session, intensity: 'moderate' },
    CARDIO_TYPES
  );
  // 160 spm x (140 / 140) x 30 min, regardless of the stored intensity
  assert.equal(withStaleVigorous, 4800);
  assert.equal(withModerate, 4800);

  // An out-of-range HR is neutral instead of pinning the 1.25 ceiling
  assert.equal(
    estimateSessionStepsFromCardio(
      { ...session, averageHeartRate: 300 },
      CARDIO_TYPES
    ),
    4800
  );

  // Intensity-mode sessions keep their intensity cadence factor
  assert.equal(
    estimateSessionStepsFromCardio(
      { ...session, effortType: 'intensity', intensity: 'vigorous' },
      CARDIO_TYPES
    ),
    Math.round(160 * 1.1 * 30)
  );
});
