/**
 * Heart-rate fields on cardio / training sessions (pure; Node-tested in
 * tests/utils/sessionHeartRate.test.js).
 *
 * Optional session fields (all absent for intensity sessions):
 * - `averageHeartRate` (canonical, priced) — whole bpm, 60-220
 * - `maxHeartRate` — the session's peak (feeds the observed-max estimate)
 * - `heartRateSource` — 'manual' | 'healthConnect' | 'ble'
 * - `heartRateCoverage` — 0..1 share of the session the samples covered
 * - `heartRateZoneSeconds` — [z1..z5] seconds
 * - `healthWorkoutId` — the imported workout's platform id (dedupes imports)
 * - `hrBurnModel` (training only) — 'keytel' | 'intensity'
 */
import {
  SESSION_HEART_RATE_SOURCES,
  normalizeDailyHeartRate,
  normalizeSessionHeartRate,
} from '../../constants/health/heartRate.js';
import {
  STRENGTH_WORKOUT_TYPES,
  WORKOUT_TYPE_TO_CARDIO_TYPE,
} from '../../constants/health/workoutTypeMap.js';

const DETAIL_FIELDS = [
  'maxHeartRate',
  'heartRateSource',
  'heartRateCoverage',
  'heartRateZoneSeconds',
];

const omitFields = (session, fields) => {
  const next = { ...session };
  fields.forEach((field) => {
    delete next[field];
  });
  return next;
};

/** The user typed / picked an average: drop the wearable details it replaces. */
export const applyManualHeartRate = (session, bpm) => ({
  ...omitFields(session, DETAIL_FIELDS),
  averageHeartRate: bpm,
  heartRateSource: 'manual',
});

/**
 * Fills a draft from a wearable / sensor summary (readSessionHeartRate or a
 * live recording). Switches the draft to heart-rate effort.
 */
export const applyHeartRateSummary = (session, summary, source) => {
  const average = normalizeSessionHeartRate(
    summary?.average ?? summary?.averageHeartRate
  );
  if (average == null) {
    return session;
  }
  const next = {
    ...omitFields(session, DETAIL_FIELDS),
    effortType: 'heartRate',
    averageHeartRate: average,
    heartRateSource: SESSION_HEART_RATE_SOURCES.includes(source)
      ? source
      : 'manual',
  };
  const max = normalizeDailyHeartRate(summary?.max ?? summary?.maxHeartRate);
  if (max != null) {
    next.maxHeartRate = max;
  }
  const coverage = Number(summary?.coverage);
  if (Number.isFinite(coverage) && coverage >= 0 && coverage <= 1) {
    next.heartRateCoverage = coverage;
  }
  if (
    Array.isArray(summary?.zoneSeconds) &&
    summary.zoneSeconds.length === 5 &&
    summary.zoneSeconds.every((value) => Number.isFinite(value) && value >= 0)
  ) {
    next.heartRateZoneSeconds = summary.zoneSeconds.map((value) =>
      Math.round(value)
    );
  }
  return next;
};

/** Switching a draft to intensity effort removes every heart-rate field. */
export const clearHeartRateFields = (session) =>
  omitFields(session, [...DETAIL_FIELDS, 'averageHeartRate', 'hrBurnModel']);

/**
 * Validates the optional heart-rate detail fields on a saved session
 * (orchestrator sanitizers + storage load). Invalid values are dropped, never
 * clamped; the canonical `averageHeartRate` is validated by the caller.
 */
export const sanitizeSessionHeartRateDetails = (session) => {
  const next = { ...session };
  const max = normalizeDailyHeartRate(next.maxHeartRate);
  if (max == null) {
    delete next.maxHeartRate;
  } else {
    next.maxHeartRate = max;
  }
  if (!SESSION_HEART_RATE_SOURCES.includes(next.heartRateSource)) {
    delete next.heartRateSource;
  }
  const coverage = Number(next.heartRateCoverage);
  if (!(Number.isFinite(coverage) && coverage >= 0 && coverage <= 1)) {
    delete next.heartRateCoverage;
  }
  if (!(
    Array.isArray(next.heartRateZoneSeconds) &&
    next.heartRateZoneSeconds.length === 5 &&
    next.heartRateZoneSeconds.every(
      (value) => Number.isFinite(value) && value >= 0
    )
  )) {
    delete next.heartRateZoneSeconds;
  }
  if (
    typeof next.healthWorkoutId !== 'string' ||
    !next.healthWorkoutId.trim()
  ) {
    delete next.healthWorkoutId;
  }
  return next;
};

/**
 * The training-HR pricing model for a save: an existing model is preserved
 * (editing a legacy Keytel session keeps it on Keytel); a session without one
 * — a NEW heart-rate session — gets 'intensity'.
 */
export const resolveTrainingHrBurnModel = (session) =>
  session?.hrBurnModel === 'keytel' || session?.hrBurnModel === 'intensity'
    ? session.hrBurnModel
    : 'intensity';

/**
 * The model a stored training session is priced with (missing = legacy
 * Keytel). Used when an existing session is loaded into an edit draft so
 * saving it can never silently switch its formula.
 */
export const getStoredTrainingHrBurnModel = (session) =>
  session?.effortType === 'heartRate'
    ? session?.hrBurnModel === 'intensity'
      ? 'intensity'
      : 'keytel'
    : undefined;

/** Cardio type key for a workout, or null when the user should pick. */
export const mapWorkoutTypeToCardioType = (workoutType, cardioTypes = {}) => {
  const key = WORKOUT_TYPE_TO_CARDIO_TYPE[workoutType];
  return key && cardioTypes?.[key] ? key : null;
};

export const isStrengthWorkout = (workoutType) =>
  STRENGTH_WORKOUT_TYPES.has(workoutType);

const toTimeOfDay = (epochMs) => {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
};

/**
 * Fills a cardio draft from an imported workout (+ its HR summary, if read).
 * Keeps the draft's type when the workout type has no honest match.
 */
export const applyWorkoutToCardioDraft = (
  draft,
  workout,
  heartRate,
  cardioTypes
) => {
  const base = {
    ...draft,
    type:
      mapWorkoutTypeToCardioType(workout.workoutType, cardioTypes) ??
      draft.type,
    startTime: toTimeOfDay(workout.startMs),
    duration: Math.max(1, workout.durationMinutes),
    healthWorkoutId: workout.id,
  };
  delete base.startedAt;
  delete base.endedAt;
  return heartRate
    ? applyHeartRateSummary(base, heartRate.summary, 'healthConnect')
    : base;
};

/** Fills a training draft (duration in hours) from an imported workout. */
export const applyWorkoutToTrainingDraft = (draft, workout, heartRate) => {
  const base = {
    ...draft,
    startTime: toTimeOfDay(workout.startMs),
    durationHours: Math.max(1, workout.durationMinutes) / 60,
    healthWorkoutId: workout.id,
  };
  delete base.startedAt;
  delete base.endedAt;
  return heartRate
    ? applyHeartRateSummary(base, heartRate.summary, 'healthConnect')
    : base;
};

/**
 * [start, end] epoch ms of a draft from its date + start time + duration, or
 * null when incomplete. `durationMinutes` is minutes for cardio, the caller
 * converts training hours.
 */
export const resolveDraftWindow = ({ dateKey, startTime, durationMinutes }) => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? ''));
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    String(startTime ?? '').trim()
  );
  const minutes = Number(durationMinutes);
  if (!dateMatch || !timeMatch || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const start = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2])
  ).getTime();
  return { startMs: start, endMs: start + minutes * 60_000 };
};
