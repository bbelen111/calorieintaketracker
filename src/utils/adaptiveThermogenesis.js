import { normalizeDateKey } from './weight.js';

const GOAL_CUT_KEYS = new Set(['cutting', 'aggressive_cut']);
const GOAL_SURPLUS_KEYS = new Set(['bulking', 'aggressive_bulk']);

const CRUDE_CUT_STAGES = [
  { minDays: 21, kcal: -50 },
  { minDays: 35, kcal: -100 },
  { minDays: 49, kcal: -150 },
  { minDays: 63, kcal: -200 },
  { minDays: 84, kcal: -250 },
];

const CRUDE_SURPLUS_STAGES = [
  { minDays: 42, kcal: 25 },
  { minDays: 70, kcal: 50 },
  { minDays: 98, kcal: 75 },
];

const SMART_WINDOW_DAYS = 28;
const SMART_MIN_VALID_DAYS = 14;
const SMART_MIN_WEIGHT_ENTRIES = 4;
const SMART_NOISE_FLOOR_KG = 0.15;
const KCAL_PER_KG = 7700;
const MAX_CORRECTION_KCAL = 300;
const MIN_CORRECTION_KCAL = -300;

const clampCorrection = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(MIN_CORRECTION_KCAL, Math.min(MAX_CORRECTION_KCAL, numeric));
};

const normalizeAdaptiveMode = (value) => {
  const normalized = String(value ?? '').trim();
  if (normalized === 'smart') {
    return 'smart';
  }
  if (normalized === 'crude') {
    return 'crude';
  }
  return 'off';
};

const toDateFromDateKey = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildWindowDateKeys = (dateKey, windowDays) => {
  const endDate = toDateFromDateKey(dateKey);
  if (!endDate) {
    return [];
  }

  const keys = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(endDate);
    day.setUTCDate(day.getUTCDate() - offset);
    const dayKey = toDateKey(day);
    if (dayKey) {
      keys.push(dayKey);
    }
  }

  return keys;
};

const resolveCrudeStage = (stages, goalDurationDays) => {
  let active = null;

  stages.forEach((stage) => {
    if (goalDurationDays >= stage.minDays) {
      active = stage;
    }
  });

  return active;
};

const computeWeightSlopeKgPerDay = (weightEntries = []) => {
  const points = weightEntries
    .map((entry) => {
      const date = toDateFromDateKey(entry?.date);
      const weight = Number(entry?.weight);
      if (!date || !Number.isFinite(weight)) {
        return null;
      }

      return {
        x: date.getTime(),
        y: weight,
      };
    })
    .filter(Boolean);

  const n = points.length;
  if (n < 2) {
    return null;
  }

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;

  const numerator = points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0
  );
  const denominator = points.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0
  );

  if (denominator === 0) {
    return null;
  }

  const MS_PER_DAY = 86_400_000;
  return (numerator / denominator) * MS_PER_DAY;
};

const getSmartWindowRecords = ({ dailySnapshots, windowDateKeys }) =>
  windowDateKeys.reduce((records, key) => {
    const snapshot = dailySnapshots?.[key];
    if (!snapshot || typeof snapshot !== 'object') {
      return records;
    }

    const intake = Number(snapshot.intake);
    const baselineTdee = Number(snapshot.baselineTdee ?? snapshot.tdee);
    if (
      !Number.isFinite(intake) ||
      intake < 0 ||
      !Number.isFinite(baselineTdee)
    ) {
      return records;
    }

    records.push({
      date: key,
      intake,
      baselineTdee,
      energyBalance: intake - baselineTdee,
    });
    return records;
  }, []);

const computeSmartCorrection = ({
  dateKey,
  dailySnapshots,
  weightEntries,
  selectedGoal,
}) => {
  const windowDateKeys = buildWindowDateKeys(dateKey, SMART_WINDOW_DAYS);
  if (windowDateKeys.length === 0) {
    return {
      correction: 0,
      active: false,
      insufficientData: true,
      confidence: 0,
      signal: null,
      details: {
        reason: 'invalid-date',
      },
    };
  }

  const windowStart = windowDateKeys[0];
  const windowEnd = windowDateKeys[windowDateKeys.length - 1];

  const records = getSmartWindowRecords({
    dailySnapshots,
    windowDateKeys,
  });

  if (records.length < SMART_MIN_VALID_DAYS) {
    return {
      correction: 0,
      active: false,
      insufficientData: true,
      confidence: 0,
      signal: null,
      details: {
        reason: 'insufficient-intake-days',
        validDays: records.length,
      },
    };
  }

  const windowWeightEntries = (
    Array.isArray(weightEntries) ? weightEntries : []
  ).filter((entry) => {
    const normalized = normalizeDateKey(entry?.date);
    return normalized && normalized >= windowStart && normalized <= windowEnd;
  });

  if (windowWeightEntries.length < SMART_MIN_WEIGHT_ENTRIES) {
    return {
      correction: 0,
      active: false,
      insufficientData: true,
      confidence: 0,
      signal: null,
      details: {
        reason: 'insufficient-weight-entries',
        weightEntriesUsed: windowWeightEntries.length,
      },
    };
  }

  const cumulativeEnergyBalance = records.reduce(
    (sum, record) => sum + record.energyBalance,
    0
  );
  const expectedWeightDeltaKg = cumulativeEnergyBalance / KCAL_PER_KG;
  const observedSlopeKgPerDay = computeWeightSlopeKgPerDay(windowWeightEntries);

  if (!Number.isFinite(observedSlopeKgPerDay)) {
    return {
      correction: 0,
      active: false,
      insufficientData: true,
      confidence: 0,
      signal: null,
      details: {
        reason: 'weight-slope-unavailable',
      },
    };
  }

  const observedWeightDeltaKg = observedSlopeKgPerDay * SMART_WINDOW_DAYS;
  const divergenceKg = observedWeightDeltaKg - expectedWeightDeltaKg;
  const divergenceKcalPerDay = (divergenceKg * KCAL_PER_KG) / SMART_WINDOW_DAYS;
  const suppressedSignal =
    Math.abs(divergenceKg) < SMART_NOISE_FLOOR_KG ? 0 : divergenceKcalPerDay;
  const rawCorrection = clampCorrection(-suppressedSignal);

  const loggingCompleteness = records.length / SMART_WINDOW_DAYS;
  const weightDensity = Math.min(windowWeightEntries.length / 8, 1);
  const confidence = Math.min(
    1,
    loggingCompleteness * 0.65 + weightDensity * 0.35
  );

  return {
    correction: Math.round(rawCorrection),
    active: Math.abs(rawCorrection) >= 10,
    insufficientData: false,
    confidence: Math.round(confidence * 100) / 100,
    signal: {
      expectedWeightDeltaKg: Math.round(expectedWeightDeltaKg * 100) / 100,
      observedWeightDeltaKg: Math.round(observedWeightDeltaKg * 100) / 100,
      divergenceKg: Math.round(divergenceKg * 100) / 100,
      rawKcalPerDay: Math.round(divergenceKcalPerDay),
      appliedKcalPerDay: Math.round(suppressedSignal),
      noiseSuppressed: Math.abs(divergenceKg) < SMART_NOISE_FLOOR_KG,
      validDays: records.length,
      weightEntriesUsed: windowWeightEntries.length,
    },
    details: {
      windowStart,
      windowEnd,
      cumulativeEnergyBalance: Math.round(cumulativeEnergyBalance),
      expectedRateKgPerWeek:
        Math.round((expectedWeightDeltaKg / 4) * 100) / 100,
      observedRateKgPerWeek: Math.round(observedSlopeKgPerDay * 700) / 100,
      goalType: GOAL_CUT_KEYS.has(selectedGoal)
        ? 'cut'
        : GOAL_SURPLUS_KEYS.has(selectedGoal)
          ? 'surplus'
          : 'maintenance',
    },
  };
};

export const resolveAdaptiveThermogenesisMode = ({
  userData,
  adaptiveThermogenesisContext,
}) => {
  const contextMode = normalizeAdaptiveMode(adaptiveThermogenesisContext?.mode);
  if (contextMode !== 'off') {
    return contextMode;
  }

  const enabled =
    adaptiveThermogenesisContext?.enabled ??
    Boolean(userData?.adaptiveThermogenesisEnabled);

  if (!enabled) {
    return 'off';
  }

  return userData?.adaptiveThermogenesisSmartMode ? 'smart' : 'crude';
};

export const computeAdaptiveThermogenesis = ({
  mode,
  selectedGoal,
  goalDurationDays,
  goalChangedAt,
  dateKey,
  dailySnapshots,
  weightEntries,
}) => {
  const normalizedMode = normalizeAdaptiveMode(mode);

  if (normalizedMode === 'off') {
    return {
      mode: 'off',
      correction: 0,
      active: false,
      insufficientData: false,
      confidence: 0,
      signal: null,
      details: null,
    };
  }

  const isCut = GOAL_CUT_KEYS.has(selectedGoal);
  const isSurplus = GOAL_SURPLUS_KEYS.has(selectedGoal);
  if (!isCut && !isSurplus) {
    return {
      mode: normalizedMode,
      correction: 0,
      active: false,
      insufficientData: false,
      confidence: 0,
      signal: null,
      details: {
        reason: 'maintenance-goal',
      },
    };
  }

  if (normalizedMode === 'crude') {
    const explicitGoalDurationDays = Number(goalDurationDays);
    const changedAt = Number(goalChangedAt);
    const derivedGoalDurationDays =
      Number.isFinite(changedAt) && changedAt > 0
        ? Math.max(0, Math.floor((Date.now() - changedAt) / 86_400_000))
        : 0;
    const resolvedGoalDurationDays = Number.isFinite(explicitGoalDurationDays)
      ? Math.max(0, Math.floor(explicitGoalDurationDays))
      : derivedGoalDurationDays;

    const stage = resolveCrudeStage(
      isCut ? CRUDE_CUT_STAGES : CRUDE_SURPLUS_STAGES,
      resolvedGoalDurationDays
    );

    const correction = clampCorrection(stage?.kcal ?? 0);
    return {
      mode: 'crude',
      correction,
      active: Math.abs(correction) > 0,
      insufficientData: false,
      confidence: stage ? 1 : 0,
      signal: null,
      details: {
        goalType: isCut ? 'cut' : 'surplus',
        goalDurationDays: resolvedGoalDurationDays,
        stage: stage ?? null,
      },
    };
  }

  return {
    mode: 'smart',
    ...computeSmartCorrection({
      dateKey,
      dailySnapshots,
      weightEntries,
      selectedGoal,
    }),
  };
};
