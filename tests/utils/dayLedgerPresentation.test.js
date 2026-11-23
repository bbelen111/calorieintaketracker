import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDayLedgerCardSummary,
  buildDayLedgerRows,
  describeGoalTarget,
  buildDaySnapshotPreview,
  formatSignedKcal,
  getAdjacentTrackedDates,
  getMeasurementForDate,
  isDayOnTarget,
  isValidDaySnapshot,
  summarizeMonthSnapshots,
} from '../../src/utils/calculations/dayLedgerPresentation.js';

const makeSnapshot = (overrides = {}) => ({
  date: '2026-03-10',
  goalAtSnapshot: 'cutting',
  tdee: 2540,
  baselineTdee: 2600,
  intake: 2000,
  deficit: 540,
  bmr: 1650,
  stepCalories: 150,
  trainingBurn: 300,
  cardioBurn: 100,
  stepCount: 8000,
  isTrainingDay: true,
  tef: 100,
  tefMode: 'dynamic',
  epoc: 60,
  epocTraining: 40,
  epocCardio: 20,
  epocFromTodaySessions: 60,
  epocCarryInCalories: 25,
  adaptiveThermogenesisCorrection: -120,
  adaptiveThermogenesisMode: 'smart',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

test('isValidDaySnapshot accepts only well-formed records', () => {
  assert.equal(isValidDaySnapshot(makeSnapshot()), true);
  assert.equal(isValidDaySnapshot(null), false);
  assert.equal(isValidDaySnapshot(undefined), false);
  assert.equal(isValidDaySnapshot('nope'), false);
  assert.equal(
    isValidDaySnapshot({ ...makeSnapshot(), date: 'not-a-date' }),
    false
  );
  assert.equal(isValidDaySnapshot({ date: '2026-03-10' }), false);
  assert.equal(
    isValidDaySnapshot({ ...makeSnapshot(), intake: Number.NaN }),
    false
  );
});

test('buildDayLedgerRows derives NEAT and orders core rows first', () => {
  const { rows, neatCalories } = buildDayLedgerRows(makeSnapshot());

  // NEAT = baseline(2600) - bmr(1650) - steps(150) - training(300)
  //        - cardio(100) - tef(100) = 300
  assert.equal(neatCalories, 300);

  assert.deepEqual(
    rows.map((row) => row.key),
    ['bmr', 'neat', 'steps', 'training', 'cardio', 'epoc', 'tef', 'adaptive']
  );
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  assert.equal(byKey.bmr, 1650);
  assert.equal(byKey.neat, 300);
  assert.equal(byKey.epoc, 60);
  assert.equal(byKey.tef, 100);
  assert.equal(byKey.adaptive, -120);
});

test('buildDayLedgerRows conditionally includes optional rows', () => {
  const minimal = makeSnapshot({
    epoc: 0,
    tefMode: 'off',
    adaptiveThermogenesisCorrection: 0,
    adaptiveThermogenesisMode: 'off',
  });
  const { rows } = buildDayLedgerRows(minimal);
  assert.deepEqual(
    rows.map((row) => row.key),
    ['bmr', 'neat', 'steps', 'training', 'cardio']
  );

  // AT correction present even while mode is off -> row included.
  const atOffWithCorrection = makeSnapshot({
    adaptiveThermogenesisMode: 'off',
  });
  const { rows: atRows } = buildDayLedgerRows(atOffWithCorrection);
  assert.ok(atRows.some((row) => row.key === 'adaptive'));
});

test('buildDayLedgerRows handles missing baseline and clamps NEAT drift', () => {
  const noBaseline = makeSnapshot({ baselineTdee: undefined });
  assert.equal(buildDayLedgerRows(noBaseline).neatCalories, 0);

  // Component sums exceeding baseline clamp NEAT at zero (never negative).
  const overCommitted = makeSnapshot({
    baselineTdee: 100,
    bmr: 500,
    stepCalories: 400,
    trainingBurn: 300,
    cardioBurn: 200,
    tef: 100,
  });
  assert.equal(buildDayLedgerRows(overCommitted).neatCalories, 0);

  assert.deepEqual(buildDayLedgerRows(null), { rows: [], neatCalories: 0 });
});

test('summarizeMonthSnapshots aggregates tracked days only', () => {
  const snapshots = {
    '2026-03-01': { date: '2026-03-01', tdee: 2000, intake: 1500 },
    '2026-03-02': { date: '2026-03-02', tdee: 2000, intake: 2400 },
    '2026-03-03': { date: '2026-03-03', tdee: 2050, intake: 2020 },
    // Malformed record: unavailable, never zero-filled.
    '2026-03-04': { date: '2026-03-04', tdee: 'oops', intake: 100 },
    // Future relative to asOfDate: excluded.
    '2026-03-20': { date: '2026-03-20', tdee: 9999, intake: 1 },
  };

  const summary = summarizeMonthSnapshots(
    snapshots,
    2026,
    2, // March (0-indexed)
    '2026-03-15'
  );

  assert.equal(summary.daysInMonth, 31);
  assert.equal(summary.daysTracked, 3);
  assert.equal(summary.totalTdee, 6050);
  assert.equal(summary.totalIntake, 5920);
  assert.equal(summary.totalBalance, 130);
  assert.equal(summary.avgTdee, Math.round(6050 / 3));
  assert.equal(summary.avgIntake, Math.round(5920 / 3));
  assert.equal(summary.avgBalance, Math.round(130 / 3));
  assert.equal(summary.deficitDays, 1);
  assert.equal(summary.surplusDays, 1);
  assert.equal(summary.maintenanceDays, 1);
  assert.equal(summary.estimatedWeightChangeKg, 0.02); // 130/7700 rounded
});

test('summarizeMonthSnapshots returns zeroed summary for empty months', () => {
  const summary = summarizeMonthSnapshots({}, 2026, 1, '2026-02-28');
  assert.equal(summary.daysInMonth, 28);
  assert.equal(summary.daysTracked, 0);
  assert.equal(summary.avgTdee, 0);
  assert.equal(summary.avgBalance, 0);
  assert.equal(summary.estimatedWeightChangeKg, 0);
});

test('summarizeMonthSnapshots tolerates invalid month input', () => {
  const summary = summarizeMonthSnapshots({}, 2026, 13, '2026-01-31');
  assert.equal(summary.daysInMonth, 0);
  assert.equal(summary.daysTracked, 0);
});

test('getAdjacentTrackedDates skips malformed and gap days', () => {
  const snapshots = {
    '2026-03-01': makeSnapshot({ date: '2026-03-01' }),
    '2026-03-04': { date: '2026-03-04', tdee: null, intake: 10 },
    '2026-03-05': makeSnapshot({ date: '2026-03-05' }),
    '2026-03-10': makeSnapshot({ date: '2026-03-10' }),
  };

  assert.deepEqual(getAdjacentTrackedDates(snapshots, '2026-03-05'), {
    prev: '2026-03-01',
    next: '2026-03-10',
  });
  // Gap day brackets to nearest tracked neighbours.
  assert.deepEqual(getAdjacentTrackedDates(snapshots, '2026-03-07'), {
    prev: '2026-03-05',
    next: '2026-03-10',
  });
  assert.deepEqual(getAdjacentTrackedDates(snapshots, '2026-03-01'), {
    prev: null,
    next: '2026-03-05',
  });
  assert.deepEqual(getAdjacentTrackedDates(snapshots, '2026-03-10'), {
    prev: '2026-03-05',
    next: null,
  });
  assert.deepEqual(getAdjacentTrackedDates(snapshots, 'garbage'), {
    prev: null,
    next: null,
  });
  assert.deepEqual(getAdjacentTrackedDates({}, '2026-03-01'), {
    prev: null,
    next: null,
  });
});

test('buildDaySnapshotPreview builds a consistent compact model', () => {
  const preview = buildDaySnapshotPreview(makeSnapshot());

  assert.equal(preview.date, '2026-03-10');
  assert.equal(preview.goalAtSnapshot, 'cutting');
  assert.equal(preview.isTrainingDay, true);
  assert.equal(preview.tdee, 2540);
  assert.equal(preview.intake, 2000);
  assert.equal(preview.deficit, 540);
  assert.equal(preview.balanceKind, 'deficit');
  assert.equal(preview.stepCount, 8000);
  assert.equal(preview.epocCarryInCalories, 25);

  // Negative AT correction is excluded from bar segments but kept in rawRows.
  const segmentKeys = preview.barSegments.map((segment) => segment.key);
  assert.ok(!segmentKeys.includes('adaptive'));
  assert.ok(preview.rawRows.some((row) => row.key === 'adaptive'));
  // Positive EPOC appears in both.
  assert.ok(segmentKeys.includes('epoc'));
  assert.ok(preview.rawRows.some((row) => row.key === 'epoc'));
});

test('buildDaySnapshotPreview classifies balance within epsilon', () => {
  const kindOf = (deficit) =>
    buildDaySnapshotPreview(makeSnapshot({ deficit })).balanceKind;

  assert.equal(kindOf(50), 'maintenance');
  assert.equal(kindOf(51), 'deficit');
  assert.equal(kindOf(0), 'maintenance');
  assert.equal(kindOf(-50), 'maintenance');
  assert.equal(kindOf(-51), 'surplus');
});

test('buildDaySnapshotPreview returns null for unavailable days', () => {
  assert.equal(buildDaySnapshotPreview(null), null);
  assert.equal(buildDaySnapshotPreview({ date: '2026-03-10' }), null);
  assert.equal(
    buildDaySnapshotPreview(makeSnapshot({ tdee: Number.POSITIVE_INFINITY })),
    null
  );
});

test('getMeasurementForDate resolves tracker entries per exact date', () => {
  const weightEntries = [
    { date: '2026-03-08', weight: 82.4 },
    { date: '2026-03-10', weight: 82.5 },
  ];
  const bodyFatEntries = [{ date: '2026-03-10', bodyFat: 17.8 }];

  assert.equal(
    getMeasurementForDate(weightEntries, '2026-03-10', 'weight'),
    82.5
  );
  assert.equal(
    getMeasurementForDate(bodyFatEntries, '2026-03-10', 'bodyFat'),
    17.8
  );
  // No entry on that date -> unavailable, never borrowed from neighbours.
  assert.equal(
    getMeasurementForDate(weightEntries, '2026-03-09', 'weight'),
    null
  );
  // Zero/negative/garbage values are unavailable, not zero-filled.
  assert.equal(
    getMeasurementForDate(
      [{ date: '2026-03-10', weight: 0 }],
      '2026-03-10',
      'weight'
    ),
    null
  );
  assert.equal(
    getMeasurementForDate(
      [{ date: '2026-03-10', weight: Number.NaN }],
      '2026-03-10',
      'weight'
    ),
    null
  );
  assert.equal(getMeasurementForDate('nope', '2026-03-10', 'weight'), null);
  assert.equal(
    getMeasurementForDate(weightEntries, 'bad-date', 'weight'),
    null
  );
});

test('formatSignedKcal renders sign-aware kcal labels', () => {
  assert.equal(formatSignedKcal(500), '+500');
  assert.equal(formatSignedKcal(-120), '-120');
  assert.equal(formatSignedKcal(0), '0');
  assert.equal(formatSignedKcal(Number.NaN), '\u2014');
  assert.equal(formatSignedKcal(undefined), '\u2014');
});

test('buildDaySnapshotPreview exposes clamped session burn fields', () => {
  const preview = buildDaySnapshotPreview(makeSnapshot());
  assert.equal(preview.cardioBurn, 100);
  assert.equal(preview.trainingBurn, 300);

  // Missing/garbage burn fields clamp to 0 instead of surfacing NaN.
  const bare = buildDaySnapshotPreview(
    makeSnapshot({
      cardioBurn: undefined,
      trainingBurn: Number.NaN,
      epoc: 0,
    })
  );
  assert.equal(bare.cardioBurn, 0);
  assert.equal(bare.trainingBurn, 0);
});

test('summarizeMonthSnapshots averages month-scoped measurements', () => {
  const snapshots = {
    '2026-03-10': makeSnapshot({ stepCount: 8000 }),
    '2026-03-11': makeSnapshot({ date: '2026-03-11', stepCount: 4000 }),
    // Malformed day: excluded from all averages.
    '2026-03-12': { date: '2026-03-12', tdee: 'oops' },
  };
  const weightEntries = [
    { date: '2026-03-08', weight: 82 },
    { date: '2026-03-10', weight: 82.5 },
    // Different month -> ignored.
    { date: '2026-04-02', weight: 99 },
    // Garbage value -> ignored.
    { date: '2026-03-15', weight: Number.NaN },
  ];
  const bodyFatEntries = [{ date: '2026-03-11', bodyFat: 17.5 }];

  const summary = summarizeMonthSnapshots(snapshots, 2026, 2, '2026-03-31', {
    weightEntries,
    bodyFatEntries,
  });

  assert.equal(summary.daysTracked, 2);
  assert.equal(summary.avgSteps, Math.round((8000 + 4000) / 2));
  assert.equal(summary.avgWeightKg, 82.3); // (82 + 82.5) / 2
  assert.equal(summary.weightSampleCount, 2);
  assert.equal(summary.avgBodyFatPercent, 17.5);
  assert.equal(summary.bodyFatSampleCount, 1);
});

test('summarizeMonthSnapshots keeps measurement fields null without input', () => {
  const summary = summarizeMonthSnapshots({}, 2026, 2, '2026-03-31');

  assert.equal(summary.avgWeightKg, null);
  assert.equal(summary.weightSampleCount, 0);
  assert.equal(summary.avgBodyFatPercent, null);
  assert.equal(summary.bodyFatSampleCount, 0);
  assert.equal(summary.avgSteps, 0);
  assert.equal(summary.daysTracked, 0);

  // Non-array and garbage entry inputs degrade to null, never throw.
  const degraded = summarizeMonthSnapshots({}, 2026, 2, '2026-03-31', {
    weightEntries: 'nope',
    bodyFatEntries: [{ date: 'bad-date', bodyFat: 20 }],
  });
  assert.equal(degraded.avgWeightKg, null);
  assert.equal(degraded.avgBodyFatPercent, null);
});
import { buildDayLedgerDetailModel } from '../../src/utils/calculations/dayLedgerPresentation.js';

const detailSnapshot = (overrides = {}) => ({
  date: '2026-03-10',
  goalAtSnapshot: 'cutting',
  tdee: 2540,
  baselineTdee: 2600,
  intake: 2000,
  deficit: 540,
  bmr: 1650,
  stepCalories: 150,
  trainingBurn: 300,
  cardioBurn: 100,
  stepCount: 8000,
  isTrainingDay: true,
  tef: 100,
  tefMode: 'dynamic',
  epoc: 60,
  epocTraining: 40,
  epocCardio: 20,
  epocFromTodaySessions: 60,
  epocCarryInCalories: 25,
  adaptiveThermogenesisCorrection: -120,
  adaptiveThermogenesisMode: 'smart',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

const detailInput = (overrides = {}) => ({
  snapshot: detailSnapshot(),
  dateKey: '2026-03-10',
  nutritionData: {
    '2026-03-10': {
      breakfast: [
        {
          id: 'f1',
          name: 'Oats',
          grams: 60,
          calories: 230,
          protein: 8,
          carbs: 40,
          fats: 4,
          fiber: 6,
          sodium: 2,
        },
      ],
      lunch: [
        {
          id: 'f2',
          name: 'Chicken breast',
          grams: 180,
          calories: 297,
          protein: 56,
          carbs: 0,
          fats: 6,
          fiber: null,
          sodium: null,
        },
        {
          id: 'f3',
          name: 'Rice',
          grams: 150,
          calories: 195,
          protein: 4,
          carbs: 43,
          fats: 0.5,
          fiber: 1,
          sodium: 5,
        },
      ],
    },
  },
  userData: { age: 30, weight: 74, height: 178, gender: 'male' },
  cardioSessions: [
    {
      id: 'c1',
      date: '2026-03-10',
      type: 'running',
      duration: 30,
      intensity: 'moderate',
      effortType: 'intensity',
      startTime: '18:00',
      stepOverlapEnabled: true,
    },
    {
      id: 'c2',
      date: '2026-03-11',
      type: 'running',
      duration: 30,
      intensity: 'moderate',
      effortType: 'intensity',
    },
  ],
  trainingSessions: [
    {
      id: 't1',
      date: '2026-03-10',
      type: 'trainingtype_1',
      duration: 75,
      intensity: 'vigorous',
      effortType: 'intensity',
      startTime: '07:30',
    },
  ],
  cardioTypes: {
    running: { label: 'Running', met: { moderate: 8 }, ambulatory: true },
  },
  trainingTypes: {
    trainingtype_1: { label: 'Bodybuilding', caloriesPerHour: 220 },
  },
  weightEntries: [
    { date: '2026-03-05', weight: 74.2 },
    { date: '2026-03-10', weight: 74 },
  ],
  bodyFatEntries: [{ date: '2026-03-10', bodyFat: 15.2 }],
  stepEntries: [{ date: '2026-03-10', steps: 8000, source: 'healthConnect' }],
  neatOverride: null,
  phaseLogV2: null,
  bodyFatTrackingEnabled: true,
  ...overrides,
});
test('buildDayLedgerDetailModel assembles sessions, meals and measurements', () => {
  const model = buildDayLedgerDetailModel(detailInput());

  assert.ok(model);
  assert.equal(model.date, '2026-03-10');

  // Sessions: only this date's, both kinds, calories via canonical formulas
  assert.equal(model.sessions.length, 2);
  const cardio = model.sessions.find((row) => row.kind === 'cardio');
  const training = model.sessions.find((row) => row.kind === 'training');
  assert.equal(cardio.label, 'Running');
  assert.equal(cardio.effortDisplay, 'Moderate');
  assert.equal(cardio.stepOverlapEnabled, true);
  assert.equal(training.label, 'Bodybuilding');
  assert.equal(training.effortDisplay, 'Vigorous');
  // MET 8 x 74kg x 0.5h = 296
  assert.equal(cardio.calories, 296);
  // 220 cal/h x 1.25 (vigorous) x 1.25h = 343.75 -> 344
  assert.equal(training.calories, 344);
  assert.equal(model.sessionsTotal, 296 + 344);

  // Nutrition: meal rows in MEAL_TYPE_ORDER, only non-empty meals
  assert.equal(model.nutrition.hasEntries, true);
  assert.deepEqual(
    model.nutrition.meals.map((meal) => meal.key),
    ['breakfast', 'lunch']
  );
  const lunch = model.nutrition.meals[1];
  assert.equal(lunch.calories, 297 + 195);
  assert.equal(lunch.entryCount, 2);
  assert.equal(model.nutrition.totals.calories, 230 + 297 + 195);
  // Fiber: chicken entry has fiber:null (untracked) -> partial; sodium missing on 2 of 3
  assert.equal(model.nutrition.microCoverage.fiber, true);
  assert.equal(model.nutrition.microCoverage.sodium, true);

  // Measurements: exact-date value + honest vs-prev delta
  assert.equal(model.measurements.weight.value, 74);
  assert.equal(model.measurements.weight.delta.delta, -0.2);
  assert.equal(model.measurements.weight.delta.spanDays, 5);
  assert.equal(model.measurements.bodyFat.value, 15.2);
  assert.equal(model.measurements.bodyFat.delta, null);

  // Step provenance + snapshot-context chips
  assert.equal(model.stepProvenance.source, 'healthConnect');
  assert.equal(model.stepProvenance.steps, 8000);
  assert.equal(model.dayShape.tefMode, 'dynamic');
  assert.equal(model.dayShape.atMode, 'smart');
  assert.equal(model.dayShape.atCorrection, -120);
  assert.equal(model.epoc.total, 60);
  assert.equal(model.epoc.carryIn, 25);
  assert.equal(model.epoc.fromToday, 60);
});

test('buildDayLedgerDetailModel HR effort copy matches HomeScreen (no "0 bpm")', () => {
  const hrSession = (averageHeartRate) => ({
    id: `hr-${String(averageHeartRate)}`,
    date: '2026-03-10',
    type: 'running',
    duration: 30,
    intensity: 'moderate',
    effortType: 'heartRate',
    averageHeartRate,
    startTime: '18:00',
  });
  const effortFor = (averageHeartRate) =>
    buildDayLedgerDetailModel(
      detailInput({
        cardioSessions: [hrSession(averageHeartRate)],
        trainingSessions: [],
      })
    ).sessions[0].effortDisplay;

  assert.equal(effortFor(152), '152 bpm');
  assert.equal(effortFor(0), 'N/A bpm');
  assert.equal(effortFor(''), 'N/A bpm');
  assert.equal(effortFor(null), 'N/A bpm');
  assert.equal(effortFor(undefined), 'N/A bpm');
});

test('buildDayLedgerDetailModel rejects a stale dateKey and malformed snapshots', () => {
  assert.equal(
    buildDayLedgerDetailModel(detailInput({ dateKey: '2026-03-09' })),
    null
  );
  assert.equal(
    buildDayLedgerDetailModel(detailInput({ snapshot: null })),
    null
  );
  assert.equal(
    buildDayLedgerDetailModel(
      detailInput({ snapshot: { date: '2026-03-10' } })
    ),
    null
  );
  // No food logged that day -> honest empty state
  assert.equal(
    buildDayLedgerDetailModel(detailInput({ nutritionData: {} })).nutrition
      .hasEntries,
    false
  );
});

test('buildDayLedgerDetailModel honors BF-off, NEAT override and phase context', () => {
  const model = buildDayLedgerDetailModel(
    detailInput({
      bodyFatTrackingEnabled: false,
      neatOverride: {
        multiplier: 0.3,
        presetKey: 'active',
        label: 'Highly Active',
        updatedAt: 1,
      },
      phaseLogV2: {
        version: 2,
        phasesById: {
          p1: {
            id: 'p1',
            name: 'Summer cut',
            goalType: 'cutting',
            startDate: '2026-03-01',
            status: 'active',
          },
        },
        phaseOrder: ['p1'],
        activePhaseId: 'p1',
        logsById: {
          'p1:2026-03-10': {
            id: 'p1:2026-03-10',
            phaseId: 'p1',
            date: '2026-03-10',
            links: {},
            notes: 'Felt strong today.',
            createdAt: 1,
            updatedAt: 1,
          },
        },
        logIdsByPhaseId: { p1: ['p1:2026-03-10'] },
        logIdByPhaseDate: { p1: { '2026-03-10': 'p1:2026-03-10' } },
      },
    })
  );

  assert.equal(model.measurements.bodyFat.value, null);
  assert.equal(model.neatOverride.label, 'Highly Active');
  assert.equal(model.neatOverride.multiplier, 0.3);
  assert.ok(model.phaseContext);
  assert.equal(model.phaseContext.name, 'Summer cut');
  assert.equal(model.phaseContext.notes, 'Felt strong today.');
  // links empty + notes -> PARTIAL (never COMPLETE)
  assert.equal(model.phaseContext.complete, false);
  assert.equal(model.phaseContext.partial, true);
});

// Card fixtures: "today" is 2026-03-20, so the 14-day window is 03-06..03-19.
const TODAY = '2026-03-20';
const logged = (date, deficit, overrides = {}) =>
  makeSnapshot({
    date,
    deficit,
    tdee: 2500,
    intake: 2500 - deficit,
    goalAtSnapshot: 'cutting',
    goalTarget: 300,
    ...overrides,
  });

test('isDayOnTarget: inclusive band, unknown deviation is never on target', () => {
  assert.equal(isDayOnTarget(100, 100), true);
  assert.equal(isDayOnTarget(-100, 100), true);
  assert.equal(isDayOnTarget(101, 100), false);
  assert.equal(isDayOnTarget(null, 100), false);
  assert.equal(isDayOnTarget(undefined, 100), false);
});

test('buildDayLedgerCardSummary: nothing logged yields gaps, never zeros', () => {
  const empty = buildDayLedgerCardSummary({ snapshots: {}, todayKey: TODAY });
  assert.equal(empty.trackedDays, 0);
  assert.equal(empty.days.length, 14);
  assert.equal(empty.days.at(-1).date, '2026-03-19');
  assert.ok(
    empty.days.every((day) => day.kind === null && day.balance === null)
  );
  assert.equal(empty.avgBalance7, null);
  assert.equal(empty.avgBalance14, null);
  assert.equal(empty.yesterday, null);
  assert.equal(empty.streak, 0);

  const invalidToday = buildDayLedgerCardSummary({
    snapshots: { '2026-03-19': logged('2026-03-19', 300) },
    todayKey: 'nope',
  });
  assert.equal(invalidToday.trackedDays, 1);
  assert.deepEqual(invalidToday.days, []);
});

test('buildDayLedgerCardSummary: a seeded snapshot with no intake is not a logged day', () => {
  const summary = buildDayLedgerCardSummary({
    snapshots: {
      '2026-03-18': logged('2026-03-18', 300),
      // The app seeds yesterday on launch: valid snapshot, nothing eaten.
      '2026-03-19': makeSnapshot({
        date: '2026-03-19',
        intake: 0,
        deficit: 2500,
        tdee: 2500,
      }),
    },
    todayKey: TODAY,
  });

  assert.equal(summary.trackedDays, 1);
  assert.equal(summary.loggedDays, 1);
  assert.equal(summary.yesterday, null);
  assert.equal(summary.days.at(-1).kind, null);
});

test('buildDayLedgerCardSummary: today never feeds the window', () => {
  const summary = buildDayLedgerCardSummary({
    snapshots: {
      '2026-03-19': logged('2026-03-19', 280),
      [TODAY]: logged(TODAY, 2000),
    },
    todayKey: TODAY,
  });
  assert.equal(
    summary.days.some((day) => day.date === TODAY),
    false
  );
  assert.equal(summary.avgBalance14, 280);
  assert.equal(summary.yesterday.balance, 280);
});

test('buildDayLedgerCardSummary: deviation, on-target count and 7d/14d averages', () => {
  const summary = buildDayLedgerCardSummary({
    snapshots: {
      '2026-03-19': logged('2026-03-19', 340), // +40  on target
      '2026-03-18': logged('2026-03-18', 150), // -150 off
      '2026-03-17': logged('2026-03-17', 300), //  0   on target
      '2026-03-08': logged('2026-03-08', 600), // +300 off (outside the 7d window)
    },
    todayKey: TODAY,
    tolerance: 100,
  });

  assert.equal(summary.yesterday.deviation, 40);
  assert.equal(summary.yesterday.target, 300);
  assert.equal(summary.loggedDays, 4);
  assert.equal(summary.judgedDays, 4);
  assert.equal(summary.onTargetDays, 2);
  assert.equal(summary.avgBalance7, 263); // (340 + 150 + 300) / 3
  assert.equal(summary.avgBalance14, 348); // (340 + 150 + 300 + 600) / 4

  const strict = buildDayLedgerCardSummary({
    snapshots: { '2026-03-19': logged('2026-03-19', 340) },
    todayKey: TODAY,
    tolerance: 30,
  });
  assert.equal(strict.onTargetDays, 0);
});

test("buildDayLedgerCardSummary: a legacy snapshot is judged against its goal's nominal delta", () => {
  const legacy = logged('2026-03-19', 320);
  delete legacy.goalTarget;
  const summary = buildDayLedgerCardSummary({
    snapshots: { '2026-03-19': legacy },
    todayKey: TODAY,
  });
  assert.equal(summary.yesterday.target, 300);
  assert.equal(summary.yesterday.onTarget, true);

  const noGoal = logged('2026-03-19', 320);
  delete noGoal.goalTarget;
  delete noGoal.goalAtSnapshot;
  const unjudged = buildDayLedgerCardSummary({
    snapshots: { '2026-03-19': noGoal },
    todayKey: TODAY,
  });
  assert.equal(unjudged.yesterday.target, null);
  assert.equal(unjudged.judgedDays, 0);
  assert.equal(unjudged.onTargetDays, 0);
});

test('buildDayLedgerCardSummary: streak = consecutive on-target days under the current goal', () => {
  const snapshots = {
    '2026-03-19': logged('2026-03-19', 310),
    '2026-03-18': logged('2026-03-18', 290),
    '2026-03-17': logged('2026-03-17', 300),
    '2026-03-16': logged('2026-03-16', 900), // off target: breaks the run
    '2026-03-15': logged('2026-03-15', 300),
  };

  const summary = buildDayLedgerCardSummary({
    snapshots,
    todayKey: TODAY,
    currentGoal: 'cutting',
  });
  assert.equal(summary.streak, 3);
  assert.equal(summary.streakGoal, 'cutting');

  // The user switched goals: the old goal's run is not their streak.
  assert.equal(
    buildDayLedgerCardSummary({
      snapshots,
      todayKey: TODAY,
      currentGoal: 'maintenance',
    }).streak,
    0
  );

  // A goal change inside the run ends it at the change.
  const switched = buildDayLedgerCardSummary({
    snapshots: {
      ...snapshots,
      '2026-03-17': logged('2026-03-17', 0, {
        goalAtSnapshot: 'maintenance',
        goalTarget: 0,
      }),
    },
    todayKey: TODAY,
    currentGoal: 'cutting',
  });
  assert.equal(switched.streak, 2);

  // A missed (unlogged) day also ends it.
  const gap = { ...snapshots };
  delete gap['2026-03-18'];
  assert.equal(
    buildDayLedgerCardSummary({
      snapshots: gap,
      todayKey: TODAY,
      currentGoal: 'cutting',
    }).streak,
    1
  );
});

test("buildDaySnapshotPreview: exposes the day's target and its deviation", () => {
  const preview = buildDaySnapshotPreview(
    makeSnapshot({ deficit: 340, goalTarget: 300, goalAtSnapshot: 'cutting' })
  );
  assert.equal(preview.goalTarget, 300);
  assert.equal(preview.targetDeviation, 40);

  const unknown = buildDaySnapshotPreview(
    makeSnapshot({ goalAtSnapshot: undefined, goalTarget: undefined })
  );
  assert.equal(unknown.goalTarget, null);
  assert.equal(unknown.targetDeviation, null);
});

test('describeGoalTarget words a daily target by direction', () => {
  assert.equal(describeGoalTarget(300), '300 kcal deficit');
  assert.equal(describeGoalTarget(-500), '500 kcal surplus');
  assert.equal(describeGoalTarget(0), 'at TDEE');
  assert.equal(describeGoalTarget(null), 'at TDEE');
});

test('buildDaySnapshotPreview: a day with nothing eaten has a target but no verdict', () => {
  const unlogged = buildDaySnapshotPreview(
    makeSnapshot({
      intake: 0,
      tdee: 2062,
      deficit: 2062,
      goalAtSnapshot: 'maintenance',
      goalTarget: 0,
    })
  );
  assert.equal(unlogged.goalTarget, 0);
  assert.equal(unlogged.targetDeviation, null);
});

test('summarizeMonthSnapshots counts finished, logged days that hit their own target', () => {
  const day = (date, deficit, overrides = {}) => ({
    date,
    tdee: 2500,
    intake: 2500 - deficit,
    deficit,
    goalAtSnapshot: 'cutting',
    goalTarget: 300,
    ...overrides,
  });
  const snapshots = {
    '2026-03-01': day('2026-03-01', 320), // +20  on target
    '2026-03-02': day('2026-03-02', 150), // -150 off
    '2026-03-03': day('2026-03-03', 380), // +80  on target
    // Recorded under a different target: judged against ITS target, not 300.
    '2026-03-04': day('2026-03-04', 0, {
      goalTarget: 0,
      goalAtSnapshot: 'maintenance',
    }),
    // Nothing eaten (launch-seeded): never judged.
    '2026-03-05': day('2026-03-05', 2500, { intake: 0 }),
    // Today is still in progress: never judged.
    '2026-03-06': day('2026-03-06', 300),
  };

  const summary = summarizeMonthSnapshots(snapshots, 2026, 2, '2026-03-06', {
    tolerance: 100,
  });
  assert.equal(summary.judgedDays, 4);
  assert.equal(summary.onTargetDays, 3);

  const strict = summarizeMonthSnapshots(snapshots, 2026, 2, '2026-03-06', {
    tolerance: 50,
  });
  assert.equal(strict.onTargetDays, 2); // the +80 day drops out
});

test('buildDayLedgerCardSummary: firstLoggedDate is the earliest logged day, ignoring empty and future ones', () => {
  const summary = buildDayLedgerCardSummary({
    snapshots: {
      // Seeded on launch, nothing eaten: not a logged day, so not "since".
      '2026-02-01': makeSnapshot({
        date: '2026-02-01',
        intake: 0,
        deficit: 2500,
      }),
      '2026-03-10': logged('2026-03-10', 300),
      '2026-03-19': logged('2026-03-19', 300),
      // After today: ignored.
      '2026-04-01': logged('2026-04-01', 300),
    },
    todayKey: TODAY,
  });
  assert.equal(summary.firstLoggedDate, '2026-03-10');
  assert.equal(summary.trackedDays, 2);

  const none = buildDayLedgerCardSummary({ snapshots: {}, todayKey: TODAY });
  assert.equal(none.firstLoggedDate, null);
});
