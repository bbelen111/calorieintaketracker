import {
  getDailyBalanceKind,
  ESTIMATED_ENERGY_PER_KG,
} from './rollingEnergyBalance.js';
import { METRIC_UNITS, createUnitFormatter } from '../units/unitFormatter.js';
import { resolveSnapshotGoalTarget } from './dailySnapshots.js';
import { DEFAULT_ON_TARGET_TOLERANCE_KCAL } from '../../constants/goals/onTarget.js';
import {
  calculateCardioCalories,
  calculateTrainingSessionCalories,
} from './calculations.js';
import {
  getPreviousEntryDelta,
  normalizeDateKey,
} from '../measurements/weight.js';
import {
  formatDateKeyUtc,
  getTodayDateKey,
  getWindowDateKeys,
} from '../data/dateKeys.js';
import { MEAL_TYPE_ORDER, MEAL_TYPES } from '../../constants/meal/mealTypes.js';
import {
  deriveDailyLogStatus,
  LOG_COMPLETION_STATUS,
} from '../data/phaseLogV2.js';
import {
  getRestingHrMethodFamily,
  getRestingHrSeries,
  sortHeartRateEntries,
} from '../measurements/heartRate.js';
import {
  getHeartRateZone,
  resolveHeartRateProfile,
  resolveHeartRateZones,
} from './heartRate.js';

/**
 * Daily Ledger presentation helpers.
 *
 * Pure display-model builders for the read-only daily snapshot frontend.
 * Snapshots are cache, never truth: these helpers only read and never mutate.
 * Sign convention matches the snapshot `deficit` field (positive = deficit).
 */

const toNumber = (value) => {
  // null/undefined must not coerce to 0 — an absent metric marks the
  // snapshot malformed rather than zero-filled.
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Minimal structural validation for a persisted snapshot record.
 * A day is "tracked" only when it resolves to a real date with finite
 * tdee/intake numbers — missing or malformed records are unavailable days,
 * never zeros.
 */
export const isValidDaySnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }
  if (!normalizeDateKey(snapshot.date)) {
    return false;
  }
  return toNumber(snapshot.tdee) !== null && toNumber(snapshot.intake) !== null;
};

/** Shared colour/label metadata for balance kinds (matches KIND_META tones). */
export const DAY_LEDGER_BALANCE_META = {
  deficit: {
    label: 'Deficit',
    textClass: 'text-accent-red',
    dotClass: 'bg-accent-red',
    cellClass: 'bg-accent-red/10 border-accent-red/40',
  },
  surplus: {
    label: 'Surplus',
    textClass: 'text-accent-green',
    dotClass: 'bg-accent-green',
    cellClass: 'bg-accent-green/10 border-accent-green/40',
  },
  maintenance: {
    label: 'Maintenance',
    textClass: 'text-accent-slate',
    dotClass: 'bg-accent-slate',
    cellClass: 'bg-surface-highlight border-border',
  },
};

/**
 * Signed whole-number energy ("+350", "-120", "0", "—" for invalid), in the
 * user's energy unit. The input is kcal.
 */
export const formatSignedKcal = (value, units = METRIC_UNITS) =>
  units.energy.value(Number.isFinite(Number(value)) ? Number(value) : null, {
    signed: true,
  });

/**
 * Build the ordered energy-composition rows for one day's ledger.
 *
 * NEAT is not persisted explicitly on the snapshot; `baselineTdee` equals
 * BMR + NEAT + steps + training + cardio + TEF, so NEAT is derived and
 * clamped against rounding drift. Conditional rows mirror
 * CalorieBreakdownModal visibility rules (TEF/EPOC/Adaptive Thermogenesis).
 *
 * @returns {{ rows: Array<{key,label,value,colorClass}>, neatCalories: number }}
 */
export const buildDayLedgerRows = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { rows: [], neatCalories: 0 };
  }

  const num = (value) => toNumber(value) ?? 0;
  const bmr = num(snapshot.bmr);
  const stepCalories = num(snapshot.stepCalories);
  const trainingBurn = num(snapshot.trainingBurn);
  const cardioBurn = num(snapshot.cardioBurn);
  const tef = num(snapshot.tef);
  const epocCalories = num(snapshot.epoc);
  const atCorrection = num(snapshot.adaptiveThermogenesisCorrection);
  const atMode = snapshot.adaptiveThermogenesisMode ?? 'off';
  const tefMode = snapshot.tefMode ?? 'off';

  const baselineTdee = toNumber(snapshot.baselineTdee);
  const neatCalories =
    baselineTdee === null
      ? 0
      : Math.max(
          0,
          Math.round(
            baselineTdee - bmr - stepCalories - trainingBurn - cardioBurn - tef
          )
        );

  const rows = [
    { key: 'bmr', label: 'BMR', value: bmr, colorClass: 'bg-accent-slate' },
    {
      key: 'neat',
      label: 'NEAT',
      value: neatCalories,
      colorClass: 'bg-accent-purple',
    },
    {
      key: 'steps',
      label: 'Steps',
      value: stepCalories,
      colorClass: 'bg-accent-green',
    },
    {
      key: 'training',
      label: 'Training',
      value: trainingBurn,
      colorClass: 'bg-accent-blue',
    },
    {
      key: 'cardio',
      label: 'Cardio',
      value: cardioBurn,
      colorClass: 'bg-accent-red',
    },
  ];

  if (epocCalories > 0) {
    rows.push({
      key: 'epoc',
      label: 'EPOC',
      value: epocCalories,
      colorClass: 'bg-accent-teal',
    });
  }
  if (tefMode !== 'off') {
    rows.push({
      key: 'tef',
      label: 'TEF',
      value: tef,
      colorClass: 'bg-accent-pink',
    });
  }
  if (atMode !== 'off' || Math.abs(atCorrection) > 0) {
    rows.push({
      key: 'adaptive',
      label: 'Adaptive Thermo',
      value: atCorrection,
      colorClass: 'bg-accent-orange',
    });
  }

  return { rows, neatCalories };
};

/**
 * Summarize one calendar month's snapshots for the ledger list's
 * "month summary" empty-state panel.
 *
 * Missing/malformed days and dates after `asOfDate` are unavailable —
 * never zero-filled.
 *
 * @param {object} snapshots        – `userData.dailySnapshots` date-keyed map
 * @param {number} year             – full year (e.g. 2026)
 * @param {number} month            – 0-indexed month (0 = January)
 * @param {string} [asOfDate]       – inclusive upper bound `YYYY-MM-DD`;
 *                                    defaults to today
 * @param {object} [options]        – optional canonical entry arrays
 * @param {Array<{date:string,weight:number}>} [options.weightEntries]
 * @param {Array<{date:string,bodyFat:number}>} [options.bodyFatEntries]
 * @param {number} [options.tolerance] – on-target band (kcal) for `onTargetDays`
 * @param {number} [options.weightPrecision=1] – decimals kept on `avgWeightKg`
 */
export const summarizeMonthSnapshots = (
  snapshots,
  year,
  month,
  asOfDate,
  options
) => {
  const resolvedYear = Math.trunc(Number(year));
  const resolvedMonth = Math.trunc(Number(month));
  const hasValidMonth =
    Number.isFinite(resolvedYear) &&
    Number.isFinite(resolvedMonth) &&
    resolvedMonth >= 0 &&
    resolvedMonth <= 11;

  const daysInMonth = hasValidMonth
    ? new Date(Date.UTC(resolvedYear, resolvedMonth + 1, 0)).getUTCDate()
    : 0;

  const summary = {
    year: hasValidMonth ? resolvedYear : year,
    month: hasValidMonth ? resolvedMonth : month,
    daysInMonth,
    daysTracked: 0,
    totalIntake: 0,
    totalTdee: 0,
    totalBalance: 0,
    avgIntake: 0,
    avgTdee: 0,
    avgBalance: 0,
    deficitDays: 0,
    surplusDays: 0,
    maintenanceDays: 0,
    estimatedWeightChangeKg: 0,
    totalSteps: 0,
    avgSteps: 0,
    avgWeightKg: null,
    weightSampleCount: 0,
    avgBodyFatPercent: null,
    bodyFatSampleCount: 0,
    onTargetDays: 0,
    judgedDays: 0,
  };

  if (
    !hasValidMonth ||
    !snapshots ||
    typeof snapshots !== 'object' ||
    daysInMonth <= 0
  ) {
    return summary;
  }

  const todayKey = normalizeDateKey(asOfDate) || getTodayDateKey();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKeyUtc(
      new Date(Date.UTC(resolvedYear, resolvedMonth, day))
    );
    if (dateKey > todayKey) {
      continue;
    }
    const snapshot = snapshots[dateKey];
    if (!isValidDaySnapshot(snapshot)) {
      continue;
    }

    const tdee = toNumber(snapshot.tdee);
    const intake = toNumber(snapshot.intake);
    const balance = Math.round(tdee - intake);

    summary.daysTracked += 1;
    summary.totalTdee += tdee;
    summary.totalIntake += intake;
    summary.totalBalance += balance;
    summary.totalSteps += Math.max(
      0,
      Math.round(toNumber(snapshot.stepCount) ?? 0)
    );

    // On-target days: logged (something eaten), finished (today is still in
    // progress) and judged against the target that day was lived under.
    const dayTarget = resolveSnapshotGoalTarget(snapshot);
    if (dateKey < todayKey && intake > 0 && dayTarget) {
      summary.judgedDays += 1;
      if (
        isDayOnTarget(
          balance - dayTarget.target,
          options?.tolerance ?? DEFAULT_ON_TARGET_TOLERANCE_KCAL
        )
      ) {
        summary.onTargetDays += 1;
      }
    }

    const kind = getDailyBalanceKind(balance);
    if (kind === 'deficit') {
      summary.deficitDays += 1;
    } else if (kind === 'surplus') {
      summary.surplusDays += 1;
    } else {
      summary.maintenanceDays += 1;
    }
  }

  if (summary.daysTracked > 0) {
    summary.avgTdee = Math.round(summary.totalTdee / summary.daysTracked);
    summary.avgIntake = Math.round(summary.totalIntake / summary.daysTracked);
    summary.avgBalance = Math.round(summary.totalBalance / summary.daysTracked);
    summary.avgSteps = Math.round(summary.totalSteps / summary.daysTracked);
    summary.estimatedWeightChangeKg =
      Math.round((summary.totalBalance / ESTIMATED_ENERGY_PER_KG) * 100) / 100;
  }

  // Measurement averages come from canonical tracker entries dated within
  // this month (≤ today), never from snapshots and never borrowed across
  // months. Absent/garbage input stays null with a zero sample count.
  const averageEntriesInMonth = (entries, field, precision = 1) => {
    if (!Array.isArray(entries)) {
      return { avg: null, count: 0 };
    }
    const startKey = formatDateKeyUtc(
      new Date(Date.UTC(resolvedYear, resolvedMonth, 1))
    );
    const endKey = formatDateKeyUtc(
      new Date(Date.UTC(resolvedYear, resolvedMonth, daysInMonth))
    );
    let total = 0;
    let count = 0;
    for (const entry of entries) {
      const entryDate = normalizeDateKey(entry?.date);
      if (
        !entryDate ||
        entryDate < startKey ||
        entryDate > endKey ||
        entryDate > todayKey
      ) {
        continue;
      }
      const value = Number(entry?.[field]);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      total += value;
      count += 1;
    }
    if (count === 0) {
      return { avg: null, count: 0 };
    }
    const factor = 10 ** precision;
    return { avg: Math.round((total / count) * factor) / factor, count };
  };

  const weightStats = averageEntriesInMonth(
    options?.weightEntries,
    'weight',
    options?.weightPrecision
  );
  summary.avgWeightKg = weightStats.avg;
  summary.weightSampleCount = weightStats.count;

  const bodyFatStats = averageEntriesInMonth(
    options?.bodyFatEntries,
    'bodyFat'
  );
  summary.avgBodyFatPercent = bodyFatStats.avg;
  summary.bodyFatSampleCount = bodyFatStats.count;

  return summary;
};

/**
 * Resolve the nearest tracked dates around `dateKey` for day-to-day
 * navigation inside the detail modal. Gap days are skipped.
 *
 * @returns {{ prev: string|null, next: string|null }}
 */
export const getAdjacentTrackedDates = (snapshots, dateKey) => {
  if (!snapshots || typeof snapshots !== 'object') {
    return { prev: null, next: null };
  }

  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return { prev: null, next: null };
  }

  const trackedKeys = Object.keys(snapshots)
    .filter((key) => isValidDaySnapshot(snapshots[key]))
    .sort();

  const currentIndex = trackedKeys.indexOf(normalized);
  if (currentIndex !== -1) {
    return {
      prev: currentIndex > 0 ? trackedKeys[currentIndex - 1] : null,
      next:
        currentIndex < trackedKeys.length - 1
          ? trackedKeys[currentIndex + 1]
          : null,
    };
  }

  // Selected key is itself untracked (e.g. a gap day): bracket it instead.
  const next = trackedKeys.find((key) => key > normalized) ?? null;
  const prev =
    trackedKeys.filter((key) => key < normalized).slice(-1)[0] ?? null;
  return { prev, next };
};

const DAY_LEDGER_CARD_WINDOW_DAYS = 14;
const DAY_LEDGER_CARD_SHORT_AVG_DAYS = 7;

const shiftDateKeyUtc = (dateKey, deltaDays) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatDateKeyUtc(date);
};

/**
 * Whether a day's balance landed within `tolerance` kcal of its goal target.
 * `deviation` is `deficit - goalTarget` (see `buildDayLedgerCardSummary`); a
 * missing deviation is unknown, never "on target".
 */
export const isDayOnTarget = (deviation, tolerance) => {
  const numeric = Number(deviation);
  const band = Number(tolerance);
  if (deviation === null || deviation === undefined) {
    return false;
  }
  return (
    Number.isFinite(numeric) &&
    Number.isFinite(band) &&
    Math.abs(numeric) <= band
  );
};

export const INTAKE_TARGET_STATUS = Object.freeze({
  UNDER: 'under',
  ON_TARGET: 'onTarget',
  OVER: 'over',
});

/**
 * Where a day's intake sits against its calorie target, using the Daily
 * Ledger's on-target band (`isDayOnTarget`). All values are kcal.
 *
 * `deviation = target - intake` (positive = under the target), the sign of the
 * ledger's `deficit - goalTarget`. Both sides are rounded to whole kcal first,
 * like the ledger's balance, so the verdict matches the numbers on screen.
 * A day with nothing eaten keeps its range but gets no verdict; an unusable
 * target gets neither.
 *
 * @param {object} params
 * @param {number} params.intake         - kcal eaten
 * @param {number} params.targetCalories - the day's calorie target
 * @param {number} [params.tolerance]    - on-target band (kcal)
 * @returns {{ status: string|null, deviation: number|null,
 *             range: { low: number, high: number }|null }}
 */
export const judgeIntakeAgainstTarget = ({
  intake,
  targetCalories,
  tolerance = DEFAULT_ON_TARGET_TOLERANCE_KCAL,
} = {}) => {
  const target = Math.round(toNumber(targetCalories) ?? 0);
  if (target <= 0) {
    return { status: null, deviation: null, range: null };
  }
  const range = {
    low: Math.max(0, target - tolerance),
    high: target + tolerance,
  };
  const eaten = toNumber(intake);
  if (eaten === null || eaten <= 0) {
    return { status: null, deviation: null, range };
  }

  const deviation = target - Math.round(eaten);
  let status = INTAKE_TARGET_STATUS.ON_TARGET;
  if (!isDayOnTarget(deviation, tolerance)) {
    status =
      deviation > 0 ? INTAKE_TARGET_STATUS.UNDER : INTAKE_TARGET_STATUS.OVER;
  }
  return { status, deviation, range };
};

/** A kcal range in the user's energy unit, each end converted on its own. */
export const formatIntakeRange = (range, units = METRIC_UNITS) =>
  `${units.energy.value(range.low)} – ${units.energy.value(range.high)}`;

/**
 * How much of a target range (from `judgeIntakeAgainstTarget`) is left, worded
 * for the line under the Tracker's bar. Distances are to the range's ends,
 * never to the single target in its middle:
 *  below the range -> "400 – 600" + "remaining"
 *  inside it       -> "up to" + "160" + "remaining" (a bare "0" at the top)
 *  above it        -> "100" + "over target"
 *
 * @returns {{ prefix: string|null, amount: string, caption: string }|null}
 *   `null` without a range.
 */
export const describeIntakeRemaining = (
  { intake, range },
  units = METRIC_UNITS
) => {
  if (!range) {
    return null;
  }
  const eaten = Math.max(0, Math.round(toNumber(intake) ?? 0));
  if (eaten > range.high) {
    return {
      prefix: null,
      amount: units.energy.value(eaten - range.high),
      caption: 'over target',
    };
  }
  if (eaten < range.low) {
    return {
      prefix: null,
      amount: formatIntakeRange(
        { low: range.low - eaten, high: range.high - eaten },
        units
      ),
      caption: 'remaining',
    };
  }
  return {
    prefix: eaten < range.high ? 'up to' : null,
    amount: units.energy.value(range.high - eaten),
    caption: 'remaining',
  };
};

/**
 * The calorie target a date is measured against on the Tracker.
 *
 * A finished day uses the target saved with it: `tdee - goalTarget`, the figure
 * the Daily Ledger judges it by (the goal's nominal delta for a snapshot older
 * than `goalTarget`). Today, a future date and a finished day with no usable
 * snapshot use the live target the user picked.
 *
 * @returns {{ targetCalories: number|undefined, isSaved: boolean }}
 */
export const resolveDayCalorieTarget = ({
  dateKey,
  todayKey,
  snapshot,
  liveTargetCalories,
} = {}) => {
  const goal = dateKey < todayKey ? resolveSnapshotGoalTarget(snapshot) : null;
  const tdee = toNumber(snapshot?.tdee);
  const saved = goal && tdee > 0 ? Math.round(tdee - goal.target) : 0;
  return saved > 0
    ? { targetCalories: saved, isSaved: true }
    : { targetCalories: liveTargetCalories, isSaved: false };
};

/**
 * How full the rim around a date in the Tracker's week strip is: intake as a
 * share of that day's target. `null` (no rim) for a future date, a day with
 * nothing eaten, and a finished day with no saved target, since today's live
 * target says nothing about it.
 *
 * @returns {number|null} 0-100
 */
export const getDayIntakeProgress = ({
  dateKey,
  todayKey,
  intake,
  snapshot,
  liveTargetCalories,
} = {}) => {
  if (dateKey > todayKey) {
    return null;
  }
  const { targetCalories, isSaved } = resolveDayCalorieTarget({
    dateKey,
    todayKey,
    snapshot,
    liveTargetCalories,
  });
  if (dateKey < todayKey && !isSaved) {
    return null;
  }
  return intake > 0 && targetCalories > 0
    ? Math.min(100, (intake / targetCalories) * 100)
    : null;
};

/**
 * Target range and intake verdict for one day in the Tracker Calendar preview.
 *
 * Uses the same saved-target + tolerance contract as TrackerScreen and the
 * Daily Ledger:
 *  - Future dates (`dateKey > todayKey`): `null` (never judged).
 *  - Finished dates (`dateKey < todayKey`): judged only when the snapshot
 *    carries a resolvable saved target (`isSaved === true`).
 *  - Today (`dateKey === todayKey`): judged against `liveTargetCalories`.
 *  - Days with nothing eaten (`intake <= 0`): `null`.
 *
 * `distanceFromRange` measures to the target range's ends (`range.low` /
 * `range.high`), matching `describeIntakeRemaining` on TrackerScreen.
 *
 * @returns {{ status: string, deviation: number,
 *             range: { low: number, high: number },
 *             distanceFromRange: number, isSaved: boolean }|null}
 */
export const buildCalendarDayTargetVerdict = ({
  dateKey,
  todayKey = getTodayDateKey(),
  intake,
  snapshot,
  liveTargetCalories,
  tolerance = DEFAULT_ON_TARGET_TOLERANCE_KCAL,
} = {}) => {
  const normalizedDate = normalizeDateKey(dateKey);
  const normalizedToday = normalizeDateKey(todayKey);
  if (!normalizedDate || !normalizedToday || normalizedDate > normalizedToday) {
    return null;
  }

  const eaten = toNumber(intake);
  if (eaten === null || eaten <= 0) {
    return null;
  }

  const { targetCalories, isSaved } = resolveDayCalorieTarget({
    dateKey: normalizedDate,
    todayKey: normalizedToday,
    snapshot,
    liveTargetCalories,
  });
  if (normalizedDate < normalizedToday && !isSaved) {
    return null;
  }

  const verdict = judgeIntakeAgainstTarget({
    intake: eaten,
    targetCalories,
    tolerance,
  });
  if (!verdict.status || !verdict.range) {
    return null;
  }

  const roundedIntake = Math.round(eaten);
  const distanceFromRange =
    verdict.status === INTAKE_TARGET_STATUS.OVER
      ? roundedIntake - verdict.range.high
      : verdict.status === INTAKE_TARGET_STATUS.UNDER
        ? verdict.range.low - roundedIntake
        : 0;

  return {
    status: verdict.status,
    deviation: verdict.deviation,
    range: verdict.range,
    distanceFromRange,
    isSaved,
  };
};

const averageBalance = (days) =>
  days.length
    ? Math.round(days.reduce((sum, day) => sum + day.balance, 0) / days.length)
    : null;

/**
 * Display model for the Logbook's Daily Ledger entry card.
 *
 * Read-only projection of `dailySnapshots` over the `windowDays` FINISHED days
 * ending yesterday (today is still in progress, so it never feeds a headline
 * number). A day is "logged" only when it has a valid snapshot AND intake above
 * zero: the app seeds yesterday's/today's snapshots on launch, so a bare
 * snapshot only proves the app was opened. Unlogged days are gaps
 * (`kind: null`) - never zero-filled.
 *
 * Each logged day carries its balance (positive = deficit, the snapshot
 * `deficit` convention), the goal target it was lived under
 * (`resolveSnapshotGoalTarget`: recorded, else nominal for legacy snapshots),
 * `deviation = balance - target` and whether that is within `tolerance`.
 *
 * `trackedDays` / `firstLoggedDate` cover ALL history (logged days up to today,
 * and the earliest of them); everything else reads the finished-day window.
 *
 * The streak counts consecutive on-target logged days ending yesterday, all
 * under the CURRENT goal (a goal switch starts a new streak).
 *
 * @param {object} params
 * @param {object} params.snapshots     - `userData.dailySnapshots`
 * @param {string} [params.todayKey]    - `YYYY-MM-DD`, defaults to local today
 * @param {number} [params.windowDays]
 * @param {number} [params.tolerance]   - on-target band (kcal)
 * @param {string} [params.currentGoal] - the goal a streak must belong to
 */
export const buildDayLedgerCardSummary = ({
  snapshots,
  todayKey = getTodayDateKey(),
  windowDays = DAY_LEDGER_CARD_WINDOW_DAYS,
  tolerance = DEFAULT_ON_TARGET_TOLERANCE_KCAL,
  currentGoal = null,
} = {}) => {
  const normalizedToday = normalizeDateKey(todayKey);
  const source = snapshots && typeof snapshots === 'object' ? snapshots : {};

  const snapshotByDate = new Map();
  Object.values(source).forEach((snapshot) => {
    if (isValidDaySnapshot(snapshot) && toNumber(snapshot.intake) > 0) {
      snapshotByDate.set(normalizeDateKey(snapshot.date), snapshot);
    }
  });
  const trackedKeys = Array.from(snapshotByDate.keys())
    .filter((key) => !normalizedToday || key <= normalizedToday)
    .sort();
  const trackedDays = trackedKeys.length;
  // The first day anything was logged (the card's "Tracking since" anchor).
  const firstLoggedDate = trackedKeys[0] ?? null;

  const empty = {
    trackedDays,
    firstLoggedDate,
    windowDays,
    days: [],
    loggedDays: 0,
    judgedDays: 0,
    onTargetDays: 0,
    avgBalance7: null,
    avgBalance14: null,
    yesterday: null,
    streak: 0,
    streakGoal: null,
    tolerance,
  };
  if (!normalizedToday) {
    return empty;
  }

  const yesterdayKey = shiftDateKeyUtc(normalizedToday, -1);
  const days = getWindowDateKeys(yesterdayKey, windowDays).map((date) => {
    const snapshot = snapshotByDate.get(date);
    if (!snapshot) {
      return {
        date,
        goal: null,
        balance: null,
        kind: null,
        target: null,
        deviation: null,
        onTarget: false,
      };
    }
    const balance = Math.round(toNumber(snapshot.deficit) ?? 0);
    const target = resolveSnapshotGoalTarget(snapshot)?.target ?? null;
    const deviation = target === null ? null : balance - target;
    return {
      date,
      goal: snapshot.goalAtSnapshot ?? null,
      balance,
      kind: getDailyBalanceKind(balance),
      target,
      deviation,
      onTarget: isDayOnTarget(deviation, tolerance),
    };
  });

  const logged = days.filter((day) => day.balance !== null);
  const judged = logged.filter((day) => day.deviation !== null);

  let streak = 0;
  const streakGoal = currentGoal ?? days.at(-1)?.goal ?? null;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (!day.onTarget || !streakGoal || day.goal !== streakGoal) {
      break;
    }
    streak += 1;
  }

  const lastDay = days.at(-1);
  return {
    ...empty,
    days,
    loggedDays: logged.length,
    judgedDays: judged.length,
    onTargetDays: judged.filter((day) => day.onTarget).length,
    avgBalance7: averageBalance(
      days
        .slice(-DAY_LEDGER_CARD_SHORT_AVG_DAYS)
        .filter((day) => day.balance !== null)
    ),
    avgBalance14: averageBalance(logged),
    yesterday: lastDay && lastDay.balance !== null ? lastDay : null,
    streak,
    streakGoal: streak > 0 ? streakGoal : null,
  };
};

/**
 * Human wording for a daily balance target (positive = deficit):
 * "300 kcal deficit" / "300 kcal surplus" / "at TDEE".
 */
export const describeGoalTarget = (target, units = METRIC_UNITS) => {
  const rounded = Math.round(Number(target) || 0);
  if (rounded === 0) {
    return 'at TDEE';
  }
  return `${units.energy.format(Math.abs(Number(target)))} ${
    rounded > 0 ? 'deficit' : 'surplus'
  }`;
};

/**
 * The goal-target view of one day: the target it was lived under and how far
 * the day's balance landed from it (`deficit - goalTarget`; positive = more
 * deficit-ward than planned). Both `null` when the target is unknown.
 */
const buildSnapshotTargetFields = (snapshot, deficit) => {
  const resolved = resolveSnapshotGoalTarget(snapshot);
  // A day with nothing eaten has a target but no verdict: its "balance" is
  // just the whole TDEE, and judging it against the goal would be nonsense.
  const isLogged = toNumber(snapshot.intake) > 0;
  return {
    goalTarget: resolved?.target ?? null,
    targetDeviation: resolved && isLogged ? deficit - resolved.target : null,
  };
};

/**
 * Compact display model for the list modal's tappable day-preview panel.
 * Returns null for unavailable/malformed snapshots. `rawRows` carries the
 * full composition rows so the detail modal renders identical numbers.
 */
export const buildDaySnapshotPreview = (snapshot) => {
  if (!isValidDaySnapshot(snapshot)) {
    return null;
  }

  const deficit = Math.round(toNumber(snapshot.deficit) ?? 0);
  const balanceKind = getDailyBalanceKind(deficit);
  const { rows } = buildDayLedgerRows(snapshot);

  return {
    date: normalizeDateKey(snapshot.date),
    goalAtSnapshot: snapshot.goalAtSnapshot ?? null,
    ...buildSnapshotTargetFields(snapshot, deficit),
    isTrainingDay: Boolean(snapshot.isTrainingDay),
    tdee: Math.round(toNumber(snapshot.tdee)),
    intake: Math.round(toNumber(snapshot.intake)),
    deficit,
    balanceKind,
    stepCount: Math.max(0, Math.round(toNumber(snapshot.stepCount) ?? 0)),
    cardioBurn: Math.max(0, Math.round(toNumber(snapshot.cardioBurn) ?? 0)),
    trainingBurn: Math.max(0, Math.round(toNumber(snapshot.trainingBurn) ?? 0)),
    epocCarryInCalories: Math.max(
      0,
      Math.round(toNumber(snapshot.epocCarryInCalories) ?? 0)
    ),
    tefMode: snapshot.tefMode ?? 'off',
    adaptiveThermogenesisMode: snapshot.adaptiveThermogenesisMode ?? 'off',
    // Stacked bars can only render positive contributions; a negative
    // Adaptive Thermogenesis correction stays visible in the row list.
    barSegments: rows.filter((row) => row.value > 0),
    rawRows: rows,
  };
};

/**
 * Look up a tracker measurement recorded on an exact date from canonical
 * entry arrays (`weightEntries` / `bodyFatEntries`). Missing entries,
 * non-array input, and zero/negative/garbage values are unavailable —
 * never borrowed from neighbouring days and never zero-filled.
 *
 * @param {Array<{date:string}>|undefined} entries
 * @param {string} dateKey  – `YYYY-MM-DD`
 * @param {'weight'|'bodyFat'} field – numeric property to read
 * @returns {number|null}
 */
export const getMeasurementForDate = (entries, dateKey, field) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized || !Array.isArray(entries) || typeof field !== 'string') {
    return null;
  }
  const entry = entries.find(
    (item) => normalizeDateKey(item?.date) === normalized
  );
  const value = Number(entry?.[field]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const MICRO_KEYS = ['fiber', 'sodium', 'saturatedFats', 'sugars'];

const num0 = (value) => Math.max(0, Math.round(toNumber(value) ?? 0));

/** Aggregate one day's entries; null-scalar semantics for the four micros. */
const sumNutritionEntries = (entries) => {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: null,
    sodium: null,
    saturatedFats: null,
    sugars: null,
  };
  const coverage = {
    fiber: false,
    sodium: false,
    saturatedFats: false,
    sugars: false,
  };
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const calories = Number(entry?.calories);
    if (Number.isFinite(calories)) {
      totals.calories += calories;
    }
    ['protein', 'carbs', 'fats'].forEach((macro) => {
      const macroValue = Number(entry?.[macro]);
      if (Number.isFinite(macroValue)) {
        totals[macro] += macroValue;
      }
    });
    MICRO_KEYS.forEach((micro) => {
      if (entry?.[micro] == null) {
        coverage[micro] = true;
        return;
      }
      const microValue = Number(entry[micro]);
      if (Number.isFinite(microValue)) {
        totals[micro] = (totals[micro] ?? 0) + microValue;
      }
    });
  });
  return { totals, coverage };
};

/** Sort canonical entry arrays ascending by normalized date key. */
const sortEntriesByDate = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({ ...entry, date: normalizeDateKey(entry?.date) }))
    .filter((entry) => entry.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

/**
 * Measurement pair for one exact date: the value plus its honest "vs prev"
 * delta object (carries `spanDays` so the UI can label irregular sampling).
 * Both nullable — never zero-filled.
 */
const buildMeasurementWithDelta = (
  entries,
  dateKey,
  valueField,
  precision = 1
) => {
  const value = getMeasurementForDate(entries, dateKey, valueField);
  if (value == null) {
    return { value: null, delta: null };
  }
  return {
    value,
    delta: getPreviousEntryDelta(
      sortEntriesByDate(entries),
      dateKey,
      valueField,
      precision
    ),
  };
};

/**
 * The day's resting HR + an uncoloured `vs prev` delta, compared only within
 * the day's own method family (measured vs estimated never mix). The series
 * is pre-filtered to entries that carry a resting value so a day holding only
 * daily aggregates cannot break the previous-entry comparison.
 */
const buildRestingHrMeasurement = (heartRateEntries, dateKey) => {
  const entries = sortHeartRateEntries(heartRateEntries);
  const entry = entries.find((item) => item.date === dateKey);
  if (!entry || entry.restingHr == null) {
    return { value: null, delta: null, method: null };
  }
  const family = getRestingHrMethodFamily(entry.restingHrMethod);
  const series = getRestingHrSeries(entries, { family });
  return {
    value: entry.restingHr,
    delta: getPreviousEntryDelta(series, dateKey, 'restingHr'),
    method: entry.restingHrMethod,
  };
};

/** Normalized NEAT override for the chip row (null → no override that day). */
const buildNeatOverrideDisplay = (override) => {
  if (!override || typeof override !== 'object') {
    return null;
  }
  const multiplier = Number(override.multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return null;
  }
  return {
    multiplier: Math.round(multiplier * 100) / 100,
    presetKey:
      typeof override.presetKey === 'string' ? override.presetKey : null,
    label:
      typeof override.label === 'string' && override.label.trim() !== ''
        ? override.label
        : null,
  };
};

/** Session provenance: only the two canonical step-entry sources surface. */
const resolveStepProvenance = (stepEntries, dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized || !Array.isArray(stepEntries)) {
    return null;
  }
  const entry = stepEntries.find(
    (item) => normalizeDateKey(item?.date) === normalized
  );
  if (!entry) {
    return null;
  }
  const source =
    entry.source === 'healthConnect' || entry.source === 'manual'
      ? entry.source
      : null;
  return { source, steps: Math.max(0, Math.round(Number(entry?.steps) || 0)) };
};

/** "Moderate" / "Light" / "132 bpm" — mirrors HomeScreen's row copy. */
const buildSessionEffortDisplay = (session) => {
  const effortType = session?.effortType ?? 'intensity';
  if (effortType === 'heartRate') {
    const heartRate = Number(session?.averageHeartRate);
    // Same guard as HomeScreen's rows: a stored 0 / '' is "N/A", not "0 bpm"
    // (Number('') === 0 is finite, so a finite check alone printed "0 bpm").
    return Number.isFinite(heartRate) && heartRate > 0
      ? `${Math.round(heartRate)} bpm`
      : 'N/A bpm';
  }
  const intensity = String(session?.intensity ?? 'moderate');
  return intensity.charAt(0).toUpperCase() + intensity.slice(1);
};

const sortSessionRows = (rows) =>
  rows.filter(Boolean).sort((a, b) => {
    if (a.startTime && b.startTime) {
      return String(a.startTime).localeCompare(String(b.startTime));
    }
    return a.startTime ? -1 : b.startTime ? 1 : 0;
  });

/**
 * Read-only session rows for one tracked day. Calories resolve through the
 * same canonical formulas the HomeScreen rows and the breakdown use, so the
 * ledger can never disagree with the numbers computed elsewhere.
 */
const buildDaySessionRows = ({
  sessions,
  dateKey,
  kind,
  types,
  typeLabelFallback,
  resolveCalories,
  zoneModel = null,
}) =>
  sortSessionRows(
    (Array.isArray(sessions) ? sessions : []).map((session) => {
      if (normalizeDateKey(session?.date) !== dateKey) {
        return null;
      }
      const typeId = session?.type;
      const isHeartRate = (session?.effortType ?? 'intensity') === 'heartRate';
      const zone = isHeartRate
        ? getHeartRateZone(session?.averageHeartRate, zoneModel)
        : null;
      return {
        heartRateZone: zone ? { key: zone.key, index: zone.index } : null,
        heartRateSource: isHeartRate
          ? (session?.heartRateSource ?? null)
          : null,
        id: String(session?.id ?? `${typeId}:${session?.startTime ?? ''}`),
        kind,
        typeId,
        label: types?.[typeId]?.label ?? typeLabelFallback,
        hasType: Boolean(types?.[typeId]),
        durationMin: Math.max(0, Math.round(Number(session?.duration) || 0)),
        effortDisplay: buildSessionEffortDisplay(session),
        calories: Math.max(0, Math.round(resolveCalories(session))),
        startTime:
          typeof session?.startTime === 'string' ? session.startTime : null,
        // Cardio only: step-overlap affects how that day's steps are counted.
        stepOverlapEnabled:
          kind === 'cardio'
            ? Boolean(types?.[typeId]?.ambulatory) &&
              Boolean(session?.stepOverlapEnabled)
            : null,
      };
    })
  );

/**
 * Phase-membership context for one date (read-only). Scans the normalized
 * v2 logs for the day's log record; missing phases degrade to `null`.
 */
const buildPhaseContext = (phaseLogV2, dateKey) => {
  if (!phaseLogV2 || typeof phaseLogV2 !== 'object') {
    return null;
  }
  const logsById =
    phaseLogV2.logsById && typeof phaseLogV2.logsById === 'object'
      ? phaseLogV2.logsById
      : {};
  const log = Object.values(logsById).find((entry) => entry?.date === dateKey);
  if (!log) {
    return null;
  }
  const phase = phaseLogV2.phasesById?.[log?.phaseId];
  if (!phase) {
    return null;
  }
  const status = deriveDailyLogStatus(log);
  return {
    id: phase.id,
    name: phase?.name ?? 'Phase',
    goalType: phase?.goalType ?? null,
    status,
    complete: status === LOG_COMPLETION_STATUS.COMPLETE,
    partial: status === LOG_COMPLETION_STATUS.PARTIAL,
    empty: status === LOG_COMPLETION_STATUS.EMPTY,
    notes: typeof log?.notes === 'string' ? log.notes.trim() : '',
  };
};

/**
 * Full read-only display model for the DayLedger detail modal.
 *
 * Consumes canonical datasets only (snapshot cache + nutrition + sessions +
 * trackers + phase log v2). Never mutates anything; missing days and
 * malformed records degrade to `null` / dash, never zeros.
 *
 * @param {object} params
 * @param {object|null} params.snapshot – `dailySnapshots[dateKey]` record
 * @param {string} params.dateKey – `YYYY-MM-DD` the modal is presenting
 * @param {object} [params.nutritionData]
 * @param {object} [params.userData] – profile for session kcal formulas
 * @param {Array} [params.cardioSessions]
 * @param {Array} [params.trainingSessions]
 * @param {object} [params.cardioTypes] – resolved cardio metadata
 * @param {object} [params.trainingTypes] – resolved training metadata
 * @param {Array} [params.weightEntries]
 * @param {Array} [params.bodyFatEntries]
 * @param {Array} [params.stepEntries]
 * @param {object|null} [params.neatOverride] – that date's `dailyNeatOverrides` record
 * @param {object|null} [params.phaseLogV2]
 * @param {boolean} [params.bodyFatTrackingEnabled=true]
 * @returns {object|null} Display model, or `null` when the snapshot is
 *   missing/malformed or `dateKey` disagrees with the recorded date
 */
export const buildDayLedgerDetailModel = (params) => {
  const {
    snapshot,
    dateKey,
    nutritionData = {},
    userData = {},
    cardioSessions = [],
    trainingSessions = [],
    cardioTypes = {},
    trainingTypes = {},
    weightEntries = [],
    bodyFatEntries = [],
    stepEntries = [],
    neatOverride = null,
    phaseLogV2 = null,
    bodyFatTrackingEnabled = true,
    heartRateEntries = [],
  } = params ?? {};

  const preview = buildDaySnapshotPreview(snapshot);
  if (!preview) {
    return null;
  }
  const dayDate = preview.date;

  // The recorded date is canonical; a stale selection cannot re-target it.
  if (normalizeDateKey(dateKey) && normalizeDateKey(dateKey) !== dayDate) {
    return null;
  }

  const epoc = {
    total: num0(snapshot.epoc),
    training: num0(snapshot.epocTraining),
    cardio: num0(snapshot.epocCardio),
    fromToday: num0(snapshot.epocFromTodaySessions),
    carryIn: num0(snapshot.epocCarryInCalories),
  };

  // --- Sessions (read-only rows; canonical kcal formulas) ---
  // Pricing reads the HR profile as of the day (zones, VO2 max, observed max),
  // so it gets the same history arrays the breakdown sees.
  const pricingUserData = {
    ...userData,
    heartRateEntries,
    cardioSessions,
    trainingSessions,
  };
  const zoneModel = resolveHeartRateZones(
    resolveHeartRateProfile(pricingUserData, dayDate)
  );
  const sessions = [
    ...buildDaySessionRows({
      sessions: cardioSessions,
      dateKey: dayDate,
      kind: 'cardio',
      types: cardioTypes,
      typeLabelFallback: 'Unknown cardio type',
      resolveCalories: (session) =>
        calculateCardioCalories(session, pricingUserData, cardioTypes),
      zoneModel,
    }),
    ...buildDaySessionRows({
      sessions: trainingSessions,
      dateKey: dayDate,
      kind: 'training',
      types: trainingTypes,
      typeLabelFallback: 'Unknown training type',
      resolveCalories: (session) =>
        calculateTrainingSessionCalories(
          session,
          pricingUserData,
          trainingTypes
        ),
      zoneModel,
    }),
  ];
  const sessionsTotal = sessions.reduce((sum, row) => sum + row.calories, 0);
  // --- Nutrition (canonical `nutritionData`, per-meal ledger) ---
  const dayNutrition =
    nutritionData && typeof nutritionData === 'object'
      ? (nutritionData[dayDate] ?? {})
      : {};
  const mealRows = MEAL_TYPE_ORDER.filter((key) => {
    const entries = dayNutrition?.[key];
    return Array.isArray(entries) && entries.length > 0;
  }).map((key) => {
    const entries = dayNutrition[key];
    const { totals } = sumNutritionEntries(entries);
    return {
      key,
      label: MEAL_TYPES[key]?.label ?? key,
      icon: MEAL_TYPES[key]?.icon ?? null,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fats: Math.round(totals.fats),
      entryCount: entries.length,
      foods: entries
        .map((entry) => ({
          name: String(entry?.name ?? ''),
          grams: Number.isFinite(Number(entry?.grams))
            ? Math.round(Number(entry.grams))
            : null,
          calories: Number.isFinite(Number(entry?.calories))
            ? Math.round(Number(entry.calories))
            : null,
        }))
        .filter((food) => food.name !== ''),
    };
  });
  const dayTotals = sumNutritionEntries(
    MEAL_TYPE_ORDER.flatMap((key) =>
      Array.isArray(dayNutrition?.[key]) ? dayNutrition[key] : []
    )
  );
  const nutrition = {
    hasEntries: mealRows.length > 0,
    totals: {
      calories: Math.round(dayTotals.totals.calories),
      protein: Math.round(dayTotals.totals.protein),
      carbs: Math.round(dayTotals.totals.carbs),
      fats: Math.round(dayTotals.totals.fats),
    },
    micros: {
      fiber:
        dayTotals.totals.fiber != null
          ? Math.round(dayTotals.totals.fiber)
          : null,
      sodium:
        dayTotals.totals.sodium != null
          ? Math.round(dayTotals.totals.sodium)
          : null,
      saturatedFats:
        dayTotals.totals.saturatedFats != null
          ? Math.round(dayTotals.totals.saturatedFats)
          : null,
      sugars:
        dayTotals.totals.sugars != null
          ? Math.round(dayTotals.totals.sugars)
          : null,
    },
    microCoverage: Object.fromEntries(
      MICRO_KEYS.map((key) => [key, Boolean(dayTotals.coverage[key])])
    ),
    meals: mealRows,
  };

  const dayShape = {
    tefMode: preview.tefMode,
    atMode: preview.adaptiveThermogenesisMode,
    // Signed: a negative (cut-side) correction must not be clamped away.
    atCorrection: Math.round(
      toNumber(snapshot.adaptiveThermogenesisCorrection) ?? 0
    ),
  };
  return {
    date: dayDate,
    preview,
    bmr: num0(snapshot.bmr),
    baselineTdee: toNumber(snapshot.baselineTdee),
    tef: num0(snapshot.tef),
    epoc,
    sessions,
    sessionsTotal,
    nutrition,
    measurements: {
      weight: buildMeasurementWithDelta(
        weightEntries,
        dayDate,
        'weight',
        createUnitFormatter(userData?.unitPreferences).bodyWeight.mathPrecision
      ),
      bodyFat:
        bodyFatTrackingEnabled === false
          ? { value: null, delta: null }
          : buildMeasurementWithDelta(bodyFatEntries, dayDate, 'bodyFat'),
      restingHr: buildRestingHrMeasurement(heartRateEntries, dayDate),
    },
    stepProvenance: resolveStepProvenance(stepEntries, dayDate),
    neatOverride: buildNeatOverrideDisplay(neatOverride),
    phaseContext: buildPhaseContext(phaseLogV2, dayDate),
    dayShape,
  };
};
