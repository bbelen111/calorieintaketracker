import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRollingEnergyBalance,
  parseDailyEnergyBalance,
  getDailyBalanceKind,
  resolveWindowDays,
  ROLLING_BALANCE_WINDOWS,
  DEFAULT_ROLLING_BALANCE_WINDOW_DAYS,
} from '../../src/utils/calculations/rollingEnergyBalance.js';

// Fixed reference date so tests are deterministic.
const AS_OF = '2026-08-14';

const snapshot = (date, tdee, intake) => ({ date, tdee, intake });

const buildMap = (snapshots) =>
  Object.fromEntries(snapshots.map((s) => [s.date, s]));

const run = (snapshots, windowDays, goalDailyBalanceTarget) =>
  calculateRollingEnergyBalance({
    snapshots,
    windowDays,
    asOfDate: AS_OF,
    goalDailyBalanceTarget,
  });

test('resolveWindowDays falls back to the 7-day default for invalid windows', () => {
  assert.equal(resolveWindowDays(7), 7);
  assert.equal(resolveWindowDays(28), 28);
  assert.equal(resolveWindowDays(5), DEFAULT_ROLLING_BALANCE_WINDOW_DAYS);
  assert.equal(
    resolveWindowDays(undefined),
    DEFAULT_ROLLING_BALANCE_WINDOW_DAYS
  );
  assert.equal(resolveWindowDays('14'), 14);
  assert.deepEqual(ROLLING_BALANCE_WINDOWS, [3, 7, 14, 28]);
});

test('seven consecutive deficit days roll up to a positive balance', () => {
  const days = [
    ['2026-08-08', 2400, 2100],
    ['2026-08-09', 2400, 2100],
    ['2026-08-10', 2400, 2000],
    ['2026-08-11', 2400, 2000],
    ['2026-08-12', 2400, 2000],
    ['2026-08-13', 2400, 1900],
    ['2026-08-14', 2400, 1900],
  ].map(([date, tdee, intake]) => snapshot(date, tdee, intake));

  const result = run(buildMap(days), 7);

  assert.equal(result.trackedDays, 7);
  // Daily balances: 300,300,400,400,400,500,500 = 2800
  assert.equal(result.rollingBalance, 2800);
  assert.equal(result.averageDailyBalance, 400);
  assert.equal(result.hasData, true);
  assert.equal(result.insufficientData, false);
  assert.ok(
    result.days.every((d) => d.balance > 0),
    'every day is a deficit'
  );
});

test('mixed deficit and surplus days combine correctly', () => {
  const days = [
    snapshot('2026-08-10', 2400, 2100), // +300
    snapshot('2026-08-11', 2400, 2300), // +100
    snapshot('2026-08-12', 2400, 2600), // -200
  ];
  const result = run(buildMap(days), 3);
  assert.equal(result.trackedDays, 3);
  assert.equal(result.rollingBalance, 200);
  assert.equal(Number(result.averageDailyBalance.toFixed(2)), 66.67);
  assert.equal(result.insufficientData, false);
});

test('missing days are excluded, not treated as zero-intake days', () => {
  const days = [
    snapshot('2026-08-10', 2400, 2100), // +300
    snapshot('2026-08-12', 2400, 2600), // -200 (08-11 missing)
    snapshot('2026-08-14', 2400, 2200), // +200
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.trackedDays, 3);
  // Would be +300 if missing day were counted as zero. We only sum present days.
  assert.equal(result.rollingBalance, 300);
  assert.equal(result.averageDailyBalance, 100);
  assert.equal(result.insufficientData, true);
});

test('fewer than N available days still averages over tracked days', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2100), // +300
    snapshot('2026-08-13', 2400, 2300), // +100
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.trackedDays, 2);
  assert.equal(result.rollingBalance, 400);
  assert.equal(result.averageDailyBalance, 200);
  assert.equal(result.insufficientData, true);
});

test('an explicit range excludes older valid days from a sparse window', () => {
  const days = [
    snapshot('2026-08-01', 2400, 2100),
    snapshot('2026-08-10', 2400, 2200),
    snapshot('2026-08-12', 2400, 2300),
    snapshot('2026-08-14', 2400, 2150),
  ];
  const result = calculateRollingEnergyBalance({
    snapshots: buildMap(days),
    windowDays: 7,
    asOfDate: AS_OF,
    startDate: '2026-08-10',
  });

  assert.deepEqual(
    result.days.map((day) => day.date),
    ['2026-08-10', '2026-08-12', '2026-08-14']
  );
  // Balances: 200 + 100 + 250.
  assert.equal(result.rollingBalance, 550);
});

test('an explicit range is bounded on both sides by start and as-of dates', () => {
  const days = [
    snapshot('2026-08-01', 2400, 2100), // before range — excluded
    snapshot('2026-08-10', 2400, 2200), // +200
    snapshot('2026-08-12', 2400, 2300), // +100
    snapshot('2026-08-14', 2400, 2150), // +250
    snapshot('2026-08-20', 2400, 1000), // after as-of — excluded
  ];
  const result = calculateRollingEnergyBalance({
    snapshots: buildMap(days),
    windowDays: 28,
    asOfDate: '2026-08-14',
    startDate: '2026-08-10',
  });

  assert.deepEqual(
    result.days.map((day) => day.date),
    ['2026-08-10', '2026-08-12', '2026-08-14']
  );
  assert.equal(result.rollingBalance, 550);
  // 3 tracked days inside a 28-day calendar range is still insufficient.
  assert.equal(result.insufficientData, true);
});

test('3/7/14/28-day windows respect the requested size', () => {
  const days = [];
  for (let i = 28; i >= 1; i -= 1) {
    const day = String(i).padStart(2, '0');
    days.push(snapshot(`2026-07-${day}`, 2400, 2100)); // +300 each
  }

  assert.equal(run(buildMap(days), 3).trackedDays, 3);
  assert.equal(run(buildMap(days), 3).rollingBalance, 900);

  assert.equal(run(buildMap(days), 7).trackedDays, 7);
  assert.equal(run(buildMap(days), 7).rollingBalance, 2100);

  assert.equal(run(buildMap(days), 14).trackedDays, 14);
  assert.equal(run(buildMap(days), 14).rollingBalance, 4200);

  assert.equal(run(buildMap(days), 28).trackedDays, 28);
  assert.equal(run(buildMap(days), 28).rollingBalance, 8400);
});

test('duplicate dates keep the last snapshot', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2100), // +300
    snapshot('2026-08-12', 2400, 2700), // -300 (overrides)
    snapshot('2026-08-13', 2400, 2300), // +100
  ];
  const result = run(buildMap(days), 3);
  assert.equal(result.trackedDays, 2);
  assert.equal(result.rollingBalance, -200);
});

test('malformed snapshots are excluded and do not break the rollup', () => {
  const days = [
    snapshot('2026-08-10', 2400, 2100), // +300
    { date: '2026-08-11', tdee: 'not-a-number', intake: 2000 }, // invalid
    { date: '2026-08-12', tdee: 2400 }, // missing intake
    { date: 'not-a-date', tdee: 2400, intake: 2000 }, // invalid date
    null, // not an object
    snapshot('2026-08-13', 2400, 2200), // +200
  ];

  const result = run(days, 7);
  assert.equal(result.trackedDays, 2);
  assert.equal(result.rollingBalance, 500);
  assert.deepEqual(
    result.days.map((d) => d.date),
    ['2026-08-10', '2026-08-13']
  );
});

test('zero balance is still a valid tracked day and classifies as maintenance', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2400), // 0
    snapshot('2026-08-13', 2400, 2300), // +100
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.trackedDays, 2);
  assert.equal(result.rollingBalance, 100);
  assert.equal(getDailyBalanceKind(0), 'maintenance');
  assert.equal(getDailyBalanceKind(45), 'maintenance'); // within epsilon
  assert.equal(getDailyBalanceKind(60), 'deficit');
  assert.equal(getDailyBalanceKind(-60), 'surplus');
});

test('positive surplus (negative balance) is reported with a negative rollup', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2700), // -300
    snapshot('2026-08-13', 2400, 2600), // -200
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.rollingBalance, -500);
  assert.equal(getDailyBalanceKind(result.rollingBalance), 'surplus');
});

test('positive deficit is reported with a positive rollup', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2100), // +300
    snapshot('2026-08-13', 2400, 2150), // +250
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.rollingBalance, 550);
  assert.equal(getDailyBalanceKind(result.rollingBalance), 'deficit');
});

test('expected vs actual variance uses the goal daily balance target', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2150), // +250 actual
    snapshot('2026-08-13', 2400, 2150), // +250 actual
    snapshot('2026-08-14', 2400, 2150), // +250 actual
  ];
  // Goal: +300/day deficit target
  const result = run(buildMap(days), 7, 300);

  assert.equal(result.trackedDays, 3);
  assert.equal(result.rollingBalance, 750);
  assert.equal(result.expectedBalance, 900); // 300 * 3
  assert.equal(result.balanceVariance, -150); // 750 - 900
});

test('without a goal target the expected/variance fields stay null', () => {
  const days = [
    snapshot('2026-08-12', 2400, 2150), // +250
    snapshot('2026-08-13', 2400, 2150), // +250
  ];
  const result = run(buildMap(days), 7, undefined);
  assert.equal(result.expectedBalance, null);
  assert.equal(result.balanceVariance, null);
  assert.equal(result.rollingBalance, 500);
});

test('date boundary excludes future dates after the as-of date', () => {
  const days = [
    snapshot('2026-08-10', 2400, 2100), // +300 (past)
    snapshot('2026-08-14', 2400, 2100), // +300 (today)
    snapshot('2026-08-20', 2400, 900), // future — excluded
    snapshot('2026-09-01', 2400, 900), // future — excluded
  ];
  const result = run(buildMap(days), 7);
  assert.equal(result.trackedDays, 2);
  assert.deepEqual(
    result.days.map((d) => d.date),
    ['2026-08-10', '2026-08-14']
  );
});

test('historical/older-schema snapshots remain compatible', () => {
  // Older snapshots may lack optional fields — we derive from tdee & intake.
  const older = {
    date: '2026-08-12',
    tdee: 2400,
    intake: 2100,
    goalAtSnapshot: 'cutting',
    bmr: 1750,
    stepCount: 8000,
    isTrainingDay: true,
  };
  const parsed = parseDailyEnergyBalance(older);
  assert.deepEqual(parsed, {
    date: '2026-08-12',
    tdee: 2400,
    intake: 2100,
    balance: 300,
  });

  const result = run({ '2026-08-12': older }, 7);
  assert.equal(result.trackedDays, 1);
  assert.equal(result.rollingBalance, 300);
});

test('empty / missing snapshot maps report no data without crashing', () => {
  assert.equal(run(undefined, 7).hasData, false);
  assert.equal(run({}, 7).trackedDays, 0);
  assert.equal(run({}, 7).rollingBalance, 0);
  assert.equal(run({}, 7).averageDailyBalance, null);
  const empty = run({}, 7);
  assert.equal(empty.estimatedWeightChangeKg, null);
  assert.equal(empty.balanceVariance, null);
});
