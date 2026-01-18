import { normalizeDateKey } from './weight';

const MS_PER_DAY = 86_400_000;

export const MIN_BODY_FAT_PERCENT = 2;
export const MAX_BODY_FAT_PERCENT = 60;

export const clampBodyFat = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const clamped = Math.min(
    Math.max(numeric, MIN_BODY_FAT_PERCENT),
    MAX_BODY_FAT_PERCENT
  );
  const rounded = Math.round(clamped * 10) / 10;
  return rounded;
};

export const formatBodyFat = (value) => {
  const numeric = clampBodyFat(value);
  if (numeric == null) {
    return null;
  }
  return Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1);
};

export const sortBodyFatEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const date = normalizeDateKey(entry.date);
      const bodyFat = clampBodyFat(entry.bodyFat);

      if (!date || bodyFat == null) {
        return null;
      }

      return { date, bodyFat };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

const getDateFromKey = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const resolveTrendLabel = (weeklyRate) => {
  const absRate = Math.abs(weeklyRate);

  if (absRate < 0.1) {
    return 'Stable';
  }

  if (weeklyRate < 0) {
    if (weeklyRate <= -1.2) return 'Severe body fat loss';
    if (weeklyRate <= -0.8) return 'Aggressive body fat loss';
    if (weeklyRate <= -0.45) return 'Moderate body fat loss';
    return 'Gradual body fat loss';
  }

  if (weeklyRate >= 1.2) return 'Severe body fat gain';
  if (weeklyRate >= 0.8) return 'Aggressive body fat gain';
  if (weeklyRate >= 0.45) return 'Moderate body fat gain';
  return 'Gradual body fat gain';
};

export const calculateBodyFatTrend = (entries, windowDays = 30) => {
  const sorted = sortBodyFatEntries(entries);
  if (sorted.length < 2) {
    return {
      label: sorted.length ? 'Need more data' : 'No data yet',
      delta: 0,
      weeklyRate: 0,
      direction: 'flat',
      sampleRange: sorted,
    };
  }

  const latest = sorted[sorted.length - 1];
  const latestDate = getDateFromKey(latest.date);
  if (!latestDate) {
    return {
      label: 'No data yet',
      delta: 0,
      weeklyRate: 0,
      direction: 'flat',
      sampleRange: sorted.slice(-2),
    };
  }

  const windowStartTime = latestDate.getTime() - windowDays * MS_PER_DAY;
  const windowEntries = sorted.filter((entry) => {
    const date = getDateFromKey(entry.date);
    if (!date) {
      return false;
    }
    return date.getTime() >= windowStartTime;
  });

  const sample = windowEntries.length >= 2 ? windowEntries : sorted.slice(-2);
  const first = sample[0];
  const firstDate = getDateFromKey(first.date);
  const final = sample[sample.length - 1];
  const finalDate = getDateFromKey(final.date);

  if (!firstDate || !finalDate) {
    return {
      label: 'No data yet',
      delta: 0,
      weeklyRate: 0,
      direction: 'flat',
      sampleRange: sample,
    };
  }

  const dayCount = Math.max(
    Math.round((finalDate.getTime() - firstDate.getTime()) / MS_PER_DAY),
    1
  );
  const delta = final.bodyFat - first.bodyFat;
  const weeklyRate = (delta / dayCount) * 7;
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const label = resolveTrendLabel(weeklyRate);

  return {
    label,
    delta,
    weeklyRate,
    direction,
    sampleRange: sample,
  };
};
