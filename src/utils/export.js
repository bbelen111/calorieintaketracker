import { calculatePhaseMetrics } from './phases';

/**
 * Export phase data as CSV
 */
export const exportPhaseAsCSV = (phase, weightEntries) => {
  if (!phase) return;

  const metrics = calculatePhaseMetrics(phase, weightEntries);
  
  // Build CSV content
  let csv = '';
  
  // Phase header
  csv += 'PHASE INFORMATION\n';
  csv += `Name,${phase.name}\n`;
  csv += `Start Date,${phase.startDate}\n`;
  csv += `End Date,${phase.endDate || 'Ongoing'}\n`;
  csv += `Goal,${phase.goalType || 'None'}\n`;
  csv += `Target Weight,${phase.targetWeight ? phase.targetWeight + ' kg' : 'Not set'}\n`;
  csv += `Status,${phase.isCompleted ? 'Completed' : phase.isPaused ? 'Paused' : 'Active'}\n`;
  csv += '\n';
  
  // Phase metrics
  csv += 'PHASE METRICS\n';
  csv += `Weight Change,${metrics.weightChange.toFixed(2)} kg\n`;
  csv += `Average Weekly Rate,${metrics.avgWeeklyRate.toFixed(2)} kg/week\n`;
  csv += `Completion Rate,${metrics.completionRate.toFixed(1)}%\n`;
  csv += `Starting Weight,${phase.startingWeight ? phase.startingWeight.toFixed(1) + ' kg' : 'Not recorded'}\n`;
  csv += `Current Weight,${metrics.currentWeight ? metrics.currentWeight.toFixed(1) + ' kg' : 'Not recorded'}\n`;
  csv += `Active Days,${metrics.activeDays}\n`;
  csv += `Total Days,${metrics.totalDays}\n`;
  csv += '\n';
  
  // Daily logs - reference-based system (links to weight/nutrition data, not raw values)
  csv += 'DAILY LOGS\n';
  csv += 'Date,Weight Ref,Nutrition Ref,Completed,Notes\n';
  
  const logs = Object.entries(phase.dailyLogs || {})
    .map(([date, log]) => ({ date, ...log }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  logs.forEach(log => {
    const row = [
      log.date,
      log.weightRef || 'Not linked',
      log.nutritionRef || 'Not linked',
      log.completed ? 'Yes' : 'No',
      log.notes ? `"${log.notes.replace(/"/g, '""')}"` : ''
    ];
    csv += row.join(',') + '\n';
  });
  
  csv += '\n';
  
  // Weight entries
  csv += 'WEIGHT ENTRIES\n';
  csv += 'Date,Weight (kg)\n';
  
  const phaseWeights = weightEntries
    .filter(entry => {
      if (entry.date < phase.startDate) return false;
      if (phase.endDate && entry.date > phase.endDate) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  
  phaseWeights.forEach(entry => {
    csv += `${entry.date},${entry.weight}\n`;
  });
  
  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${phase.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export phase data as JSON
 */
export const exportPhaseAsJSON = (phase, weightEntries) => {
  if (!phase) return;

  const metrics = calculatePhaseMetrics(phase, weightEntries);
  
  const phaseWeights = weightEntries
    .filter(entry => {
      if (entry.date < phase.startDate) return false;
      if (phase.endDate && entry.date > phase.endDate) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  
  const exportData = {
    phase: {
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate || null,
      goalType: phase.goalType || null,
      targetWeight: phase.targetWeight || null,
      status: phase.isCompleted ? 'completed' : phase.isPaused ? 'paused' : 'active',
      createdAt: phase.createdAt || null,
      completedAt: phase.completedAt || null
    },
    metrics: {
      weightChange: parseFloat(metrics.weightChange.toFixed(2)),
      avgWeeklyRate: parseFloat(metrics.avgWeeklyRate.toFixed(3)),
      completionRate: parseFloat(metrics.completionRate.toFixed(2)),
      startingWeight: phase.startingWeight ? parseFloat(phase.startingWeight.toFixed(2)) : null,
      currentWeight: metrics.currentWeight ? parseFloat(metrics.currentWeight.toFixed(2)) : null,
      activeDays: metrics.activeDays,
      totalDays: metrics.totalDays
    },
    dailyLogs: Object.entries(phase.dailyLogs || {})
      .map(([date, log]) => ({ date, ...log }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    weightEntries: phaseWeights,
    exportedAt: new Date().toISOString()
  };
  
  // Trigger download
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${phase.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
