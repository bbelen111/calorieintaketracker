import {
  calculatePhaseMetrics,
  getNutritionTotalsForDate,
} from './phases/phases.js';
import { getTodayDateKey } from './data/dateKeys.js';
import { sortHeartRateEntries } from './measurements/heartRate.js';
import { saveTextFile } from '../services/fileShare.js';

/**
 * `Phase Name 1` → `Phase_Name_1_2026-09-29.csv`.
 *
 * The character-stripping expression is deliberately identical to the one the
 * web flow has always used, so exporting the same phase produces the same file
 * name it always did.
 */
const buildPhaseExportFileName = (phase, extension) =>
  `${phase.name.replace(/[^a-z0-9]/gi, '_')}_${getTodayDateKey()}.${extension}`;

/** Daily heart-rate entries inside the phase window (normalized, sorted). */
const getPhaseHeartRateRows = (phase, heartRateEntries) =>
  sortHeartRateEntries(heartRateEntries)
    .filter(
      (entry) =>
        entry.date >= phase.startDate &&
        (!phase.endDate || entry.date <= phase.endDate)
    )
    .map((entry) => ({
      date: entry.date,
      restingHr: entry.restingHr,
      restingHrMethod: entry.restingHrMethod,
      avgHr: entry.avgHr,
      maxHr: entry.maxHr,
      vo2Max: entry.vo2Max,
    }));

/**
 * Export phase data as CSV.
 *
 * Delivery is platform-dependent — a web download in the browser, the native
 * share sheet inside the iOS/Android shell (`utils/../services/fileShare.js`).
 * Returns the delivery result; it never throws.
 */
export const exportPhaseAsCSV = async (
  phase,
  weightEntries,
  nutritionData = {},
  heartRateEntries = []
) => {
  if (!phase) {
    return { success: false, method: 'none', error: 'No phase selected' };
  }

  const metrics = calculatePhaseMetrics(
    phase,
    weightEntries,
    nutritionData,
    heartRateEntries
  );

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
  csv += `Nutrition Logged Days,${metrics.nutritionDays}\n`;
  csv += `Average Protein,${metrics.avgProtein.toFixed(1)} g\n`;
  csv += `Average Carbs,${metrics.avgCarbs.toFixed(1)} g\n`;
  csv += `Average Fats,${metrics.avgFats.toFixed(1)} g\n`;
  if (metrics.avgFiber != null) {
    csv += `Average Fiber,${metrics.avgFiber.toFixed(1)} g\n`;
  }
  if (metrics.avgSodium != null) {
    csv += `Average Sodium,${metrics.avgSodium.toFixed(0)} mg\n`;
  }
  if (metrics.avgSaturatedFats != null) {
    csv += `Average Saturated Fat,${metrics.avgSaturatedFats.toFixed(1)} g\n`;
  }
  if (metrics.avgSugars != null) {
    csv += `Average Sugars,${metrics.avgSugars.toFixed(1)} g\n`;
  }
  if (metrics.restingHrStart != null) {
    csv += `Resting HR (start),${metrics.restingHrStart} bpm\n`;
    csv += `Resting HR (end),${metrics.restingHrEnd} bpm\n`;
    csv += `Resting HR Change,${metrics.restingHrChange} bpm\n`;
  }
  csv += '\n';

  // Daily logs - reference-based system (links to weight/nutrition data, not raw values)
  csv += 'DAILY LOGS\n';
  csv +=
    'Date,Weight Ref,Body Fat Ref,Nutrition Ref,Calories,Protein,Carbs,Fats,Fiber,Sodium,SaturatedFat,Sugars,Completed,Notes\n';

  const logs = Object.entries(phase.dailyLogs || {})
    .map(([date, log]) => ({ date, ...log }))
    .sort((a, b) => a.date.localeCompare(b.date));

  logs.forEach((log) => {
    const nutritionTotals = getNutritionTotalsForDate(
      nutritionData,
      log.nutritionRef
    );
    const row = [
      log.date,
      log.weightRef || 'Not linked',
      log.bodyFatRef || 'Not linked',
      log.nutritionRef || 'Not linked',
      nutritionTotals.calories ? nutritionTotals.calories.toFixed(1) : '',
      nutritionTotals.protein ? nutritionTotals.protein.toFixed(1) : '',
      nutritionTotals.carbs ? nutritionTotals.carbs.toFixed(1) : '',
      nutritionTotals.fats ? nutritionTotals.fats.toFixed(1) : '',
      nutritionTotals.fiber != null ? nutritionTotals.fiber.toFixed(1) : '',
      nutritionTotals.sodium != null ? nutritionTotals.sodium.toFixed(0) : '',
      nutritionTotals.saturatedFats != null
        ? nutritionTotals.saturatedFats.toFixed(1)
        : '',
      nutritionTotals.sugars != null ? nutritionTotals.sugars.toFixed(1) : '',
      log.completed ? 'Yes' : 'No',
      log.notes ? `"${log.notes.replace(/"/g, '""')}"` : '',
    ];
    csv += row.join(',') + '\n';
  });

  csv += '\n';

  // Weight entries
  csv += 'WEIGHT ENTRIES\n';
  csv += 'Date,Weight (kg)\n';

  const phaseWeights = weightEntries
    .filter((entry) => {
      if (entry.date < phase.startDate) return false;
      if (phase.endDate && entry.date > phase.endDate) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  phaseWeights.forEach((entry) => {
    csv += `${entry.date},${entry.weight}\n`;
  });

  const phaseHeartRate = getPhaseHeartRateRows(phase, heartRateEntries);
  if (phaseHeartRate.length) {
    csv += '\n';
    csv += 'HEART RATE\n';
    csv +=
      'Date,Resting HR (bpm),Resting Source,Avg HR (bpm),Max HR (bpm),VO2 Max\n';
    phaseHeartRate.forEach((entry) => {
      csv += [
        entry.date,
        entry.restingHr ?? '',
        entry.restingHrMethod ?? '',
        entry.avgHr ?? '',
        entry.maxHr ?? '',
        entry.vo2Max ?? '',
      ].join(',');
      csv += '\n';
    });
  }

  return saveTextFile({
    fileName: buildPhaseExportFileName(phase, 'csv'),
    content: csv,
    mimeType: 'text/csv;charset=utf-8;',
    title: `Export ${phase.name}`,
    dialogTitle: 'Export phase data',
  });
};

export const FULL_EXPORT_FORMAT_VERSION = 1;

/**
 * Fields left out of a full export: `cachedFoods` is a re-downloadable lookup
 * cache (up to 500 catalog rows), not something the user logged.
 */
const FULL_EXPORT_EXCLUDED_FIELDS = ['cachedFoods'];

/**
 * Builds the full-export document: the user's profile, settings and every
 * history dataset (`userData` is already the merged profile + history shape),
 * wrapped with a format version so a future importer can recognise it.
 *
 * @returns {object | null} `null` when there is nothing to export.
 */
export const buildFullExportPayload = (userData, now = new Date()) => {
  if (!userData || typeof userData !== 'object') {
    return null;
  }

  const data = { ...userData };
  FULL_EXPORT_EXCLUDED_FIELDS.forEach((field) => {
    delete data[field];
  });

  return {
    app: 'Energy Map',
    formatVersion: FULL_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
};

/**
 * Export everything the user has logged as one JSON file (Settings ->
 * Integrations -> Your data).
 *
 * Same delivery contract as `exportPhaseAsCSV`: web download or native share
 * sheet, resolved value instead of a throw.
 */
export const exportAllDataAsJSON = async (userData) => {
  const payload = buildFullExportPayload(userData);
  if (!payload) {
    return { success: false, method: 'none', error: 'No data to export' };
  }

  return saveTextFile({
    fileName: `energy-map-export_${getTodayDateKey()}.json`,
    content: JSON.stringify(payload, null, 2),
    mimeType: 'application/json',
    title: 'Energy Map data export',
    dialogTitle: 'Export all data',
  });
};

/**
 * Export phase data as JSON.
 *
 * Same delivery contract as `exportPhaseAsCSV`.
 */
export const exportPhaseAsJSON = async (
  phase,
  weightEntries,
  nutritionData = {},
  heartRateEntries = []
) => {
  if (!phase) {
    return { success: false, method: 'none', error: 'No phase selected' };
  }

  const metrics = calculatePhaseMetrics(
    phase,
    weightEntries,
    nutritionData,
    heartRateEntries
  );

  const phaseWeights = weightEntries
    .filter((entry) => {
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
      status: phase.isCompleted
        ? 'completed'
        : phase.isPaused
          ? 'paused'
          : 'active',
      createdAt: phase.createdAt || null,
      completedAt: phase.completedAt || null,
    },
    metrics: {
      weightChange: parseFloat(metrics.weightChange.toFixed(2)),
      avgWeeklyRate: parseFloat(metrics.avgWeeklyRate.toFixed(3)),
      completionRate: parseFloat(metrics.completionRate.toFixed(2)),
      startingWeight: phase.startingWeight
        ? parseFloat(phase.startingWeight.toFixed(2))
        : null,
      currentWeight: metrics.currentWeight
        ? parseFloat(metrics.currentWeight.toFixed(2))
        : null,
      activeDays: metrics.activeDays,
      totalDays: metrics.totalDays,
      nutritionDays: metrics.nutritionDays,
      avgProtein: parseFloat(metrics.avgProtein.toFixed(2)),
      avgCarbs: parseFloat(metrics.avgCarbs.toFixed(2)),
      avgFats: parseFloat(metrics.avgFats.toFixed(2)),
      avgFiber:
        metrics.avgFiber != null
          ? parseFloat(metrics.avgFiber.toFixed(2))
          : null,
      avgSodium:
        metrics.avgSodium != null
          ? parseFloat(metrics.avgSodium.toFixed(0))
          : null,
      avgSaturatedFats:
        metrics.avgSaturatedFats != null
          ? parseFloat(metrics.avgSaturatedFats.toFixed(2))
          : null,
      avgSugars:
        metrics.avgSugars != null
          ? parseFloat(metrics.avgSugars.toFixed(2))
          : null,
      restingHrStart: metrics.restingHrStart,
      restingHrEnd: metrics.restingHrEnd,
      restingHrChange: metrics.restingHrChange,
    },
    dailyLogs: Object.entries(phase.dailyLogs || {})
      .map(([date, log]) => ({
        date,
        ...log,
        nutritionTotals: getNutritionTotalsForDate(
          nutritionData,
          log?.nutritionRef
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    weightEntries: phaseWeights,
    heartRateEntries: getPhaseHeartRateRows(phase, heartRateEntries),
    exportedAt: new Date().toISOString(),
  };

  return saveTextFile({
    fileName: buildPhaseExportFileName(phase, 'json'),
    content: JSON.stringify(exportData, null, 2),
    mimeType: 'application/json',
    title: `Export ${phase.name}`,
    dialogTitle: 'Export phase data',
  });
};
