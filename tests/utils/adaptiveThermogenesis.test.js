import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeAdaptiveThermogenesis,
  getAdaptiveThermogenesisSmartModeDataStatus,
  resolveAdaptiveThermogenesisMode,
  SMART_WEIGHT_STALENESS_MAX_AGE_DAYS,
} from '../../src/utils/calculations/adaptiveThermogenesis.js';

const padDay = (day) => String(day).padStart(2, '0');
const makeDateKey = (day) => `2026-03-${padDay(day)}`;

const buildGoalHistory = ({ days, endDay, dayGoal }) => {
  const snapshots = {};
  for (let offset = 0; offset < days; offset += 1) {
    const day = endDay - days + 1 + offset;
    const dateKey = makeDateKey(day);
    snapshots[dateKey] = {
      date: dateKey,
      goalAtSnapshot: dayGoal(day),
      baselineTdee: 2500,
      tdee: 2500,
      intake: 2000,
    };
  }
  return { snapshots, endDateKey: makeDateKey(endDay) };
};

test('resolveAdaptiveThermogenesisMode respects explicit context mode overrides', () => {
  const mode = resolveAdaptiveThermogenesisMode({
    userData: {
      adaptiveThermogenesisEnabled: false,
      adaptiveThermogenesisSmartMode: false,
    },
    adaptiveThermogenesisContext: {
      mode: 'smart',
    },
  });

  assert.equal(mode, 'smart');
});

test('computeAdaptiveThermogenesis crude mode returns staged negative correction during extended cut', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 28,
    endDay: 28,
    dayGoal: () => 'cutting',
  });

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  assert.equal(result.mode, 'crude');
  assert.equal(result.correction, -250);
  assert.equal(result.active, true);
});

test('crude mode maps cut pressure tiers to milestone corrections', () => {
  const expectations = [
    { days: 1, pressure: -1, correction: 0 },
    { days: 2, pressure: -2, correction: 0 },
    { days: 3, pressure: -3, correction: -50 },
    { days: 7, pressure: -7, correction: -100 },
    { days: 14, pressure: -14, correction: -175 },
    { days: 21, pressure: -21, correction: -250 },
    { days: 28, pressure: -28, correction: -250 },
  ];

  expectations.forEach(({ days, pressure, correction }) => {
    const { snapshots, endDateKey } = buildGoalHistory({
      days,
      endDay: days,
      dayGoal: () => 'cutting',
    });
    const result = computeAdaptiveThermogenesis({
      mode: 'crude',
      selectedGoal: 'cutting',
      dateKey: endDateKey,
      dailySnapshots: snapshots,
    });

    assert.equal(
      result.details.balancePressure,
      pressure,
      `pressure after ${days} cut days`
    );
    assert.equal(
      result.correction,
      correction,
      `correction after ${days} cut days`
    );
  });
});

test('crude mode maps surplus pressure tiers to milestone corrections', () => {
  const expectations = [
    { days: 9, pressure: 6.75, correction: 0 },
    { days: 10, pressure: 7.5, correction: 50 },
    { days: 18, pressure: 13.5, correction: 50 },
    { days: 19, pressure: 14.25, correction: 100 },
    { days: 27, pressure: 20.25, correction: 100 },
    { days: 28, pressure: 21, correction: 150 },
  ];

  expectations.forEach(({ days, pressure, correction }) => {
    const { snapshots, endDateKey } = buildGoalHistory({
      days,
      endDay: days,
      dayGoal: () => 'bulking',
    });
    const result = computeAdaptiveThermogenesis({
      mode: 'crude',
      selectedGoal: 'bulking',
      dateKey: endDateKey,
      dailySnapshots: snapshots,
    });

    assert.equal(
      result.details.balancePressure,
      pressure,
      `pressure after ${days} surplus days`
    );
    assert.equal(
      result.correction,
      correction,
      `correction after ${days} surplus days`
    );
  });
});

test('crude keeps a non-zero high-tier correction on an isolated maintenance day after a long cut', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 21,
    endDay: 21,
    dayGoal: (day) => (day === 21 ? 'maintenance' : 'cutting'),
  });

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'maintenance',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.balancePressure, -19.75);
  assert.equal(result.correction, -175);
  assert.equal(result.active, true);
});

test('crude preserves the accumulated deficit into the cut days that follow a maintenance day', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 22,
    endDay: 22,
    dayGoal: (day) => (day === 21 ? 'maintenance' : 'cutting'),
  });

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.balancePressure, -20.75);
  assert.equal(result.correction, -175);
});

test('crude unwinds negative pressure faster with surplus than with maintenance', () => {
  const singleSurplus = buildGoalHistory({
    days: 21,
    endDay: 21,
    dayGoal: (day) => (day === 21 ? 'bulking' : 'cutting'),
  });
  const singleMaintenance = buildGoalHistory({
    days: 21,
    endDay: 21,
    dayGoal: (day) => (day === 21 ? 'maintenance' : 'cutting'),
  });

  const afterSurplus = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'bulking',
    dateKey: singleSurplus.endDateKey,
    dailySnapshots: singleSurplus.snapshots,
  });
  const afterMaintenance = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'maintenance',
    dateKey: singleMaintenance.endDateKey,
    dailySnapshots: singleMaintenance.snapshots,
  });

  assert.equal(afterSurplus.details.balancePressure, -18);
  assert.equal(afterMaintenance.details.balancePressure, -19.75);
  assert.ok(
    afterSurplus.details.balancePressure >
      afterMaintenance.details.balancePressure
  );
  assert.equal(afterSurplus.correction, -175);
  assert.equal(afterMaintenance.correction, -175);
});

test('crude surplus clears a deep cut deficit within the lookback window while maintenance lingers', () => {
  const cutThenSurplus = buildGoalHistory({
    days: 28,
    endDay: 28,
    dayGoal: (day) => (day <= 18 ? 'cutting' : 'bulking'),
  });
  const cutThenMaintenance = buildGoalHistory({
    days: 28,
    endDay: 28,
    dayGoal: (day) => (day <= 18 ? 'cutting' : 'maintenance'),
  });

  const surplusResult = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'bulking',
    dateKey: cutThenSurplus.endDateKey,
    dailySnapshots: cutThenSurplus.snapshots,
  });
  const maintenanceResult = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'maintenance',
    dateKey: cutThenMaintenance.endDateKey,
    dailySnapshots: cutThenMaintenance.snapshots,
  });

  // 18 cut + 10 surplus: -18 unwound at +2/day -> 0 then +0.75 (neutral zone).
  assert.equal(surplusResult.details.balancePressure, 0.75);
  assert.equal(surplusResult.correction, 0);
  // 18 cut + 10 maintenance: -18 + 2.5 -> still deep deficit, still -175.
  assert.equal(maintenanceResult.details.balancePressure, -15.5);
  assert.equal(maintenanceResult.correction, -175);
});

test('crude resets to -1.0 when a cut day follows positive (surplus) pressure', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 11,
    endDay: 11,
    dayGoal: (day) => (day === 11 ? 'cutting' : 'bulking'),
  });

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.balancePressure, -1);
  assert.equal(result.correction, 0);
});

test('crude prefers snapshot.selectedGoal over goalAtSnapshot', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 5,
    endDay: 5,
    dayGoal: () => 'cutting',
  });
  const lastKey = makeDateKey(5);
  snapshots[lastKey].selectedGoal = 'bulking';
  snapshots[lastKey].goalAtSnapshot = 'cutting';

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'bulking',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  // Days 1-4 cut (-4), day 5 surplus (+2) => -2, still neutral zone.
  assert.equal(result.details.balancePressure, -2);
  assert.equal(result.correction, 0);
});

test('crude falls back to goalAtSnapshot and skips snapshots without a goal', () => {
  const snapshots = {
    [makeDateKey(1)]: { date: makeDateKey(1), goalAtSnapshot: 'cutting' },
    [makeDateKey(2)]: { date: makeDateKey(2) },
    [makeDateKey(3)]: { date: makeDateKey(3), goalAtSnapshot: 'cutting' },
  };

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: makeDateKey(3),
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.windowDays, 2);
  assert.equal(result.details.balancePressure, -2);
  assert.equal(result.correction, 0);
});

test('crude stays neutral with maintenance-only goal history', () => {
  const { snapshots, endDateKey } = buildGoalHistory({
    days: 10,
    endDay: 10,
    dayGoal: () => 'maintenance',
  });

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'maintenance',
    dateKey: endDateKey,
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.balancePressure, 0);
  assert.equal(result.correction, 0);
  assert.equal(result.active, false);
});

test('crude only evaluates snapshots inside the 28-day window', () => {
  const snapshots = {
    '2026-02-28': { date: '2026-02-28', goalAtSnapshot: 'cutting' },
  };

  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: '2026-03-28',
    dailySnapshots: snapshots,
  });

  assert.equal(result.details.windowDays, 0);
  assert.equal(result.correction, 0);
  assert.equal(result.active, false);
});

test('crude returns an invalid-date state for an unparseable dateKey', () => {
  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: 'not-a-date',
    dailySnapshots: {},
  });

  assert.equal(result.correction, 0);
  assert.equal(result.active, false);
  assert.equal(result.details.reason, 'invalid-date');
});

test('crude corrections stay bounded at the lookback extremes', () => {
  const cut = buildGoalHistory({
    days: 28,
    endDay: 28,
    dayGoal: () => 'cutting',
  });
  const surplus = buildGoalHistory({
    days: 28,
    endDay: 28,
    dayGoal: () => 'bulking',
  });

  const cutResult = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    dateKey: cut.endDateKey,
    dailySnapshots: cut.snapshots,
  });
  const surplusResult = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'bulking',
    dateKey: surplus.endDateKey,
    dailySnapshots: surplus.snapshots,
  });

  assert.equal(cutResult.correction, -250);
  assert.equal(surplusResult.correction, 150);
});

test('computeAdaptiveThermogenesis smart mode returns negative correction when observed loss is slower than expected', () => {
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

  const weightEntries = [
    { date: '2026-03-01', weight: 80.0 },
    { date: '2026-03-08', weight: 79.8 },
    { date: '2026-03-15', weight: 79.5 },
    { date: '2026-03-28', weight: 79.0 },
  ];

  const result = computeAdaptiveThermogenesis({
    mode: 'smart',
    selectedGoal: 'cutting',
    dateKey: '2026-03-28',
    dailySnapshots,
    weightEntries,
  });

  assert.equal(result.mode, 'smart');
  assert.equal(result.insufficientData, false);
  assert.ok(result.correction < 0);
});

test('computeAdaptiveThermogenesis smart mode returns insufficientData when snapshot window is sparse', () => {
  const result = computeAdaptiveThermogenesis({
    mode: 'smart',
    selectedGoal: 'cutting',
    dateKey: '2026-03-28',
    dailySnapshots: {
      '2026-03-28': {
        date: '2026-03-28',
        baselineTdee: 2400,
        intake: 2000,
      },
    },
    weightEntries: [
      { date: '2026-03-01', weight: 80 },
      { date: '2026-03-28', weight: 79 },
    ],
  });

  assert.equal(result.mode, 'smart');
  assert.equal(result.insufficientData, true);
  assert.equal(result.correction, 0);
});

test('computeAdaptiveThermogenesis smart mode supports optional smoothing and exposes applied smoothing metadata', () => {
  const dailySnapshots = {};
  for (let day = 1; day <= 28; day += 1) {
    const dateKey = `2026-03-${String(day).padStart(2, '0')}`;
    dailySnapshots[dateKey] = {
      date: dateKey,
      baselineTdee: 2500,
      tdee: 2500,
      intake: 2050,
    };
  }

  const weightEntries = [
    { date: '2026-03-01', weight: 80.0 },
    { date: '2026-03-08', weight: 79.7 },
    { date: '2026-03-15', weight: 80.3 },
    { date: '2026-03-22', weight: 79.2 },
    { date: '2026-03-28', weight: 78.9 },
  ];

  const result = computeAdaptiveThermogenesis({
    mode: 'smart',
    selectedGoal: 'cutting',
    dateKey: '2026-03-28',
    dailySnapshots,
    weightEntries,
    adaptiveSmoothingEnabled: true,
    adaptiveSmoothingMethod: 'sma',
    adaptiveSmoothingWindowDays: 7,
  });

  assert.equal(result.mode, 'smart');
  assert.equal(result.insufficientData, false);
  assert.equal(result.signal?.smoothingEnabled, true);
  assert.equal(result.signal?.smoothingMethod, 'sma');
  assert.equal(result.signal?.smoothingWindowDays, 7);
});

const buildFullSmartWindow = () => {
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
  return dailySnapshots;
};

test('smart-mode data status flags stale weigh-ins via weight-data-stale with age metadata', () => {
  const status = getAdaptiveThermogenesisSmartModeDataStatus({
    dateKey: '2026-03-28',
    dailySnapshots: buildFullSmartWindow(),
    // Enough entries inside the window, but the newest is 8 days old.
    weightEntries: [
      { date: '2026-03-01', weight: 80 },
      { date: '2026-03-08', weight: 79.8 },
      { date: '2026-03-15', weight: 79.5 },
      { date: '2026-03-20', weight: 79.2 },
    ],
  });

  assert.equal(status.isSufficient, false);
  assert.equal(status.reason, 'weight-data-stale');
  assert.equal(status.latestWeightEntryAgeDays, 8);
  assert.equal(status.stalenessMaxAgeDays, SMART_WEIGHT_STALENESS_MAX_AGE_DAYS);
});

test('smart-mode data status stays sufficient when the newest weigh-in is within the staleness window', () => {
  const status = getAdaptiveThermogenesisSmartModeDataStatus({
    dateKey: '2026-03-28',
    dailySnapshots: buildFullSmartWindow(),
    weightEntries: [
      { date: '2026-03-08', weight: 80 },
      { date: '2026-03-15', weight: 79.8 },
      { date: '2026-03-22', weight: 79.5 },
      { date: '2026-03-27', weight: 79.2 },
    ],
  });

  assert.equal(status.isSufficient, true);
  assert.equal(status.reason, null);
  assert.equal(status.latestWeightEntryAgeDays, 1);
});

test('computeAdaptiveThermogenesis surfaces weight-data-stale through smart-mode details', () => {
  const result = computeAdaptiveThermogenesis({
    mode: 'smart',
    selectedGoal: 'cutting',
    dateKey: '2026-03-28',
    dailySnapshots: buildFullSmartWindow(),
    weightEntries: [
      { date: '2026-03-01', weight: 80 },
      { date: '2026-03-10', weight: 79.8 },
      { date: '2026-03-18', weight: 79.5 },
      { date: '2026-03-24', weight: 79.2 },
    ],
  });

  assert.equal(result.mode, 'smart');
  assert.equal(result.insufficientData, true);
  assert.equal(result.correction, 0);
  assert.equal(result.details.reason, 'weight-data-stale');
  assert.equal(result.details.latestWeightEntryAgeDays, 4);
});
