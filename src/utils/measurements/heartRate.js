/**
 * Daily heart-rate entries (`userData.heartRateEntries`, Dexie history,
 * sharded `heartRateEntries:YYYY-MM-DD`).
 *
 * Entry shape (one per date):
 *   { date, restingHr, restingHrMethod, avgHr, minHr, maxHr, wakingAvgHr, vo2Max, updatedAt }
 * - `restingHr` + `restingHrMethod` ('device' | 'manual' | 'estimated')
 * - `avgHr` / `minHr` / `maxHr`: the wearable's daily aggregates (synced only)
 * - `wakingAvgHr`: mean hourly HR 08:00-22:00 outside logged sessions (synced
 *   only; feeds the advisory NEAT suggestion)
 * - `vo2Max`: a VO2 max reading dated that day (synced only)
 * Every value is nullable; `null` = unknown (never zero-filled). An entry with
 * no known value at all is dropped.
 *
 * Kept as a date-sorted array (like weight/body-fat entries) so the generic
 * measurement helpers in ./weight.js work with `valueField: 'restingHr'`.
 */
import { normalizeDateKey } from './weight.js';
import {
  MEASURED_RESTING_HR_METHODS,
  RESTING_HR_METHODS,
  normalizeDailyHeartRate,
  normalizeRestingHeartRate,
  normalizeVo2Max,
} from '../../constants/health/heartRate.js';

const VALUE_FIELDS = [
  'restingHr',
  'avgHr',
  'minHr',
  'maxHr',
  'wakingAvgHr',
  'vo2Max',
];

/**
 * @returns {object|null} The normalized entry, or `null` when the date is
 *   invalid or no value survives validation.
 */
export const normalizeHeartRateEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const date = normalizeDateKey(entry.date);
  if (!date) {
    return null;
  }

  const restingHr = normalizeRestingHeartRate(entry.restingHr);
  const restingHrMethod =
    restingHr == null
      ? null
      : RESTING_HR_METHODS.includes(entry.restingHrMethod)
        ? entry.restingHrMethod
        : 'device';
  const avgHr = normalizeDailyHeartRate(entry.avgHr);
  const minHr = normalizeDailyHeartRate(entry.minHr);
  const maxHr = normalizeDailyHeartRate(entry.maxHr);
  const wakingAvgHr = normalizeDailyHeartRate(entry.wakingAvgHr);
  const vo2Max = normalizeVo2Max(entry.vo2Max);

  if (
    restingHr == null &&
    avgHr == null &&
    minHr == null &&
    maxHr == null &&
    wakingAvgHr == null &&
    vo2Max == null
  ) {
    return null;
  }

  const updatedAt = Number(entry.updatedAt);

  return {
    date,
    restingHr,
    restingHrMethod,
    avgHr,
    minHr,
    maxHr,
    wakingAvgHr,
    vo2Max,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
  };
};

/**
 * Normalizes, de-duplicates (last entry for a date wins) and sorts ascending.
 * Returns a NEW array; the input is never mutated.
 */
export const sortHeartRateEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const byDate = new Map();
  entries.forEach((entry) => {
    const normalized = normalizeHeartRateEntry(entry);
    if (normalized) {
      byDate.set(normalized.date, normalized);
    }
  });

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
};

export const getHeartRateEntryForDate = (entries, dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized || !Array.isArray(entries)) {
    return null;
  }
  return entries.find((entry) => entry?.date === normalized) ?? null;
};

/** 'measured' (device + manual) vs 'estimated' — the two never share a trend. */
export const getRestingHrMethodFamily = (method) =>
  MEASURED_RESTING_HR_METHODS.includes(method)
    ? 'measured'
    : method === 'estimated'
      ? 'estimated'
      : null;

/**
 * Resting-HR readings as `{ date, restingHr, restingHrMethod }`, filtered to
 * entries that actually carry a resting value (and optionally to one method
 * family). Use THIS before handing entries to the generic weight.js helpers:
 * `getPreviousEntryDelta` compares with the immediately previous array entry,
 * so a day holding only `avgHr` would otherwise break the comparison chain.
 *
 * @param {Array} entries - Sorted heart-rate entries
 * @param {{ family?: 'measured' | 'estimated' }} [options]
 */
export const getRestingHrSeries = (entries, options = {}) => {
  if (!Array.isArray(entries)) {
    return [];
  }
  const { family } = options;
  return entries
    .filter((entry) => Number.isFinite(entry?.restingHr))
    .filter(
      (entry) =>
        !family || getRestingHrMethodFamily(entry.restingHrMethod) === family
    )
    .map((entry) => ({
      date: entry.date,
      restingHr: entry.restingHr,
      restingHrMethod: entry.restingHrMethod,
    }));
};

/**
 * Picks the single method family to trend over a window: measured readings
 * win when there are at least `minMeasured` of them inside the window,
 * otherwise estimated readings are used. Never mixes the two.
 *
 * @returns {'measured' | 'estimated' | null}
 */
export const resolveRestingHrTrendFamily = (
  entries,
  { startDateKey, endDateKey, minMeasured = 3 } = {}
) => {
  const inWindow = getRestingHrSeries(entries).filter(
    (entry) =>
      (!startDateKey || entry.date >= startDateKey) &&
      (!endDateKey || entry.date <= endDateKey)
  );
  if (!inWindow.length) {
    return null;
  }
  const measuredCount = inWindow.filter(
    (entry) => getRestingHrMethodFamily(entry.restingHrMethod) === 'measured'
  ).length;
  if (measuredCount >= minMeasured) {
    return 'measured';
  }
  const estimatedCount = inWindow.length - measuredCount;
  if (estimatedCount > measuredCount) {
    return 'estimated';
  }
  return measuredCount > 0 ? 'measured' : 'estimated';
};

const isSameEntryValues = (a, b) =>
  VALUE_FIELDS.every(
    (field) => (a?.[field] ?? null) === (b?.[field] ?? null)
  ) && (a?.restingHrMethod ?? null) === (b?.restingHrMethod ?? null);

/**
 * Field-level merge of a SYNCED reading into an existing entry.
 * - A synced value only fills/replaces a field when it is known (`null` from a
 *   sync means "the device said nothing", not "erase").
 * - A manual resting HR is never overwritten by a synced one; deleting the
 *   manual value lets the next sync fill it again.
 *
 * @returns {object|null} The merged entry (same reference as `existing` when
 *   nothing changed), or `null` when neither side holds a value.
 */
export const mergeSyncedHeartRateEntry = (
  existing,
  incoming,
  now = Date.now()
) => {
  const normalizedIncoming = normalizeHeartRateEntry(incoming);
  const normalizedExisting = existing
    ? normalizeHeartRateEntry(existing)
    : null;
  if (!normalizedIncoming) {
    return normalizedExisting ? existing : null;
  }

  const base = normalizedExisting ?? {
    date: normalizedIncoming.date,
    restingHr: null,
    restingHrMethod: null,
    avgHr: null,
    minHr: null,
    maxHr: null,
    wakingAvgHr: null,
    vo2Max: null,
    updatedAt: null,
  };

  const next = { ...base };
  const keepManualResting = base.restingHrMethod === 'manual';
  if (!keepManualResting && normalizedIncoming.restingHr != null) {
    next.restingHr = normalizedIncoming.restingHr;
    next.restingHrMethod = normalizedIncoming.restingHrMethod;
  }
  ['avgHr', 'minHr', 'maxHr', 'wakingAvgHr', 'vo2Max'].forEach((field) => {
    if (normalizedIncoming[field] != null) {
      next[field] = normalizedIncoming[field];
    }
  });

  if (normalizedExisting && isSameEntryValues(normalizedExisting, next)) {
    return existing;
  }

  next.updatedAt = now;
  return next;
};

/**
 * Sets (or clears, with `null`) the manual resting HR for an entry.
 * Clearing a manual value leaves the synced aggregates intact; an entry left
 * with no value at all collapses to `null` (the caller removes it).
 */
export const applyManualRestingHeartRate = (
  existing,
  dateKey,
  bpm,
  now = Date.now()
) => {
  const date = normalizeDateKey(dateKey);
  if (!date) {
    return existing ?? null;
  }
  const base = (existing && normalizeHeartRateEntry(existing)) ?? {
    date,
    restingHr: null,
    restingHrMethod: null,
    avgHr: null,
    minHr: null,
    maxHr: null,
    wakingAvgHr: null,
    vo2Max: null,
    updatedAt: null,
  };

  if (bpm == null) {
    if (base.restingHrMethod !== 'manual') {
      return existing ?? null;
    }
    return normalizeHeartRateEntry({
      ...base,
      restingHr: null,
      restingHrMethod: null,
      updatedAt: now,
    });
  }

  const restingHr = normalizeRestingHeartRate(bpm);
  if (restingHr == null) {
    return existing ?? null;
  }
  return {
    ...base,
    date,
    restingHr,
    restingHrMethod: 'manual',
    updatedAt: now,
  };
};
