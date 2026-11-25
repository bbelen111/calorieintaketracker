// Display model for Home's hero readouts: the pill beside the "Energy Map"
// title and the two configurable tiles beneath it. One pure function turns a
// chosen metric + today's inputs into what they draw - an icon key, the
// readout, an optional 0-100 progress outline and an accessible label. No
// React, no store: the components only render it, and every number comes from
// an existing canonical source (nutrition totals, the macro engine, the rolling
// balance calculator and the Daily Ledger summary), never a re-implementation.
//
// One model, two shapes. The pill reads `value` + `unit` on a single line
// (`447 / 2,583 kcal`); the tile reads `shortLabel` / `primary` / `caption`
// (`Calories` / `447` / `of 2,583 kcal`), the same three-line grammar as the
// Weight tile.
//
// Honesty rules shared by every metric:
// - A metric that cannot be computed reads "—" and still opens its screen; it
//   never silently swaps to another metric.
// - A metric with no goal has no progress outline (`progress: null`), which is
//   different from 0 % (a goal exists and nothing is done yet).

import { HERO_ACTION_METRICS } from '../../constants/appearance/heroAction.js';
import { normalizeOnTargetTolerance } from '../../constants/goals/onTarget.js';
import { calculateRollingEnergyBalance } from './rollingEnergyBalance.js';
import { buildDayLedgerCardSummary } from './dayLedgerPresentation.js';
import { createUnitFormatter } from '../units/unitFormatter.js';
import {
  calculateMacroRecommendations,
  normalizeMacroLocks,
  normalizeMacroRecommendationSplit,
} from './macroRecommendations.js';
import { getTodayDateKey } from '../data/dateKeys.js';

export const HERO_ROLLING_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DASH = '—';

const toFinite = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toPositive = (value) => {
  const numeric = toFinite(value);
  return numeric != null && numeric > 0 ? numeric : null;
};

const formatInt = (value) => Math.round(Number(value) || 0).toLocaleString();

/**
 * Share of `goal` already reached, clamped to 0-100. A missing or non-positive
 * goal (or value) means "no progress", never a division artifact.
 *
 * Over-goal and goal-reached states are intentionally not designed yet: today
 * anything past the goal just clamps to a full outline. Their branch point
 * belongs here (shaped like `StepTrackerModal`'s `getBarColor`), so the
 * components stay presentational.
 */
export const getProgressPercent = (value, goal) => {
  const goalValue = Number(goal);
  const numericValue = Number(value);

  if (!Number.isFinite(goalValue) || goalValue <= 0) {
    return 0;
  }
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }
  return Math.min(100, (numericValue / goalValue) * 100);
};

const parseDateKeyUtc = (dateKey) => {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }
  const time = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
};

const diffDays = (fromKey, toKey) => {
  const from = parseDateKeyUtc(fromKey);
  const to = parseDateKeyUtc(toKey);
  if (from == null || to == null) {
    return null;
  }
  return Math.round((to - from) / MS_PER_DAY);
};

/**
 * Shape one metric's model from its parts.
 *
 * `current` is the headline number, `goal` the figure it is measured against
 * (or `null`), `unit` the pill's trailing unit. `tileUnit` overrides the unit in
 * the tile's caption where the pill's would read badly (`days`).
 */
const makeModel = ({
  metric,
  iconKey,
  label,
  shortLabel,
  current,
  goal = null,
  unit = '',
  tileUnit = unit,
  tilePrimary = current,
  tileCaption = null,
  warning = null,
  progress = null,
  action,
  ariaDetail,
}) => {
  const value = goal != null ? `${current} / ${goal}` : current;
  const caption =
    tileCaption ??
    (goal != null
      ? `of ${goal}${tileUnit ? ` ${tileUnit}` : ''}`
      : (tileUnit ?? ''));
  return {
    metric,
    iconKey,
    label,
    shortLabel,
    value,
    unit,
    primary: tilePrimary,
    caption,
    // A staleness note shown beside the tile's value (Weight / Body Fat only).
    warning,
    progress,
    ariaLabel: `${label}, ${ariaDetail ?? [value, unit].filter(Boolean).join(' ')}. ${action}`,
  };
};

const buildCaloriesModel = ({ consumed, calorieTarget }) => {
  const eaten = Math.max(0, Math.round(Number(consumed) || 0));
  const target = toPositive(calorieTarget);
  const targetValue = target != null ? Math.round(target) : null;
  return makeModel({
    metric: HERO_ACTION_METRICS.CALORIES,
    iconKey: 'utensils',
    label: 'Calories today',
    shortLabel: 'Calories',
    current: formatInt(eaten),
    goal: targetValue != null ? formatInt(targetValue) : DASH,
    unit: 'kcal',
    progress: targetValue != null ? getProgressPercent(eaten, targetValue) : 0,
    action: 'Add meal',
    ariaDetail:
      targetValue != null ? `${eaten} of ${targetValue} kcal` : `${eaten} kcal`,
  });
};

const buildCaloriesLeftModel = ({ consumed, calorieTarget }) => {
  const eaten = Math.max(0, Math.round(Number(consumed) || 0));
  const target = toPositive(calorieTarget);
  const base = {
    metric: HERO_ACTION_METRICS.CALORIES_LEFT,
    iconKey: 'utensils',
    label: 'Calories left',
    shortLabel: 'Calories left',
    action: 'Add meal',
  };
  if (target == null) {
    return makeModel({
      ...base,
      current: DASH,
      unit: 'kcal left',
      progress: 0,
    });
  }
  const targetValue = Math.round(target);
  const remaining = targetValue - eaten;
  return makeModel({
    ...base,
    current: formatInt(Math.abs(remaining)),
    unit: remaining >= 0 ? 'kcal left' : 'kcal over',
    progress: getProgressPercent(eaten, targetValue),
  });
};

const buildProteinModel = ({ proteinGrams, calorieTarget, userData }) => {
  const eaten = Math.max(0, Math.round(Number(proteinGrams) || 0));
  const target = toPositive(calorieTarget);
  let targetGrams = null;
  if (target != null) {
    const recommendation = calculateMacroRecommendations({
      targetCalories: target,
      macroSplit: normalizeMacroRecommendationSplit(
        userData?.macroRecommendationSplit
      ),
      userData,
      macroLocks: normalizeMacroLocks(userData?.macroLocks),
    });
    targetGrams = toPositive(recommendation?.grams?.protein);
  }
  const targetValue = targetGrams != null ? Math.round(targetGrams) : null;
  return makeModel({
    metric: HERO_ACTION_METRICS.PROTEIN,
    iconKey: 'beef',
    label: 'Protein today',
    shortLabel: 'Protein',
    current: formatInt(eaten),
    goal: targetValue != null ? formatInt(targetValue) : DASH,
    unit: 'g',
    progress: targetValue != null ? getProgressPercent(eaten, targetValue) : 0,
    action: 'Add meal',
    ariaDetail:
      targetValue != null ? `${eaten} of ${targetValue} g` : `${eaten} g`,
  });
};

const buildStepsModel = ({ steps, stepGoal }) => {
  const count = Math.max(0, Math.round(Number(steps) || 0));
  const goal = toPositive(stepGoal);
  const goalValue = goal != null ? Math.round(goal) : null;
  return makeModel({
    metric: HERO_ACTION_METRICS.STEPS,
    iconKey: 'footprints',
    label: 'Steps today',
    shortLabel: 'Steps',
    current: formatInt(count),
    goal: goalValue != null ? formatInt(goalValue) : DASH,
    unit: 'steps',
    progress: goalValue != null ? getProgressPercent(count, goalValue) : 0,
    action: 'Open step tracker',
    ariaDetail:
      goalValue != null ? `${count} of ${goalValue} steps` : `${count} steps`,
  });
};

// Deficit-positive (the app's convention): balance = TDEE - intake.
const describeBalanceKind = (balance) => (balance >= 0 ? 'deficit' : 'surplus');

const buildTodayBalanceModel = ({ tdee, consumed, goalDailyBalanceTarget }) => {
  const intake = Math.max(0, Number(consumed) || 0);
  const dayTdee = toPositive(tdee);
  const base = {
    metric: HERO_ACTION_METRICS.DEFICIT,
    iconKey: 'gauge',
    label: 'Today’s balance',
    shortLabel: 'Today’s balance',
    action: 'Open today’s ledger',
  };

  // Nothing eaten yet means the "balance" is the whole day's TDEE, not a
  // verdict - the ledger shows the same day as unjudged.
  if (dayTdee == null || intake <= 0) {
    return makeModel({ ...base, current: DASH, unit: 'kcal', progress: null });
  }

  const balance = Math.round(dayTdee - intake);
  const target = toFinite(goalDailyBalanceTarget);
  const unit = `kcal ${describeBalanceKind(balance)}`;
  const magnitude = formatInt(Math.abs(balance));

  if (target == null || target === 0) {
    return makeModel({ ...base, current: magnitude, unit, progress: null });
  }

  // Progress only counts movement in the goal's own direction: a cut that is
  // currently in surplus is 0 %, not a negative or a full ring.
  const ratio = balance / target;
  return makeModel({
    ...base,
    current: magnitude,
    goal: formatInt(Math.abs(target)),
    unit,
    progress: ratio > 0 ? Math.min(100, ratio * 100) : 0,
  });
};

const buildRollingBalanceModel = ({
  snapshots,
  goalDailyBalanceTarget,
  todayKey,
}) => {
  const base = {
    metric: HERO_ACTION_METRICS.BALANCE_7D,
    iconKey: 'trendingDown',
    label: '7-day balance',
    shortLabel: '7-day balance',
    action: 'Open rolling energy balance',
  };
  const rolling = calculateRollingEnergyBalance({
    snapshots,
    windowDays: HERO_ROLLING_WINDOW_DAYS,
    asOfDate: todayKey,
    goalDailyBalanceTarget,
  });
  const total = toFinite(rolling?.rollingBalance);
  if (!rolling?.hasData || total == null) {
    return makeModel({ ...base, current: DASH, unit: 'kcal', progress: null });
  }
  const rounded = Math.round(total);
  return makeModel({
    ...base,
    current: formatInt(Math.abs(rounded)),
    unit: rounded === 0 ? 'kcal' : `kcal ${describeBalanceKind(rounded)}`,
    progress: null,
  });
};

const buildPhaseModel = ({ activePhase, todayKey }) => {
  const base = {
    metric: HERO_ACTION_METRICS.PHASE,
    iconKey: 'flag',
    label: 'Phase',
    shortLabel: 'Phase',
    action: 'Open active phase',
    progress: null,
  };
  const noPhase = () => makeModel({ ...base, current: 'No phase', unit: '' });

  if (!activePhase || !activePhase.startDate) {
    return noPhase();
  }
  const elapsed = diffDays(activePhase.startDate, todayKey);
  if (elapsed == null) {
    return noPhase();
  }
  if (elapsed < 0) {
    return makeModel({ ...base, current: 'Not started', unit: '' });
  }

  const span = activePhase.endDate
    ? diffDays(activePhase.startDate, activePhase.endDate)
    : null;
  const total = span != null && span >= 0 ? span + 1 : null;
  const day = elapsed + 1;

  if (total == null) {
    return makeModel({
      ...base,
      current: `Day ${formatInt(day)}`,
      unit: '',
      tileUnit: 'no end date',
    });
  }

  const clampedDay = Math.min(day, total);
  return makeModel({
    ...base,
    current: `Day ${formatInt(clampedDay)}`,
    goal: formatInt(total),
    unit: '',
    tileUnit: 'days',
    progress: getProgressPercent(clampedDay, total),
  });
};

const buildStreakModel = ({ snapshots, todayKey, tolerance, selectedGoal }) => {
  const summary = buildDayLedgerCardSummary({
    snapshots,
    todayKey,
    tolerance,
    currentGoal: selectedGoal,
  });
  const days = Math.max(0, Math.round(Number(summary?.streak) || 0));
  return makeModel({
    metric: HERO_ACTION_METRICS.STREAK,
    iconKey: 'flame',
    label: 'On-target streak',
    shortLabel: 'Streak',
    current: formatInt(days),
    unit: 'day streak',
    tileUnit: days === 1 ? 'day on target' : 'days on target',
    progress: null,
    action: 'Open daily ledger',
    ariaDetail: `${days} ${days === 1 ? 'day' : 'days'}`,
  });
};

const buildRestingHrModel = ({ restingHr }) => {
  const bpm = toPositive(restingHr);
  return makeModel({
    metric: HERO_ACTION_METRICS.RESTING_HR,
    iconKey: 'heartPulse',
    label: 'Resting heart rate',
    shortLabel: 'Resting HR',
    current: bpm != null ? formatInt(bpm) : DASH,
    unit: 'bpm',
    progress: null,
    action: 'Open heart rate tracker',
  });
};

const buildBurnModel = ({ exerciseBurn }) =>
  makeModel({
    metric: HERO_ACTION_METRICS.BURN,
    iconKey: 'zap',
    label: 'Exercise burn',
    shortLabel: 'Exercise',
    current: formatInt(Math.max(0, Number(exerciseBurn) || 0)),
    unit: 'kcal burned',
    progress: null,
    action: 'Open today’s breakdown',
  });

// Weight / Body Fat are readings, not goals: no progress outline. The caller
// formats them (`formatWeight`, `formatPanelDate`, the old-data warning live in
// view helpers) so this module stays free of React/view imports.
const buildMeasurementModel = ({
  metric,
  iconKey,
  label,
  shortLabel,
  unit,
  tileSuffix,
  reading,
  action,
}) => {
  const display =
    reading?.display != null && reading.display !== '' ? reading.display : null;
  return makeModel({
    metric,
    iconKey,
    label,
    shortLabel,
    current: display ?? DASH,
    unit: display != null ? unit : '',
    tilePrimary: display != null ? `${display}${tileSuffix}` : DASH,
    tileCaption: reading?.dateLabel || 'No entries yet',
    warning: reading?.warning ?? null,
    progress: null,
    action,
    ariaDetail: display != null ? `${display}${tileSuffix}` : 'no entries yet',
  });
};

/**
 * @param {object} args
 * @param {string} args.metric one of `HERO_ACTION_METRICS`
 * @param {object} args.userData profile + history (macro split/locks, snapshots, tolerance)
 * @param {string} [args.todayKey] local `YYYY-MM-DD`
 * @param {number|null} args.calorieTarget today's calorie target
 * @param {number} args.consumed calories eaten today
 * @param {number} args.proteinGrams protein eaten today
 * @param {number} args.steps steps today
 * @param {number} args.stepGoal daily step goal
 * @param {number} args.tdee today's goal-seeded TDEE
 * @param {number} args.goalDailyBalanceTarget phase-lock-aware target, positive = deficit
 * @param {object|null} args.activePhase the active phase (`startDate` / `endDate`)
 * @param {number|null} args.restingHr resting HR baseline as of today
 * @param {number} args.exerciseBurn training + cardio kcal today
 * @param {{display: string|null, dateLabel: string, warning: string|null}} [args.weight] latest weigh-in, pre-formatted
 * @param {{display: string|null, dateLabel: string, warning: string|null}} [args.bodyFat] latest body fat reading, pre-formatted
 */
export const buildHeroActionModel = ({
  metric,
  userData,
  todayKey = getTodayDateKey(),
  calorieTarget = null,
  consumed = 0,
  proteinGrams = 0,
  steps = 0,
  stepGoal = null,
  tdee = 0,
  goalDailyBalanceTarget = 0,
  activePhase = null,
  restingHr = null,
  exerciseBurn = 0,
  weight = null,
  bodyFat = null,
} = {}) => {
  const units = createUnitFormatter(userData?.unitPreferences);

  switch (metric) {
    case HERO_ACTION_METRICS.WEIGHT:
      return buildMeasurementModel({
        metric,
        iconKey: 'scale',
        label: 'Weight',
        shortLabel: 'Weight',
        // The caller's reading is the value in this unit ("11 st 10.2" + "lb").
        unit: units.bodyWeight.linearUnit,
        tileSuffix: ` ${units.bodyWeight.linearUnit}`,
        reading: weight,
        action: 'Open weight tracker',
      });
    case HERO_ACTION_METRICS.BODY_FAT:
      return buildMeasurementModel({
        metric,
        iconKey: 'percent',
        label: 'Body fat',
        shortLabel: 'Body Fat %',
        unit: '%',
        tileSuffix: '%',
        reading: bodyFat,
        action: 'Open body fat tracker',
      });
    case HERO_ACTION_METRICS.CALORIES_LEFT:
      return buildCaloriesLeftModel({ consumed, calorieTarget });
    case HERO_ACTION_METRICS.PROTEIN:
      return buildProteinModel({ proteinGrams, calorieTarget, userData });
    case HERO_ACTION_METRICS.STEPS:
      return buildStepsModel({ steps, stepGoal });
    case HERO_ACTION_METRICS.DEFICIT:
      return buildTodayBalanceModel({
        tdee,
        consumed,
        goalDailyBalanceTarget,
      });
    case HERO_ACTION_METRICS.BALANCE_7D:
      return buildRollingBalanceModel({
        snapshots: userData?.dailySnapshots,
        goalDailyBalanceTarget,
        todayKey,
      });
    case HERO_ACTION_METRICS.PHASE:
      return buildPhaseModel({ activePhase, todayKey });
    case HERO_ACTION_METRICS.STREAK:
      return buildStreakModel({
        snapshots: userData?.dailySnapshots,
        todayKey,
        tolerance: normalizeOnTargetTolerance(userData?.onTargetToleranceKcal),
        selectedGoal: userData?.selectedGoal ?? null,
      });
    case HERO_ACTION_METRICS.RESTING_HR:
      return buildRestingHrModel({ restingHr });
    case HERO_ACTION_METRICS.BURN:
      return buildBurnModel({ exerciseBurn });
    case HERO_ACTION_METRICS.CALORIES:
    default:
      return buildCaloriesModel({ consumed, calorieTarget });
  }
};
