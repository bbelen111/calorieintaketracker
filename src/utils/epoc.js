const MIN_DURATION_MINUTES = 10;
const DEFAULT_CARRYOVER_HOURS = 6;
const MAX_CARRYOVER_HOURS = 24;

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

const resolveIntensityFromHeartRate = ({ averageHeartRate, userAge }) => {
  const heartRate = normalizeNumber(averageHeartRate, NaN);
  const age = normalizeNumber(userAge, NaN);
  if (!Number.isFinite(heartRate) || !Number.isFinite(age) || age <= 0) {
    return null;
  }

  const maxHeartRate = 220 - age;
  if (!Number.isFinite(maxHeartRate) || maxHeartRate <= 0) {
    return null;
  }

  const intensityRatio = heartRate / maxHeartRate;
  if (intensityRatio >= 0.85) return 'vigorous';
  if (intensityRatio >= 0.7) return 'moderate';
  return 'light';
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
    2
  );

  return Math.round(
    (baselineHours + durationBoostHours) * configuredHours * 0.5 * 60
  );
};

const resolveSessionIntensity = ({ session, userAge }) => {
  if (session?.effortType === 'heartRate') {
    const fromHeartRate = resolveIntensityFromHeartRate({
      averageHeartRate: session?.averageHeartRate,
      userAge,
    });
    if (fromHeartRate) {
      return fromHeartRate;
    }
  }

  return normalizeIntensity(session?.intensity);
};

const buildEpocResult = ({
  session,
  exerciseCalories,
  intensity,
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

  const intensity = resolveSessionIntensity({
    session,
    userAge: userData?.age,
  });
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

  const intensity = resolveSessionIntensity({
    session,
    userAge: userData?.age,
  });
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
    typeMultiplier,
    epocFactor,
    durationAdjustment,
    carryoverWindowMinutes,
  });
};
