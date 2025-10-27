/**
 * Calculate comprehensive metrics for a phase based on daily logs and weight entries
 * NOTE: Uses reference-based system - logs store weightRef/nutritionRef, not raw data
 */
export const calculatePhaseMetrics = (phase, weightEntries = []) => {
  if (!phase || !phase.dailyLogs) {
    return {
      totalDays: 0,
      activeDays: 0,
      avgCalories: 0,
      avgSteps: 0,
      weightChange: 0,
      avgWeeklyRate: 0,
      currentWeight: null,
      completionRate: 0
    };
  }

  const logs = Object.values(phase.dailyLogs);
  const activeDays = logs.length;

  // Calorie/step averages are 0 until nutrition tracker is built
  // Daily logs only store references (weightRef, nutritionRef), not raw data
  const avgCalories = 0;
  const avgSteps = 0;

  // Calculate total days (from start date to end date or today)
  const startDate = new Date(phase.startDate + 'T00:00:00');
  const endDate = phase.endDate ? new Date(phase.endDate + 'T00:00:00') : new Date();
  const diffTime = Math.abs(endDate - startDate);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day

  // Calculate completion rate
  const completionRate = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

  // Calculate weight change using referenced weight entries
  const phaseWeightEntries = weightEntries.filter(entry => {
    const entryDate = new Date(entry.date + 'T00:00:00');
    const isAfterStart = entryDate >= startDate;
    const isBeforeEnd = phase.endDate ? entryDate <= endDate : true;
    return isAfterStart && isBeforeEnd;
  });

  let weightChange = 0;
  let avgWeeklyRate = 0;
  let currentWeight = null;

  if (phaseWeightEntries.length > 0) {
    const sortedEntries = [...phaseWeightEntries].sort((a, b) => a.date.localeCompare(b.date));
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    
    currentWeight = lastEntry.weight;
    weightChange = lastEntry.weight - (phase.startingWeight || firstEntry.weight);

    // Calculate weekly rate
    const firstDate = new Date(firstEntry.date + 'T00:00:00');
    const lastDate = new Date(lastEntry.date + 'T00:00:00');
    const daysBetween = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24), 1);
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
    avgCalories, // Always 0 until nutrition tracker built
    avgSteps, // Always 0 until nutrition tracker built
    weightChange,
    avgWeeklyRate,
    currentWeight,
    completionRate
  };
};

/**
 * Get calendar data for a phase - which days have logs and their status
 * NOTE: Status based on reference presence (weightRef, nutritionRef), not raw data
 */
export const getPhaseCalendarData = (phase) => {
  if (!phase || !phase.startDate) {
    return [];
  }

  const startDate = new Date(phase.startDate + 'T00:00:00');
  const endDate = phase.endDate ? new Date(phase.endDate + 'T00:00:00') : new Date();
  
  const calendar = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const log = phase.dailyLogs?.[dateStr];
    
    let status = 'empty';
    if (log) {
      // Check if references exist (weightRef, nutritionRef)
      const hasWeight = log.weightRef && log.weightRef.trim() !== '';
      const hasNutrition = log.nutritionRef && log.nutritionRef.trim() !== '';
      
      // Completed if marked complete OR has both references
      if (log.completed || (hasWeight && hasNutrition)) {
        status = 'completed';
      } else if (hasWeight || hasNutrition) {
        // Partial if has at least one reference
        status = 'partial';
      }
    }

    calendar.push({
      date: dateStr,
      dayOfWeek: currentDate.getDay(),
      dayOfMonth: currentDate.getDate(),
      status,
      log
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
