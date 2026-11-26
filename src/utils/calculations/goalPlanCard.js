import { getDateKeyDayDifference, getTodayDateKey } from '../data/dateKeys.js';
import {
  calculateWeightTrend,
  sortWeightEntries,
} from '../measurements/weight.js';
import { hasTrendData } from './goalAlignment.js';

/**
 * Display model for the Home "Your Goal" card.
 *
 * Without an active phase it answers "is my goal working?" (day in goal,
 * weight-trend verdict, a short projection and at most one coach nudge). With
 * an active phase it gives the glance row's facts (day X of Y and progress),
 * and says when the phase is about to end or has run past its end date.
 *
 * Pure and honest: a value with no real data behind it is `null`, never a
 * zero - callers render nothing for it. The adherence strip is not built here;
 * it comes straight from `buildDayLedgerCardSummary`.
 */

export const GOAL_PLAN_STATE = Object.freeze({
  GOAL: 'goal',
  PHASE: 'phase',
  PHASE_ENDING: 'phaseEnding',
  PHASE_OVERDUE: 'phaseOverdue',
});

export const GOAL_PLAN_NUDGE = Object.freeze({
  STALE_WEIGH_IN: 'staleWeighIn',
  LONG_CUT: 'longCut',
  GAINING_FAST: 'gainingFast',
});

/** A weigh-in older than this many days is called out (and blocks the projection). */
export const NUDGE_STALE_WEIGH_IN_DAYS = 7;
/** Cutting at least this long suggests a maintenance week. */
export const NUDGE_LONG_CUT_DAYS = 56;
/** An active phase this many days (or fewer) from its end date is "ending". */
export const PHASE_ENDING_SOON_DAYS = 3;
/** How far ahead the goal projection looks. */
export const PROJECTION_WEEKS = 4;
/** Finished days in the card's adherence strip. */
export const GOAL_PLAN_STRIP_DAYS = 7;
/** A projected change smaller than this (kg) reads as "holding". */
export const PROJECTION_HOLDING_KG = 0.25;

// `getGoalAlignmentText` (utils/visuals/trackerHelpers.jsx) wording for a
// directional goal moving faster than its band. Kept in one place so the
// nudge and the verdict cannot disagree.
export const ALIGNMENT_TEXT_FASTER = 'Faster than goal target';

const CUT_GOALS = new Set(['cutting', 'aggressive_cut']);
const BULK_GOALS = new Set(['bulking', 'aggressive_bulk']);

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveLatestWeighIn = (sortedEntries, todayKey) => {
  const latest = sortedEntries.at(-1) ?? null;
  if (!latest) {
    return { latest: null, ageDays: null };
  }
  return {
    latest,
    ageDays: getDateKeyDayDifference(latest.date, todayKey),
  };
};

const buildGoalModel = ({
  selectedGoal,
  goalDurationDays,
  sortedEntries,
  weightTrend,
  alignment,
  todayKey,
}) => {
  const { latest, ageDays } = resolveLatestWeighIn(sortedEntries, todayKey);
  const isWeighInStale =
    Number.isFinite(ageDays) && ageDays > NUDGE_STALE_WEIGH_IN_DAYS;
  const trend = weightTrend ?? calculateWeightTrend(sortedEntries);
  const hasTrend = hasTrendData(trend);

  const elapsedDays = Math.max(0, Math.floor(Number(goalDurationDays) || 0));

  let projection = null;
  if (hasTrend && !trend.isStaleFallback && !isWeighInStale && latest) {
    const deltaKg = trend.weeklyRate * PROJECTION_WEEKS;
    projection = {
      weeks: PROJECTION_WEEKS,
      weightKg: latest.weight + deltaKg,
      isHolding: Math.abs(deltaKg) < PROJECTION_HOLDING_KG,
    };
  }

  let nudge = null;
  if (isWeighInStale) {
    nudge = { kind: GOAL_PLAN_NUDGE.STALE_WEIGH_IN, days: ageDays };
  } else if (
    CUT_GOALS.has(selectedGoal) &&
    elapsedDays >= NUDGE_LONG_CUT_DAYS
  ) {
    nudge = {
      kind: GOAL_PLAN_NUDGE.LONG_CUT,
      weeks: Math.floor(elapsedDays / 7),
    };
  } else if (
    BULK_GOALS.has(selectedGoal) &&
    hasTrend &&
    alignment?.text === ALIGNMENT_TEXT_FASTER
  ) {
    nudge = { kind: GOAL_PLAN_NUDGE.GAINING_FAST };
  }

  return {
    state: GOAL_PLAN_STATE.GOAL,
    dayInGoal: elapsedDays + 1,
    trend: hasTrend
      ? { weeklyRate: trend.weeklyRate, alignment: alignment ?? null }
      : null,
    projection,
    nudge,
  };
};

const buildPhaseModel = ({ phase, sortedEntries, todayKey }) => {
  const startDate = phase.startDate;
  const endDate = phase.endDate ?? null;

  const sinceStart = getDateKeyDayDifference(startDate, todayKey);
  const dayNumber = Number.isFinite(sinceStart) ? sinceStart + 1 : null;
  const startsInDays =
    Number.isFinite(sinceStart) && sinceStart < 0 ? -sinceStart : 0;

  const span = endDate ? getDateKeyDayDifference(startDate, endDate) : null;
  const totalDays = Number.isFinite(span) && span >= 0 ? span + 1 : null;
  const daysLeft = endDate ? getDateKeyDayDifference(todayKey, endDate) : null;

  let state = GOAL_PLAN_STATE.PHASE;
  if (Number.isFinite(daysLeft) && daysLeft < 0) {
    state = GOAL_PLAN_STATE.PHASE_OVERDUE;
  } else if (
    Number.isFinite(daysLeft) &&
    daysLeft <= PHASE_ENDING_SOON_DAYS &&
    startsInDays === 0
  ) {
    state = GOAL_PLAN_STATE.PHASE_ENDING;
  }

  // Weight progress reads only weigh-ins inside the phase window (an overdue
  // phase stops at its end date).
  const windowEnd = endDate && endDate < todayKey ? endDate : todayKey;
  const windowEntries = sortedEntries.filter(
    (entry) => entry.date >= startDate && entry.date <= windowEnd
  );
  const current = windowEntries.at(-1) ?? null;
  const startWeightKg =
    toFiniteOrNull(phase.startingWeight) ?? windowEntries[0]?.weight ?? null;
  const targetKg = toFiniteOrNull(phase.targetWeight);

  let progress = null;
  if (
    targetKg !== null &&
    startWeightKg !== null &&
    current &&
    targetKg !== startWeightKg
  ) {
    progress = {
      kind: 'weight',
      fraction: (current.weight - startWeightKg) / (targetKg - startWeightKg),
    };
  } else if (totalDays !== null && dayNumber !== null) {
    progress = { kind: 'time', fraction: dayNumber / totalDays };
  }

  return {
    state,
    phaseName: phase.name || 'Active phase',
    endDate,
    dayNumber: startsInDays > 0 ? null : dayNumber,
    startsInDays,
    totalDays,
    daysLeft,
    progress: progress
      ? {
          kind: progress.kind,
          percent: Math.round(clamp01(progress.fraction) * 100),
        }
      : null,
  };
};

/**
 * @param {object} params
 * @param {string} params.selectedGoal
 * @param {number} [params.goalDurationDays] - store `goalDurationDays` (0 on the first day)
 * @param {object|null} [params.phase] - the ACTIVE phase from the store's `phases`
 *   view (`name`, `startDate`, `endDate`, `targetWeight`, `startingWeight`)
 * @param {Array} [params.weightEntries]
 * @param {object|null} [params.weightTrend] - precomputed `calculateWeightTrend(weightEntries)`
 * @param {{text: string, color: string}|null} [params.alignment] - `getGoalAlignmentText(trend, goal)`
 * @param {string} [params.todayKey]
 */
export const buildGoalPlanCardModel = ({
  selectedGoal,
  goalDurationDays = 0,
  phase = null,
  weightEntries = [],
  weightTrend = null,
  alignment = null,
  todayKey = getTodayDateKey(),
} = {}) => {
  const sortedEntries = sortWeightEntries(weightEntries);
  if (phase && getDateKeyDayDifference(phase.startDate, todayKey) !== null) {
    return buildPhaseModel({ phase, sortedEntries, todayKey });
  }
  return buildGoalModel({
    selectedGoal,
    goalDurationDays,
    sortedEntries,
    weightTrend,
    alignment,
    todayKey,
  });
};
