import { normalizeSessionHeartRate } from '../../constants/health/heartRate.js';

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
  // Out-of-range averages are typos (see constants/health/heartRate.js); they
  // stay neutral instead of pinning the cadence to its 1.25 ceiling.
  const safeHeartRate = normalizeSessionHeartRate(heartRate);
  if (safeHeartRate == null) {
    return 1;
  }

  // Baseline around 140 bpm, bounded to avoid unrealistic spikes.
  return clamp(safeHeartRate / 140, 0.85, 1.25);
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
  const isHeartRateSession = session.effortType === 'heartRate';
  // A heart-rate session keeps whatever `intensity` the form held before the
  // user switched to HR; that value is stale. HR alone sets the cadence, so the
  // intensity factor stays neutral instead of being stacked on top of it.
  const intensityMultiplier = isHeartRateSession
    ? 1
    : (INTENSITY_CADENCE_MULTIPLIER[session.intensity ?? 'moderate'] ?? 1);

  const heartRateMultiplier = isHeartRateSession
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

export const DEFAULT_STEP_RANGES = [
  '<10k',
  '10k',
  '12k',
  '14k',
  '16k',
  '18k',
  '20k',
  '>20k',
];

export const STEP_RANGE_MIN_STEPS = 1000;
export const STEP_RANGE_MAX_STEPS = 50000;
export const STEP_RANGE_WHEEL_INCREMENT = 500;
export const STEP_RANGE_NUDGE_INCREMENT = 1000;

export const STEP_RANGE_PRESETS = [
  {
    id: 'standard',
    label: 'Standard (2k)',
    description: 'Default 2,000-step ladder from under 10k to over 20k',
    ranges: DEFAULT_STEP_RANGES,
  },
  {
    id: 'everyday',
    label: 'Everyday',
    description: 'Lower to moderate daily movement',
    ranges: ['<6k', '6k', '8k', '10k', '12k', '15k', '>15k'],
  },
  {
    id: 'banded',
    label: 'Banded',
    description: 'Grouped step brackets estimated at each midpoint',
    ranges: ['<6k', '6k-8k', '8k-10k', '10k-12k', '12k-15k', '>15k'],
  },
  {
    id: 'high_volume',
    label: 'High Volume',
    description: 'Higher step milestones for active or cutting phases',
    ranges: ['<10k', '10k', '12.5k', '15k', '17.5k', '20k', '25k', '>25k'],
  },
];

export const formatCompactStepCount = (steps) => {
  const numeric = Math.round(Number(steps));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '';
  }

  if (numeric < 1000) {
    return String(numeric);
  }

  const thousands = numeric / 1000;
  const formatted = Number.isInteger(thousands)
    ? String(thousands)
    : thousands.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted}k`;
};

export const buildStepRangeLabel = ({
  mode = 'exact',
  primarySteps,
  secondarySteps,
}) => {
  const primary = Math.round(Number(primarySteps));
  if (!Number.isFinite(primary) || primary <= 0) {
    return null;
  }

  if (mode === 'under') {
    return `<${formatCompactStepCount(primary)}`;
  }

  if (mode === 'over') {
    return `>${formatCompactStepCount(primary)}`;
  }

  if (mode === 'range') {
    const secondary = Math.round(Number(secondarySteps));
    if (!Number.isFinite(secondary) || secondary <= primary) {
      return null;
    }
    return `${formatCompactStepCount(primary)}-${formatCompactStepCount(secondary)}`;
  }

  return formatCompactStepCount(primary);
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

export const compareStepRanges = (a, b) => {
  const sortDiff = getStepRangeSortValue(a) - getStepRangeSortValue(b);
  if (sortDiff !== 0) {
    return sortDiff;
  }

  const estA = estimateStepsFromRange(parseStepRange(a));
  const estB = estimateStepsFromRange(parseStepRange(b));
  if (estA !== estB) {
    return estA - estB;
  }

  return String(a ?? '').localeCompare(String(b ?? ''));
};

export const sortAndDedupeStepRanges = (ranges) => {
  if (!Array.isArray(ranges)) {
    return [];
  }

  const seen = new Set();
  const unique = [];

  ranges.forEach((raw) => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  });

  return unique.sort(compareStepRanges);
};

export const areStepRangesEquivalent = (rangeA, rangeB) => {
  const trimmedA = String(rangeA ?? '').trim();
  const trimmedB = String(rangeB ?? '').trim();
  if (!trimmedA || !trimmedB) {
    return false;
  }
  if (trimmedA === trimmedB) {
    return true;
  }

  const parsedA = parseStepRange(trimmedA);
  const parsedB = parseStepRange(trimmedB);
  return (
    parsedA.operator === parsedB.operator &&
    parsedA.min === parsedB.min &&
    parsedA.max === parsedB.max
  );
};

export const findMatchingStepRange = (ranges, candidateRange) => {
  if (!Array.isArray(ranges) || !candidateRange) {
    return null;
  }

  return (
    ranges.find((existing) =>
      areStepRangesEquivalent(existing, candidateRange)
    ) ?? null
  );
};

export const findActiveStepRangePreset = (ranges) => {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return null;
  }

  const match = STEP_RANGE_PRESETS.find(
    (preset) =>
      preset.ranges.length === ranges.length &&
      preset.ranges.every((range, index) => range === ranges[index])
  );

  return match?.id ?? null;
};

const SUGGESTED_STEP_COUNTS = [
  15000, 8000, 25000, 6000, 10000, 12000, 5000, 22000, 7500, 12500, 30000,
];

export const getNextSuggestedStepCount = (ranges) => {
  const safeRanges = Array.isArray(ranges) ? ranges : [];

  for (const steps of SUGGESTED_STEP_COUNTS) {
    const label = buildStepRangeLabel({ mode: 'exact', primarySteps: steps });
    if (label && !findMatchingStepRange(safeRanges, label)) {
      return steps;
    }
  }

  return 15000;
};

export const isStepGoalMatchedByRange = (range, stepGoal, allRanges = []) => {
  const numericGoal = Number(stepGoal);
  if (!Number.isFinite(numericGoal) || numericGoal <= 0 || !range) {
    return false;
  }

  const parsed = parseStepRange(range);
  if (parsed.operator === 'exact') {
    return parsed.min === numericGoal;
  }

  if (parsed.operator !== 'range' || parsed.min == null || parsed.max == null) {
    return false;
  }

  const safeAll = Array.isArray(allRanges) ? allRanges : [];
  const hasExactMatch = safeAll.some((item) => {
    const parsedItem = parseStepRange(item);
    return parsedItem.operator === 'exact' && parsedItem.min === numericGoal;
  });
  if (hasExactMatch) {
    return false;
  }

  if (numericGoal >= parsed.min && numericGoal < parsed.max) {
    return true;
  }

  const hasHalfOpenMatch = safeAll.some((item) => {
    const parsedItem = parseStepRange(item);
    return (
      parsedItem.operator === 'range' &&
      parsedItem.min != null &&
      parsedItem.max != null &&
      numericGoal >= parsedItem.min &&
      numericGoal < parsedItem.max
    );
  });

  return (
    !hasHalfOpenMatch && numericGoal >= parsed.min && numericGoal <= parsed.max
  );
};

export const formatStepRangeEstimate = (parsedRange, estimatedSteps) => {
  const safeSteps = Math.round(Number(estimatedSteps));
  if (!Number.isFinite(safeSteps) || safeSteps <= 0) {
    return '—';
  }

  if (parsedRange?.operator === 'exact') {
    return `${safeSteps.toLocaleString()} steps`;
  }

  return `~${safeSteps.toLocaleString()} steps`;
};

/**
 * Resolve which range in `ranges` should become the active step-range target
 * when the list changes (e.g. switching presets). Preserves exact or
 * semantically equivalent matches, then prefers a containing bracket, and
 * finally picks the range with the nearest estimated step count.
 */
export const resolveClosestStepRange = (ranges, targetRange) => {
  const safeRanges = Array.isArray(ranges)
    ? ranges.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (safeRanges.length === 0) {
    return null;
  }

  const trimmedTarget = String(targetRange ?? '').trim();
  if (!trimmedTarget) {
    return safeRanges[0];
  }

  if (safeRanges.includes(trimmedTarget)) {
    return trimmedTarget;
  }

  const equivalent = findMatchingStepRange(safeRanges, trimmedTarget);
  if (equivalent) {
    return equivalent;
  }

  const targetSteps = estimateStepsFromRange(parseStepRange(trimmedTarget));

  const halfOpenBracket = safeRanges.find((candidate) => {
    const parsed = parseStepRange(candidate);
    return (
      parsed.operator === 'range' &&
      parsed.min != null &&
      parsed.max != null &&
      targetSteps >= parsed.min &&
      targetSteps < parsed.max
    );
  });
  if (halfOpenBracket) {
    return halfOpenBracket;
  }

  const closedBracket = safeRanges.find((candidate) => {
    const parsed = parseStepRange(candidate);
    return (
      parsed.operator === 'range' &&
      parsed.min != null &&
      parsed.max != null &&
      targetSteps >= parsed.min &&
      targetSteps <= parsed.max
    );
  });
  if (closedBracket) {
    return closedBracket;
  }

  let closest = safeRanges[0];
  let smallestDiff = Math.abs(
    estimateStepsFromRange(parseStepRange(closest)) - targetSteps
  );

  for (let i = 1; i < safeRanges.length; i += 1) {
    const candidate = safeRanges[i];
    const diff = Math.abs(
      estimateStepsFromRange(parseStepRange(candidate)) - targetSteps
    );
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = candidate;
    }
  }

  return closest;
};
