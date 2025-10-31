const DEFAULT_RESULT = { min: 0, max: null, operator: 'exact' };

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

export const calculateCaloriesFromSteps = (
  stepCount,
  { weight, height, gender }
) => {
  if (!stepCount || stepCount <= 0) {
    return 0;
  }

  const weightKg = weight > 0 ? weight : 70;
  const heightCm = height > 0 ? height : 175;
  const heightMeters = heightCm / 100;
  const strideLengthMeters =
    heightMeters > 0
      ? heightMeters * (gender === 'female' ? 0.413 : 0.415)
      : 0.75;
  const effectiveStride = strideLengthMeters > 0 ? strideLengthMeters : 0.75;
  const stepsPerMile = 1609.34 / effectiveStride;
  const distanceMiles = stepCount / stepsPerMile;
  const weightLbs = weightKg * 2.20462;
  const caloriesPerMile = 0.57 * weightLbs;

  return distanceMiles * caloriesPerMile;
};

export const getStepDetails = (stepRange, userData) => {
  const parsedRange = parseStepRange(stepRange);
  const estimatedSteps = estimateStepsFromRange(parsedRange);
  const calories = Math.round(
    calculateCaloriesFromSteps(estimatedSteps, userData)
  );

  return {
    parsedRange,
    estimatedSteps,
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
