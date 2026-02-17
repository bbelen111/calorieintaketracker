import { getLifestyleMultiplier } from '../constants/activityPresets';
import { getStepDetails } from './steps';

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

const calculateCaloriesPerMinuteFromHeartRate = ({
  heartRate,
  weightKg,
  ageYears,
  gender,
}) => {
  const safeHeartRate = Number.isFinite(heartRate) ? heartRate : 0;
  const safeWeight = Number.isFinite(weightKg) ? weightKg : 0;
  const safeAge = Number.isFinite(ageYears) ? ageYears : 0;
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
  const safeAge = Number(age);
  const safeWeight = Number(weight);
  const safeHeight = Number(height);
  const resolvedGender = gender === 'female' ? 'female' : 'male';
  const details = {
    method: 'mifflin-st-jeor',
    age: safeAge,
    weight: safeWeight,
    height: safeHeight,
    gender: resolvedGender,
    bodyFat: null,
    leanMass: null,
  };

  if (
    bodyFatTrackingEnabled &&
    Array.isArray(bodyFatEntries) &&
    bodyFatEntries.length
  ) {
    const latestEntry = bodyFatEntries[bodyFatEntries.length - 1];
    const bodyFat = Number(latestEntry?.bodyFat);
    if (Number.isFinite(bodyFat) && Number.isFinite(safeWeight)) {
      const leanMass = safeWeight * (1 - bodyFat / 100);
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
    return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  }
  return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
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

  const weight = Number(userData?.weight);
  const age = Number(userData?.age);
  const gender = userData?.gender;

  if (cardioSession.effortType === 'heartRate') {
    const rawHeartRate = Number(cardioSession.averageHeartRate);
    const heartRate = Number.isFinite(rawHeartRate) ? rawHeartRate : 0;
    if (heartRate <= 0) {
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
  userData.cardioSessions.reduce(
    (total, session) =>
      total + calculateCardioCalories(session, userData, cardioTypes),
    0
  );

export const getTrainingCaloriesPerHour = (userData, trainingTypes) =>
  trainingTypes[userData.trainingType]?.caloriesPerHour ?? 0;

const TRAINING_INTENSITY_MULTIPLIERS = {
  light: 0.75,
  moderate: 1.0,
  vigorous: 1.25,
};

export const getTrainingCalories = (
  userData,
  trainingTypes,
  {
    effortType = 'intensity',
    trainingIntensity = 'moderate',
    averageHeartRate = null,
  } = {}
) => {
  const duration = Number(userData?.trainingDuration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const trainingTypeKey = userData?.trainingType;
  const trainingType = trainingTypes?.[trainingTypeKey];
  if (!trainingType) {
    return 0;
  }

  const baseCaloriesPerHour = Number(trainingType.caloriesPerHour);
  if (!Number.isFinite(baseCaloriesPerHour) || baseCaloriesPerHour <= 0) {
    return 0;
  }

  // Heart rate mode
  if (effortType === 'heartRate' && averageHeartRate) {
    const hr = Number(averageHeartRate);
    if (Number.isFinite(hr) && hr > 0) {
      const weight = Number(userData?.weight);
      const age = Number(userData?.age);
      const gender = userData?.gender;
      const caloriesPerMinute = calculateCaloriesPerMinuteFromHeartRate({
        heartRate: hr,
        weightKg: weight,
        ageYears: age,
        gender,
      });
      return Math.round(caloriesPerMinute * duration * 60);
    }
  }

  // Intensity mode (default)
  const intensityMultiplier =
    TRAINING_INTENSITY_MULTIPLIERS[trainingIntensity] ?? 1.0;
  return Math.round(baseCaloriesPerHour * duration * intensityMultiplier);
};

export const calculateCalorieBreakdown = ({
  steps,
  isTrainingDay,
  userData,
  bmr,
  cardioTypes,
  trainingTypes,
  lifestyleMultiplier = null,
  trainingEffortType = 'intensity',
  trainingIntensity = 'moderate',
  trainingAverageHeartRate = null,
  cardioSessions = null,
}) => {
  const stepDetails = getStepDetails(steps, userData);
  const bmrDetails = resolveBmrDetails(userData);
  const trainingTypeKey = userData?.trainingType;
  const trainingType = trainingTypes?.[trainingTypeKey] ?? null;
  const trainingDuration = Number.isFinite(userData?.trainingDuration)
    ? userData.trainingDuration
    : 0;
  const trainingCaloriesPerHour = Number.isFinite(trainingType?.caloriesPerHour)
    ? trainingType.caloriesPerHour
    : 0;
  
  // Use provided cardio sessions or fall back to userData.cardioSessions
  const sessions = Array.isArray(cardioSessions)
    ? cardioSessions
    : Array.isArray(userData?.cardioSessions)
      ? userData.cardioSessions
      : [];
  
  // Calculate base using lifestyle multiplier (new approach)
  // If lifestyleMultiplier not provided, fall back to old activityMultipliers
  let base;
  let baseMultiplier;
  if (lifestyleMultiplier !== null && Number.isFinite(lifestyleMultiplier)) {
    baseMultiplier = lifestyleMultiplier;
    base = Math.round(bmr * lifestyleMultiplier);
  } else {
    // Legacy fallback
    const multipliers =
      userData.activityMultipliers ?? { training: 0.35, rest: 0.28 };
    const activityMultiplier = isTrainingDay
      ? (multipliers.training ?? 0.35)
      : (multipliers.rest ?? 0.28);
    baseMultiplier = activityMultiplier;
    base = Math.round(bmr * activityMultiplier);
  }
  
  const trainingBurn = Math.round(
    isTrainingDay
      ? getTrainingCalories(userData, trainingTypes, {
          effortType: trainingEffortType,
          trainingIntensity,
          averageHeartRate: trainingAverageHeartRate,
        })
      : 0
  );
  
  // Calculate cardio step deduction
  let totalSteps = Number(steps) || 0;
  let cardioStepDeduction = 0;
  const cardioDetails = sessions
    .map((session) => {
      const rawDuration = Number(session?.duration);
      const durationMinutes = Number.isFinite(rawDuration) ? rawDuration : 0;
      if (durationMinutes <= 0) {
        return null;
      }

      const effortType = session?.effortType ?? 'intensity';
      const calories = calculateCardioCalories(session, userData, cardioTypes);
      const typeKey = session?.type;
      const cardioType = cardioTypes?.[typeKey];
      const typeLabel = cardioType?.label ?? typeKey ?? 'Cardio';
      
      // Calculate step deduction
      let stepsDeducted = 0;
      if (cardioType?.spm) {
        let spmValue = 0;
        if (effortType === 'heartRate') {
          // Default to moderate for HR mode
          spmValue = cardioType.spm.moderate ?? 0;
        } else {
          const intensityKey = session?.intensity ?? 'moderate';
          spmValue = cardioType.spm[intensityKey] ?? 0;
        }
        stepsDeducted = Math.round(spmValue * durationMinutes);
      }
      cardioStepDeduction += stepsDeducted;

      if (effortType === 'heartRate') {
        const heartRate = Number(session?.averageHeartRate);
        const weightKg = Number(userData?.weight);
        const ageYears = Number(userData?.age);
        const gender = userData?.gender;
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
          averageHeartRate: Number.isFinite(heartRate) ? heartRate : 0,
          calories,
          caloriesPerMinute,
          weightKg,
          ageYears,
          gender,
          stepsDeducted,
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
        weightKg: Number(userData?.weight),
        stepsDeducted,
      };
    })
    .filter(Boolean);
  
  const cardioBurn = cardioDetails.reduce((sum, detail) => sum + detail.calories, 0);
  
  // Calculate net steps (total steps - cardio deduction, minimum 0)
  const netSteps = Math.max(0, totalSteps - cardioStepDeduction);
  const netStepDetails = getStepDetails(netSteps, userData);
  
  const total = Math.round(
    bmr + base + netStepDetails.calories + trainingBurn + cardioBurn
  );

  return {
    total,
    bmr,
    base,
    baseMultiplier,
    baseActivity: base, // Legacy compat
    activityMultiplier: baseMultiplier, // Legacy compat
    stepCalories: netStepDetails.calories,
    stepDetails: netStepDetails,
    estimatedSteps: netStepDetails.estimatedSteps,
    grossSteps: totalSteps,
    netSteps,
    cardioStepDeduction,
    trainingBurn,
    trainingDuration,
    trainingCaloriesPerHour,
    trainingTypeLabel: trainingType?.label ?? trainingTypeKey ?? 'Training',
    trainingEffortType,
    trainingIntensity,
    cardioBurn,
    cardioDetails,
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

/**
 * Calculate daily expenditure for a specific date using per-day activity data
 * 4-layer stack: Base (BMR × lifestyleMultiplier) → Training → Cardio → Net Steps
 */
export const getDailyExpenditure = (
  date,
  {
    userData,
    dailyActivity = {},
    stepEntries = [],
    lifestyleTier = 'sedentary',
    bmr,
    trainingTypes,
    cardioTypes,
  }
) => {
  // Get daily activity for this date
  const dayActivity = dailyActivity[date] || {};
  
  // Get lifestyle multiplier
  const lifestyleMultiplier = getLifestyleMultiplier(lifestyleTier);
  
  // Get step count for this date
  const stepEntry = stepEntries.find((entry) => entry.date === date);
  const steps = stepEntry?.steps || 0;
  
  // Check if training is enabled for this day
  const isTrainingDay = dayActivity.trainingEnabled ?? false;
  const trainingEffortType = dayActivity.trainingEffortType ?? 'intensity';
  const trainingIntensity = dayActivity.trainingIntensity ?? 'moderate';
  const trainingAverageHeartRate = dayActivity.trainingAverageHeartRate ?? null;
  
  // Get cardio sessions for this day
  const cardioSessions = dayActivity.cardioSessions || [];
  
  return calculateCalorieBreakdown({
    steps,
    isTrainingDay,
    userData,
    bmr,
    cardioTypes,
    trainingTypes,
    lifestyleMultiplier,
    trainingEffortType,
    trainingIntensity,
    trainingAverageHeartRate,
    cardioSessions,
  });
};
