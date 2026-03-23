import { calculateBMR, calculateCalorieBreakdown } from './calculations.js';
import { getNutritionTotalsForDate } from './phases.js';
import { normalizeDateKey } from './weight.js';

const toDateKeyFromDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPreviousDateKey = (dateKey) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  if (!normalizedDateKey) {
    return null;
  }

  const date = new Date(`${normalizedDateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKeyFromDate(date);
};

const getStepCountForDate = (userData, dateKey) => {
  const entries = Array.isArray(userData?.stepEntries)
    ? userData.stepEntries
    : [];
  const entry = entries.find(
    (item) => normalizeDateKey(item?.date) === dateKey
  );
  const numericSteps = Number(entry?.steps);
  if (!Number.isFinite(numericSteps) || numericSteps < 0) {
    return 0;
  }
  return Math.round(numericSteps);
};

const hasTrainingSessionsForDate = (userData, dateKey) => {
  const sessions = Array.isArray(userData?.trainingSessions)
    ? userData.trainingSessions
    : [];

  return sessions.some(
    (session) => normalizeDateKey(session?.date) === dateKey
  );
};

const getSnapshotComparable = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const comparable = { ...snapshot };
  delete comparable.createdAt;
  delete comparable.updatedAt;
  return comparable;
};

export const areDailySnapshotsEquivalent = (previousSnapshot, nextSnapshot) =>
  JSON.stringify(getSnapshotComparable(previousSnapshot)) ===
  JSON.stringify(getSnapshotComparable(nextSnapshot));

export const buildDailySnapshot = ({
  dateKey,
  userData,
  trainingTypes,
  cardioTypes,
  bmr,
  existingSnapshot,
}) => {
  const normalizedDateKey = normalizeDateKey(dateKey);
  if (!normalizedDateKey) {
    return null;
  }

  const nutritionTotals = getNutritionTotalsForDate(
    userData?.nutritionData ?? {},
    normalizedDateKey
  );
  const stepCount = getStepCountForDate(userData, normalizedDateKey);
  const isTrainingDay = hasTrainingSessionsForDate(userData, normalizedDateKey);
  const resolvedBmr = Number.isFinite(Number(bmr))
    ? Math.round(Number(bmr))
    : Math.round(calculateBMR(userData ?? {}));

  const tefContext = userData?.smartTefEnabled
    ? {
        mode: 'dynamic',
        enabled: true,
        totals: nutritionTotals,
      }
    : {
        mode: 'off',
        enabled: false,
      };

  const breakdown = calculateCalorieBreakdown({
    steps: stepCount,
    isTrainingDay,
    userData,
    bmr: resolvedBmr,
    cardioTypes,
    trainingTypes,
    tefContext,
    dateKey: normalizedDateKey,
  });

  const intake = Math.round(Number(nutritionTotals?.calories) || 0);
  const tdee = Math.round(Number(breakdown?.total) || 0);
  const now = Date.now();

  return {
    date: normalizedDateKey,
    tdee,
    intake,
    deficit: tdee - intake,
    stepCount,
    isTrainingDay,
    bmr: resolvedBmr,
    stepCalories: Math.round(Number(breakdown?.stepCalories) || 0),
    trainingBurn: Math.round(Number(breakdown?.trainingBurn) || 0),
    cardioBurn: Math.round(Number(breakdown?.cardioBurn) || 0),
    tef: Math.round(Number(breakdown?.smartTefCalories) || 0),
    tefMode: breakdown?.tefMode ?? 'off',
    createdAt: Number(existingSnapshot?.createdAt) || now,
    updatedAt: now,
  };
};
