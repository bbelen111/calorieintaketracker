import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRestingHrTrend,
  computeTimeWeightedHeartRate,
  describeHeartRateLoad,
  estimateRestingHrFromHourly,
  getHeartRateZone,
  parseHeartRateMeasurement,
  predictMaxHeartRate,
  resolveHeartRateIntensity,
  resolveHeartRateProfile,
  resolveHeartRateZones,
  selectPrimaryHeartRateSource,
} from '../../src/utils/calculations/heartRate.js';
import {
  applyManualRestingHeartRate,
  getRestingHrSeries,
  mergeSyncedHeartRateEntry,
  normalizeHeartRateEntry,
  resolveRestingHrTrendFamily,
  sortHeartRateEntries,
} from '../../src/utils/measurements/heartRate.js';
import {
  normalizeDailyHeartRate,
  normalizeMaxHeartRate,
  normalizeRestingHeartRate,
  normalizeVo2Max,
} from '../../src/constants/health/heartRate.js';
import {
  calculateCaloriesPerMinuteFromHeartRate,
  calculateCardioCalories,
  calculateTrainingSessionCalories,
} from '../../src/utils/calculations/calculations.js';
import { resolveCardioSessionEpoc } from '../../src/utils/calculations/epoc.js';
import { diffShardedHistoryField } from '../../src/utils/data/storage.js';
import { buildSnapshotHeartRateFields } from '../../src/utils/calculations/dailySnapshots.js';

const D = '2026-03-10';
const shift = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const resting = (offset, restingHr, restingHrMethod = 'manual') => ({
  date: shift(D, offset),
  restingHr,
  restingHrMethod,
});

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

test('heart-rate normalizers reject (never clamp) out-of-range values', () => {
  assert.equal(normalizeRestingHeartRate(30), 30);
  assert.equal(normalizeRestingHeartRate(120), 120);
  assert.equal(normalizeRestingHeartRate(29), null);
  assert.equal(normalizeRestingHeartRate(121), null);
  assert.equal(normalizeMaxHeartRate(120), 120);
  assert.equal(normalizeMaxHeartRate(230), 230);
  assert.equal(normalizeMaxHeartRate(231), null);
  assert.equal(normalizeDailyHeartRate(25), 25);
  assert.equal(normalizeDailyHeartRate(241), null);
  assert.equal(normalizeVo2Max(47.25), 47.3);
  assert.equal(normalizeVo2Max(14.9), null);
  assert.equal(normalizeVo2Max(''), null);
});

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

test('normalizeHeartRateEntry drops empty entries and defaults the method', () => {
  assert.equal(normalizeHeartRateEntry({ date: D }), null);
  assert.equal(normalizeHeartRateEntry({ date: 'bad', restingHr: 55 }), null);
  assert.deepEqual(normalizeHeartRateEntry({ date: D, restingHr: 55 }), {
    date: D,
    restingHr: 55,
    restingHrMethod: 'device',
    avgHr: null,
    minHr: null,
    maxHr: null,
    wakingAvgHr: null,
    vo2Max: null,
    updatedAt: null,
  });
  // An invalid resting value drops only that field
  assert.equal(
    normalizeHeartRateEntry({ date: D, restingHr: 300, avgHr: 70 }).restingHr,
    null
  );
});

test('sortHeartRateEntries de-duplicates by date (last wins) and sorts', () => {
  const sorted = sortHeartRateEntries([
    resting(0, 60),
    resting(-1, 58),
    { date: D, restingHr: 57, restingHrMethod: 'manual' },
  ]);
  assert.deepEqual(
    sorted.map((entry) => [entry.date, entry.restingHr]),
    [
      [shift(D, -1), 58],
      [D, 57],
    ]
  );
});

test('a synced reading never overwrites a manual resting HR', () => {
  const manual = { date: D, restingHr: 52, restingHrMethod: 'manual' };
  const merged = mergeSyncedHeartRateEntry(
    manual,
    {
      date: D,
      restingHr: 58,
      restingHrMethod: 'device',
      avgHr: 74,
      maxHr: 160,
    },
    1000
  );
  assert.equal(merged.restingHr, 52);
  assert.equal(merged.restingHrMethod, 'manual');
  assert.equal(merged.avgHr, 74);
  assert.equal(merged.maxHr, 160);
  assert.equal(merged.updatedAt, 1000);

  // An identical sync is a no-op (same reference -> no store write)
  assert.equal(
    mergeSyncedHeartRateEntry(merged, { date: D, avgHr: 74, maxHr: 160 }),
    merged
  );
  // A null from the device is "unknown", not "erase"
  assert.equal(mergeSyncedHeartRateEntry(merged, { date: D }), merged);
});

test('clearing a manual resting HR keeps synced aggregates; empty collapses', () => {
  const withAgg = {
    date: D,
    restingHr: 52,
    restingHrMethod: 'manual',
    avgHr: 70,
  };
  const cleared = applyManualRestingHeartRate(withAgg, D, null, 5);
  assert.equal(cleared.restingHr, null);
  assert.equal(cleared.avgHr, 70);

  const onlyManual = { date: D, restingHr: 52, restingHrMethod: 'manual' };
  assert.equal(applyManualRestingHeartRate(onlyManual, D, null), null);

  // Clearing never touches a device reading
  const device = { date: D, restingHr: 58, restingHrMethod: 'device' };
  assert.equal(applyManualRestingHeartRate(device, D, null), device);

  const set = applyManualRestingHeartRate(device, D, 54, 9);
  assert.equal(set.restingHr, 54);
  assert.equal(set.restingHrMethod, 'manual');
  // Out of range is rejected
  assert.equal(applyManualRestingHeartRate(device, D, 10), device);
});

test('resting series filter + measured/estimated family never mix', () => {
  const entries = sortHeartRateEntries([
    resting(-3, 60, 'estimated'),
    resting(-2, 61, 'estimated'),
    resting(-1, 55, 'device'),
    { date: D, avgHr: 70 },
  ]);
  assert.equal(getRestingHrSeries(entries).length, 3);
  assert.equal(getRestingHrSeries(entries, { family: 'measured' }).length, 1);
  // 2 estimated vs 1 measured (below the 3-measured threshold) -> estimated
  assert.equal(
    resolveRestingHrTrendFamily(entries, { endDateKey: D }),
    'estimated'
  );
  const moreMeasured = sortHeartRateEntries([
    ...entries,
    resting(-5, 56, 'manual'),
    resting(-4, 57, 'device'),
  ]);
  assert.equal(
    resolveRestingHrTrendFamily(moreMeasured, { endDateKey: D }),
    'measured'
  );
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

test('predictMaxHeartRate uses Tanaka (208 - 0.7 x age)', () => {
  assert.equal(predictMaxHeartRate(30), 187);
  assert.equal(predictMaxHeartRate(40), 180);
  assert.equal(predictMaxHeartRate(0), null);
  assert.equal(predictMaxHeartRate('x'), null);
});

test('profile without HR data stays on the legacy rule', () => {
  const profile = resolveHeartRateProfile({ age: 30 }, D);
  assert.equal(profile.hasPersonalZones, false);
  assert.equal(profile.restingHr, null);
  assert.equal(profile.maxHr, 187);
  assert.equal(profile.maxHrSource, 'predicted');
  assert.equal(profile.legacyMaxHr, 190);

  // Legacy cutpoints, exactly as EPOC used them before (220 - age)
  const level = (hr) =>
    resolveHeartRateIntensity({ heartRate: hr, profile }).level;
  assert.equal(level(170), 'vigorous'); // 0.895
  assert.equal(level(162), 'vigorous'); // 162/190 = 0.8526
  assert.equal(level(161), 'moderate'); // 0.847
  assert.equal(level(133), 'moderate'); // exactly 0.70
  assert.equal(level(132), 'light');
  assert.equal(
    resolveHeartRateIntensity({ heartRate: 170, profile }).model,
    'legacy'
  );
  // Out of range / missing profile -> null (caller falls back)
  assert.equal(resolveHeartRateIntensity({ heartRate: 300, profile }), null);
  assert.equal(
    resolveHeartRateIntensity({ heartRate: 150, profile: null }),
    null
  );
});

test('personal zones need 3 readings in 14 days and use ACSM %HRR cutpoints', () => {
  const twoReadings = {
    age: 30,
    heartRateEntries: [resting(-1, 60), resting(0, 60)],
  };
  assert.equal(resolveHeartRateProfile(twoReadings, D).hasPersonalZones, false);

  const userData = {
    age: 30,
    heartRateEntries: [resting(-2, 60), resting(-1, 60), resting(0, 60)],
  };
  const profile = resolveHeartRateProfile(userData, D);
  assert.equal(profile.hasPersonalZones, true);
  assert.equal(profile.restingHr, 60);
  assert.equal(profile.maxHr, 187);
  assert.equal(profile.hrReserve, 127);

  const level = (hr) =>
    resolveHeartRateIntensity({ heartRate: hr, profile }).level;
  // 60 + 0.4 x 127 = 110.8 ; 60 + 0.6 x 127 = 136.2
  assert.equal(level(110), 'light'); // 39.4 %
  assert.equal(level(111), 'moderate'); // 40.2 %
  assert.equal(level(136), 'moderate'); // 59.8 %
  assert.equal(level(137), 'vigorous'); // 60.6 %
  assert.equal(
    resolveHeartRateIntensity({ heartRate: 137, profile }).model,
    'hrr'
  );
});

test('profile is resolved AS OF the date (no future data leaks back)', () => {
  const userData = {
    age: 30,
    heartRateEntries: [resting(-2, 60), resting(-1, 60), resting(0, 60)],
  };
  assert.equal(
    resolveHeartRateProfile(userData, shift(D, -3)).hasPersonalZones,
    false
  );
  // Baseline only from readings up to the date
  assert.equal(
    resolveHeartRateProfile(
      {
        age: 30,
        heartRateEntries: [
          resting(-3, 50),
          resting(-2, 50),
          resting(-1, 50),
          resting(1, 90),
        ],
      },
      shift(D, -1)
    ).restingHr,
    50
  );
});

test('max HR: custom wins; observed only raises and ignores spikes', () => {
  const session = (offset, maxHeartRate) => ({
    date: shift(D, offset),
    maxHeartRate,
  });
  const observed = resolveHeartRateProfile(
    {
      age: 30,
      cardioSessions: [session(-3, 195), session(-2, 196)],
      trainingSessions: [session(-1, 197), session(-1, 230)],
    },
    D
  );
  // 230 > Tanaka (187) + 20 -> spike, ignored; 3 plausible sessions -> 197
  assert.equal(observed.observedMaxHr, 197);
  assert.equal(observed.maxHr, 197);
  assert.equal(observed.maxHrSource, 'observed');

  const lowerObserved = resolveHeartRateProfile(
    {
      age: 30,
      cardioSessions: [session(-3, 170), session(-2, 172), session(-1, 175)],
    },
    D
  );
  assert.equal(lowerObserved.maxHr, 187);
  assert.equal(lowerObserved.maxHrSource, 'predicted');

  const tooFew = resolveHeartRateProfile(
    { age: 30, cardioSessions: [session(-1, 199), session(-2, 199)] },
    D
  );
  assert.equal(tooFew.observedMaxHr, null);

  const custom = resolveHeartRateProfile(
    {
      age: 30,
      maxHeartRateCustom: 200,
      cardioSessions: [session(-3, 195), session(-2, 196), session(-1, 197)],
    },
    D
  );
  assert.equal(custom.maxHr, 200);
  assert.equal(custom.maxHrSource, 'custom');
  // A custom max also feeds the legacy rule
  assert.equal(custom.legacyMaxHr, 200);
});

test('VO2 max: custom wins; device reading valid for 180 days', () => {
  const userData = {
    age: 30,
    heartRateEntries: [{ date: shift(D, -10), vo2Max: 48 }],
  };
  assert.equal(resolveHeartRateProfile(userData, D).vo2Max, 48);
  assert.equal(resolveHeartRateProfile(userData, D).vo2MaxSource, 'device');
  assert.equal(resolveHeartRateProfile(userData, shift(D, -11)).vo2Max, null);
  assert.equal(resolveHeartRateProfile(userData, shift(D, 169)).vo2Max, 48);
  assert.equal(resolveHeartRateProfile(userData, shift(D, 170)).vo2Max, null);
  assert.equal(
    resolveHeartRateProfile({ ...userData, vo2MaxCustom: 52 }, D).vo2Max,
    52
  );
});

test('profile memoizes per data references', () => {
  const userData = {
    age: 30,
    heartRateEntries: [resting(-2, 60), resting(-1, 60), resting(0, 60)],
  };
  assert.equal(
    resolveHeartRateProfile(userData, D),
    resolveHeartRateProfile(userData, D)
  );
  assert.notEqual(
    resolveHeartRateProfile(userData, D),
    resolveHeartRateProfile(
      { ...userData, heartRateEntries: [...userData.heartRateEntries] },
      D
    )
  );
});

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

test('zones: Karvonen with personal zones, %max otherwise', () => {
  const personal = resolveHeartRateProfile(
    {
      age: 30,
      heartRateEntries: [resting(-2, 60), resting(-1, 60), resting(0, 60)],
    },
    D
  );
  const hrr = resolveHeartRateZones(personal);
  assert.equal(hrr.model, 'hrr');
  // Z1 lower = 60 + 0.5 x 127 = 123.5 -> 124 ; Z5 upper = 187
  assert.equal(hrr.zones[0].lowerBpm, 124);
  assert.equal(hrr.zones[4].upperBpm, 187);
  assert.equal(getHeartRateZone(123, hrr), null);
  assert.equal(getHeartRateZone(124, hrr).key, 'z1');
  assert.equal(getHeartRateZone(200, hrr).key, 'z5');

  const pctMax = resolveHeartRateZones(resolveHeartRateProfile({ age: 30 }, D));
  assert.equal(pctMax.model, 'max');
  assert.equal(pctMax.zones[0].lowerBpm, 94); // 0.5 x 187 = 93.5
  assert.deepEqual(describeHeartRateLoad(140, personal), {
    percent: 63,
    basis: 'HRR',
  });
});

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

test('time-weighted session HR: trapezoid, gaps excluded, zone seconds', () => {
  const start = Date.UTC(2026, 2, 10, 7, 0, 0);
  const samples = [];
  // 0-60 s at 100 bpm, 60-120 s at 140 bpm, one sample every 5 s
  for (let t = 0; t <= 120; t += 5) {
    samples.push({
      startDate: new Date(start + t * 1000).toISOString(),
      value: t < 60 ? 100 : 140,
    });
  }
  // A 10-minute silence, then 60 s at 140
  for (let t = 720; t <= 780; t += 5) {
    samples.push({
      startDate: new Date(start + t * 1000).toISOString(),
      value: 140,
    });
  }
  const zoneModel = resolveHeartRateZones(
    resolveHeartRateProfile({ age: 30 }, D)
  );
  const result = computeTimeWeightedHeartRate(samples, {
    start,
    end: start + 900 * 1000,
    zoneModel,
  });
  assert.equal(result.method, 'continuous');
  // Covered: 0-120 s (area 100x55 + 120x5 + 140x60 = 14500) + 720-780 s
  // (140 x 60 = 8400) => 22900 / 180 = 127.2
  assert.equal(result.average, 127);
  assert.equal(result.min, 100);
  assert.equal(result.max, 140);
  // 180 covered seconds of a 900 s window
  assert.equal(result.coverage, 0.2);
  assert.equal(
    result.zoneSeconds.reduce((sum, seconds) => sum + seconds, 0),
    180
  );
});

test('time-weighted session HR: sparse samples fall back to a plain mean', () => {
  const start = Date.UTC(2026, 2, 10, 7, 0, 0);
  const samples = [0, 300, 600].map((t, index) => ({
    startDate: new Date(start + t * 1000).toISOString(),
    value: [120, 130, 140][index],
  }));
  const result = computeTimeWeightedHeartRate(samples, {
    start,
    end: start + 900 * 1000,
  });
  assert.equal(result.method, 'sparse');
  assert.equal(result.average, 130);
  assert.equal(result.coverage, null);
  assert.equal(result.zoneSeconds, null);
  assert.equal(
    computeTimeWeightedHeartRate([], { start, end: start + 1 }),
    null
  );
  assert.equal(
    computeTimeWeightedHeartRate(samples, { start, end: start }),
    null
  );
});

test('source selection: preferred, then most samples, then device type', () => {
  const sample = (sourceId, deviceType) => ({
    sourceId,
    deviceType,
    value: 120,
  });
  const samples = [
    sample('watch', 'watch'),
    sample('watch', 'watch'),
    sample('strap', 'chestStrap'),
    sample('strap', 'chestStrap'),
    sample('phone', 'phone'),
  ];
  assert.equal(
    selectPrimaryHeartRateSource(samples, 'phone').sourceId,
    'phone'
  );
  assert.equal(selectPrimaryHeartRateSource(samples).sourceId, 'strap');
  assert.equal(
    selectPrimaryHeartRateSource([...samples, sample('watch', 'watch')])
      .sourceId,
    'watch'
  );
  assert.equal(selectPrimaryHeartRateSource([]), null);
});

test('resting HR estimate = lowest hourly average, needs 6 buckets', () => {
  assert.equal(
    estimateRestingHrFromHourly([{ value: 60 }, { value: 70 }]),
    null
  );
  assert.equal(
    estimateRestingHrFromHourly([
      { values: { average: 64 } },
      { value: 58.6 },
      { value: 70 },
      { value: 80 },
      { value: 90 },
      { value: 300 },
      { value: 75 },
    ]),
    59
  );
});

test('resting HR trend: least-squares over one family, >= 7 readings', () => {
  const entries = [];
  for (let offset = -27; offset <= 0; offset += 3) {
    // 1 bpm drop every 3 days -> 28 days x (-1/3) = -9.3
    entries.push(resting(offset, 70 - offset / 3, 'device'));
  }
  const trend = calculateRestingHrTrend(entries, D);
  assert.equal(trend.family, 'measured');
  assert.equal(trend.readings, 10);
  assert.ok(Math.abs(trend.deltaBpm - -9.3) <= 0.2, `got ${trend.deltaBpm}`);
  assert.equal(calculateRestingHrTrend(entries.slice(0, 6), D), null);
});

// ---------------------------------------------------------------------------
// BLE 0x2A37
// ---------------------------------------------------------------------------

const view = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('parseHeartRateMeasurement: uint8, uint16, contact, energy, RR', () => {
  assert.deepEqual(parseHeartRateMeasurement(view([0x00, 72])), {
    bpm: 72,
    contactDetected: null,
    energyExpendedKj: null,
    rrIntervalsMs: [],
  });
  // uint16 bpm 300 (0x012C), little endian
  assert.equal(parseHeartRateMeasurement(view([0x01, 0x2c, 0x01])).bpm, 300);
  // contact supported but not detected / detected
  assert.equal(
    parseHeartRateMeasurement(view([0x04, 80])).contactDetected,
    false
  );
  assert.equal(
    parseHeartRateMeasurement(view([0x06, 80])).contactDetected,
    true
  );
  // energy (0x08) = 500 kJ, then RR (0x10) 1024/1024 s = 1000 ms and 512 -> 500 ms
  assert.deepEqual(
    parseHeartRateMeasurement(
      view([0x18, 90, 0xf4, 0x01, 0x00, 0x04, 0x00, 0x02])
    ),
    {
      bpm: 90,
      contactDetected: null,
      energyExpendedKj: 500,
      rrIntervalsMs: [1000, 500],
    }
  );
  assert.equal(parseHeartRateMeasurement(view([0x00])), null);
  assert.equal(parseHeartRateMeasurement(view([0x01, 0x2c])), null);
  assert.equal(parseHeartRateMeasurement(null), null);
});

// ---------------------------------------------------------------------------
// Weaving into the calorie system
// ---------------------------------------------------------------------------

const personalUser = {
  age: 30,
  weight: 80,
  height: 180,
  gender: 'male',
  epocCarryoverHours: 6,
  heartRateEntries: [resting(-2, 60), resting(-1, 60), resting(0, 60)],
};

test('EPOC uses personal zones as of the session date', () => {
  const session = {
    id: 's',
    date: D,
    duration: 45,
    type: 'running',
    effortType: 'heartRate',
    averageHeartRate: 120,
    intensity: 'vigorous',
  };
  const cardioType = { label: 'Running' };
  const epoc = (userData, s = session) =>
    resolveCardioSessionEpoc({
      session: s,
      exerciseCalories: 500,
      cardioType,
      userData,
    });

  // Legacy: 120 / 190 = 0.63 -> light
  const legacy = epoc({ age: 30, epocCarryoverHours: 6 });
  assert.equal(legacy.details.intensity, 'light');
  assert.deepEqual(legacy.details.heartRateIntensity, {
    percent: 63,
    model: 'legacy',
  });
  // Personal: (120 - 60) / 127 = 47 % HRR -> moderate
  const personal = epoc(personalUser);
  assert.equal(personal.details.intensity, 'moderate');
  assert.deepEqual(personal.details.heartRateIntensity, {
    percent: 47,
    model: 'hrr',
  });
  // A session BEFORE the readings existed stays legacy
  assert.equal(
    epoc(personalUser, { ...session, date: shift(D, -5) }).details.intensity,
    'light'
  );
});

test('training hrBurnModel "intensity": HR picks the level, type keeps kcal/hr', () => {
  const trainingTypes = {
    lift: { label: 'Bodybuilding', caloriesPerHour: 220 },
  };
  const base = {
    date: D,
    duration: 60,
    type: 'lift',
    effortType: 'heartRate',
    averageHeartRate: 140, // (140 - 60) / 127 = 63 % HRR -> vigorous
    intensity: 'light',
  };
  assert.equal(
    calculateTrainingSessionCalories(
      { ...base, hrBurnModel: 'intensity' },
      personalUser,
      trainingTypes
    ),
    275 // 220 x 1.25 x 1 h
  );
  // No marker -> legacy Keytel, unchanged
  const keytel =
    ((-55.0969 + 0.6309 * 140 + 0.1988 * 80 + 0.2017 * 30) / 4.184) * 60;
  assert.equal(
    calculateTrainingSessionCalories(base, personalUser, trainingTypes),
    Math.round(keytel)
  );
});

test('cardio HR uses the Keytel VO2 max variant when VO2 max is known', () => {
  const kcalPerMin = (gender, weight, age, hr, vo2) =>
    gender === 'female'
      ? (-59.3954 + 0.45 * hr + 0.38 * vo2 + 0.103 * weight + 0.274 * age) /
        4.184
      : (-95.7735 + 0.634 * hr + 0.404 * vo2 + 0.394 * weight + 0.271 * age) /
        4.184;
  assert.ok(
    Math.abs(
      calculateCaloriesPerMinuteFromHeartRate({
        heartRate: 150,
        weightKg: 80,
        ageYears: 30,
        gender: 'male',
        vo2Max: 48,
      }) - kcalPerMin('male', 80, 30, 150, 48)
    ) < 1e-9
  );
  assert.ok(
    Math.abs(
      calculateCaloriesPerMinuteFromHeartRate({
        heartRate: 150,
        weightKg: 62,
        ageYears: 41,
        gender: 'female',
        vo2Max: 38,
      }) - kcalPerMin('female', 62, 41, 150, 38)
    ) < 1e-9
  );

  const session = {
    date: D,
    duration: 45,
    type: 'running',
    effortType: 'heartRate',
    averageHeartRate: 150,
  };
  const withVo2 = {
    ...personalUser,
    heartRateEntries: [{ date: shift(D, -3), vo2Max: 48 }],
  };
  assert.equal(
    calculateCardioCalories(session, withVo2, {}),
    Math.round(kcalPerMin('male', 80, 30, 150, 48) * 45)
  );
  // VO2 reading after the session does not apply to it
  assert.equal(
    calculateCardioCalories({ ...session, date: shift(D, -4) }, withVo2, {}),
    Math.round(
      ((-55.0969 + 0.6309 * 150 + 0.1988 * 80 + 0.2017 * 30) / 4.184) * 45
    )
  );
});

// ---------------------------------------------------------------------------
// Persistence + snapshots
// ---------------------------------------------------------------------------

test('heartRateEntries persist as one shard per day; unchanged days write nothing', () => {
  const day1 = { date: shift(D, -1), restingHr: 58, restingHrMethod: 'device' };
  const day2 = { date: D, restingHr: 57, restingHrMethod: 'manual', avgHr: 71 };
  const initial = diffShardedHistoryField('heartRateEntries', [], [day1, day2]);
  assert.deepEqual(initial.documents.map((doc) => doc.id).sort(), [
    `heartRateEntries:${shift(D, -1)}`,
    `heartRateEntries:${D}`,
  ]);

  const edited = { ...day2, restingHr: 55 };
  const next = diffShardedHistoryField(
    'heartRateEntries',
    [day1, day2],
    [day1, edited]
  );
  assert.deepEqual(
    next.documents.map((doc) => doc.id),
    [`heartRateEntries:${D}`]
  );

  const removed = diffShardedHistoryField(
    'heartRateEntries',
    [day1, day2],
    [day1]
  );
  assert.deepEqual(removed.deletes, [`heartRateEntries:${D}`]);
});

test('snapshot heart-rate fields are flat and null when unknown', () => {
  assert.deepEqual(buildSnapshotHeartRateFields([], D), {
    restingHr: null,
    restingHrMethod: null,
    avgHr: null,
    maxHr: null,
    vo2Max: null,
  });
  assert.deepEqual(
    buildSnapshotHeartRateFields(
      [
        {
          date: D,
          restingHr: 54,
          restingHrMethod: 'manual',
          avgHr: 70,
          maxHr: 165,
          vo2Max: 47,
        },
      ],
      D
    ),
    {
      restingHr: 54,
      restingHrMethod: 'manual',
      avgHr: 70,
      maxHr: 165,
      vo2Max: 47,
    }
  );
});
