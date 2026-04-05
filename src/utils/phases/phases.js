import { MEAL_TYPE_ORDER } from '../../constants/meal/mealTypes.js';
import { formatDateKeyUtc } from '../data/dateKeys.js';

const EMPTY_NUTRITION_TOTALS = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};

export const hasNutritionEntriesForDate = (nutritionData = {}, dateKey) => {
  if (!dateKey || !nutritionData || typeof nutritionData !== 'object') {
    return false;
  }

  const mealsForDate = nutritionData[dateKey];
  if (!mealsForDate || typeof mealsForDate !== 'object') {
    return false;
  }

  return MEAL_TYPE_ORDER.some((mealTypeId) => {
    const entries = Array.isArray(mealsForDate[mealTypeId])
      ? mealsForDate[mealTypeId]
      : [];
    return entries.length > 0;
  });
};

export const getNutritionTotalsForDate = (nutritionData = {}, dateKey) => {
  if (!hasNutritionEntriesForDate(nutritionData, dateKey)) {
    return EMPTY_NUTRITION_TOTALS;
  }

  const mealsForDate = nutritionData[dateKey];

  return MEAL_TYPE_ORDER.reduce(
    (totals, mealTypeId) => {
      const entries = Array.isArray(mealsForDate[mealTypeId])
        ? mealsForDate[mealTypeId]
        : [];

      entries.forEach((entry) => {
        totals.calories += Number(entry?.calories) || 0;
        totals.protein += Number(entry?.protein) || 0;
        totals.carbs += Number(entry?.carbs) || 0;
        totals.fats += Number(entry?.fats) || 0;
      });

      return totals;
    },
    { ...EMPTY_NUTRITION_TOTALS }
  );
};

/**
 * Calculate comprehensive metrics for a phase based on daily logs and weight entries
 * NOTE: Uses reference-based system - logs store weightRef/nutritionRef, not raw data
 */
export const calculatePhaseMetrics = (
  phase,
  weightEntries = [],
  nutritionData = {}
) => {
  if (!phase || !phase.dailyLogs) {
    return {
      totalDays: 0,
      activeDays: 0,
      avgCalories: 0,
      avgProtein: 0,
      avgCarbs: 0,
      avgFats: 0,
      nutritionDays: 0,
      avgSteps: 0,
      weightChange: 0,
      avgWeeklyRate: 0,
      currentWeight: null,
      completionRate: 0,
    };
  }

  const logs = Object.values(phase.dailyLogs);
  const activeDays = logs.length;

  const nutritionTotals = logs.reduce(
    (acc, log) => {
      const nutritionRef = log?.nutritionRef;
      if (!hasNutritionEntriesForDate(nutritionData, nutritionRef)) {
        return acc;
      }

      const totals = getNutritionTotalsForDate(nutritionData, nutritionRef);
      return {
        calories: acc.calories + totals.calories,
        protein: acc.protein + totals.protein,
        carbs: acc.carbs + totals.carbs,
        fats: acc.fats + totals.fats,
        days: acc.days + 1,
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      days: 0,
    }
  );

  const nutritionDays = nutritionTotals.days;
  const avgCalories =
    nutritionDays > 0 ? nutritionTotals.calories / nutritionDays : 0;
  const avgProtein =
    nutritionDays > 0 ? nutritionTotals.protein / nutritionDays : 0;
  const avgCarbs =
    nutritionDays > 0 ? nutritionTotals.carbs / nutritionDays : 0;
  const avgFats = nutritionDays > 0 ? nutritionTotals.fats / nutritionDays : 0;

  const avgSteps = 0;

  // Calculate total days (from start date to end date or today)
  const startDate = new Date(phase.startDate + 'T00:00:00Z');
  const endDate = phase.endDate
    ? new Date(phase.endDate + 'T00:00:00Z')
    : new Date();
  const diffTime = Math.abs(endDate - startDate);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day

  // Calculate completion rate
  const completionRate =
    totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

  // Calculate weight change using referenced weight entries
  const phaseWeightEntries = weightEntries.filter((entry) => {
    const entryDate = new Date(entry.date + 'T00:00:00Z');
    const isAfterStart = entryDate >= startDate;
    const isBeforeEnd = phase.endDate ? entryDate <= endDate : true;
    return isAfterStart && isBeforeEnd;
  });

  let weightChange = 0;
  let avgWeeklyRate = 0;
  let currentWeight = null;

  if (phaseWeightEntries.length > 0) {
    const sortedEntries = [...phaseWeightEntries].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];

    currentWeight = lastEntry.weight;
    weightChange =
      lastEntry.weight - (phase.startingWeight || firstEntry.weight);

    // Calculate weekly rate
    const firstDate = new Date(firstEntry.date + 'T00:00:00Z');
    const lastDate = new Date(lastEntry.date + 'T00:00:00Z');
    const daysBetween = Math.max(
      (lastDate - firstDate) / (1000 * 60 * 60 * 24),
      1
    );
    avgWeeklyRate = (weightChange / daysBetween) * 7;
  } else if (phase.startingWeight) {
    // No weight entries in phase, use starting weight
    currentWeight = phase.startingWeight;
    weightChange = 0;
    avgWeeklyRate = 0;
  }

  return {
    totalDays,
    activeDays,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFats,
    nutritionDays,
    avgSteps,
    weightChange,
    avgWeeklyRate,
    currentWeight,
    completionRate,
  };
};

/**
 * Get calendar data for a phase - which days have logs and their status
 * NOTE: Status based on reference presence (weightRef, bodyFatRef, nutritionRef), not raw data
 */
export const getPhaseCalendarData = (phase, nutritionData = null) => {
  if (!phase || !phase.startDate) {
    return [];
  }

  const startDate = new Date(phase.startDate + 'T00:00:00Z');
  const endDate = phase.endDate
    ? new Date(phase.endDate + 'T00:00:00Z')
    : new Date();

  const calendar = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = formatDateKeyUtc(currentDate);
    const log = phase.dailyLogs?.[dateStr];

    let status = 'empty';
    if (log) {
      // Check if references exist (weightRef, bodyFatRef, nutritionRef)
      const hasWeight = log.weightRef && log.weightRef.trim() !== '';
      const hasBodyFat = log.bodyFatRef && log.bodyFatRef.trim() !== '';
      const nutritionRef =
        typeof log.nutritionRef === 'string' ? log.nutritionRef.trim() : '';
      const hasNutrition = nutritionRef
        ? nutritionData == null
          ? true
          : hasNutritionEntriesForDate(nutritionData, nutritionRef)
        : false;
      const hasPrimaryMetric = hasWeight || hasBodyFat;

      // Completed if marked complete OR has a primary metric + nutrition.
      if (log.completed || (hasPrimaryMetric && hasNutrition)) {
        status = 'completed';
      } else if (hasPrimaryMetric || hasNutrition) {
        // Partial if at least one tracked reference exists.
        status = 'partial';
      }
    }

    calendar.push({
      date: dateStr,
      dayOfWeek: currentDate.getDay(),
      dayOfMonth: currentDate.getDate(),
      status,
      log,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return calendar;
};

/**
 * Get recent daily logs sorted by date (descending)
 */
export const getRecentDailyLogs = (phase, limit = 7) => {
  if (!phase || !phase.dailyLogs) {
    return [];
  }

  const logs = Object.values(phase.dailyLogs)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  return logs;
};
