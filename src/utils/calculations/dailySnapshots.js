import {
  buildDisplayTefContext,
  buildTefContextForMode,
  calculateBMR,
  calculateGoalSeededBreakdown,
  isGoalKey,
  resolveGoalCalorieDelta,
} from './calculations.js';
import { getTodayDateKey } from '../data/dateKeys.js';
import { getNutritionTotalsForDate } from '../phases/phases.js';
import { normalizeDateKey } from '../measurements/weight.js';
import { normalizeHeartRateEntry } from '../measurements/heartRate.js';
import {
  NUTRIENT_KEYS,
  normalizeNutrientValue,
} from '../../constants/nutrients/nutrients.js';

/** The day's heart-rate entry projected onto flat snapshot fields. */
export const buildSnapshotHeartRateFields = (heartRateEntries, dateKey) => {
  const raw = Array.isArray(heartRateEntries)
    ? heartRateEntries.find((entry) => entry?.date === dateKey)
    : null;
  const entry = raw ? normalizeHeartRateEntry(raw) : null;
  return {
    restingHr: entry?.restingHr ?? null,
    restingHrMethod: entry?.restingHrMethod ?? null,
    avgHr: entry?.avgHr ?? null,
    maxHr: entry?.maxHr ?? null,
    vo2Max: entry?.vo2Max ?? null,
  };
};

const normalizeSelectedGoal = (value, fallback = 'maintenance') => {
  const normalized = String(value ?? '').trim();
  return isGoalKey(normalized) ? normalized : fallback;
};

const isFiniteNumber = (value) =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value));

/**
 * The daily balance target a snapshot's day was measured against, in the
 * snapshot's own sign convention (positive = deficit, e.g. +300 for a cut).
 *
 * - `recorded`: the snapshot carries `goalTarget` (stamped at build time from
 *   the goal AND any active phase delta override).
 * - `nominal`: a legacy snapshot without it; falls back to the nominal delta
 *   of its `goalAtSnapshot` (phase overrides are not recoverable from history).
 * - `null`: neither is known, so no judgement can be made about that day.
 *
 * @returns {{ target: number, source: 'recorded'|'nominal' }|null}
 */
export const resolveSnapshotGoalTarget = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  if (isFiniteNumber(snapshot.goalTarget)) {
    return {
      target: Math.round(Number(snapshot.goalTarget)),
      source: 'recorded',
    };
  }
  const goal = String(snapshot.goalAtSnapshot ?? '').trim();
  if (isGoalKey(goal)) {
    return { target: 0 - resolveGoalCalorieDelta(goal), source: 'nominal' };
  }
  return null;
};

/**
 * Repairs history written while a target-mode phase applied its smart delta
 * but `selectedGoal` still held the goal from before the phase, so a bulk day
 * was recorded as "maintenance" with a +692 kcal target (the goal now follows
 * the phase; this fixes the days recorded before it did). A day is relabelled
 * with its phase's goal only on proof: it falls inside the phase's dates, its
 * recorded `goalTarget` is exactly the phase's planned delta, and its recorded
 * goal's own nominal delta does not explain that target. Legacy snapshots
 * without a target, goal-mode phases and coincidental matches keep their
 * record. Only `goalAtSnapshot` changes; the target and every number stay.
 *
 * @param {Object<string, object>} snapshots - `dailySnapshots`
 * @param {object[]} phases - normalized phase records
 * @returns {Object<string, object>} the same object when nothing needed repair
 */
export const reconcileSnapshotGoalsWithPhases = (snapshots, phases) => {
  if (!snapshots || typeof snapshots !== 'object' || !Array.isArray(phases)) {
    return snapshots;
  }

  const plans = phases
    .map((phase) => {
      const goalType = String(phase?.goalType ?? '').trim();
      const delta = Number(phase?.smartCaloriePlan?.requiredDailyDeltaCalories);
      const startDate = normalizeDateKey(phase?.startDate);
      if (
        phase?.creationMode !== 'target' ||
        !isGoalKey(goalType) ||
        !startDate ||
        !Number.isFinite(delta) ||
        Math.round(delta) === 0
      ) {
        return null;
      }
      return {
        goalType,
        target: 0 - Math.round(delta),
        startDate,
        endDate: normalizeDateKey(phase?.endDate),
      };
    })
    .filter(Boolean);

  if (plans.length === 0) {
    return snapshots;
  }

  let repaired = null;
  Object.entries(snapshots).forEach(([dateKey, snapshot]) => {
    if (!snapshot || !isFiniteNumber(snapshot.goalTarget)) {
      return;
    }
    const target = Math.round(Number(snapshot.goalTarget));
    const recordedGoal = String(snapshot.goalAtSnapshot ?? '').trim();
    if (
      isGoalKey(recordedGoal) &&
      0 - resolveGoalCalorieDelta(recordedGoal) === target
    ) {
      return;
    }

    const plan = plans.find(
      (candidate) =>
        candidate.target === target &&
        dateKey >= candidate.startDate &&
        (!candidate.endDate || dateKey <= candidate.endDate)
    );
    if (!plan || plan.goalType === recordedGoal) {
      return;
    }

    if (!repaired) {
      repaired = { ...snapshots };
    }
    repaired[dateKey] = { ...snapshot, goalAtSnapshot: plan.goalType };
  });

  return repaired ?? snapshots;
};

const toDateKeyFromDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPreviousDateKey = (dateKey) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  if (!normalizedDateKey) {
    return null;
  }

  const date = new Date(`${normalizedDateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKeyFromDate(date);
};

const getStepCountForDate = (userData, dateKey) => {
  const entries = Array.isArray(userData?.stepEntries)
    ? userData.stepEntries
    : [];
  const entry = entries.find(
    (item) => normalizeDateKey(item?.date) === dateKey
  );
  const numericSteps = Number(entry?.steps);
  if (!Number.isFinite(numericSteps) || numericSteps < 0) {
    return 0;
  }
  return Math.round(numericSteps);
};

const hasTrainingSessionsForDate = (userData, dateKey) => {
  const sessions = Array.isArray(userData?.trainingSessions)
    ? userData.trainingSessions
    : [];

  return sessions.some(
    (session) => normalizeDateKey(session?.date) === dateKey
  );
};

const META_FIELDS = new Set(['createdAt', 'updatedAt']);

const getComparableKeys = (snapshot) =>
  Object.keys(snapshot).filter((key) => !META_FIELDS.has(key));

const isPlainObjectValue = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const arePlainObjectsEqual = (a, b) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
};

export const areDailySnapshotsEquivalent = (previousSnapshot, nextSnapshot) => {
  if (previousSnapshot === nextSnapshot) {
    return true;
  }

  if (!previousSnapshot || !nextSnapshot) {
    return false;
  }

  const previousKeys = getComparableKeys(previousSnapshot);
  const nextKeys = getComparableKeys(nextSnapshot);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (let index = 0; index < previousKeys.length; index += 1) {
    const key = previousKeys[index];
    if (!Object.prototype.hasOwnProperty.call(nextSnapshot, key)) {
      return false;
    }

    const previousValue = previousSnapshot[key];
    const nextValue = nextSnapshot[key];

    // Object-valued fields (`micros`, `microsCoverage`) are rebuilt as fresh
    // objects on every snapshot build, so they must be compared structurally.
    // Reference comparison here made every rebuild look "different", which
    // (1) defeated the idempotent-upsert guarantee and (2) drove the midnight
    // day-turnover rollover into an unbounded write/re-fire recursion that
    // froze and crashed the app at 12:00 AM.
    if (isPlainObjectValue(previousValue) && isPlainObjectValue(nextValue)) {
      if (!arePlainObjectsEqual(previousValue, nextValue)) {
        return false;
      }
    } else if (previousValue !== nextValue) {
      return false;
    }
  }

  return true;
};

export const buildDailySnapshot = ({
  dateKey,
  userData,
  trainingTypes,
  cardioTypes,
  bmr,
  existingSnapshot,
  goalKey,
  goalDeltaOverride = null,
  todayKey = getTodayDateKey(),
}) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  if (!normalizedDateKey) {
    return null;
  }

  // The goal a day was lived under is history: once the day is over, a rebuild
  // (an edited meal, a health backfill) must not restamp it with today's goal
  // and target. Today's snapshot is still in progress, so it follows the live
  // goal (a mid-day switch or a phase change). A legacy past snapshot keeps its
  // goal; its target stays unknown (`null`) and readers fall back to nominal.
  const recordedGoal = String(existingSnapshot?.goalAtSnapshot ?? '').trim();
  const keepsRecordedGoal =
    Boolean(existingSnapshot) &&
    normalizedDateKey < todayKey &&
    isGoalKey(recordedGoal);
  const resolvedGoalKey = goalKey ?? userData?.selectedGoal;
  const goalTarget = keepsRecordedGoal
    ? isFiniteNumber(existingSnapshot.goalTarget)
      ? Math.round(Number(existingSnapshot.goalTarget))
      : null
    : 0 - resolveGoalCalorieDelta(resolvedGoalKey, goalDeltaOverride);

  const nutritionTotals = getNutritionTotalsForDate(
    userData?.nutritionData ?? {},
    normalizedDateKey
  );
  const stepCount = getStepCountForDate(userData, normalizedDateKey);
  const isTrainingDay = hasTrainingSessionsForDate(userData, normalizedDateKey);
  const resolvedBmr = Number.isFinite(Number(bmr))
    ? Math.round(Number(bmr))
    : Math.round(calculateBMR(userData ?? {}));

  // Record the TEF mode the user actually sees (Smart TEF's Target option is
  // what non-logging users run), not a hardcoded dynamic/off choice — the
  // ledger, the breakdown modal it opens and the hero all read this snapshot.
  const tefContext = buildDisplayTefContext(userData, { nutritionTotals });

  const breakdown = calculateGoalSeededBreakdown({
    steps: stepCount,
    isTrainingDay,
    userData,
    bmr: resolvedBmr,
    cardioTypes,
    trainingTypes,
    tefContext,
    adaptiveThermogenesisContext: {
      enabled: Boolean(userData?.adaptiveThermogenesisEnabled),
      mode: userData?.adaptiveThermogenesisEnabled
        ? userData?.adaptiveThermogenesisSmartMode
          ? 'smart'
          : 'crude'
        : 'off',
    },
    dateKey: normalizedDateKey,
    goalKey: goalKey ?? userData?.selectedGoal,
    goalDeltaOverride,
  });

  const intake = Math.round(Number(nutritionTotals?.calories) || 0);
  const tdee = Math.round(Number(breakdown?.total) || 0);
  const baselineTdee = Math.round(Number(breakdown?.baselineTotal) || tdee);
  const adaptiveThermogenesisCorrection = Math.round(
    Number(breakdown?.adaptiveThermogenesisCorrection) || 0
  );
  const adaptiveThermogenesisMode =
    breakdown?.adaptiveThermogenesisMode ?? 'off';
  const now = Date.now();

  // Micro totals are persisted for history/analytics (Ledger, Insights).
  // `null` = no logged data that day, number = sum of known values; coverage
  // tracks whether the day's sum is partial (some entries lacked the nutrient).
  const micros = {};
  const microsCoverage = {};
  NUTRIENT_KEYS.forEach((key) => {
    micros[key] =
      nutritionTotals[key] != null
        ? normalizeNutrientValue(nutritionTotals[key], key)
        : null;
    microsCoverage[key] = Boolean(
      nutritionTotals.microCoverage?.[key]?.hasUntracked
    );
  });

  return {
    date: normalizedDateKey,
    goalAtSnapshot: keepsRecordedGoal
      ? recordedGoal
      : normalizeSelectedGoal(userData?.selectedGoal),
    // Daily balance target this day is judged against (kcal, positive =
    // deficit, same convention as `deficit`). Includes an active phase's smart
    // delta. The deviation is derived (`deficit - goalTarget`), never stored.
    goalTarget,
    tdee,
    baselineTdee,
    adaptiveThermogenesisCorrection,
    adaptiveThermogenesisMode,
    intake,
    deficit: tdee - intake,
    micros,
    microsCoverage,
    stepCount,
    isTrainingDay,
    bmr: resolvedBmr,
    stepCalories: Math.round(Number(breakdown?.stepCalories) || 0),
    trainingBurn: Math.round(Number(breakdown?.trainingBurn) || 0),
    cardioBurn: Math.round(Number(breakdown?.cardioBurn) || 0),
    tef: Math.round(Number(breakdown?.smartTefCalories) || 0),
    tefMode: breakdown?.tefMode ?? 'off',
    epoc: Math.round(Number(breakdown?.epocCalories) || 0),
    epocTraining: Math.round(Number(breakdown?.trainingEpoc) || 0),
    epocCardio: Math.round(Number(breakdown?.cardioEpoc) || 0),
    epocFromTodaySessions: Math.round(
      Number(breakdown?.epocFromTodaySessions) || 0
    ),
    epocCarryInCalories: Math.round(
      Number(breakdown?.epocCarryInCalories) || 0
    ),
    // Heart-rate context for history/analytics. Flat primitives on purpose:
    // areDailySnapshotsEquivalent compares nested objects only one level deep.
    // `null` = no reading that day (never zero-filled).
    ...buildSnapshotHeartRateFields(
      userData?.heartRateEntries,
      normalizedDateKey
    ),
    createdAt: Number(existingSnapshot?.createdAt) || now,
    updatedAt: now,
  };
};

/**
 * Rebuild the TEF / Adaptive-Thermogenesis contexts a recorded snapshot was
 * built with, so a historical breakdown recomputes with the *recorded* modes
 * rather than today's settings. Both resolvers fall back to current
 * `userData` flags, so the off cases are pinned with `enabled: false`.
 *
 * @param {object} snapshot – a `dailySnapshots[dateKey]` record
 * @param {{ nutritionTotals?: object }} [options]
 */
export const resolveSnapshotBreakdownContexts = (snapshot, options = {}) => {
  const tefContext = buildTefContextForMode(
    snapshot?.tefMode ?? 'off',
    options
  );
  const atMode = snapshot?.adaptiveThermogenesisMode ?? 'off';
  const adaptiveThermogenesisContext =
    atMode === 'off' ? { mode: 'off', enabled: false } : { mode: atMode };

  return { tefContext, adaptiveThermogenesisContext };
};
