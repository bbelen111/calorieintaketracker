import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyHeartRateSummary,
  applyManualHeartRate,
  applyWorkoutToCardioDraft,
  applyWorkoutToTrainingDraft,
  clearHeartRateFields,
  getStoredTrainingHrBurnModel,
  isStrengthWorkout,
  mapWorkoutTypeToCardioType,
  resolveDraftWindow,
  resolveTrainingHrBurnModel,
  sanitizeSessionHeartRateDetails,
} from '../../src/utils/calculations/sessionHeartRate.js';
import { WORKOUT_TYPE_TO_CARDIO_TYPE } from '../../src/constants/health/workoutTypeMap.js';
import { cardioTypes } from '../../src/constants/cardio/cardioTypes.js';
import {
  assessAdaptiveThermogenesisPhysiology,
  assessNeatFromHeartRate,
  computeWakingHeartRate,
} from '../../src/utils/calculations/heartRate.js';
import { calculatePhaseRestingHeartRate } from '../../src/utils/phases/phases.js';
import {
  addRecordingSample,
  createRecording,
  summarizeRecording,
} from '../../src/services/heartRateSensor.js';

const D = '2026-03-10';
const shift = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Session fields
// ---------------------------------------------------------------------------

test('every workout mapping targets a real cardio type', () => {
  Object.entries(WORKOUT_TYPE_TO_CARDIO_TYPE).forEach(([workoutType, key]) => {
    assert.ok(
      cardioTypes[key],
      `${workoutType} -> ${key} is not a cardio type`
    );
  });
  assert.equal(
    mapWorkoutTypeToCardioType('walking', cardioTypes),
    'walking_outdoor'
  );
  // Plain outdoor running has no honest match: the user picks
  assert.equal(mapWorkoutTypeToCardioType('running', cardioTypes), null);
  assert.equal(isStrengthWorkout('traditionalStrengthTraining'), true);
  assert.equal(isStrengthWorkout('cycling'), false);
});

test('a typed average replaces the wearable details it overrides', () => {
  const fromWatch = {
    effortType: 'heartRate',
    averageHeartRate: 142,
    maxHeartRate: 171,
    heartRateSource: 'healthConnect',
    heartRateCoverage: 0.92,
    heartRateZoneSeconds: [0, 60, 600, 300, 0],
  };
  assert.deepEqual(applyManualHeartRate(fromWatch, 150), {
    effortType: 'heartRate',
    averageHeartRate: 150,
    heartRateSource: 'manual',
  });
});

test('applyHeartRateSummary fills HR mode from a summary, dropping invalid parts', () => {
  const next = applyHeartRateSummary(
    { effortType: 'intensity', intensity: 'light', type: 'rowing' },
    {
      average: 141,
      max: 168,
      coverage: 0.8,
      zoneSeconds: [10, 20, 30, 40, 50],
    },
    'ble'
  );
  assert.equal(next.effortType, 'heartRate');
  assert.equal(next.averageHeartRate, 141);
  assert.equal(next.maxHeartRate, 168);
  assert.equal(next.heartRateSource, 'ble');
  assert.equal(next.heartRateCoverage, 0.8);
  assert.deepEqual(next.heartRateZoneSeconds, [10, 20, 30, 40, 50]);

  // Live-recording summary shape (averageHeartRate / maxHeartRate) works too
  const fromRecording = applyHeartRateSummary(
    {},
    { averageHeartRate: 130, maxHeartRate: 160, coverage: 2, zoneSeconds: [1] },
    'ble'
  );
  assert.equal(fromRecording.averageHeartRate, 130);
  assert.equal(fromRecording.heartRateCoverage, undefined);
  assert.equal(fromRecording.heartRateZoneSeconds, undefined);

  // An out-of-range average leaves the draft untouched
  const draft = { effortType: 'intensity' };
  assert.equal(applyHeartRateSummary(draft, { average: 300 }, 'ble'), draft);
});

test('clearHeartRateFields + sanitizeSessionHeartRateDetails', () => {
  assert.deepEqual(
    clearHeartRateFields({
      type: 'x',
      averageHeartRate: 140,
      maxHeartRate: 170,
      heartRateSource: 'ble',
      hrBurnModel: 'intensity',
    }),
    { type: 'x' }
  );
  assert.deepEqual(
    sanitizeSessionHeartRateDetails({
      maxHeartRate: 999,
      heartRateSource: 'telepathy',
      heartRateCoverage: -1,
      heartRateZoneSeconds: [1, 2],
      healthWorkoutId: '  ',
      keep: true,
    }),
    { keep: true }
  );
});

test('training HR pricing model: new sessions intensity, stored legacy keeps Keytel', () => {
  assert.equal(resolveTrainingHrBurnModel({}), 'intensity');
  assert.equal(resolveTrainingHrBurnModel({ hrBurnModel: 'keytel' }), 'keytel');
  assert.equal(
    getStoredTrainingHrBurnModel({ effortType: 'heartRate' }),
    'keytel'
  );
  assert.equal(
    getStoredTrainingHrBurnModel({
      effortType: 'heartRate',
      hrBurnModel: 'intensity',
    }),
    'intensity'
  );
  assert.equal(
    getStoredTrainingHrBurnModel({ effortType: 'intensity' }),
    undefined
  );
});

test('workout import fills type, time, duration and the HR summary', () => {
  const startMs = new Date(2026, 2, 10, 6, 30).getTime();
  const workout = {
    id: 'w1',
    workoutType: 'cycling',
    startMs,
    endMs: startMs + 45 * 60_000,
    durationMinutes: 45,
  };
  const cardio = applyWorkoutToCardioDraft(
    { type: 'treadmill_walk', startedAt: 1, endedAt: 2 },
    workout,
    { summary: { average: 138, max: 165 } },
    cardioTypes
  );
  assert.equal(cardio.type, 'bike_outdoor');
  assert.equal(cardio.startTime, '06:30');
  assert.equal(cardio.duration, 45);
  assert.equal(cardio.healthWorkoutId, 'w1');
  assert.equal(cardio.averageHeartRate, 138);
  assert.equal(cardio.heartRateSource, 'healthConnect');
  assert.equal(cardio.startedAt, undefined);

  const training = applyWorkoutToTrainingDraft(
    { type: 'trainingtype_1' },
    workout,
    null
  );
  assert.equal(training.durationHours, 0.75);
  assert.equal(training.averageHeartRate, undefined);
});

test('resolveDraftWindow builds a local window or null', () => {
  const window = resolveDraftWindow({
    dateKey: D,
    startTime: '07:15',
    durationMinutes: 30,
  });
  assert.equal(window.endMs - window.startMs, 30 * 60_000);
  assert.equal(new Date(window.startMs).getHours(), 7);
  assert.equal(
    resolveDraftWindow({ dateKey: D, startTime: '7:15', durationMinutes: 30 }),
    null
  );
  assert.equal(
    resolveDraftWindow({ dateKey: D, startTime: '07:15', durationMinutes: 0 }),
    null
  );
});

// ---------------------------------------------------------------------------
// Waking HR + NEAT advisory + AT physiology
// ---------------------------------------------------------------------------

const hourBucket = (hour, value) => {
  const start = new Date(2026, 2, 10, hour, 0, 0);
  return {
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 3_600_000).toISOString(),
    value,
  };
};

test('waking HR averages 08-22 hours and skips hours with a session', () => {
  const buckets = [
    hourBucket(3, 50), // night: ignored
    hourBucket(9, 70),
    hourBucket(10, 72),
    hourBucket(11, 74),
    hourBucket(12, 140), // overlaps a session: ignored
    hourBucket(13, 76),
    hourBucket(23, 60), // late: ignored
  ];
  const sessionStart = new Date(2026, 2, 10, 12, 10).getTime();
  assert.equal(
    computeWakingHeartRate(buckets, {
      excludeIntervals: [
        { startMs: sessionStart, endMs: sessionStart + 40 * 60_000 },
      ],
    }),
    73
  );
  assert.equal(computeWakingHeartRate(buckets.slice(0, 3)), null);
});

const wakingEntries = (todayValue, baselineValue = 70, days = 20) => {
  const entries = [{ date: D, wakingAvgHr: todayValue }];
  for (let offset = 1; offset <= days; offset += 1) {
    entries.push({ date: shift(D, -offset), wakingAvgHr: baselineValue });
  }
  return entries;
};

test('NEAT advisory: up / down / none, gated on baseline and steps', () => {
  assert.deepEqual(
    assessNeatFromHeartRate({
      heartRateEntries: wakingEntries(79),
      stepEntries: [],
      dateKey: D,
    }),
    { direction: 'up', deltaBpm: 9, baselineDays: 20 }
  );
  assert.deepEqual(
    assessNeatFromHeartRate({
      heartRateEntries: wakingEntries(63),
      stepEntries: [],
      dateKey: D,
    }),
    { direction: 'down', deltaBpm: -7, baselineDays: 20 }
  );
  assert.equal(
    assessNeatFromHeartRate({
      heartRateEntries: wakingEntries(74),
      stepEntries: [],
      dateKey: D,
    }),
    null
  );
  // Not enough baseline days
  assert.equal(
    assessNeatFromHeartRate({
      heartRateEntries: wakingEntries(80, 70, 10),
      stepEntries: [],
      dateKey: D,
    }),
    null
  );
  // Elevated HR on a high-step day is the walking: no "up" suggestion
  const steps = [{ date: D, steps: 15000 }];
  for (let offset = 1; offset <= 20; offset += 1) {
    steps.push({ date: shift(D, -offset), steps: 8000 });
  }
  assert.equal(
    assessNeatFromHeartRate({
      heartRateEntries: wakingEntries(80),
      stepEntries: steps,
      dateKey: D,
    }),
    null
  );
});

test('AT physiology check is display-only corroboration over measured readings', () => {
  const falling = [];
  for (let offset = -27; offset <= 0; offset += 3) {
    falling.push({
      date: shift(D, offset),
      restingHr: 60 + -offset / 3,
      restingHrMethod: 'device',
    });
  }
  assert.equal(
    assessAdaptiveThermogenesisPhysiology({
      correction: -120,
      heartRateEntries: falling,
      dateKey: D,
    }).agreement,
    'agrees'
  );
  assert.equal(
    assessAdaptiveThermogenesisPhysiology({
      correction: 80,
      heartRateEntries: falling,
      dateKey: D,
    }).agreement,
    'disagrees'
  );
  assert.equal(
    assessAdaptiveThermogenesisPhysiology({
      correction: 0,
      heartRateEntries: falling,
      dateKey: D,
    }).agreement,
    'neutral'
  );
  // Estimated readings never count
  const estimated = falling.map((entry) => ({
    ...entry,
    restingHrMethod: 'estimated',
  }));
  assert.equal(
    assessAdaptiveThermogenesisPhysiology({
      correction: -120,
      heartRateEntries: estimated,
      dateKey: D,
    }),
    null
  );
});

test('phase resting HR: first/last reading in the phase, one family only', () => {
  const phase = { startDate: shift(D, -10), endDate: D };
  assert.deepEqual(
    calculatePhaseRestingHeartRate(phase, [
      { date: shift(D, -12), restingHr: 70, restingHrMethod: 'manual' },
      { date: shift(D, -9), restingHr: 62, restingHrMethod: 'manual' },
      { date: shift(D, -5), restingHr: 60, restingHrMethod: 'device' },
      { date: shift(D, -1), restingHr: 58, restingHrMethod: 'manual' },
    ]),
    {
      restingHrStart: 62,
      restingHrEnd: 58,
      restingHrChange: -4,
      restingHrReadings: 3,
    }
  );
  assert.equal(
    calculatePhaseRestingHeartRate(phase, [
      { date: shift(D, -9), restingHr: 62, restingHrMethod: 'manual' },
    ]).restingHrStart,
    null
  );
});

// ---------------------------------------------------------------------------
// Live recording accumulator
// ---------------------------------------------------------------------------

test('live recording: trapezoid between beats, gaps excluded, short sessions refused', () => {
  const startedAt = 1_000_000;
  let recording = createRecording({ kind: 'cardio', startedAt });
  // 0-60 s at 120 bpm, 1 Hz
  for (let t = 0; t <= 60; t += 1) {
    recording = addRecordingSample(
      recording,
      { timeMs: startedAt + t * 1000, bpm: 120 },
      null
    );
  }
  // 30 s signal loss, then 60 s at 140
  for (let t = 90; t <= 150; t += 1) {
    recording = addRecordingSample(
      recording,
      { timeMs: startedAt + t * 1000, bpm: 140 },
      null
    );
  }
  // Implausible frames are ignored
  recording = addRecordingSample(
    recording,
    { timeMs: startedAt + 151_000, bpm: 300 },
    null
  );

  const summary = summarizeRecording(recording, startedAt + 150_000);
  assert.equal(summary.kind, 'cardio');
  assert.equal(summary.averageHeartRate, 130); // 60 s @120 + 60 s @140
  assert.equal(summary.maxHeartRate, 140);
  assert.equal(summary.minHeartRate, 120);
  assert.equal(summary.coverage, 0.8); // 120 covered / 150 elapsed
  assert.equal(summary.durationMinutes, 3); // 2.5 min rounds to 3

  assert.equal(
    summarizeRecording(
      createRecording({ kind: 'cardio', startedAt }),
      startedAt + 30_000
    ),
    null
  );
});
