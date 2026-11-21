/**
 * Display helpers for heart-rate values (presentation only; the numbers come
 * from utils/calculations/heartRate.js and the stored entries).
 */

export const formatBpm = (value, fallback = '—') => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? `${Math.round(numeric)} bpm`
    : fallback;
};

const RESTING_METHOD_LABELS = {
  device: 'watch',
  manual: 'manual',
  estimated: 'estimated',
};

/** 'watch' | 'manual' | 'estimated' | null */
export const describeRestingHrMethod = (method) =>
  RESTING_METHOD_LABELS[method] ?? null;

const SESSION_SOURCE_LABELS = {
  healthConnect: 'From watch',
  ble: 'From sensor',
  manual: 'Entered',
};

export const describeSessionHeartRateSource = (source) =>
  SESSION_SOURCE_LABELS[source] ?? null;

const MAX_SOURCE_LABELS = {
  custom: 'custom',
  observed: 'observed',
  predicted: 'age-predicted',
};

export const describeMaxHrSource = (source) => MAX_SOURCE_LABELS[source] ?? '';

/** "+2.4 bpm" / "-3 bpm" / "0 bpm" (uncoloured by design). */
export const formatSignedBpm = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  const rounded = Math.round(numeric * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded)} bpm`;
};

/** "12:34" mm:ss, or "1:02:03" past an hour. */
export const formatElapsed = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const mm = String(minutes).padStart(hours ? 2 : 1, '0');
  const ss = String(remainder).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** "12 min" / "1 h 05 min" for zone time. */
export const formatZoneDuration = (totalSeconds) => {
  const minutes = Math.round((Number(totalSeconds) || 0) / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
};
