import {
  getDailyBalanceKind,
  ESTIMATED_ENERGY_PER_KG,
} from './rollingEnergyBalance.js';
import { normalizeDateKey } from '../measurements/weight.js';
import { formatDateKeyUtc, getTodayDateKey } from '../data/dateKeys.js';

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

/** Signed whole-kcal formatter ("+350", "-120", "0", "—" for invalid). */
export const formatSignedKcal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '\u2014';
  }
  const rounded = Math.round(numeric);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()}`;
};

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
  const averageEntriesInMonth = (entries, field) => {
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
    return { avg: Math.round((total / count) * 10) / 10, count };
  };

  const weightStats = averageEntriesInMonth(options?.weightEntries, 'weight');
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
