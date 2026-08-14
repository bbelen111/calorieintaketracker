import { normalizeDateKey } from '../measurements/weight.js';
import { getTodayDateKey } from '../data/dateKeys.js';

/**
 * Rolling Energy Balance.
 *
 * Consumes already-computed daily snapshot values (`tdee`, `intake`) and rolls
 * them up over a configurable calendar-day window. It NEVER rebuilds TDEE from
 * BMR/steps/training/TEF/EPOC — the snapshot's `tdee` is authoritative.
 *
 * Sign convention (matches the app's snapshot `deficit` field):
 *   balance   = tdee - intake
 *   positive  = deficit   (burned more than eaten)
 *   negative  = surplus   (ate more than burned)
 *
 * A missing snapshot is simply an unavailable day — never treated as zero
 * intake, zero deficit, or maintenance.
 */

export const ROLLING_BALANCE_WINDOWS = [3, 7, 14, 28];
export const DEFAULT_ROLLING_BALANCE_WINDOW_DAYS = 7;
/** A day whose |balance| is within this many kcal counts as "near zero". */
export const MAINTENANCE_EPSILON = 50;
/**
 * Rough energy-equivalent conversion used ONLY for a clearly-labelled estimate.
 * This is not a physiological prediction — body-weight change never follows
 * this conversion exactly.
 */
export const ESTIMATED_ENERGY_PER_KG = 7700;

/**
 * Resolve a window size to one of the supported values.
 * Invalid / missing values fall back to the 7-day primary window.
 * @param {number|string|undefined} windowDays
 * @returns {number}
 */
export const resolveWindowDays = (windowDays) => {
  const numeric = Number(windowDays);
  return ROLLING_BALANCE_WINDOWS.includes(numeric)
    ? numeric
    : DEFAULT_ROLLING_BALANCE_WINDOW_DAYS;
};

/**
 * Validate a single daily snapshot and extract its energy balance.
 *
 * @param {object|undefined} snapshot
 * @returns {{ date, tdee, intake, balance } | null}
 *   Returns null for any snapshot that cannot produce a trustworthy balance
 *   (missing/invalid date, missing/non-finite tdee or intake). Malformed
 *   records are excluded rather than producing nonsense.
 */
export const parseDailyEnergyBalance = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const date = normalizeDateKey(snapshot.date);
  if (!date) {
    return null;
  }

  const tdee = Number(snapshot.tdee);
  const intake = Number(snapshot.intake);

  if (!Number.isFinite(tdee) || !Number.isFinite(intake)) {
    return null;
  }

  return {
    date,
    tdee,
    intake,
    balance: tdee - intake,
  };
};

/**
 * Select the contributing days for a rolling window.
 *
 * - Accepts `dailySnapshots` as either a date-keyed object map or an array.
 * - Deduplicates by calendar date (last encountered wins).
 * - Excludes future dates (strictly after `asOfDate`).
 * - Sorts ascending and keeps the most recent `windowDays` valid days.
 *
 * @param {object} params
 * @param {object|Array} params.snapshots  – `userData.dailySnapshots`
 * @param {number} params.windowDays        – requested window size
 * @param {string} [params.asOfDate]        – `YYYY-MM-DD` reference date (local)
 * @returns {Array<{date, tdee, intake, balance}>}
 */
export const selectRollingBalanceDays = ({
  snapshots,
  windowDays,
  asOfDate,
}) => {
  const windowDaysResolved = resolveWindowDays(windowDays);
  const asOf = normalizeDateKey(asOfDate) || getTodayDateKey();
  if (!snapshots || typeof snapshots !== 'object') {
    return [];
  }

  const entries = Array.isArray(snapshots)
    ? snapshots
    : Object.values(snapshots);

  const byDate = new Map();
  for (const snapshot of entries) {
    const parsed = parseDailyEnergyBalance(snapshot);
    if (parsed && parsed.date <= asOf) {
      // Last encountered wins for duplicate dates.
      byDate.set(parsed.date, parsed);
    }
  }

  const days = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  return days.slice(-windowDaysResolved);
};

/**
 * Classify a single day's balance for colouring / labelling.
 * @param {number|string|undefined} balance
 * @returns {'deficit'|'surplus'|'maintenance'}
 */
export const getDailyBalanceKind = (balance) => {
  const numeric = Number(balance);
  if (!Number.isFinite(numeric)) {
    return 'maintenance';
  }
  if (Math.abs(numeric) <= MAINTENANCE_EPSILON) {
    return 'maintenance';
  }
  return numeric > 0 ? 'deficit' : 'surplus';
};

/**
 * Compute rolling energy-balance analytics over the most recent valid days.
 *
 * @param {object} params
 * @param {object|Array} params.snapshots            – `userData.dailySnapshots`
 * @param {number} [params.windowDays]               – requested window size (default 7)
 * @param {string} [params.asOfDate]                 – `YYYY-MM-DD` reference date (local)
 * @param {number} [params.goalDailyBalanceTarget]   – target daily deficit/surplus in
 *                                                     balance convention (positive = deficit),
 *                                                     e.g. +300 for a cut. Pass 0/undefined to
 *                                                     disable the expected/actual breakdown.
 * @returns {{
 *   windowDays: number,
 *   trackedDays: number,
 *   rollingBalance: number,
 *   averageDailyBalance: number|null,
 *   expectedBalance: number|null,
 *   balanceVariance: number|null,
 *   estimatedWeightChangeKg: number|null,
 *   hasData: boolean,
 *   insufficientData: boolean,
 *   days: Array<{date, tdee, intake, balance}>,
 * }}
 */
export const calculateRollingEnergyBalance = ({
  snapshots,
  windowDays,
  asOfDate,
  goalDailyBalanceTarget,
}) => {
  const windowDaysResolved = resolveWindowDays(windowDays);
  const days = selectRollingBalanceDays({
    snapshots,
    windowDays: windowDaysResolved,
    asOfDate,
  });

  const trackedDays = days.length;
  const hasData = trackedDays > 0;

  const rollingBalance = days.reduce((sum, day) => sum + day.balance, 0);
  const averageDailyBalance = hasData ? rollingBalance / trackedDays : null;

  const goalTarget = Number(goalDailyBalanceTarget);
  const hasGoalTarget = Number.isFinite(goalTarget);

  let expectedBalance = null;
  let balanceVariance = null;
  if (hasData && hasGoalTarget) {
    expectedBalance = goalTarget * trackedDays;
    balanceVariance = rollingBalance - expectedBalance;
  }

  const estimatedWeightChangeKg = hasData
    ? rollingBalance / ESTIMATED_ENERGY_PER_KG
    : null;

  const insufficientData = hasData && trackedDays < windowDaysResolved;

  return {
    windowDays: windowDaysResolved,
    trackedDays,
    rollingBalance,
    averageDailyBalance,
    expectedBalance,
    balanceVariance,
    estimatedWeightChangeKg,
    hasData,
    insufficientData,
    days,
  };
};
