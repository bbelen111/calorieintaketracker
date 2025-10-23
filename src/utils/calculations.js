import { DEFAULT_ACTIVITY_MULTIPLIERS } from '../constants/activityPresets';
import { getStepDetails } from './steps';

export const calculateBMR = ({ age, weight, height, gender }) => {
  if (gender === 'male') {
    return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  }
  return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
};

export const calculateCardioCalories = (cardioSession, userData, cardioTypes) => {
  const cardioType = cardioTypes[cardioSession.type];
  if (!cardioType) return 0;
  const met = cardioType.met[cardioSession.intensity];
  if (!met) return 0;
  const hours = cardioSession.duration / 60;
  return Math.round(met * userData.weight * hours);
};

export const getTotalCardioBurn = (userData, cardioTypes) =>
  userData.cardioSessions.reduce(
    (total, session) => total + calculateCardioCalories(session, userData, cardioTypes),
    0
  );

export const getTrainingCaloriesPerHour = (userData, trainingTypes) =>
  trainingTypes[userData.trainingType]?.caloriesPerHour ?? 0;

export const getTrainingCalories = (userData, trainingTypes) =>
  userData.trainingDuration * getTrainingCaloriesPerHour(userData, trainingTypes);

export const calculateCalorieBreakdown = ({
  steps,
  isTrainingDay,
  userData,
  bmr,
  cardioTypes,
  trainingTypes
}) => {
  const stepDetails = getStepDetails(steps, userData);
  const multipliers = userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;
  const activityMultiplier = isTrainingDay
    ? multipliers.training ?? DEFAULT_ACTIVITY_MULTIPLIERS.training
    : multipliers.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest;
  const baseActivity = Math.round(bmr * activityMultiplier);
  const trainingBurn = Math.round(isTrainingDay ? getTrainingCalories(userData, trainingTypes) : 0);
  const cardioBurn = Math.round(getTotalCardioBurn(userData, cardioTypes));
  const total = Math.round(bmr + baseActivity + stepDetails.calories + trainingBurn + cardioBurn);

  return {
    total,
    bmr,
    baseActivity,
    activityMultiplier,
    stepCalories: stepDetails.calories,
    estimatedSteps: stepDetails.estimatedSteps,
    trainingBurn,
    cardioBurn
  };
};

export const calculateTDEE = (options) => calculateCalorieBreakdown(options).total;

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
