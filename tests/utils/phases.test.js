import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculatePhaseMetrics,
  getPhaseCalendarData,
  getNutritionTotalsForDate,
  hasNutritionEntriesForDate,
} from '../../src/utils/phases/phases.js';

test('calendar marks day as completed when body-fat and nutrition references exist', () => {
  const phase = {
    startDate: '2026-03-10',
    endDate: '2026-03-10',
    dailyLogs: {
      '2026-03-10': {
        date: '2026-03-10',
        bodyFatRef: '2026-03-10',
        nutritionRef: '2026-03-10',
        completed: false,
      },
    },
  };

  const [day] = getPhaseCalendarData(phase);
  assert.equal(day.status, 'completed');
});

test('calendar marks day as partial when only body-fat reference exists', () => {
  const phase = {
    startDate: '2026-03-10',
    endDate: '2026-03-10',
    dailyLogs: {
      '2026-03-10': {
        date: '2026-03-10',
        bodyFatRef: '2026-03-10',
        nutritionRef: '',
        completed: false,
      },
    },
  };

  const [day] = getPhaseCalendarData(phase);
  assert.equal(day.status, 'partial');
});

test('phase metrics aggregate linked nutrition calories and macros', () => {
  const phase = {
    startDate: '2026-03-10',
    endDate: '2026-03-11',
    dailyLogs: {
      '2026-03-10': {
        date: '2026-03-10',
        nutritionRef: '2026-03-10',
      },
      '2026-03-11': {
        date: '2026-03-11',
        nutritionRef: '2026-03-11',
      },
    },
  };

  const nutritionData = {
    '2026-03-10': {
      breakfast: [
        { calories: 500, protein: 40, carbs: 45, fats: 20 },
        { calories: 200, protein: 10, carbs: 20, fats: 8 },
      ],
      lunch: [],
      dinner: [],
      snacks: [],
    },
    '2026-03-11': {
      breakfast: [{ calories: 600, protein: 50, carbs: 65, fats: 15 }],
      lunch: [{ calories: 300, protein: 20, carbs: 30, fats: 10 }],
      dinner: [],
      snacks: [],
    },
  };

  const metrics = calculatePhaseMetrics(phase, [], nutritionData);

  assert.equal(metrics.nutritionDays, 2);
  assert.equal(metrics.avgCalories, 800);
  assert.equal(metrics.avgProtein, 60);
  assert.equal(metrics.avgCarbs, 80);
  assert.equal(metrics.avgFats, 26.5);
});

test('calendar treats stale nutrition ref as missing when nutrition data is provided', () => {
  const phase = {
    startDate: '2026-03-10',
    endDate: '2026-03-10',
    dailyLogs: {
      '2026-03-10': {
        date: '2026-03-10',
        weightRef: '2026-03-10',
        nutritionRef: '2026-03-10',
      },
    },
  };

  const [day] = getPhaseCalendarData(phase, {
    '2026-03-10': {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    },
  });

  assert.equal(day.status, 'partial');
});

test('nutrition helpers detect linked day entries and totals', () => {
  const nutritionData = {
    '2026-03-10': {
      breakfast: [{ calories: 450, protein: 35, carbs: 45, fats: 12 }],
      lunch: [{ calories: 300, protein: 20, carbs: 30, fats: 10 }],
      dinner: [],
      snacks: [],
    },
  };

  assert.equal(hasNutritionEntriesForDate(nutritionData, '2026-03-10'), true);
  assert.equal(hasNutritionEntriesForDate(nutritionData, '2026-03-11'), false);

  const totals = getNutritionTotalsForDate(nutritionData, '2026-03-10');
  assert.equal(totals.calories, 750);
  assert.equal(totals.protein, 55);
  assert.equal(totals.carbs, 75);
  assert.equal(totals.fats, 22);
});
