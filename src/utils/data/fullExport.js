/**
 * The "Export all data" file format and its reader (Settings -> Integrations ->
 * Your data). Build and parse live together so the two halves of the round trip
 * cannot drift: a document is `{ app, formatVersion, exportedAt, data }` where
 * `data` is the user's merged profile + history (`userData`).
 *
 * Pure and dependency-free so both test tiers can load it.
 */

export const FULL_EXPORT_APP_NAME = 'Energy Map';
export const FULL_EXPORT_FORMAT_VERSION = 1;

/**
 * Fields left out of a full export: `cachedFoods` is a re-downloadable lookup
 * cache (up to 500 catalog rows), not something the user logged.
 */
const FULL_EXPORT_EXCLUDED_FIELDS = ['cachedFoods'];

/**
 * Fields that describe THIS device rather than the person (a paired Bluetooth
 * sensor, whether health sync is switched on and permitted here). An import
 * keeps the device's own values instead of the file's.
 */
export const DEVICE_BOUND_FIELDS = ['heartRateSensor', 'heartRateSyncEnabled'];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Builds the full-export document.
 *
 * @returns {object | null} `null` when there is nothing to export.
 */
export const buildFullExportPayload = (userData, now = new Date()) => {
  if (!isPlainObject(userData)) {
    return null;
  }

  const data = { ...userData };
  FULL_EXPORT_EXCLUDED_FIELDS.forEach((field) => {
    delete data[field];
  });

  return {
    app: FULL_EXPORT_APP_NAME,
    formatVersion: FULL_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
};

const countArray = (value) => (Array.isArray(value) ? value.length : 0);

const countKeys = (value) =>
  isPlainObject(value) ? Object.keys(value).length : 0;

/** Headline numbers shown in the import confirmation. */
export const summarizeFullExport = (document) => {
  const data = document?.data ?? {};
  const exportedAtMs = Date.parse(document?.exportedAt);

  return {
    exportedAt: Number.isFinite(exportedAtMs)
      ? new Date(exportedAtMs).toISOString()
      : null,
    weighIns: countArray(data.weightEntries),
    loggedDays: countKeys(data.nutritionData),
    workouts:
      countArray(data.cardioSessions) + countArray(data.trainingSessions),
  };
};

const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/** `120 days of food, 45 weigh-ins and 30 workouts, exported 2026-03-10`. */
export const describeFullExportSummary = (summary) => {
  const parts = [
    `${pluralize(summary?.loggedDays ?? 0, 'day')} of food`,
    pluralize(summary?.weighIns ?? 0, 'weigh-in'),
    pluralize(summary?.workouts ?? 0, 'workout'),
  ];
  const list = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const exportedOn = summary?.exportedAt?.slice(0, 10);
  return exportedOn ? `${list}, exported ${exportedOn}` : list;
};

const failure = (error) => ({ ok: false, error });

/**
 * Reads and validates an export file's text. Never throws.
 *
 * @returns {{ ok: true, data: object, summary: object } | { ok: false, error: string }}
 */
export const parseFullExportText = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure("This file isn't valid JSON.");
  }

  if (!isPlainObject(parsed) || parsed.app !== FULL_EXPORT_APP_NAME) {
    return failure("This isn't an Energy Map export file.");
  }

  const version = Number(parsed.formatVersion);
  if (!Number.isInteger(version) || version < 1) {
    return failure("This export's format isn't recognised.");
  }
  if (version > FULL_EXPORT_FORMAT_VERSION) {
    return failure(
      'This export was made by a newer version of Energy Map. Update the app and try again.'
    );
  }

  if (!isPlainObject(parsed.data) || Object.keys(parsed.data).length === 0) {
    return failure('This export has no data in it.');
  }

  return {
    ok: true,
    data: parsed.data,
    summary: summarizeFullExport(parsed),
  };
};

/**
 * The data an import writes: the file's contents with this device's own
 * device-bound fields laid over them.
 */
export const applyDeviceBoundFields = (importedData, currentData) => {
  const next = { ...importedData };
  DEVICE_BOUND_FIELDS.forEach((field) => {
    if (currentData && field in currentData) {
      next[field] = currentData[field];
    } else {
      delete next[field];
    }
  });
  return next;
};
