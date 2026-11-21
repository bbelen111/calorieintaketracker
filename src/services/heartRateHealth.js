/**
 * Heart-rate reads from the platform health store (`@capgo/capacitor-health`):
 * Health Connect on Android, HealthKit on iOS (read-only on both).
 *
 * Read rules (see AGENTS.md "Heart Rate"):
 * - Daily data is read ONE local day per call (`buildLocalDayReadWindow`), so
 *   a DST day is never split across two buckets.
 * - Daily avg/min/max come from `queryAggregated` (the platform dedupes
 *   sources), never from summing raw samples.
 * - Resting HR prefers the device's own record; when a device writes none, the
 *   day's resting HR is ESTIMATED (lowest hourly average) and tagged so it is
 *   never trended together with measured readings.
 * - Session HR reads raw samples with `limit: 0` (a session window is bounded)
 *   and summarizes ONE source, time-weighted.
 * - Every read degrades to `null` instead of throwing into the UI.
 */
import { Health } from '@capgo/capacitor-health';
import {
  buildLocalDayReadWindow,
  toLocalDateKey,
} from '../utils/healthConnectWindow.js';
import {
  computeTimeWeightedHeartRate,
  computeWakingHeartRate,
  estimateRestingHrFromHourly,
  selectPrimaryHeartRateSource,
} from '../utils/calculations/heartRate.js';
import {
  normalizeDailyHeartRate,
  normalizeRestingHeartRate,
  normalizeVo2Max,
} from '../constants/health/heartRate.js';

/** Health read types the heart-rate features ask for (read-only). */
export const HEART_RATE_READ_TYPES = Object.freeze([
  'heartRate',
  'restingHeartRate',
  'vo2Max',
  'workouts',
]);

const warn = (message, error) =>
  console.warn(`[HeartRate] ${message}:`, error?.message ?? error);

const toSamples = (result) =>
  Array.isArray(result?.samples) ? result.samples : [];

const readAggregated = async (options) => {
  try {
    return toSamples(await Health.queryAggregated(options));
  } catch (error) {
    warn(`Aggregated ${options.dataType} read failed`, error);
    return null;
  }
};

const readSamples = async (options) => {
  try {
    return toSamples(await Health.readSamples(options));
  } catch (error) {
    warn(`${options.dataType} sample read failed`, error);
    return null;
  }
};

const bucketValue = (bucket, key) =>
  Number(bucket?.values?.[key] ?? (key === 'average' ? bucket?.value : NaN));

/**
 * One local day's heart-rate summary.
 *
 * @param {string} dateKey - `YYYY-MM-DD`
 * @param {{ canReadResting?: boolean, now?: Date, sessionIntervals?: Array<{ startMs, endMs }> }} [options]
 *   `sessionIntervals`: the day's logged sessions, left out of the waking HR
 * @returns {Promise<null | { date, avgHr, minHr, maxHr, wakingAvgHr, restingHr, restingHrMethod }>}
 *   `null` when the day has not started or every read failed.
 */
export const readDailyHeartRate = async (dateKey, options = {}) => {
  const { canReadResting = true, now = new Date() } = options;
  const window = buildLocalDayReadWindow(dateKey, now);
  if (!window) {
    return null;
  }

  const dayBuckets = await readAggregated({
    dataType: 'heartRate',
    ...window,
    bucket: 'day',
    aggregation: ['average', 'min', 'max'],
  });

  let avgHr = null;
  let minHr = null;
  let maxHr = null;
  if (dayBuckets?.length) {
    // One local-day window normally yields one bucket; if a platform splits
    // it, combine: extremes across buckets, mean of the bucket averages.
    const averages = dayBuckets
      .map((bucket) => bucketValue(bucket, 'average'))
      .filter(Number.isFinite);
    const mins = dayBuckets
      .map((bucket) => bucketValue(bucket, 'min'))
      .filter(Number.isFinite);
    const maxes = dayBuckets
      .map((bucket) => bucketValue(bucket, 'max'))
      .filter(Number.isFinite);
    avgHr = averages.length
      ? normalizeDailyHeartRate(
          averages.reduce((sum, value) => sum + value, 0) / averages.length
        )
      : null;
    minHr = mins.length ? normalizeDailyHeartRate(Math.min(...mins)) : null;
    maxHr = maxes.length ? normalizeDailyHeartRate(Math.max(...maxes)) : null;
  }

  let restingHr = null;
  let restingHrMethod = null;
  if (canReadResting) {
    const restingSamples = await readSamples({
      dataType: 'restingHeartRate',
      ...window,
      limit: 0,
    });
    const latest = (restingSamples ?? [])
      .filter((sample) => normalizeRestingHeartRate(sample?.value) != null)
      .sort((a, b) =>
        String(a?.endDate ?? a?.startDate).localeCompare(
          String(b?.endDate ?? b?.startDate)
        )
      )
      .pop();
    if (latest) {
      restingHr = normalizeRestingHeartRate(latest.value);
      restingHrMethod = 'device';
    }
  }

  // Hourly averages feed the waking-hours HR (advisory NEAT suggestion) and,
  // when the device wrote no resting record, the estimated resting HR.
  let wakingAvgHr = null;
  if (dayBuckets?.length) {
    const hourly = await readAggregated({
      dataType: 'heartRate',
      ...window,
      bucket: 'hour',
      aggregation: 'average',
    });
    wakingAvgHr = normalizeDailyHeartRate(
      computeWakingHeartRate(hourly ?? [], {
        excludeIntervals: options.sessionIntervals ?? [],
      })
    );
    if (restingHr == null) {
      const estimate = normalizeRestingHeartRate(
        estimateRestingHrFromHourly(hourly ?? [])
      );
      if (estimate != null) {
        restingHr = estimate;
        restingHrMethod = 'estimated';
      }
    }
  }

  if (dayBuckets == null && restingHr == null) {
    return null;
  }

  return {
    date: dateKey,
    avgHr,
    minHr,
    maxHr,
    wakingAvgHr,
    restingHr,
    restingHrMethod,
  };
};

/**
 * VO2 max readings (newest first) between two instants, one per local day.
 * @returns {Promise<Array<{ date: string, vo2Max: number }>>}
 */
export const readVo2MaxReadings = async ({ startDate, endDate }) => {
  const samples = await readSamples({
    dataType: 'vo2Max',
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    limit: 60,
    ascending: false,
  });
  const byDate = new Map();
  (samples ?? []).forEach((sample) => {
    const date = toLocalDateKey(sample?.startDate ?? sample?.endDate);
    const vo2Max = normalizeVo2Max(sample?.value);
    if (date && vo2Max != null && !byDate.has(date)) {
      byDate.set(date, vo2Max);
    }
  });
  return Array.from(byDate, ([date, vo2Max]) => ({ date, vo2Max }));
};

/**
 * HR summary for a session window from raw wearable samples (one source,
 * time-weighted; see computeTimeWeightedHeartRate).
 *
 * @param {{ start, end, preferredSourceId?, zoneModel? }} params - start/end as ms/Date/ISO
 * @returns {Promise<null | { summary, source: { sourceId, sourceName, deviceType } }>}
 */
export const readSessionHeartRate = async ({
  start,
  end,
  preferredSourceId,
  zoneModel,
}) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return null;
  }

  const samples = await readSamples({
    dataType: 'heartRate',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    limit: 0,
    ascending: true,
  });
  const primary = selectPrimaryHeartRateSource(
    samples ?? [],
    preferredSourceId
  );
  if (!primary) {
    return null;
  }
  const summary = computeTimeWeightedHeartRate(primary.samples, {
    start: startDate.getTime(),
    end: endDate.getTime(),
    zoneModel,
  });
  if (!summary) {
    return null;
  }
  return {
    summary,
    source: {
      sourceId: primary.sourceId,
      sourceName: primary.sourceName,
      deviceType: primary.deviceType,
    },
  };
};

/**
 * Workouts recorded on a local day, oldest first.
 * @returns {Promise<Array<{ id, workoutType, startMs, endMs, durationMinutes, totalEnergyBurned, sourceName, sourceId }> | null>}
 */
export const readWorkoutsForDate = async (dateKey, now = new Date()) => {
  const window = buildLocalDayReadWindow(dateKey, now);
  if (!window) {
    return [];
  }
  try {
    const result = await Health.queryWorkouts({
      ...window,
      limit: 50,
      ascending: true,
    });
    const workouts = Array.isArray(result?.workouts) ? result.workouts : [];
    return workouts
      .map((workout) => {
        const startMs = Date.parse(workout?.startDate);
        const endMs = Date.parse(workout?.endDate);
        if (
          !Number.isFinite(startMs) ||
          !Number.isFinite(endMs) ||
          endMs <= startMs
        ) {
          return null;
        }
        const durationSeconds = Number(workout?.duration);
        const durationMinutes = Math.round(
          (Number.isFinite(durationSeconds) && durationSeconds > 0
            ? durationSeconds
            : (endMs - startMs) / 1000) / 60
        );
        const energy = Number(workout?.totalEnergyBurned);
        return {
          id: String(
            workout?.platformId ??
              `${workout?.sourceId ?? 'workout'}:${startMs}`
          ),
          workoutType: String(workout?.workoutType ?? 'other'),
          startMs,
          endMs,
          durationMinutes,
          totalEnergyBurned:
            Number.isFinite(energy) && energy > 0 ? Math.round(energy) : null,
          sourceName: workout?.sourceName ?? null,
          sourceId: workout?.sourceId ?? null,
        };
      })
      .filter(Boolean);
  } catch (error) {
    warn('Workout read failed', error);
    return null;
  }
};
