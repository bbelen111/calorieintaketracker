import {
  calculatePhaseMetrics,
  getNutritionTotalsForDate,
} from './phases/phases.js';
import { getTodayDateKey } from './data/dateKeys.js';
import { sortHeartRateEntries } from './measurements/heartRate.js';
import { saveTextFile, saveTextFileToDevice } from '../services/fileShare.js';
import {
  buildFullExportPayload,
  FULL_EXPORT_FORMAT_VERSION,
} from './data/fullExport.js';
import { METRIC_UNITS } from './units/unitFormatter.js';

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
 *
 * `units` sets the body-weight and energy units of the CSV (stone is written
 * in pounds, so every column stays a plain number). The JSON exports always
 * keep the stored kg and kcal.
 */
export const exportPhaseAsCSV = async (
  phase,
  weightEntries,
  nutritionData = {},
  heartRateEntries = [],
  units = METRIC_UNITS
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

  const { bodyWeight, energy } = units;
  const isKilograms = bodyWeight.linearUnit === 'kg';
  // A stored weight as a number in the column's unit.
  const weightNumber = (kg, digits) => bodyWeight.toNumber(kg).toFixed(digits);

  // Build CSV content
  let csv = '';

  // Phase header
  csv += 'PHASE INFORMATION\n';
  csv += `Name,${phase.name}\n`;
  csv += `Start Date,${phase.startDate}\n`;
  csv += `End Date,${phase.endDate || 'Ongoing'}\n`;
  csv += `Goal,${phase.goalType || 'None'}\n`;
  const targetWeight = isKilograms
    ? phase.targetWeight
    : phase.targetWeight && weightNumber(phase.targetWeight, 1);
  csv += `Target Weight,${phase.targetWeight ? `${targetWeight} ${bodyWeight.linearUnit}` : 'Not set'}\n`;
  csv += `Status,${phase.isCompleted ? 'Completed' : phase.isPaused ? 'Paused' : 'Active'}\n`;
  csv += '\n';

  // Phase metrics
  csv += 'PHASE METRICS\n';
  csv += `Weight Change,${weightNumber(metrics.weightChange, 2)} ${bodyWeight.linearUnit}\n`;
  csv += `Average Weekly Rate,${weightNumber(metrics.avgWeeklyRate, 2)} ${bodyWeight.linearUnit}/week\n`;
  csv += `Completion Rate,${metrics.completionRate.toFixed(1)}%\n`;
  csv += `Starting Weight,${phase.startingWeight ? `${weightNumber(phase.startingWeight, 1)} ${bodyWeight.linearUnit}` : 'Not recorded'}\n`;
  csv += `Current Weight,${metrics.currentWeight ? `${weightNumber(metrics.currentWeight, 1)} ${bodyWeight.linearUnit}` : 'Not recorded'}\n`;
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
  const energyColumn = energy.isKj ? 'Energy (kJ)' : 'Calories';
  csv += `Date,Weight Ref,Body Fat Ref,Nutrition Ref,${energyColumn},Protein,Carbs,Fats,Fiber,Sodium,SaturatedFat,Sugars,Completed,Notes\n`;

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
      nutritionTotals.calories
        ? energy.decimal(nutritionTotals.calories, 1)
        : '',
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
  csv += `Date,Weight (${bodyWeight.linearUnit})\n`;

  const phaseWeights = weightEntries
    .filter((entry) => {
      if (entry.date < phase.startDate) return false;
      if (phase.endDate && entry.date > phase.endDate) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  phaseWeights.forEach((entry) => {
    const weight = isKilograms ? entry.weight : weightNumber(entry.weight, 1);
    csv += `${entry.date},${weight}\n`;
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

// The file format (build + parse) lives in `data/fullExport.js`; re-exported so
// existing callers keep importing it from here.
export { buildFullExportPayload, FULL_EXPORT_FORMAT_VERSION };

/** `energy-map-export_2026-03-10_1432.json`: the time keeps repeat exports apart. */
const buildFullExportFileName = (now = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `energy-map-export_${getTodayDateKey()}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
};

/**
 * Export everything the user has logged as one JSON file (Settings ->
 * Integrations -> Your data).
 *
 * By default the file is SAVED where the platform lets an app do so (a web
 * download; Android's public Documents folder), and only handed to the share
 * sheet where that is the platform's own save route (iOS) or the save was
 * refused. `{ share: true }` always opens the share sheet instead.
 *
 * Same delivery contract as `exportPhaseAsCSV`: resolved value, never a throw.
 */
export const exportAllDataAsJSON = async (userData, { share = false } = {}) => {
  const payload = buildFullExportPayload(userData);
  if (!payload) {
    return { success: false, method: 'none', error: 'No data to export' };
  }

  const deliver = share ? saveTextFile : saveTextFileToDevice;
  return deliver({
    fileName: buildFullExportFileName(),
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
