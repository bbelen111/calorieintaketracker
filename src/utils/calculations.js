import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../constants/activityPresets';
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

export const getTrainingCalories = (userData, trainingTypes) =>
  userData.trainingDuration *
  getTrainingCaloriesPerHour(userData, trainingTypes);

export const calculateCalorieBreakdown = ({
  steps,
  isTrainingDay,
  userData,
  bmr,
  cardioTypes,
  trainingTypes,
}) => {
  const stepDetails = getStepDetails(steps, userData);
  const bmrDetails = resolveBmrDetails(userData);
  const trainingTypeKey = userData?.trainingType;
  const trainingType = trainingTypes?.[trainingTypeKey] ?? null;
  const trainingDuration = Number.isFinite(userData?.trainingDuration)
    ? userData.trainingDuration
    : 0;
  const trainingCaloriesPerHour = Number.isFinite(
    trainingType?.caloriesPerHour
  )
    ? trainingType.caloriesPerHour
    : 0;
  const cardioSessions = Array.isArray(userData?.cardioSessions)
    ? userData.cardioSessions
    : [];
  const multipliers =
    userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;
  const activityMultiplier = isTrainingDay
    ? (multipliers.training ?? DEFAULT_ACTIVITY_MULTIPLIERS.training)
    : (multipliers.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest);
  const baseActivity = Math.round(bmr * activityMultiplier);
  const trainingBurn = Math.round(
    isTrainingDay ? getTrainingCalories(userData, trainingTypes) : 0
  );
  const cardioBurn = Math.round(getTotalCardioBurn(userData, cardioTypes));
  const cardioDetails = cardioSessions
    .map((session) => {
      const rawDuration = Number(session?.duration);
      const durationMinutes = Number.isFinite(rawDuration)
        ? rawDuration
        : 0;
      if (durationMinutes <= 0) {
        return null;
      }

      const effortType = session?.effortType ?? 'intensity';
      const calories = calculateCardioCalories(session, userData, cardioTypes);
      const typeKey = session?.type;
      const cardioType = cardioTypes?.[typeKey];
      const typeLabel = cardioType?.label ?? typeKey ?? 'Cardio';

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
      };
    })
    .filter(Boolean);
  const total = Math.round(
    bmr + baseActivity + stepDetails.calories + trainingBurn + cardioBurn
  );

  return {
    total,
    bmr,
    baseActivity,
    activityMultiplier,
    stepCalories: stepDetails.calories,
    stepDetails,
    estimatedSteps: stepDetails.estimatedSteps,
    trainingBurn,
    trainingDuration,
    trainingCaloriesPerHour,
    trainingTypeLabel: trainingType?.label ?? trainingTypeKey ?? 'Training',
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
  if (!Number.isFinite(safeWeight) || !Number.isFinite(safeHeight) || safeHeight <= 0) {
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
