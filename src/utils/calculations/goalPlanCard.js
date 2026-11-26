import {
  formatDateKeyUtc,
  getDateKeyDayDifference,
  getTodayDateKey,
} from '../data/dateKeys.js';
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
 * an active phase it gives the phase's facts (day X of Y, progress, start /
 * current / target weight, planned and measured weekly rate), and says when the
 * phase is about to end or has run past its end date.
 *
 * Pure and honest: a value with no real data behind it is `null`, never a
 * zero - callers render nothing for it. The adherence strip is not built here;
 * it comes straight from `buildDayLedgerCardSummary` (a phase narrows its
 * input with `selectPhaseLedgerInput`).
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
/** A phase's weekly rate needs weigh-ins at least this many days apart. */
export const PHASE_RATE_MIN_SPAN_DAYS = 7;
/** On pace: within this share of the phase's planned weekly rate... */
export const PACE_TOLERANCE_SHARE = 0.25;
/** ...and never tighter than this (kg/wk), which also reads as "holding". */
export const PACE_TOLERANCE_MIN_KG = 0.1;

// `getGoalAlignmentText` (utils/visuals/trackerHelpers.jsx) wording for a
// directional goal moving faster than its band. Kept in one place so the
// nudge and the verdict cannot disagree.
export const ALIGNMENT_TEXT_FASTER = 'Faster than goal target';

// Short forms of those verdicts, so the card's trend and projection share one
// line on a phone.
const SHORT_VERDICTS = Object.freeze({
  'Slower than goal target': 'Slow pace',
  [ALIGNMENT_TEXT_FASTER]: 'Fast pace',
  'Not losing as expected': 'Off track',
  'Not gaining as expected': 'Off track',
  'Deviating from maintenance': 'Drifting',
});

/** The card's wording for a verdict; unknown text passes through. */
export const shortenVerdict = (text) => SHORT_VERDICTS[text] ?? text;

const verdict = (text, color) => Object.freeze({ text, color });

// The wording and colours of `getGoalAlignmentText`.
const PACE_VERDICT = Object.freeze({
  ON_TRACK: verdict('On track', 'text-accent-green'),
  SLOWER: verdict('Slower than goal target', 'text-accent-blue'),
  FASTER: verdict(ALIGNMENT_TEXT_FASTER, 'text-accent-yellow'),
  NOT_GAINING: verdict('Not gaining as expected', 'text-accent-yellow'),
  NOT_LOSING: verdict('Not losing as expected', 'text-accent-yellow'),
  DRIFTING: verdict('Deviating from maintenance', 'text-accent-yellow'),
});

/**
 * A weekly rate against the rate a phase planned (both kg/wk, signed). A phase
 * is judged by its own plan, not by the goal's generic band.
 */
export const judgePhasePace = (currentRate, plannedRate) => {
  const planned = Math.abs(plannedRate);
  if (planned <= PACE_TOLERANCE_MIN_KG) {
    return Math.abs(currentRate) <= PACE_TOLERANCE_MIN_KG
      ? PACE_VERDICT.ON_TRACK
      : PACE_VERDICT.DRIFTING;
  }
  const isGain = plannedRate > 0;
  // Positive when moving the planned way.
  const toward = isGain ? currentRate : -currentRate;
  const tolerance = Math.max(
    PACE_TOLERANCE_MIN_KG,
    planned * PACE_TOLERANCE_SHARE
  );
  if (toward > 0 && Math.abs(toward - planned) <= tolerance) {
    return PACE_VERDICT.ON_TRACK;
  }
  if (toward <= PACE_TOLERANCE_MIN_KG) {
    return isGain ? PACE_VERDICT.NOT_GAINING : PACE_VERDICT.NOT_LOSING;
  }
  return toward < planned ? PACE_VERDICT.SLOWER : PACE_VERDICT.FASTER;
};

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
  const storedStartKg = toFiniteOrNull(phase.startingWeight);
  const startWeightKg = storedStartKg ?? windowEntries[0]?.weight ?? null;
  const targetKg = toFiniteOrNull(phase.targetWeight);
  // Without a stored starting weight, a lone weigh-in would only be compared
  // with itself: that is no change, not a change of zero.
  const hasChange =
    current !== null && (storedStartKg !== null || windowEntries.length > 1);

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

  // The rate the phase planned: start to target weight over its dates.
  const plannedWeeklyRateKg =
    targetKg !== null && startWeightKg !== null && span > 0
      ? ((targetKg - startWeightKg) / span) * 7
      : null;
  // The measured rate reads the phase's own weigh-ins, once they span enough
  // days that water weight does not decide it.
  const phaseTrend = calculateWeightTrend(windowEntries);
  const sample = phaseTrend.sampleRange;
  const sampleSpan =
    sample.length > 1
      ? getDateKeyDayDifference(sample[0].date, sample.at(-1).date)
      : 0;
  const trend =
    hasTrendData(phaseTrend) && sampleSpan >= PHASE_RATE_MIN_SPAN_DAYS
      ? phaseTrend
      : null;

  return {
    state,
    phaseName: phase.name || 'Active phase',
    startDate,
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
    weight: {
      startKg: startWeightKg,
      currentKg: current?.weight ?? null,
      changeKg: hasChange ? current.weight - startWeightKg : null,
      targetKg,
    },
    targetBodyFat: toFiniteOrNull(phase.targetBodyFat),
    pace: {
      plannedWeeklyRateKg,
      trend,
      verdict:
        trend && plannedWeeklyRateKg !== null
          ? judgePhasePace(trend.weeklyRate, plannedWeeklyRateKg)
          : null,
    },
  };
};

const nextDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return formatDateKeyUtc(date);
};

/**
 * `buildDayLedgerCardSummary` input for the phase card's adherence strip: only
 * the phase's own days count, and a phase past its end date reads the days up
 * to that end.
 *
 * @param {object} params
 * @param {object} params.phase - the active phase (`startDate`, `endDate`)
 * @param {object} [params.snapshots] - `userData.dailySnapshots`
 * @param {string} [params.todayKey]
 */
export const selectPhaseLedgerInput = ({
  phase,
  snapshots,
  todayKey = getTodayDateKey(),
}) => {
  const { startDate, endDate = null } = phase;
  return {
    snapshots: Object.values(snapshots ?? {}).filter(
      (snapshot) =>
        snapshot?.date >= startDate && (!endDate || snapshot.date <= endDate)
    ),
    todayKey: endDate && endDate < todayKey ? nextDateKey(endDate) : todayKey,
  };
};

/**
 * @param {object} params
 * @param {string} params.selectedGoal
 * @param {number} [params.goalDurationDays] - store `goalDurationDays` (0 on the first day)
 * @param {object|null} [params.phase] - the ACTIVE phase from the store's `phases`
 *   view (`name`, `startDate`, `endDate`, `targetWeight`, `targetBodyFat`,
 *   `startingWeight`)
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
