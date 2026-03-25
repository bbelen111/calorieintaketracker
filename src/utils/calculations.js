import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../constants/activityPresets.js';
import {
  getStepCaloriesDetails,
  getStepDetails,
  getStepOverlapFromCardioSessions,
} from './steps.js';
import {
  computeAdaptiveThermogenesis,
  resolveAdaptiveThermogenesisMode,
} from './adaptiveThermogenesis.js';
import {
  resolveCardioSessionEpoc,
  resolveTrainingSessionEpoc,
} from './epoc.js';
import { getCarryoverForDateFromSessions } from './sessionCarryover.js';

const HEART_RATE_COEFFICIENTS = {
  male: {
    base: -55.0969,
    heartRate: 0.6309,
    weight: 0.1988,
    age: 0.2017,
  },
  female: {
    base: -20.4022,
    heartRate: 0.4472,
    weight: -0.1263,
    age: 0.074,
  },
};

export const TEF_MULTIPLIER_OFFSET = 0.1;
export const TEF_PROTEIN_RATE = 0.25;
export const TEF_CARB_RATE = 0.08;
export const TEF_FAT_RATE = 0.02;

const PROTEIN_CALORIES_PER_GRAM = 4;
const CARB_CALORIES_PER_GRAM = 4;
const FAT_CALORIES_PER_GRAM = 9;
const DEFAULT_CALCULATION_PROFILE = {
  age: 21,
  weight: 70,
  height: 170,
  gender: 'male',
};
const MIN_HEART_RATE_BPM = 60;
const MAX_HEART_RATE_BPM = 220;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeSessionDateKey = (value) => {
  if (value == null) {
    return null;
  }

  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!DATE_KEY_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
};

const getSessionsForDate = (sessions, dateKey) => {
  const normalizedDateKey =
    normalizeSessionDateKey(dateKey) ?? getTodayDateKey();
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions.filter((session) => {
    const sessionDate = normalizeSessionDateKey(session?.date);
    return sessionDate === normalizedDateKey;
  });
};

const normalizeNonNegativeNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
};

const roundToTenth = (value) => Math.round(value * 10) / 10;

const normalizePositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
};

const normalizeCalculationProfile = (userData = {}) => ({
  age: normalizePositiveNumber(userData?.age, DEFAULT_CALCULATION_PROFILE.age),
  weight: normalizePositiveNumber(
    userData?.weight,
    DEFAULT_CALCULATION_PROFILE.weight
  ),
  height: normalizePositiveNumber(
    userData?.height,
    DEFAULT_CALCULATION_PROFILE.height
  ),
  gender: userData?.gender === 'female' ? 'female' : 'male',
  bodyFatEntries: Array.isArray(userData?.bodyFatEntries)
    ? userData.bodyFatEntries
    : [],
  bodyFatTrackingEnabled: Boolean(userData?.bodyFatTrackingEnabled),
});

const normalizeHeartRate = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  if (rounded < MIN_HEART_RATE_BPM || rounded > MAX_HEART_RATE_BPM) {
    return null;
  }
  return rounded;
};

const resolveTefMacroDetails = ({ proteinGrams, carbsGrams, fatsGrams }) => {
  const safeProteinGrams = normalizeNonNegativeNumber(proteinGrams);
  const safeCarbsGrams = normalizeNonNegativeNumber(carbsGrams);
  const safeFatsGrams = normalizeNonNegativeNumber(fatsGrams);
  const proteinCalories = safeProteinGrams * PROTEIN_CALORIES_PER_GRAM;
  const carbCalories = safeCarbsGrams * CARB_CALORIES_PER_GRAM;
  const fatCalories = safeFatsGrams * FAT_CALORIES_PER_GRAM;
  const proteinTefCalories = proteinCalories * TEF_PROTEIN_RATE;
  const carbTefCalories = carbCalories * TEF_CARB_RATE;
  const fatTefCalories = fatCalories * TEF_FAT_RATE;
  const rawTotalCalories =
    proteinTefCalories + carbTefCalories + fatTefCalories;

  return {
    proteinGrams: roundToTenth(safeProteinGrams),
    carbsGrams: roundToTenth(safeCarbsGrams),
    fatsGrams: roundToTenth(safeFatsGrams),
    proteinCalories: roundToTenth(proteinCalories),
    carbCalories: roundToTenth(carbCalories),
    fatCalories: roundToTenth(fatCalories),
    proteinTefCalories: roundToTenth(proteinTefCalories),
    carbTefCalories: roundToTenth(carbTefCalories),
    fatTefCalories: roundToTenth(fatTefCalories),
    rawTotalCalories: roundToTenth(rawTotalCalories),
    totalCalories: Math.round(rawTotalCalories),
  };
};

const resolveTargetMacroDetails = ({ targetCalories, weightKg }) => {
  const safeTargetCalories = normalizeNonNegativeNumber(targetCalories);
  const safeWeightKg = normalizeNonNegativeNumber(weightKg);
  const proteinGrams = safeWeightKg * 2;
  const fatsGrams = safeWeightKg * 0.8;
  const proteinCalories = proteinGrams * PROTEIN_CALORIES_PER_GRAM;
  const fatCalories = fatsGrams * FAT_CALORIES_PER_GRAM;
  const remainingCaloriesForCarbs = Math.max(
    0,
    safeTargetCalories - proteinCalories - fatCalories
  );
  const carbsGrams = remainingCaloriesForCarbs / CARB_CALORIES_PER_GRAM;

  return {
    targetCalories: Math.round(safeTargetCalories),
    weightKg: roundToTenth(safeWeightKg),
    proteinGrams: roundToTenth(proteinGrams),
    carbsGrams: roundToTenth(carbsGrams),
    fatsGrams: roundToTenth(fatsGrams),
    remainingCaloriesForCarbs: roundToTenth(remainingCaloriesForCarbs),
  };
};

export const calculateTefFromMacros = ({
  proteinGrams,
  carbsGrams,
  fatsGrams,
}) =>
  resolveTefMacroDetails({
    proteinGrams,
    carbsGrams,
    fatsGrams,
  }).totalCalories;

export const calculateTargetTef = ({ targetCalories, weightKg }) => {
  const macroTargets = resolveTargetMacroDetails({ targetCalories, weightKg });
  return calculateTefFromMacros(macroTargets);
};

export const calculateDynamicTef = ({ totals }) =>
  calculateTefFromMacros({
    proteinGrams: totals?.proteinGrams ?? totals?.protein ?? 0,
    carbsGrams: totals?.carbsGrams ?? totals?.carbs ?? 0,
    fatsGrams: totals?.fatsGrams ?? totals?.fats ?? 0,
  });

const resolveSmartTef = ({ tefContext, userData, targetCaloriesSeed }) => {
  const smartTefEnabled =
    tefContext?.enabled ?? Boolean(userData?.smartTefEnabled);
  const requestedMode = tefContext?.mode ?? 'off';
  const tefMode = smartTefEnabled ? requestedMode : 'off';

  if (tefMode === 'dynamic') {
    const dynamicDetails = resolveTefMacroDetails({
      proteinGrams:
        tefContext?.totals?.proteinGrams ?? tefContext?.totals?.protein,
      carbsGrams: tefContext?.totals?.carbsGrams ?? tefContext?.totals?.carbs,
      fatsGrams: tefContext?.totals?.fatsGrams ?? tefContext?.totals?.fats,
    });

    return {
      tefMode,
      smartTefCalories: dynamicDetails.totalCalories,
      details: {
        ...dynamicDetails,
        source: 'logged-macros',
      },
    };
  }

  if (tefMode === 'target') {
    const explicitTargetCalories = normalizeNonNegativeNumber(
      tefContext?.targetCalories ?? tefContext?.target
    );
    const hasExplicitTargetCalories = explicitTargetCalories > 0;

    const targetCaloriesBase = normalizeNonNegativeNumber(targetCaloriesSeed);
    let resolvedTargetCalories = hasExplicitTargetCalories
      ? explicitTargetCalories
      : targetCaloriesBase;

    // When no explicit target is provided, iteratively seed TEF from the
    // pre-TEF subtotal to avoid a hidden circular dependency.
    if (!hasExplicitTargetCalories) {
      for (let pass = 0; pass < 2; pass += 1) {
        const seededMacroDetails = resolveTargetMacroDetails({
          targetCalories: resolvedTargetCalories,
          weightKg: tefContext?.weightKg ?? userData?.weight,
        });
        const seededTefDetails = resolveTefMacroDetails(seededMacroDetails);
        resolvedTargetCalories =
          targetCaloriesBase + seededTefDetails.totalCalories;
      }
    }

    const targetMacroDetails = resolveTargetMacroDetails({
      targetCalories: resolvedTargetCalories,
      weightKg: tefContext?.weightKg ?? userData?.weight,
    });
    const targetTefDetails = resolveTefMacroDetails(targetMacroDetails);

    return {
      tefMode,
      smartTefCalories: targetTefDetails.totalCalories,
      details: {
        ...targetMacroDetails,
        ...targetTefDetails,
        source: 'target-macros',
        targetCaloriesSource: hasExplicitTargetCalories
          ? 'context'
          : 'subtotal-seeded',
        targetCaloriesSeed: Math.round(targetCaloriesBase),
        refinementPasses: hasExplicitTargetCalories ? 0 : 2,
      },
    };
  }

  return {
    tefMode: 'off',
    smartTefCalories: 0,
    details: null,
  };
};

const calculateCaloriesPerMinuteFromHeartRate = ({
  heartRate,
  weightKg,
  ageYears,
  gender,
}) => {
  const safeHeartRate = normalizeHeartRate(heartRate);
  if (safeHeartRate == null) {
    return 0;
  }

  const safeWeight = normalizeNonNegativeNumber(weightKg);
  const safeAge = normalizeNonNegativeNumber(ageYears);
  const coefficients =
    HEART_RATE_COEFFICIENTS[gender === 'female' ? 'female' : 'male'];
  const rawCalories =
    coefficients.base +
    coefficients.heartRate * safeHeartRate +
    coefficients.weight * safeWeight +
    coefficients.age * safeAge;

  return Math.max(0, rawCalories / 4.184);
};

const resolveBmrDetails = ({
  age,
  weight,
  height,
  gender,
  bodyFatEntries,
  bodyFatTrackingEnabled,
}) => {
  const normalizedProfile = normalizeCalculationProfile({
    age,
    weight,
    height,
    gender,
    bodyFatEntries,
    bodyFatTrackingEnabled,
  });

  const details = {
    method: 'mifflin-st-jeor',
    age: normalizedProfile.age,
    weight: normalizedProfile.weight,
    height: normalizedProfile.height,
    gender: normalizedProfile.gender,
    bodyFat: null,
    leanMass: null,
  };

  if (
    normalizedProfile.bodyFatTrackingEnabled &&
    normalizedProfile.bodyFatEntries.length
  ) {
    const latestEntry =
      normalizedProfile.bodyFatEntries[
        normalizedProfile.bodyFatEntries.length - 1
      ];
    const bodyFat = Number(latestEntry?.bodyFat);
    if (Number.isFinite(bodyFat)) {
      const leanMass = normalizedProfile.weight * (1 - bodyFat / 100);
      if (Number.isFinite(leanMass) && leanMass > 0) {
        details.method = 'katch-mcardle';
        details.bodyFat = bodyFat;
        details.leanMass = leanMass;
      }
    }
  }

  return details;
};

export const calculateBMR = ({
  age,
  weight,
  height,
  gender,
  bodyFatEntries,
  bodyFatTrackingEnabled,
}) => {
  const details = resolveBmrDetails({
    age,
    weight,
    height,
    gender,
    bodyFatEntries,
    bodyFatTrackingEnabled,
  });

  if (details.method === 'katch-mcardle' && details.leanMass != null) {
    return Math.round(370 + 21.6 * details.leanMass);
  }

  if (details.gender === 'male') {
    return Math.round(
      10 * details.weight + 6.25 * details.height - 5 * details.age + 5
    );
  }
  return Math.round(
    10 * details.weight + 6.25 * details.height - 5 * details.age - 161
  );
};

export const calculateCardioCalories = (
  cardioSession,
  userData,
  cardioTypes
) => {
  if (!cardioSession) {
    return 0;
  }

  const rawDuration = Number(cardioSession.duration);
  const durationMinutes = Number.isFinite(rawDuration) ? rawDuration : 0;
  if (durationMinutes <= 0) {
    return 0;
  }

  const normalizedProfile = normalizeCalculationProfile(userData);
  const weight = normalizedProfile.weight;
  const age = normalizedProfile.age;
  const gender = normalizedProfile.gender;

  if (cardioSession.effortType === 'heartRate') {
    const heartRate = normalizeHeartRate(cardioSession.averageHeartRate);
    if (heartRate == null) {
      return 0;
    }

    const caloriesPerMinute = calculateCaloriesPerMinuteFromHeartRate({
      heartRate,
      weightKg: weight,
      ageYears: age,
      gender,
    });

    return Math.round(caloriesPerMinute * durationMinutes);
  }

  const cardioType = cardioTypes?.[cardioSession.type];
  if (!cardioType) return 0;
  const intensityKey = cardioSession.intensity ?? 'moderate';
  const met = cardioType.met[intensityKey];
  if (!met) return 0;
  if (!Number.isFinite(weight) || weight <= 0) {
    return 0;
  }
  const hours = durationMinutes / 60;
  return Math.round(met * weight * hours);
};

export const getTotalCardioBurn = (userData, cardioTypes) =>
  getSessionsForDate(userData.cardioSessions, getTodayDateKey()).reduce(
    (total, session) =>
      total + calculateCardioCalories(session, userData, cardioTypes),
    0
  );

export const getTotalCardioBurnForDate = (userData, cardioTypes, dateKey) =>
  getSessionsForDate(userData?.cardioSessions, dateKey).reduce(
    (total, session) =>
      total + calculateCardioCalories(session, userData, cardioTypes),
    0
  );

const TRAINING_INTENSITY_MULTIPLIERS = {
  light: 0.75,
  moderate: 1.0,
  vigorous: 1.25,
};

export const getTrainingCaloriesPerHour = (userData, trainingTypes) => {
  const selectedTrainingType = userData.selectedTrainingType;
  const base = trainingTypes?.[selectedTrainingType]?.caloriesPerHour ?? 0;
  const multiplier =
    TRAINING_INTENSITY_MULTIPLIERS[userData.trainingIntensity ?? 'moderate'] ??
    1.0;
  return base * multiplier;
};

export const getTrainingCalories = (userData, trainingTypes) => {
  const durationHours = normalizeNonNegativeNumber(userData.trainingDuration);
  if (durationHours <= 0) {
    return 0;
  }

  const normalizedProfile = normalizeCalculationProfile(userData);

  if (userData.trainingEffortType === 'heartRate') {
    const heartRate = normalizeHeartRate(userData.trainingHeartRate);
    if (heartRate == null) return 0;
    const durationMinutes = durationHours * 60;
    if (durationMinutes <= 0) return 0;
    const calsPerMin = calculateCaloriesPerMinuteFromHeartRate({
      heartRate,
      weightKg: normalizedProfile.weight,
      ageYears: normalizedProfile.age,
      gender: normalizedProfile.gender,
    });
    return Math.round(calsPerMin * durationMinutes);
  }
  return Math.round(
    durationHours * getTrainingCaloriesPerHour(userData, trainingTypes)
  );
};

export const calculateTrainingSessionCalories = (
  trainingSession,
  userData,
  trainingTypes
) => {
  if (!trainingSession || typeof trainingSession !== 'object') {
    return 0;
  }

  const durationHours = normalizeNonNegativeNumber(
    Number(trainingSession.duration) / 60
  );
  if (durationHours <= 0) {
    return 0;
  }

  const normalizedProfile = normalizeCalculationProfile(userData);
  const effortType = trainingSession.effortType ?? 'intensity';

  if (effortType === 'heartRate') {
    const heartRate = normalizeHeartRate(trainingSession.averageHeartRate);
    if (heartRate == null) {
      return 0;
    }

    const durationMinutes = durationHours * 60;
    const calsPerMin = calculateCaloriesPerMinuteFromHeartRate({
      heartRate,
      weightKg: normalizedProfile.weight,
      ageYears: normalizedProfile.age,
      gender: normalizedProfile.gender,
    });

    return Math.round(calsPerMin * durationMinutes);
  }

  const base = trainingTypes?.[trainingSession.type]?.caloriesPerHour ?? 0;
  const multiplier =
    TRAINING_INTENSITY_MULTIPLIERS[trainingSession.intensity ?? 'moderate'] ??
    1.0;

  return Math.round(durationHours * base * multiplier);
};

export const getTotalTrainingBurnForDate = (userData, trainingTypes, dateKey) =>
  getSessionsForDate(userData?.trainingSessions, dateKey).reduce(
    (total, session) =>
      total +
      calculateTrainingSessionCalories(session, userData, trainingTypes),
    0
  );

export const calculateCalorieBreakdown = ({
  steps,
  isTrainingDay,
  userData,
  bmr,
  cardioTypes,
  trainingTypes,
  tefContext,
  adaptiveThermogenesisContext,
  dateKey,
}) => {
  void isTrainingDay;
  const normalizedProfile = normalizeCalculationProfile(userData);
  const normalizedUserData = {
    ...userData,
    ...normalizedProfile,
  };

  const baseStepDetails = getStepDetails(steps, normalizedUserData);
  const bmrDetails = resolveBmrDetails(normalizedUserData);
  const resolvedDateKey = normalizeSessionDateKey(dateKey) ?? getTodayDateKey();
  const trainingSessions = getSessionsForDate(
    normalizedUserData?.trainingSessions,
    resolvedDateKey
  );
  const trainingDurationMinutes = trainingSessions.reduce((total, session) => {
    const duration = Number(session?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return total;
    }
    return total + duration;
  }, 0);
  const trainingDuration = roundToTenth(trainingDurationMinutes / 60);
  const cardioSessions = getSessionsForDate(
    normalizedUserData?.cardioSessions,
    resolvedDateKey
  );
  const stepOverlap = getStepOverlapFromCardioSessions({
    estimatedSteps: baseStepDetails.estimatedSteps,
    cardioSessions,
    cardioTypes,
  });
  const adjustedStepCalorieDetails = getStepCaloriesDetails(
    stepOverlap.remainingEstimatedSteps,
    normalizedUserData
  );
  const stepDetails = {
    ...baseStepDetails,
    ...adjustedStepCalorieDetails,
    calories: Math.round(adjustedStepCalorieDetails.calories),
    estimatedSteps: stepOverlap.remainingEstimatedSteps,
    originalEstimatedSteps: stepOverlap.originalEstimatedSteps,
    deductedSteps: stepOverlap.deductedSteps,
    rawDeductedSteps: stepOverlap.rawDeductedSteps,
    remainingEstimatedSteps: stepOverlap.remainingEstimatedSteps,
    stepOverlapSessionsCount: stepOverlap.stepOverlapSessionsCount,
    stepOverlapApplicableSessionsCount:
      stepOverlap.stepOverlapApplicableSessionsCount,
    stepOverlapSessions: stepOverlap.sessionDetails,
  };
  const multipliers =
    normalizedUserData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;
  const rawActivityMultiplier = isTrainingDay
    ? (multipliers.training ?? DEFAULT_ACTIVITY_MULTIPLIERS.training)
    : (multipliers.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest);
  const trainingBurn = Math.round(
    getTotalTrainingBurnForDate(
      normalizedUserData,
      trainingTypes,
      resolvedDateKey
    )
  );
  const trainingCaloriesPerHour =
    trainingDuration > 0 ? Math.round(trainingBurn / trainingDuration) : 0;
  const trainingTypeLabel =
    trainingSessions.length === 0
      ? 'No Training'
      : trainingSessions.length === 1
        ? (trainingTypes?.[trainingSessions[0]?.type]?.label ??
          trainingSessions[0]?.type ??
          'Training')
        : `${trainingSessions.length} sessions`;
  const cardioBurn = Math.round(
    getTotalCardioBurnForDate(normalizedUserData, cardioTypes, resolvedDateKey)
  );
  const cardioDetails = cardioSessions
    .map((session) => {
      const rawDuration = Number(session?.duration);
      const durationMinutes = Number.isFinite(rawDuration) ? rawDuration : 0;
      if (durationMinutes <= 0) {
        return null;
      }

      const effortType = session?.effortType ?? 'intensity';
      const calories = calculateCardioCalories(
        session,
        normalizedUserData,
        cardioTypes
      );
      const typeKey = session?.type;
      const cardioType = cardioTypes?.[typeKey];
      const typeLabel = cardioType?.label ?? typeKey ?? 'Cardio';

      if (effortType === 'heartRate') {
        const heartRate = normalizeHeartRate(session?.averageHeartRate);
        const weightKg = normalizedProfile.weight;
        const ageYears = normalizedProfile.age;
        const gender = normalizedProfile.gender;
        const caloriesPerMinute = calculateCaloriesPerMinuteFromHeartRate({
          heartRate,
          weightKg,
          ageYears,
          gender,
        });

        return {
          typeKey,
          typeLabel,
          effortType,
          durationMinutes,
          averageHeartRate: heartRate ?? 0,
          calories,
          caloriesPerMinute,
          weightKg,
          ageYears,
          gender,
        };
      }

      const intensityKey = session?.intensity ?? 'moderate';
      const met = cardioType?.met?.[intensityKey] ?? null;
      const hours = durationMinutes / 60;

      return {
        typeKey,
        typeLabel,
        effortType,
        intensityKey,
        met,
        hours,
        durationMinutes,
        calories,
        weightKg: normalizedProfile.weight,
      };
    })
    .filter(Boolean);

  const epocEnabled = normalizedUserData?.epocEnabled ?? true;
  const resolveTrainingSessionCarryover = (session) => {
    if (!epocEnabled) {
      return { totalCalories: 0, windowMinutes: 0 };
    }

    const exerciseCalories = calculateTrainingSessionCalories(
      session,
      normalizedUserData,
      trainingTypes
    );

    return resolveTrainingSessionEpoc({
      session,
      exerciseCalories,
      trainingType: trainingTypes?.[session?.type],
      userData: normalizedUserData,
    });
  };

  const resolveCardioSessionCarryover = (session) => {
    if (!epocEnabled) {
      return { totalCalories: 0, windowMinutes: 0 };
    }

    const exerciseCalories = calculateCardioCalories(
      session,
      normalizedUserData,
      cardioTypes
    );

    return resolveCardioSessionEpoc({
      session,
      exerciseCalories,
      cardioType: cardioTypes?.[session?.type],
      userData: normalizedUserData,
    });
  };

  const trainingEpocAllocation = getCarryoverForDateFromSessions({
    dateKey: resolvedDateKey,
    sessions: normalizedUserData?.trainingSessions,
    resolveCarryover: resolveTrainingSessionCarryover,
  });
  const cardioEpocAllocation = getCarryoverForDateFromSessions({
    dateKey: resolvedDateKey,
    sessions: normalizedUserData?.cardioSessions,
    resolveCarryover: resolveCardioSessionCarryover,
  });

  const trainingEpoc = Math.round(
    Number(trainingEpocAllocation?.totalCalories) || 0
  );
  const cardioEpoc = Math.round(Number(cardioEpocAllocation?.totalCalories) || 0);
  const epocCalories = Math.round(trainingEpoc + cardioEpoc);

  const trainingEpocFromToday = Math.round(
    (trainingEpocAllocation?.allocations ?? [])
      .filter((allocation) => allocation?.sourceDate === resolvedDateKey)
      .reduce((sum, allocation) => sum + (Number(allocation?.calories) || 0), 0)
  );
  const cardioEpocFromToday = Math.round(
    (cardioEpocAllocation?.allocations ?? [])
      .filter((allocation) => allocation?.sourceDate === resolvedDateKey)
      .reduce((sum, allocation) => sum + (Number(allocation?.calories) || 0), 0)
  );
  const epocFromTodaySessions = Math.round(
    trainingEpocFromToday + cardioEpocFromToday
  );
  const epocCarryInCalories = Math.round(epocCalories - epocFromTodaySessions);
  const tefOffsetApplied =
    tefContext?.mode &&
    tefContext.mode !== 'off' &&
    (tefContext?.enabled ?? Boolean(userData?.smartTefEnabled))
      ? TEF_MULTIPLIER_OFFSET
      : 0;
  const effectiveActivityMultiplier = Math.max(
    0,
    rawActivityMultiplier - tefOffsetApplied
  );
  const baseActivity = Math.round(bmr * effectiveActivityMultiplier);
  const subtotalBeforeSmartTef = Math.round(
    bmr +
      baseActivity +
      stepDetails.calories +
      trainingBurn +
      cardioBurn +
      epocCalories
  );
  const {
    tefMode,
    smartTefCalories,
    details: smartTefDetails,
  } = resolveSmartTef({
    tefContext,
    userData: normalizedUserData,
    targetCaloriesSeed: subtotalBeforeSmartTef,
  });
  const baselineTotal = Math.round(subtotalBeforeSmartTef + smartTefCalories);
  const adaptiveThermogenesisMode = resolveAdaptiveThermogenesisMode({
    userData: normalizedUserData,
    adaptiveThermogenesisContext,
  });
  const adaptiveThermogenesis = computeAdaptiveThermogenesis({
    mode: adaptiveThermogenesisMode,
    selectedGoal: normalizedUserData?.selectedGoal,
    goalDurationDays: normalizedUserData?.goalDurationDays,
    goalChangedAt: normalizedUserData?.goalChangedAt,
    dateKey: resolvedDateKey,
    dailySnapshots: normalizedUserData?.dailySnapshots,
    weightEntries: normalizedUserData?.weightEntries,
  });
  const adaptiveThermogenesisCorrection = Math.round(
    Number(adaptiveThermogenesis?.correction) || 0
  );
  const total = Math.round(baselineTotal + adaptiveThermogenesisCorrection);

  return {
    total,
    baselineTotal,
    adjustedTotal: total,
    adaptiveThermogenesisMode,
    adaptiveThermogenesisCorrection,
    adaptiveThermogenesis,
    bmr,
    baseActivity,
    activityMultiplier: rawActivityMultiplier,
    rawActivityMultiplier,
    effectiveActivityMultiplier,
    tefOffsetApplied,
    tefMode,
    smartTefCalories,
    smartTefDetails,
    stepCalories: stepDetails.calories,
    stepDetails,
    estimatedSteps: stepDetails.estimatedSteps,
    originalEstimatedSteps: stepDetails.originalEstimatedSteps,
    deductedSteps: stepDetails.deductedSteps,
    remainingEstimatedSteps: stepDetails.remainingEstimatedSteps,
    stepOverlapSessionsCount: stepDetails.stepOverlapSessionsCount,
    stepOverlapApplicableSessionsCount:
      stepDetails.stepOverlapApplicableSessionsCount,
    stepOverlapSessions: stepDetails.stepOverlapSessions,
    trainingBurn,
    trainingDuration,
    trainingCaloriesPerHour,
    trainingTypeLabel,
    cardioBurn,
    cardioDetails,
    epocEnabled,
    epocCalories,
    trainingEpoc,
    cardioEpoc,
    epocFromTodaySessions,
    epocCarryInCalories,
    trainingEpocDetails: trainingEpocAllocation?.allocations ?? [],
    cardioEpocDetails: cardioEpocAllocation?.allocations ?? [],
    bmrDetails,
  };
};

export const calculateTDEE = (options) =>
  calculateCalorieBreakdown(options).total;

export const calculateGoalCalories = (tdee, goal) => {
  switch (goal) {
    case 'aggressive_bulk':
      return Math.round(tdee + 500);
    case 'bulking':
      return Math.round(tdee + 300);
    case 'cutting':
      return Math.round(tdee - 300);
    case 'aggressive_cut':
      return Math.round(tdee - 500);
    case 'maintenance':
    default:
      return Math.round(tdee);
  }
};

/**
 * Calculate BMI (Body Mass Index)
 * Formula: weight (kg) / height (m)²
 */
export const calculateBMI = (weight, height) => {
  const safeWeight = Number(weight);
  const safeHeight = Number(height);
  if (
    !Number.isFinite(safeWeight) ||
    !Number.isFinite(safeHeight) ||
    safeHeight <= 0
  ) {
    return null;
  }
  const heightInMeters = safeHeight / 100;
  return safeWeight / (heightInMeters * heightInMeters);
};

/**
 * Get BMI category based on value
 */
export const getBMICategory = (bmi) => {
  if (!Number.isFinite(bmi)) return { label: 'Unknown', color: 'slate' };
  if (bmi < 18.5) return { label: 'Underweight', color: 'blue' };
  if (bmi < 25) return { label: 'Normal', color: 'green' };
  if (bmi < 30) return { label: 'Overweight', color: 'yellow' };
  return { label: 'Obese', color: 'red' };
};

/**
 * Calculate FFMI (Fat-Free Mass Index)
 * Formula: lean mass (kg) / height (m)² + 6.1 × (1.8 - height in m)
 * Requires body fat percentage to calculate lean mass
 */
export const calculateFFMI = (weight, height, bodyFatPercent) => {
  const safeWeight = Number(weight);
  const safeHeight = Number(height);
  const safeBodyFat = Number(bodyFatPercent);

  if (
    !Number.isFinite(safeWeight) ||
    !Number.isFinite(safeHeight) ||
    !Number.isFinite(safeBodyFat) ||
    safeHeight <= 0 ||
    safeBodyFat < 0 ||
    safeBodyFat >= 100
  ) {
    return null;
  }

  const heightInMeters = safeHeight / 100;
  const leanMass = safeWeight * (1 - safeBodyFat / 100);
  const rawFFMI = leanMass / (heightInMeters * heightInMeters);
  // Normalized FFMI (adjusted for height)
  const normalizedFFMI = rawFFMI + 6.1 * (1.8 - heightInMeters);

  return {
    raw: rawFFMI,
    normalized: normalizedFFMI,
    leanMass,
  };
};

/**
 * Get FFMI category based on normalized value (for males)
 * Female ranges are roughly 2-3 points lower
 */
export const getFFMICategory = (ffmi, gender = 'male') => {
  if (!Number.isFinite(ffmi)) return { label: 'Unknown', color: 'slate' };

  // Adjust thresholds for females (roughly 2-3 points lower)
  const offset = gender === 'female' ? 2.5 : 0;

  if (ffmi < 18 - offset) return { label: 'Below average', color: 'blue' };
  if (ffmi < 20 - offset) return { label: 'Average', color: 'slate' };
  if (ffmi < 22 - offset) return { label: 'Above average', color: 'green' };
  if (ffmi < 23 - offset) return { label: 'Excellent', color: 'emerald' };
  if (ffmi < 25 - offset) return { label: 'Elite', color: 'purple' };
  if (ffmi < 27 - offset) return { label: 'Pro-level', color: 'amber' };
  return { label: 'Suspiciously high', color: 'red' };
};
