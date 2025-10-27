/**
 * Calculate comprehensive metrics for a phase based on daily logs and weight entries
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

  // Calculate average calories (only from logs that have calories)
  const logsWithCalories = logs.filter(log => log.calories && log.calories > 0);
  const totalCalories = logsWithCalories.reduce((sum, log) => sum + (log.calories || 0), 0);
  const avgCalories = logsWithCalories.length > 0 ? Math.round(totalCalories / logsWithCalories.length) : 0;

  // Calculate average steps (only from logs that have steps)
  const logsWithSteps = logs.filter(log => log.steps && log.steps > 0);
  const totalSteps = logsWithSteps.reduce((sum, log) => sum + (log.steps || 0), 0);
  const avgSteps = logsWithSteps.length > 0 ? Math.round(totalSteps / logsWithSteps.length) : 0;

  // Calculate total days (from start date to end date or today)
  const startDate = new Date(phase.startDate + 'T00:00:00');
  const endDate = phase.endDate ? new Date(phase.endDate + 'T00:00:00') : new Date();
  const diffTime = Math.abs(endDate - startDate);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day

  // Calculate completion rate
  const completionRate = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

  // Calculate weight change
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
    avgCalories,
    avgSteps,
    weightChange,
    avgWeeklyRate,
    currentWeight,
    completionRate
  };
};

/**
 * Get calendar data for a phase - which days have logs and their status
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
      status = log.completed ? 'completed' : 'partial';
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
