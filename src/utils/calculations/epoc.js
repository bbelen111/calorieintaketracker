import {
  resolveHeartRateIntensity,
  resolveHeartRateProfile,
} from './heartRate.js';

const MIN_DURATION_MINUTES = 10;
const DEFAULT_CARRYOVER_HOURS = 6;
const MAX_CARRYOVER_HOURS = 24;
const MAX_DURATION_BOOST_HOURS = 2;

const INTENSITY_FACTOR_BY_LEVEL = {
  light: 0.04,
  moderate: 0.07,
  vigorous: 0.12,
};

const CARRYOVER_HOURS_BY_INTENSITY = {
  light: 2,
  moderate: 6,
  vigorous: 12,
};

const TRAINING_LABEL_MULTIPLIERS = [
  { pattern: /power|olympic|strongman|crossfit|wod|metcon/i, multiplier: 1.2 },
  { pattern: /bodybuild|hypertrophy|resistance|strength/i, multiplier: 1.1 },
  { pattern: /calisthenics|functional|circuit/i, multiplier: 1.05 },
  { pattern: /yoga|mobility|stretch/i, multiplier: 0.6 },
];

const CARDIO_LABEL_MULTIPLIERS = [
  { pattern: /hiit|interval|sprint|tabata|hill/i, multiplier: 1.25 },
  { pattern: /run|row|boxing|kickbox|battle rope/i, multiplier: 1.1 },
  { pattern: /walk|desk treadmill|mobility/i, multiplier: 0.8 },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeIntensity = (value, fallback = 'moderate') => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'light' ||
    normalized === 'moderate' ||
    normalized === 'vigorous'
  ) {
    return normalized;
  }
  return fallback;
};

const resolveLabelMultiplier = (label, table) => {
  const normalizedLabel = String(label ?? '').trim();
  if (!normalizedLabel) {
    return 1;
  }

  const matched = table.find((entry) => entry.pattern.test(normalizedLabel));
  return matched?.multiplier ?? 1;
};

const resolveDurationAdjustment = (durationMinutes) => {
  const minutes = normalizeNumber(durationMinutes, 0);
  if (minutes < MIN_DURATION_MINUTES) {
    return 0;
  }

  return clamp(Math.sqrt(minutes / 45), 0.75, 1.5);
};

const resolveCarryoverWindowMinutes = ({
  intensity,
  durationMinutes,
  epocCarryoverHours,
}) => {
  const userHours = normalizeNumber(
    epocCarryoverHours,
    DEFAULT_CARRYOVER_HOURS
  );
  const configuredHours = clamp(userHours, 1, MAX_CARRYOVER_HOURS);
  const baselineHours =
    CARRYOVER_HOURS_BY_INTENSITY[intensity] ?? DEFAULT_CARRYOVER_HOURS;
  const durationBoostHours = clamp(
    normalizeNumber(durationMinutes, 0) / 120,
    0,
    MAX_DURATION_BOOST_HOURS
  );

  return Math.round(
    (baselineHours + durationBoostHours) * configuredHours * 0.5 * 60
  );
};

/**
 * EPOC intensity for a session. Heart-rate sessions are classified from the
 * user's HR profile AS OF the session's own date (personal %HRR zones once a
 * resting baseline exists, otherwise the exact legacy 220 - age rule). An
 * invalid/out-of-range HR, or no usable profile, falls back to the stored
 * intensity.
 *
 * @returns {{ level: string, heartRate: null | { percent: number, model: 'hrr'|'legacy' } }}
 */
const resolveSessionIntensity = ({ session, userData }) => {
  if (session?.effortType === 'heartRate') {
    const fromHeartRate = resolveHeartRateIntensity({
      heartRate: session?.averageHeartRate,
      profile: resolveHeartRateProfile(userData, session?.date),
    });
    if (fromHeartRate) {
      return {
        level: fromHeartRate.level,
        heartRate: {
          percent: fromHeartRate.percent,
          model: fromHeartRate.model,
        },
      };
    }
  }

  return { level: normalizeIntensity(session?.intensity), heartRate: null };
};

const buildEpocResult = ({
  session,
  exerciseCalories,
  intensity,
  heartRateIntensity = null,
  typeMultiplier,
  epocFactor,
  durationAdjustment,
  carryoverWindowMinutes,
}) => {
  const safeExerciseCalories = Math.max(
    0,
    Math.round(normalizeNumber(exerciseCalories, 0))
  );
  const rawCalories =
    safeExerciseCalories * epocFactor * typeMultiplier * durationAdjustment;
  const totalCalories = Math.max(0, Math.round(rawCalories));

  return {
    totalCalories,
    windowMinutes: totalCalories > 0 ? carryoverWindowMinutes : 0,
    details: {
      sessionId: session?.id ?? null,
      intensity,
      // How a heart-rate session's intensity was read: "64% HRR" (personal
      // zones) or "% of max" (legacy rule). null for intensity sessions.
      heartRateIntensity,
      exerciseCalories: safeExerciseCalories,
      epocFactor,
      typeMultiplier,
      durationAdjustment,
      carryoverWindowMinutes: totalCalories > 0 ? carryoverWindowMinutes : 0,
    },
  };
};

export const resolveTrainingSessionEpoc = ({
  session,
  exerciseCalories,
  trainingType,
  userData,
}) => {
  const durationMinutes = normalizeNumber(session?.duration, 0);
  const durationAdjustment = resolveDurationAdjustment(durationMinutes);
  if (durationAdjustment <= 0) {
    return { totalCalories: 0, windowMinutes: 0, details: { intensity: null } };
  }

  const { level: intensity, heartRate: heartRateIntensity } =
    resolveSessionIntensity({ session, userData });
  const epocFactor =
    INTENSITY_FACTOR_BY_LEVEL[intensity] ?? INTENSITY_FACTOR_BY_LEVEL.moderate;
  const typeMultiplier = resolveLabelMultiplier(
    trainingType?.label ?? session?.type,
    TRAINING_LABEL_MULTIPLIERS
  );
  const carryoverWindowMinutes = resolveCarryoverWindowMinutes({
    intensity,
    durationMinutes,
    epocCarryoverHours: userData?.epocCarryoverHours,
  });

  return buildEpocResult({
    session,
    exerciseCalories,
    intensity,
    heartRateIntensity,
    typeMultiplier,
    epocFactor,
    durationAdjustment,
    carryoverWindowMinutes,
  });
};

export const resolveCardioSessionEpoc = ({
  session,
  exerciseCalories,
  cardioType,
  userData,
}) => {
  const durationMinutes = normalizeNumber(session?.duration, 0);
  const durationAdjustment = resolveDurationAdjustment(durationMinutes);
  if (durationAdjustment <= 0) {
    return { totalCalories: 0, windowMinutes: 0, details: { intensity: null } };
  }

  const { level: intensity, heartRate: heartRateIntensity } =
    resolveSessionIntensity({ session, userData });
  const epocFactor =
    (INTENSITY_FACTOR_BY_LEVEL[intensity] ??
      INTENSITY_FACTOR_BY_LEVEL.moderate) * 0.9;
  const typeMultiplier = resolveLabelMultiplier(
    cardioType?.label ?? session?.type,
    CARDIO_LABEL_MULTIPLIERS
  );
  const carryoverWindowMinutes = resolveCarryoverWindowMinutes({
    intensity,
    durationMinutes,
    epocCarryoverHours: userData?.epocCarryoverHours,
  });

  return buildEpocResult({
    session,
    exerciseCalories,
    intensity,
    heartRateIntensity,
    typeMultiplier,
    epocFactor,
    durationAdjustment,
    carryoverWindowMinutes,
  });
};

// Hard upper bound on any session's EPOC carryover window, derived from the
// same clamps the window formula uses: (max baseline intensity hours + max
// duration boost) * max configured hours * 0.5, in minutes. Exported so
// `sessionCarryover` can pre-filter sessions by date distance without
// computing each session's burn (see getCarryoverForDateFromSessions).
export const MAX_EPOC_CARRYOVER_WINDOW_MINUTES = Math.round(
  (Math.max(...Object.values(CARRYOVER_HOURS_BY_INTENSITY)) +
    MAX_DURATION_BOOST_HOURS) *
    MAX_CARRYOVER_HOURS *
    0.5 *
    60
);

export {
  DEFAULT_CARRYOVER_HOURS,
  MAX_CARRYOVER_HOURS,
  CARRYOVER_HOURS_BY_INTENSITY,
};
