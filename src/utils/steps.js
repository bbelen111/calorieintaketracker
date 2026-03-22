const DEFAULT_RESULT = { min: 0, max: null, operator: 'exact' };
const INTENSITY_CADENCE_MULTIPLIER = {
  light: 0.9,
  moderate: 1,
  vigorous: 1.1,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const resolveCadenceFromCardioType = (cardioType) => {
  const explicitCadence = Number(cardioType?.cadence);
  if (Number.isFinite(explicitCadence) && explicitCadence > 0) {
    return Math.round(explicitCadence);
  }

  // Fallback for custom types that may define MET but not cadence.
  const moderateMet = Number(cardioType?.met?.moderate);
  if (!Number.isFinite(moderateMet) || moderateMet <= 0) {
    return 0;
  }

  return Math.round(clamp(80 + moderateMet * 9, 0, 220));
};

const getHeartRateCadenceMultiplier = (heartRate) => {
  const numeric = Number(heartRate);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }

  // Baseline around 140 bpm, bounded to avoid unrealistic spikes.
  return clamp(numeric / 140, 0.85, 1.25);
};

export const isStepBasedCardioType = (typeKey, cardioType) => {
  if (!typeKey || !cardioType || typeof cardioType !== 'object') {
    return false;
  }
  return Boolean(cardioType.ambulatory);
};

export const estimateSessionStepsFromCardio = (session, cardioTypes = {}) => {
  if (!session || typeof session !== 'object') {
    return 0;
  }

  const cardioType = cardioTypes?.[session.type] ?? null;
  if (!isStepBasedCardioType(session.type, cardioType)) {
    return 0;
  }

  const durationMinutes = Number(session.duration);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 0;
  }

  const baseCadence = resolveCadenceFromCardioType(cardioType);
  if (!Number.isFinite(baseCadence) || baseCadence <= 0) {
    return 0;
  }
  const intensityMultiplier =
    INTENSITY_CADENCE_MULTIPLIER[session.intensity ?? 'moderate'] ?? 1;

  const heartRateMultiplier =
    session.effortType === 'heartRate'
      ? getHeartRateCadenceMultiplier(session.averageHeartRate)
      : 1;

  const cadence = baseCadence * intensityMultiplier * heartRateMultiplier;
  return Math.round(Math.max(0, cadence * durationMinutes));
};

export const getStepOverlapFromCardioSessions = ({
  estimatedSteps,
  cardioSessions,
  cardioTypes,
}) => {
  const safeEstimatedSteps = Number.isFinite(estimatedSteps)
    ? Math.max(0, Math.round(estimatedSteps))
    : 0;
  const sessions = Array.isArray(cardioSessions) ? cardioSessions : [];

  let rawDeductedSteps = 0;
  const sessionDetails = [];

  sessions.forEach((session) => {
    const cardioType = cardioTypes?.[session?.type] ?? null;
    const isStepBased = isStepBasedCardioType(session?.type, cardioType);
    if (!isStepBased) {
      return;
    }

    const enabled = session?.stepOverlapEnabled ?? true;
    const estimatedSessionSteps = estimateSessionStepsFromCardio(
      session,
      cardioTypes
    );

    sessionDetails.push({
      id: session?.id ?? null,
      type: session?.type ?? null,
      label: cardioType?.label ?? session?.type ?? 'Cardio',
      durationMinutes: Number(session?.duration) || 0,
      effortType: session?.effortType ?? 'intensity',
      enabled,
      estimatedSessionSteps,
    });

    if (enabled) {
      rawDeductedSteps += estimatedSessionSteps;
    }
  });

  const deductedSteps = Math.min(safeEstimatedSteps, rawDeductedSteps);
  const remainingEstimatedSteps = Math.max(
    0,
    safeEstimatedSteps - deductedSteps
  );

  return {
    originalEstimatedSteps: safeEstimatedSteps,
    rawDeductedSteps,
    deductedSteps,
    remainingEstimatedSteps,
    stepOverlapSessionsCount: sessionDetails.filter((detail) => detail.enabled)
      .length,
    stepOverlapApplicableSessionsCount: sessionDetails.length,
    sessionDetails,
  };
};

export const parseStepRange = (rawRange) => {
  if (!rawRange) {
    return { ...DEFAULT_RESULT };
  }

  const normalized = rawRange.toString().trim().toLowerCase();
  if (!normalized) {
    return { ...DEFAULT_RESULT };
  }

  const operator = normalized.includes('<')
    ? 'lt'
    : normalized.includes('>') || normalized.includes('+')
      ? 'gt'
      : 'range';

  const numericParts = normalized
    .replace(/[<>+\s]/g, '')
    .split(/(?:-|–|—|to)/)
    .map((part) => part.trim())
    .filter(Boolean);

  const parseValue = (value) => {
    if (!value) {
      return null;
    }
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (!match) {
      return null;
    }
    let numeric = parseFloat(match[1]);
    if (value.includes('k')) {
      numeric *= 1000;
    }
    return Math.round(numeric);
  };

  if (operator === 'lt') {
    const max = parseValue(numericParts[numericParts.length - 1]);
    return { min: 0, max: max ?? null, operator };
  }

  if (operator === 'gt') {
    const min = parseValue(numericParts[0]);
    return { min: min ?? 0, max: null, operator };
  }

  if (numericParts.length >= 2) {
    const min = parseValue(numericParts[0]);
    const max = parseValue(numericParts[1]);
    if (min != null && max != null) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
        operator: 'range',
      };
    }
  }

  const value = parseValue(numericParts[0]);
  return {
    min: value ?? 0,
    max: value ?? null,
    operator: 'exact',
  };
};

export const estimateStepsFromRange = (rangeDetails) => {
  if (!rangeDetails) {
    return 0;
  }

  const { min, max, operator } = rangeDetails;

  if (operator === 'lt') {
    const effectiveMax = max ?? 10000;
    return Math.round(effectiveMax * 0.75);
  }

  if (operator === 'gt') {
    const baseline = min ?? 20000;
    return Math.round(baseline * 1.15);
  }

  if (min != null && max != null) {
    return Math.round((min + max) / 2);
  }

  if (min != null) {
    return Math.round(min);
  }

  if (max != null) {
    return Math.round(max * 0.75);
  }

  return 0;
};

export const getStepCaloriesDetails = (
  stepCount,
  { weight, height, gender }
) => {
  const safeSteps = Number.isFinite(stepCount) ? stepCount : 0;
  const weightKg = weight > 0 ? weight : 70;
  const heightCm = height > 0 ? height : 175;
  const heightMeters = heightCm / 100;
  const strideLengthMeters =
    heightMeters > 0
      ? heightMeters * (gender === 'female' ? 0.413 : 0.415)
      : 0.75;
  const effectiveStride = strideLengthMeters > 0 ? strideLengthMeters : 0.75;
  const stepsPerMile = 1609.34 / effectiveStride;
  const distanceMiles = stepsPerMile > 0 ? safeSteps / stepsPerMile : 0;
  const distanceKm = distanceMiles * 1.60934;
  const weightLbs = weightKg * 2.20462;
  const caloriesPerMile = 0.57 * weightLbs;
  const calories = distanceMiles * caloriesPerMile;

  return {
    stepCount: safeSteps,
    weightKg,
    heightCm,
    gender,
    strideLengthMeters,
    stepsPerMile,
    distanceMiles,
    distanceKm,
    weightLbs,
    caloriesPerMile,
    calories,
  };
};

export const calculateCaloriesFromSteps = (
  stepCount,
  { weight, height, gender }
) => {
  if (!stepCount || stepCount <= 0) {
    return 0;
  }

  const details = getStepCaloriesDetails(stepCount, { weight, height, gender });
  return details.calories;
};

export const getStepDetails = (stepRange, userData) => {
  const parsedRange = parseStepRange(stepRange);
  const estimatedSteps = estimateStepsFromRange(parsedRange);
  const calorieDetails = getStepCaloriesDetails(estimatedSteps, userData);
  const calories = Math.round(calorieDetails.calories);

  return {
    parsedRange,
    estimatedSteps,
    ...calorieDetails,
    calories,
  };
};

export const getStepRangeSortValue = (range) => {
  const parsed = parseStepRange(range);
  if (parsed.operator === 'lt') {
    return (parsed.max ?? 0) - 1000;
  }
  if (parsed.operator === 'gt') {
    return (parsed.min ?? 0) + 1000;
  }
  if (parsed.min != null) {
    return parsed.min;
  }
  if (parsed.max != null) {
    return parsed.max;
  }
  return 0;
};
