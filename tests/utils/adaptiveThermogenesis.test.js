import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeAdaptiveThermogenesis,
  resolveAdaptiveThermogenesisMode,
} from '../../src/utils/calculations/adaptiveThermogenesis.js';

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
  const result = computeAdaptiveThermogenesis({
    mode: 'crude',
    selectedGoal: 'cutting',
    goalDurationDays: 85,
    dateKey: '2026-03-24',
  });

  assert.equal(result.mode, 'crude');
  assert.equal(result.correction, -250);
  assert.equal(result.active, true);
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
