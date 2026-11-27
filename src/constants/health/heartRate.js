/**
 * Canonical heart-rate bounds + vocabulary.
 *
 * One source of truth for every place that accepts, validates or prices a
 * heart-rate value (session forms, save-time sanitizers, the Keytel kcal
 * formula, EPOC intensity, step-overlap cadence, the HR pickers, the synced /
 * manual daily entries). Before this module each layer enforced its own rule:
 * the picker clamped to 60-220, the sanitizers accepted any integer >= 1, the
 * kcal formula priced anything outside 60-220 at 0 kcal, and EPOC applied no
 * bounds at all.
 *
 * Pure leaf module (no imports) so the Node test tier can load it directly.
 * Every normalizer REJECTS out-of-range values (returns null) instead of
 * clamping them: a 300 bpm average or a 12 bpm resting rate is a typo or a
 * sensor glitch, not a measurement.
 */

/**
 * The master "Heart rate" switch (Settings -> Profile & Health). Only an
 * explicit `false` turns it off, so profiles saved before it existed keep
 * every heart-rate surface.
 *
 * It decides what is SHOWN and whether the watch is READ. It is deliberately
 * not a calculation input: saved readings are kept and sessions logged with a
 * heart rate keep their numbers.
 *
 * @param {object} [userData]
 * @returns {boolean}
 */
export const isHeartRateTrackingEnabled = (userData) =>
  userData?.heartRateTrackingEnabled !== false;

/** Average heart rate of an exercise session, in bpm. */
export const SESSION_HEART_RATE_MIN_BPM = 60;
export const SESSION_HEART_RATE_MAX_BPM = 220;

/** Where the session heart-rate picker opens when no value has been entered. */
export const DEFAULT_SESSION_HEART_RATE_BPM = 120;

/** Resting heart rate (morning / device-computed), in bpm. */
export const RESTING_HEART_RATE_MIN_BPM = 30;
export const RESTING_HEART_RATE_MAX_BPM = 120;
export const DEFAULT_RESTING_HEART_RATE_BPM = 60;

/** A user-entered maximum heart rate, in bpm. */
export const MAX_HEART_RATE_MIN_BPM = 120;
export const MAX_HEART_RATE_MAX_BPM = 230;

/**
 * Daily aggregate readings from a wearable (avg / min / max of the day, or a
 * single sample). Wider than the session range on purpose: overnight minima
 * sit in the 30s-40s for trained people.
 */
export const DAILY_HEART_RATE_MIN_BPM = 25;
export const DAILY_HEART_RATE_MAX_BPM = 240;

/** VO2 max, in mL/kg/min. */
export const VO2_MAX_MIN = 15;
export const VO2_MAX_MAX = 90;

const normalizeWholeInRange = (value, min, max) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) {
    return null;
  }
  return rounded;
};

/**
 * Normalizes a session average heart rate.
 *
 * @param {unknown} value - Raw value (number, numeric string, '' or nullish)
 * @returns {number|null} Whole bpm inside the session bounds, or `null`.
 */
export const normalizeSessionHeartRate = (value) =>
  normalizeWholeInRange(
    value,
    SESSION_HEART_RATE_MIN_BPM,
    SESSION_HEART_RATE_MAX_BPM
  );

/** @returns {number|null} Whole bpm inside the resting bounds, or `null`. */
export const normalizeRestingHeartRate = (value) =>
  normalizeWholeInRange(
    value,
    RESTING_HEART_RATE_MIN_BPM,
    RESTING_HEART_RATE_MAX_BPM
  );

/** @returns {number|null} Whole bpm inside the max-HR bounds, or `null`. */
export const normalizeMaxHeartRate = (value) =>
  normalizeWholeInRange(value, MAX_HEART_RATE_MIN_BPM, MAX_HEART_RATE_MAX_BPM);

/** @returns {number|null} Whole bpm inside the daily-reading bounds, or `null`. */
export const normalizeDailyHeartRate = (value) =>
  normalizeWholeInRange(
    value,
    DAILY_HEART_RATE_MIN_BPM,
    DAILY_HEART_RATE_MAX_BPM
  );

/** @returns {number|null} VO2 max rounded to 1 decimal inside bounds, or `null`. */
export const normalizeVo2Max = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric * 10) / 10;
  if (rounded < VO2_MAX_MIN || rounded > VO2_MAX_MAX) {
    return null;
  }
  return rounded;
};

/**
 * How a day's resting heart rate was obtained.
 * - `device`: the wearable's own resting-HR record (Apple Health / Health
 *   Connect `RestingHeartRateRecord`).
 * - `manual`: the user's morning reading.
 * - `estimated`: derived by the app (lowest hourly average of the day) when the
 *   wearable writes no resting-HR record. Reads high versus `device`, so it is
 *   never mixed into the same trend as device/manual readings.
 */
export const RESTING_HR_METHODS = Object.freeze([
  'device',
  'manual',
  'estimated',
]);

/** Device and manual readings are both real measurements and may share a trend. */
export const MEASURED_RESTING_HR_METHODS = Object.freeze(['device', 'manual']);

/**
 * Five-zone model. Bounds are fractions of heart-rate reserve (Karvonen) when
 * the user has personal zones (a resting baseline), otherwise of max HR.
 * `accent` is a semantic accent token name (never a raw colour).
 */
export const HEART_RATE_ZONES = Object.freeze([
  {
    key: 'z1',
    index: 1,
    label: 'Zone 1',
    name: 'Very light',
    lower: 0.5,
    upper: 0.6,
    accent: 'accent-slate',
  },
  {
    key: 'z2',
    index: 2,
    label: 'Zone 2',
    name: 'Light',
    lower: 0.6,
    upper: 0.7,
    accent: 'accent-blue',
  },
  {
    key: 'z3',
    index: 3,
    label: 'Zone 3',
    name: 'Moderate',
    lower: 0.7,
    upper: 0.8,
    accent: 'accent-green',
  },
  {
    key: 'z4',
    index: 4,
    label: 'Zone 4',
    name: 'Hard',
    lower: 0.8,
    upper: 0.9,
    accent: 'accent-amber',
  },
  {
    key: 'z5',
    index: 5,
    label: 'Zone 5',
    name: 'Maximum',
    lower: 0.9,
    upper: 1.0,
    accent: 'accent-red',
  },
]);

/** Text / background utility classes per zone accent (static strings for Tailwind). */
export const HEART_RATE_ZONE_CLASSES = Object.freeze({
  z1: {
    text: 'text-accent-slate',
    bg: 'bg-accent-slate',
    soft: 'bg-accent-slate/15',
  },
  z2: {
    text: 'text-accent-blue',
    bg: 'bg-accent-blue',
    soft: 'bg-accent-blue/15',
  },
  z3: {
    text: 'text-accent-green',
    bg: 'bg-accent-green',
    soft: 'bg-accent-green/15',
  },
  z4: {
    text: 'text-accent-amber',
    bg: 'bg-accent-amber',
    soft: 'bg-accent-amber/15',
  },
  z5: {
    text: 'text-accent-red',
    bg: 'bg-accent-red',
    soft: 'bg-accent-red/15',
  },
});

/** Where a session's heart rate came from. */
export const SESSION_HEART_RATE_SOURCES = Object.freeze([
  'manual',
  'healthConnect',
  'ble',
]);

/** How a heart-rate training session is priced. Missing = 'keytel' (legacy). */
export const TRAINING_HR_BURN_MODELS = Object.freeze(['keytel', 'intensity']);
