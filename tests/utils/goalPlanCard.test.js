import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALIGNMENT_TEXT_FASTER,
  buildGoalPlanCardModel,
  GOAL_PLAN_NUDGE,
  GOAL_PLAN_STATE,
  NUDGE_LONG_CUT_DAYS,
  PROJECTION_WEEKS,
} from '../../src/utils/calculations/goalPlanCard.js';

const TODAY = '2026-11-26';

// A steady weigh-in every other day ending `endKey`, `rate` kg/week.
const steadyEntries = ({
  endKey = TODAY,
  count = 10,
  start = 80,
  rate = -0.5,
}) => {
  const end = new Date(`${endKey}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const offsetDays = (count - 1 - index) * 2;
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - offsetDays);
    return {
      date: date.toISOString().slice(0, 10),
      weight: Math.round((start + (rate / 7) * index * 2) * 100) / 100,
    };
  });
};

test('goal state: day in goal counts the first day as day 1', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    goalDurationDays: 0,
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.GOAL);
  assert.equal(model.dayInGoal, 1);
});

test('goal state: no weigh-ins -> no verdict, no projection', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    todayKey: TODAY,
  });
  assert.equal(model.trend, null);
  assert.equal(model.projection, null);
  assert.equal(model.nudge, null);
});

test('goal state: one weigh-in -> no verdict yet, never a 0 rate', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    weightEntries: [{ date: TODAY, weight: 80 }],
    todayKey: TODAY,
  });
  assert.equal(model.trend, null);
  assert.equal(model.projection, null);
});

test('goal state: a real trend gives a verdict and a projection', () => {
  const alignment = { text: 'On track', color: 'text-accent-green' };
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    weightEntries: steadyEntries({ rate: -0.5 }),
    alignment,
    todayKey: TODAY,
  });
  assert.ok(model.trend);
  assert.ok(Math.abs(model.trend.weeklyRate + 0.5) < 0.05);
  assert.equal(model.trend.alignment, alignment);
  assert.equal(model.projection.weeks, PROJECTION_WEEKS);
  assert.equal(model.projection.isHolding, false);
  assert.ok(model.projection.weightKg < 80);
});

test('goal state: a flat trend projects as holding', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'maintenance',
    weightEntries: steadyEntries({ rate: 0 }),
    todayKey: TODAY,
  });
  assert.equal(model.projection.isHolding, true);
});

test('goal state: a stale weigh-in hides the projection and nudges first', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    goalDurationDays: NUDGE_LONG_CUT_DAYS + 10,
    weightEntries: steadyEntries({ endKey: '2026-11-16' }),
    todayKey: TODAY,
  });
  assert.equal(model.projection, null);
  assert.deepEqual(model.nudge, {
    kind: GOAL_PLAN_NUDGE.STALE_WEIGH_IN,
    days: 10,
  });
});

test('goal state: a long cut suggests a maintenance week', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'aggressive_cut',
    goalDurationDays: NUDGE_LONG_CUT_DAYS,
    weightEntries: steadyEntries({}),
    todayKey: TODAY,
  });
  assert.deepEqual(model.nudge, { kind: GOAL_PLAN_NUDGE.LONG_CUT, weeks: 8 });
});

test('goal state: a long maintenance or bulk is not a long cut', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'maintenance',
    goalDurationDays: NUDGE_LONG_CUT_DAYS * 2,
    weightEntries: steadyEntries({ rate: 0 }),
    todayKey: TODAY,
  });
  assert.equal(model.nudge, null);
});

test('goal state: a bulk gaining too fast is nudged', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'bulking',
    weightEntries: steadyEntries({ rate: 1.2 }),
    alignment: { text: ALIGNMENT_TEXT_FASTER, color: 'text-accent-yellow' },
    todayKey: TODAY,
  });
  assert.deepEqual(model.nudge, { kind: GOAL_PLAN_NUDGE.GAINING_FAST });
});

const basePhase = {
  name: 'Summer Cut',
  startDate: '2026-11-09',
  endDate: '2027-01-03',
  targetWeight: null,
  startingWeight: 80,
};

test('phase state: day X of Y with time progress', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: basePhase,
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.PHASE);
  assert.equal(model.phaseName, 'Summer Cut');
  assert.equal(model.dayNumber, 18);
  assert.equal(model.totalDays, 56);
  assert.equal(model.progress.kind, 'time');
  assert.equal(model.progress.percent, 32);
});

test('phase state: weigh-ins from before the phase do not drive progress', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, targetWeight: 76 },
    // Only weigh-ins before the phase started: falls back to elapsed time.
    weightEntries: steadyEntries({ endKey: '2026-11-01' }),
    todayKey: TODAY,
  });
  assert.equal(model.progress.kind, 'time');
});

test('phase state: weight progress toward a target weight', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, targetWeight: 76 },
    weightEntries: [
      { date: '2026-11-10', weight: 80 },
      { date: '2026-11-25', weight: 79 },
    ],
    todayKey: TODAY,
  });
  assert.equal(model.progress.kind, 'weight');
  assert.equal(model.progress.percent, 25);
});

test('phase state: moving away from the target never goes below 0 %', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, targetWeight: 76 },
    weightEntries: [{ date: '2026-11-20', weight: 81 }],
    todayKey: TODAY,
  });
  assert.equal(model.progress.percent, 0);
});

test('phase state: open-ended phase has no total and no time bar', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'bulking',
    phase: { ...basePhase, endDate: null },
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.PHASE);
  assert.equal(model.totalDays, null);
  assert.equal(model.progress, null);
  assert.equal(model.dayNumber, 18);
});

test('phase ending: within 3 days of the end date', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, endDate: '2026-11-28' },
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.PHASE_ENDING);
  assert.equal(model.daysLeft, 2);
});

test('phase overdue: still active past its end date', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, endDate: '2026-11-20', targetWeight: 76 },
    weightEntries: [
      { date: '2026-11-15', weight: 79 },
      // After the end date: not part of the phase.
      { date: '2026-11-24', weight: 76 },
    ],
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.PHASE_OVERDUE);
  assert.equal(model.daysLeft, -6);
  assert.equal(model.progress.percent, 25);
});

test('phase upcoming: a phase that has not started yet', () => {
  const model = buildGoalPlanCardModel({
    selectedGoal: 'cutting',
    phase: { ...basePhase, startDate: '2026-11-30' },
    todayKey: TODAY,
  });
  assert.equal(model.state, GOAL_PLAN_STATE.PHASE);
  assert.equal(model.dayNumber, null);
  assert.equal(model.startsInDays, 4);
  assert.equal(model.progress.percent, 0);
});
