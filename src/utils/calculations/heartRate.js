/**
 * Heart-rate engine (pure; Node-tested in tests/utils/heartRate.test.js).
 *
 * Owns every HR derivation the calorie system consumes:
 * - the user's HR profile AS OF a date (max HR, resting baseline, reserve,
 *   VO2 max, whether personal zones exist),
 * - HR -> light/moderate/vigorous intensity (EPOC + HR-priced training),
 * - the five-zone model,
 * - session HR summaries from raw wearable samples (time-weighted),
 * - wearable-source selection, resting-HR estimation, resting-HR trend,
 * - the BLE Heart Rate Measurement (0x2A37) parser.
 *
 * Contract: a user with no HR data gets EXACTLY the legacy behaviour (the
 * `220 - age` / 0.70 / 0.85 EPOC rule). Personal zones only switch on once a
 * resting baseline exists, and every profile is resolved for a specific date
 * so recomputing a past day never uses data from after it.
 */
import { calculateTrapezoidalWindowAverage } from '../measurements/weight.js';
import {
  getRestingHrMethodFamily,
  getRestingHrSeries,
  resolveRestingHrTrendFamily,
  sortHeartRateEntries,
} from '../measurements/heartRate.js';
import { getTodayDateKey, getWindowDateKeys } from '../data/dateKeys.js';
import {
  DAILY_HEART_RATE_MAX_BPM,
  DAILY_HEART_RATE_MIN_BPM,
  HEART_RATE_ZONES,
  MAX_HEART_RATE_MAX_BPM,
  MAX_HEART_RATE_MIN_BPM,
  normalizeMaxHeartRate,
  normalizeSessionHeartRate,
  normalizeVo2Max,
} from '../../constants/health/heartRate.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Resting baseline window (trapezoidal average), in days. */
export const RESTING_BASELINE_WINDOW_DAYS = 7;
/** Personal zones need this many resting readings in the lookback window. */
export const PERSONAL_ZONES_MIN_READINGS = 3;
export const PERSONAL_ZONES_LOOKBACK_DAYS = 14;
/** Reserve below this is implausible (bad max or bad resting) -> no zones. */
export const MIN_HEART_RATE_RESERVE_BPM = 40;
/** Observed max needs this many sessions carrying a recorded max. */
export const OBSERVED_MAX_MIN_SESSIONS = 3;
export const OBSERVED_MAX_LOOKBACK_DAYS = 365;
/** A recorded max above Tanaka + this is treated as an optical spike. */
export const OBSERVED_MAX_SPIKE_MARGIN_BPM = 20;
/** A VO2 max reading counts for this many days after it was taken. */
export const VO2_MAX_VALIDITY_DAYS = 180;

/** ACSM %HRR cutpoints (moderate 40-59 %, vigorous >= 60 %). */
export const HRR_MODERATE_THRESHOLD = 0.4;
export const HRR_VIGOROUS_THRESHOLD = 0.6;
/** Legacy %HRmax cutpoints, kept verbatim for users without personal zones. */
export const LEGACY_MODERATE_THRESHOLD = 0.7;
export const LEGACY_VIGOROUS_THRESHOLD = 0.85;

/** Session-sample gaps longer than this are excluded, never interpolated. */
export const MAX_SAMPLE_GAP_SECONDS = 120;
/** Hourly buckets needed before a day's resting HR may be estimated. */
export const RESTING_ESTIMATE_MIN_HOURLY_BUCKETS = 6;
/** Resting-HR trend window + minimum single-family readings. */
export const RESTING_TREND_WINDOW_DAYS = 28;
export const RESTING_TREND_MIN_READINGS = 7;

const normalizeDate = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return DATE_KEY_REGEX.test(trimmed) ? trimmed : null;
};

const shiftDateKey = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Tanaka et al. 2001: 208 - 0.7 x age. More accurate than 220 - age for
 * adults; the legacy formula survives only inside the legacy intensity rule.
 */
export const predictMaxHeartRate = (age) => {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge) || numericAge <= 0) {
    return null;
  }
  return Math.round(208 - 0.7 * numericAge);
};

// ---------------------------------------------------------------------------
// Profile (memoized per data references + date)
// ---------------------------------------------------------------------------

const EMPTY_LIST = [];
const sortedEntriesCache = new WeakMap();
const sessionMaxCache = new WeakMap();
const profileCache = new WeakMap();

const getSortedEntries = (entries) => {
  const ref = Array.isArray(entries) ? entries : EMPTY_LIST;
  let sorted = sortedEntriesCache.get(ref);
  if (!sorted) {
    sorted = sortHeartRateEntries(ref);
    sortedEntriesCache.set(ref, sorted);
  }
  return sorted;
};

/** `[{ date, maxHeartRate }]` from one sessions array (cached per reference). */
const getSessionMaxReadings = (sessions) => {
  const ref = Array.isArray(sessions) ? sessions : EMPTY_LIST;
  let readings = sessionMaxCache.get(ref);
  if (!readings) {
    readings = ref
      .map((session) => ({
        date: normalizeDate(session?.date),
        maxHeartRate: normalizeMaxHeartRate(session?.maxHeartRate),
      }))
      .filter((reading) => reading.date && reading.maxHeartRate != null);
    sessionMaxCache.set(ref, readings);
  }
  return readings;
};

const getNestedCache = (cache, key) => {
  let next = cache.get(key);
  if (!next) {
    next = new WeakMap();
    cache.set(key, next);
  }
  return next;
};

const resolveObservedMaxHeartRate = ({
  cardioSessions,
  trainingSessions,
  dateKey,
  predictedMaxHr,
}) => {
  const startKey = shiftDateKey(dateKey, -(OBSERVED_MAX_LOOKBACK_DAYS - 1));
  const ceiling =
    predictedMaxHr != null
      ? predictedMaxHr + OBSERVED_MAX_SPIKE_MARGIN_BPM
      : MAX_HEART_RATE_MAX_BPM;
  const plausible = [
    ...getSessionMaxReadings(cardioSessions),
    ...getSessionMaxReadings(trainingSessions),
  ].filter(
    (reading) =>
      reading.date >= startKey &&
      reading.date <= dateKey &&
      reading.maxHeartRate <= ceiling
  );
  if (plausible.length < OBSERVED_MAX_MIN_SESSIONS) {
    return null;
  }
  return Math.max(...plausible.map((reading) => reading.maxHeartRate));
};

const resolveDeviceVo2Max = (entries, dateKey) => {
  const startKey = shiftDateKey(dateKey, -(VO2_MAX_VALIDITY_DAYS - 1));
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.date > dateKey) {
      continue;
    }
    if (entry.date < startKey) {
      break;
    }
    if (entry.vo2Max != null) {
      return { value: entry.vo2Max, date: entry.date };
    }
  }
  return null;
};

const computeHeartRateProfile = (userData, dateKey) => {
  const age = Number(userData?.age);
  const predictedMaxHr = predictMaxHeartRate(age);
  const customMaxHr = normalizeMaxHeartRate(userData?.maxHeartRateCustom);
  const observedMaxHr =
    customMaxHr == null
      ? resolveObservedMaxHeartRate({
          cardioSessions: userData?.cardioSessions,
          trainingSessions: userData?.trainingSessions,
          dateKey,
          predictedMaxHr,
        })
      : null;

  // Observed max may only RAISE the estimate: people rarely hit their true
  // max, so a lower observed peak would overstate every %HRR.
  let maxHr = null;
  let maxHrSource = null;
  if (customMaxHr != null) {
    maxHr = customMaxHr;
    maxHrSource = 'custom';
  } else if (
    observedMaxHr != null &&
    (predictedMaxHr == null || observedMaxHr > predictedMaxHr)
  ) {
    maxHr = observedMaxHr;
    maxHrSource = 'observed';
  } else if (predictedMaxHr != null) {
    maxHr = predictedMaxHr;
    maxHrSource = 'predicted';
  }

  // Legacy rule input: exactly what EPOC used before (220 - age), unless the
  // user deliberately set a custom max.
  const legacyMaxHr =
    customMaxHr ??
    (Number.isFinite(age) && age > 0 && 220 - age > 0 ? 220 - age : null);

  const entries = getSortedEntries(userData?.heartRateEntries);
  const lookbackKeys = getWindowDateKeys(dateKey, PERSONAL_ZONES_LOOKBACK_DAYS);
  const lookbackStart = lookbackKeys[0] ?? dateKey;
  const family = resolveRestingHrTrendFamily(entries, {
    startDateKey: lookbackStart,
    endDateKey: dateKey,
  });

  let restingHr = null;
  let restingReadings = 0;
  if (family) {
    const series = getRestingHrSeries(entries, { family });
    restingReadings = series.filter(
      (entry) => entry.date >= lookbackStart && entry.date <= dateKey
    ).length;
    const baseline =
      calculateTrapezoidalWindowAverage(
        series,
        RESTING_BASELINE_WINDOW_DAYS,
        dateKey,
        'restingHr'
      ) ??
      calculateTrapezoidalWindowAverage(
        series,
        PERSONAL_ZONES_LOOKBACK_DAYS,
        dateKey,
        'restingHr'
      );
    restingHr = baseline != null ? Math.round(baseline) : null;
  }

  const hrReserve =
    maxHr != null && restingHr != null ? maxHr - restingHr : null;
  const hasPersonalZones =
    restingHr != null &&
    restingReadings >= PERSONAL_ZONES_MIN_READINGS &&
    hrReserve != null &&
    hrReserve >= MIN_HEART_RATE_RESERVE_BPM;

  const customVo2Max = normalizeVo2Max(userData?.vo2MaxCustom);
  const deviceVo2Max =
    customVo2Max == null ? resolveDeviceVo2Max(entries, dateKey) : null;

  return {
    dateKey,
    age: Number.isFinite(age) && age > 0 ? age : null,
    predictedMaxHr,
    observedMaxHr,
    maxHr,
    maxHrSource,
    legacyMaxHr,
    restingHr,
    restingHrFamily: restingHr != null ? family : null,
    restingReadings,
    hrReserve,
    hasPersonalZones,
    vo2Max: customVo2Max ?? deviceVo2Max?.value ?? null,
    vo2MaxSource:
      customVo2Max != null ? 'custom' : deviceVo2Max ? 'device' : null,
    vo2MaxDate: deviceVo2Max?.date ?? null,
  };
};

/**
 * The user's heart-rate profile as of `dateKey` (defaults to today).
 * Memoized per (heartRateEntries, cardioSessions, trainingSessions)
 * references + date + the profile scalars it reads, so the per-session EPOC /
 * training pricing in every breakdown stays cheap. All three arrays are
 * replaced immutably by the store, which is what makes reference keys safe.
 */
export const resolveHeartRateProfile = (userData, dateKey) => {
  const resolvedDateKey = normalizeDate(dateKey) ?? getTodayDateKey();
  const entriesRef = Array.isArray(userData?.heartRateEntries)
    ? userData.heartRateEntries
    : EMPTY_LIST;
  const cardioRef = Array.isArray(userData?.cardioSessions)
    ? userData.cardioSessions
    : EMPTY_LIST;
  const trainingRef = Array.isArray(userData?.trainingSessions)
    ? userData.trainingSessions
    : EMPTY_LIST;

  const byCardio = getNestedCache(profileCache, entriesRef);
  const byTraining = getNestedCache(byCardio, cardioRef);
  let byKey = byTraining.get(trainingRef);
  if (!byKey) {
    byKey = new Map();
    byTraining.set(trainingRef, byKey);
  }

  const key = `${resolvedDateKey}|${userData?.age}|${userData?.maxHeartRateCustom}|${userData?.vo2MaxCustom}`;
  let profile = byKey.get(key);
  if (!profile) {
    profile = computeHeartRateProfile(userData, resolvedDateKey);
    byKey.set(key, profile);
  }
  return profile;
};

// ---------------------------------------------------------------------------
// Intensity + zones
// ---------------------------------------------------------------------------

/**
 * Light / moderate / vigorous for an average heart rate.
 * - Personal zones (resting baseline known): %HRR with ACSM cutpoints.
 * - Otherwise: the exact legacy rule (0.70 / 0.85 of 220 - age, or of a
 *   custom max), so users without HR data see no change.
 *
 * @returns {{ level: 'light'|'moderate'|'vigorous', percent: number, model: 'hrr'|'legacy' } | null}
 */
export const resolveHeartRateIntensity = ({ heartRate, profile }) => {
  const safeHeartRate = normalizeSessionHeartRate(heartRate);
  if (safeHeartRate == null || !profile) {
    return null;
  }

  if (profile.hasPersonalZones) {
    const ratio =
      (safeHeartRate - profile.restingHr) / (profile.maxHr - profile.restingHr);
    const level =
      ratio >= HRR_VIGOROUS_THRESHOLD
        ? 'vigorous'
        : ratio >= HRR_MODERATE_THRESHOLD
          ? 'moderate'
          : 'light';
    return { level, percent: Math.round(ratio * 100), model: 'hrr' };
  }

  const legacyMax = Number(profile.legacyMaxHr);
  if (!Number.isFinite(legacyMax) || legacyMax <= 0) {
    return null;
  }
  const ratio = safeHeartRate / legacyMax;
  const level =
    ratio >= LEGACY_VIGOROUS_THRESHOLD
      ? 'vigorous'
      : ratio >= LEGACY_MODERATE_THRESHOLD
        ? 'moderate'
        : 'light';
  return { level, percent: Math.round(ratio * 100), model: 'legacy' };
};

/**
 * Five zones in bpm. Karvonen (resting + pct x reserve) with personal zones,
 * otherwise pct x max HR.
 *
 * @returns {{ model: 'hrr'|'max', zones: Array<{ key, index, label, name, accent, lowerBpm, upperBpm }> } | null}
 */
export const resolveHeartRateZones = (profile) => {
  if (!profile || profile.maxHr == null) {
    return null;
  }
  const useReserve = Boolean(profile.hasPersonalZones);
  const toBpm = (fraction) =>
    Math.round(
      useReserve
        ? profile.restingHr + fraction * (profile.maxHr - profile.restingHr)
        : fraction * profile.maxHr
    );
  return {
    model: useReserve ? 'hrr' : 'max',
    zones: HEART_RATE_ZONES.map((zone) => ({
      key: zone.key,
      index: zone.index,
      label: zone.label,
      name: zone.name,
      accent: zone.accent,
      lowerBpm: toBpm(zone.lower),
      upperBpm: toBpm(zone.upper),
    })),
  };
};

/**
 * Zone for a heart rate (`null` below Zone 1). Values above the Zone 5 upper
 * bound stay in Zone 5.
 */
export const getHeartRateZone = (heartRate, zoneModel) => {
  const value = Number(heartRate);
  const zones = zoneModel?.zones;
  if (!Number.isFinite(value) || !Array.isArray(zones) || !zones.length) {
    return null;
  }
  if (value < zones[0].lowerBpm) {
    return null;
  }
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    if (value >= zones[index].lowerBpm) {
      return zones[index];
    }
  }
  return null;
};

/** Percent of reserve (personal) or of max HR, for a "68% HRR" chip. */
export const describeHeartRateLoad = (heartRate, profile) => {
  const value = normalizeSessionHeartRate(heartRate);
  if (value == null || !profile || profile.maxHr == null) {
    return null;
  }
  if (profile.hasPersonalZones) {
    return {
      percent: Math.round(
        ((value - profile.restingHr) / (profile.maxHr - profile.restingHr)) *
          100
      ),
      basis: 'HRR',
    };
  }
  return { percent: Math.round((value / profile.maxHr) * 100), basis: 'max' };
};

// ---------------------------------------------------------------------------
// Wearable samples
// ---------------------------------------------------------------------------

const toEpochMs = (value) => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isPlausibleSampleBpm = (bpm) =>
  Number.isFinite(bpm) &&
  bpm >= DAILY_HEART_RATE_MIN_BPM &&
  bpm <= DAILY_HEART_RATE_MAX_BPM;

const DEVICE_TYPE_RANK = { chestStrap: 4, watch: 3, ring: 2, phone: 1 };

/**
 * Picks ONE source's samples (never averages across devices: the denser
 * device would bias the mean).
 * - The preferred source (e.g. the workout's own source) wins when present.
 * - Otherwise the source with the most samples; ties broken by device type
 *   (chest strap > watch > ring > phone; Android only reports device type).
 *
 * @returns {{ sourceId: string, sourceName: string|null, deviceType: string|null, samples: Array } | null}
 */
export const selectPrimaryHeartRateSource = (samples, preferredSourceId) => {
  if (!Array.isArray(samples) || !samples.length) {
    return null;
  }
  const groups = new Map();
  samples.forEach((sample) => {
    const sourceId = sample?.sourceId || sample?.sourceName || 'unknown';
    if (!groups.has(sourceId)) {
      groups.set(sourceId, {
        sourceId,
        sourceName: sample?.sourceName ?? null,
        deviceType: sample?.deviceType ?? null,
        samples: [],
      });
    }
    groups.get(sourceId).samples.push(sample);
  });

  if (preferredSourceId && groups.has(preferredSourceId)) {
    return groups.get(preferredSourceId);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.samples.length !== a.samples.length) {
      return b.samples.length - a.samples.length;
    }
    return (
      (DEVICE_TYPE_RANK[b.deviceType] ?? 0) -
      (DEVICE_TYPE_RANK[a.deviceType] ?? 0)
    );
  })[0];
};

/**
 * Summarizes one source's HR samples over a session window.
 * - `continuous`: trapezoid between consecutive samples; gaps longer than
 *   MAX_SAMPLE_GAP_SECONDS are excluded from numerator and denominator
 *   (never interpolated). Also returns seconds per zone.
 * - `sparse`: when the median sample interval itself exceeds the gap limit
 *   (e.g. an Apple Watch outside a workout samples about every 5 min), a
 *   plain mean of the samples; coverage and zone time are unknown (`null`).
 *
 * @param {Array<{ startDate|time|timestamp, value|bpm }>} samples
 * @param {{ start, end, zoneModel? }} window - start/end as ms, Date or ISO
 * @returns {null | { average, min, max, sampleCount, coverage, zoneSeconds, method }}
 */
export const computeTimeWeightedHeartRate = (samples, window = {}) => {
  const startMs = toEpochMs(window.start);
  const endMs = toEpochMs(window.end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }

  const points = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({
      timeMs: toEpochMs(
        sample?.time ??
          sample?.timestamp ??
          sample?.startDate ??
          sample?.endDate
      ),
      bpm: Number(sample?.bpm ?? sample?.value),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.timeMs) &&
        point.timeMs >= startMs &&
        point.timeMs <= endMs &&
        isPlausibleSampleBpm(point.bpm)
    )
    .sort((a, b) => a.timeMs - b.timeMs);

  if (!points.length) {
    return null;
  }

  const bpms = points.map((point) => point.bpm);
  const min = Math.round(Math.min(...bpms));
  const max = Math.round(Math.max(...bpms));
  const intervals = [];
  for (let index = 1; index < points.length; index += 1) {
    intervals.push((points[index].timeMs - points[index - 1].timeMs) / 1000);
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length
    ? sortedIntervals[Math.floor((sortedIntervals.length - 1) / 2)]
    : Infinity;

  if (points.length < 2 || medianInterval > MAX_SAMPLE_GAP_SECONDS) {
    return {
      average: Math.round(
        bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length
      ),
      min,
      max,
      sampleCount: points.length,
      coverage: null,
      zoneSeconds: null,
      method: 'sparse',
    };
  }

  const zones = window.zoneModel?.zones;
  const zoneSeconds = Array.isArray(zones) ? zones.map(() => 0) : null;
  let area = 0;
  let coveredSeconds = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dt = intervals[index - 1];
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_SECONDS) {
      continue;
    }
    const meanBpm = (points[index - 1].bpm + points[index].bpm) / 2;
    area += meanBpm * dt;
    coveredSeconds += dt;
    if (zoneSeconds) {
      const zone = getHeartRateZone(meanBpm, window.zoneModel);
      if (zone) {
        zoneSeconds[zone.index - 1] += dt;
      }
    }
  }

  if (coveredSeconds <= 0) {
    return {
      average: Math.round(
        bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length
      ),
      min,
      max,
      sampleCount: points.length,
      coverage: null,
      zoneSeconds: null,
      method: 'sparse',
    };
  }

  const windowSeconds = (endMs - startMs) / 1000;
  return {
    average: Math.round(area / coveredSeconds),
    min,
    max,
    sampleCount: points.length,
    coverage: Math.min(
      1,
      Math.round((coveredSeconds / windowSeconds) * 100) / 100
    ),
    zoneSeconds: zoneSeconds
      ? zoneSeconds.map((seconds) => Math.round(seconds))
      : null,
    method: 'continuous',
  };
};

/**
 * A day's resting HR estimated from hourly averages: the lowest hourly
 * average. Reads high versus a device's own resting record (it is an hour,
 * not the quietest minutes), which is why it is stored as 'estimated' and
 * never trended together with measured readings.
 *
 * @param {Array<{ value?, values?: { average? } }>} buckets - Hourly aggregates
 * @returns {number|null}
 */
export const estimateRestingHrFromHourly = (buckets) => {
  if (!Array.isArray(buckets)) {
    return null;
  }
  const averages = buckets
    .map((bucket) => Number(bucket?.values?.average ?? bucket?.value))
    .filter(isPlausibleSampleBpm);
  if (averages.length < RESTING_ESTIMATE_MIN_HOURLY_BUCKETS) {
    return null;
  }
  return Math.round(Math.min(...averages));
};

/**
 * Resting-HR change over a window, from a least-squares slope over ONE method
 * family (measured or estimated, never mixed).
 *
 * @returns {null | { deltaBpm, readings, family, windowDays }}
 */
export const calculateRestingHrTrend = (
  entries,
  dateKey,
  windowDays = RESTING_TREND_WINDOW_DAYS
) => {
  const endKey = normalizeDate(dateKey) ?? getTodayDateKey();
  const keys = getWindowDateKeys(endKey, windowDays);
  if (!keys.length) {
    return null;
  }
  const startKey = keys[0];
  const sorted = getSortedEntries(entries);
  const family = resolveRestingHrTrendFamily(sorted, {
    startDateKey: startKey,
    endDateKey: endKey,
  });
  if (!family) {
    return null;
  }
  const series = getRestingHrSeries(sorted, { family }).filter(
    (entry) => entry.date >= startKey && entry.date <= endKey
  );
  if (series.length < RESTING_TREND_MIN_READINGS) {
    return null;
  }

  const startMs = new Date(`${startKey}T00:00:00Z`).getTime();
  const xs = series.map(
    (entry) =>
      (new Date(`${entry.date}T00:00:00Z`).getTime() - startMs) / 86_400_000
  );
  const ys = series.map((entry) => entry.restingHr);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  xs.forEach((x, index) => {
    numerator += (x - meanX) * (ys[index] - meanY);
    denominator += (x - meanX) ** 2;
  });
  if (denominator === 0) {
    return null;
  }
  const slopePerDay = numerator / denominator;
  return {
    deltaBpm: Math.round(slopePerDay * windowDays * 10) / 10,
    readings: series.length,
    family,
    windowDays,
  };
};

/** Same family test, exported for display code. */
export { getRestingHrMethodFamily };

// ---------------------------------------------------------------------------
// Advisory NEAT suggestion (never applied automatically)
// ---------------------------------------------------------------------------

export const WAKING_HOUR_START = 8;
export const WAKING_HOUR_END = 22;
export const WAKING_MIN_HOURLY_BUCKETS = 4;
export const NEAT_ADVISORY_BASELINE_DAYS = 28;
export const NEAT_ADVISORY_MIN_BASELINE_DAYS = 14;
export const NEAT_ADVISORY_UP_DELTA_BPM = 8;
export const NEAT_ADVISORY_DOWN_DELTA_BPM = -6;

/**
 * Mean of a day's hourly HR averages between WAKING_HOUR_START and
 * WAKING_HOUR_END (local), skipping any hour that overlaps a logged session
 * (exercise is priced by the session; counting it here would double it).
 *
 * @param {Array<{ startDate, endDate?, value?, values?: { average? } }>} buckets
 * @param {{ excludeIntervals?: Array<{ startMs: number, endMs: number }> }} [options]
 * @returns {number|null}
 */
export const computeWakingHeartRate = (buckets, options = {}) => {
  if (!Array.isArray(buckets)) {
    return null;
  }
  const exclude = Array.isArray(options.excludeIntervals)
    ? options.excludeIntervals
    : [];
  const values = buckets
    .map((bucket) => {
      const startMs = toEpochMs(bucket?.startDate);
      if (!Number.isFinite(startMs)) {
        return null;
      }
      const endMs = Number.isFinite(toEpochMs(bucket?.endDate))
        ? toEpochMs(bucket.endDate)
        : startMs + 3_600_000;
      const hour = new Date(startMs).getHours();
      if (hour < WAKING_HOUR_START || hour >= WAKING_HOUR_END) {
        return null;
      }
      const overlapsSession = exclude.some(
        (interval) => interval.startMs < endMs && interval.endMs > startMs
      );
      if (overlapsSession) {
        return null;
      }
      const value = Number(bucket?.values?.average ?? bucket?.value);
      return isPlausibleSampleBpm(value) ? value : null;
    })
    .filter((value) => value != null);
  if (values.length < WAKING_MIN_HOURLY_BUCKETS) {
    return null;
  }
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Whether today's waking heart rate suggests a more (or less) active day than
 * the user's NEAT setting assumes. ADVISORY ONLY: it never changes TDEE; the
 * NEAT override sheet shows it as a chip the user may act on.
 *
 * - Baseline: median waking HR of the previous 28 days (>= 14 days needed).
 * - "up" when today runs >= 8 bpm above it AND steps are not above their own
 *   28-day median (steps already price walking; an elevated HR on a high-step
 *   day is the walking, not extra NEAT).
 * - "down" when today runs >= 6 bpm below it.
 *
 * @returns {null | { direction: 'up' | 'down', deltaBpm: number, baselineDays: number }}
 */
export const assessNeatFromHeartRate = ({
  heartRateEntries,
  stepEntries,
  dateKey,
}) => {
  const endKey = normalizeDate(dateKey) ?? getTodayDateKey();
  const entries = getSortedEntries(heartRateEntries);
  const today = entries.find((entry) => entry.date === endKey)?.wakingAvgHr;
  if (!Number.isFinite(today)) {
    return null;
  }
  const startKey = shiftDateKey(endKey, -NEAT_ADVISORY_BASELINE_DAYS);
  const baseline = entries
    .filter(
      (entry) =>
        entry.date >= startKey &&
        entry.date < endKey &&
        Number.isFinite(entry.wakingAvgHr)
    )
    .map((entry) => entry.wakingAvgHr);
  if (baseline.length < NEAT_ADVISORY_MIN_BASELINE_DAYS) {
    return null;
  }
  const deltaBpm = Math.round((today - median(baseline)) * 10) / 10;

  if (deltaBpm >= NEAT_ADVISORY_UP_DELTA_BPM) {
    const steps = Array.isArray(stepEntries) ? stepEntries : [];
    const todaySteps = Number(
      steps.find((entry) => entry?.date === endKey)?.steps
    );
    const pastSteps = steps
      .filter((entry) => entry?.date >= startKey && entry?.date < endKey)
      .map((entry) => Number(entry?.steps))
      .filter(Number.isFinite);
    const stepsAboveUsual =
      Number.isFinite(todaySteps) &&
      pastSteps.length >= NEAT_ADVISORY_MIN_BASELINE_DAYS &&
      todaySteps > median(pastSteps);
    return stepsAboveUsual
      ? null
      : { direction: 'up', deltaBpm, baselineDays: baseline.length };
  }
  if (deltaBpm <= NEAT_ADVISORY_DOWN_DELTA_BPM) {
    return { direction: 'down', deltaBpm, baselineDays: baseline.length };
  }
  return null;
};

/** Resting-HR drift (bpm over 28 days) treated as a real move, not noise. */
export const PHYSIOLOGY_MIN_DRIFT_BPM = 2;

/**
 * DISPLAY-ONLY corroboration for a smart adaptive-thermogenesis result: does
 * the resting-HR trend move the same way as the correction? A long deficit
 * tends to lower resting HR (and a surplus to raise it), so a falling resting
 * HR alongside a downward correction "agrees". This NEVER feeds the
 * correction, its confidence, or TDEE — resting HR is moved by too many other
 * things (illness, alcohol, sleep, training load) to price energy from.
 * Only measured readings (device / manual) count.
 *
 * @returns {null | { restingHrDeltaBpm: number, readings: number, agreement: 'agrees' | 'disagrees' | 'neutral' }}
 */
export const assessAdaptiveThermogenesisPhysiology = ({
  correction,
  heartRateEntries,
  dateKey,
}) => {
  const trend = calculateRestingHrTrend(heartRateEntries, dateKey);
  if (!trend || trend.family !== 'measured') {
    return null;
  }
  const numericCorrection = Number(correction) || 0;
  let agreement = 'neutral';
  if (
    Math.abs(trend.deltaBpm) >= PHYSIOLOGY_MIN_DRIFT_BPM &&
    Math.abs(numericCorrection) >= 10
  ) {
    agreement =
      Math.sign(trend.deltaBpm) === Math.sign(numericCorrection)
        ? 'agrees'
        : 'disagrees';
  }
  return {
    restingHrDeltaBpm: trend.deltaBpm,
    readings: trend.readings,
    agreement,
  };
};

// ---------------------------------------------------------------------------
// Bluetooth LE Heart Rate Measurement (characteristic 0x2A37)
// ---------------------------------------------------------------------------

/**
 * Parses a Heart Rate Measurement notification.
 * Flags byte: bit0 = bpm is uint16 (else uint8); bits1-2 = sensor contact
 * (bit2 = supported, bit1 = detected); bit3 = energy expended (uint16 kJ)
 * present; bit4 = RR intervals present (uint16 each, units of 1/1024 s).
 *
 * @param {DataView} dataView
 * @returns {null | { bpm, contactDetected: boolean|null, energyExpendedKj: number|null, rrIntervalsMs: number[] }}
 */
export const parseHeartRateMeasurement = (dataView) => {
  if (!dataView || typeof dataView.getUint8 !== 'function') {
    return null;
  }
  const length = dataView.byteLength;
  if (length < 2) {
    return null;
  }
  const flags = dataView.getUint8(0);
  const isUint16 = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = contactSupported ? (flags & 0x02) !== 0 : null;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;

  let offset = 1;
  let bpm;
  if (isUint16) {
    if (length < 3) {
      return null;
    }
    bpm = dataView.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = dataView.getUint8(offset);
    offset += 1;
  }

  let energyExpendedKj = null;
  if (hasEnergy) {
    if (offset + 2 > length) {
      return null;
    }
    energyExpendedKj = dataView.getUint16(offset, true);
    offset += 2;
  }

  const rrIntervalsMs = [];
  if (hasRr) {
    while (offset + 2 <= length) {
      rrIntervalsMs.push(
        Math.round((dataView.getUint16(offset, true) / 1024) * 1000)
      );
      offset += 2;
    }
  }

  return { bpm, contactDetected, energyExpendedKj, rrIntervalsMs };
};

/** Max-HR picker range, re-exported for UI convenience. */
export const MAX_HEART_RATE_RANGE = Object.freeze({
  min: MAX_HEART_RATE_MIN_BPM,
  max: MAX_HEART_RATE_MAX_BPM,
});
