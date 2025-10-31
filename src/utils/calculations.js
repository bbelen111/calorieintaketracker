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

export const calculateBMR = ({ age, weight, height, gender }) => {
  if (gender === 'male') {
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
  const total = Math.round(
    bmr + baseActivity + stepDetails.calories + trainingBurn + cardioBurn
  );

  return {
    total,
    bmr,
    baseActivity,
    activityMultiplier,
    stepCalories: stepDetails.calories,
    estimatedSteps: stepDetails.estimatedSteps,
    trainingBurn,
    cardioBurn,
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
