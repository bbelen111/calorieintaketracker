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

export const createBodyFatSparklinePoints = (
  entries,
  { width = 100, height = 32, padding = 4, limit = 8 } = {}
) => {
  const sorted = sortBodyFatEntries(entries);
  const recent = sorted.slice(-limit);
  if (!recent.length) {
    return {
      points: '',
      areaPath: '',
      min: null,
      max: null,
      range: 0,
      values: [],
    };
  }

  const values = recent.map((entry) => entry.bodyFat);
  const min = Math.min(...values);
  const max = Math.max(...values);
  let range = max - min;

  const minVisibleRange = 2;
  let effectiveMin = min;
  let effectiveMax = max;

  if (range < minVisibleRange) {
    const midpoint = (min + max) / 2;
    effectiveMin = midpoint - minVisibleRange / 2;
    effectiveMax = midpoint + minVisibleRange / 2;
    range = minVisibleRange;
  }

  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);
  const step = recent.length === 1 ? 0 : usableWidth / (recent.length - 1);
  const baselineY = height - padding;

  const coordinates = recent.map((entry, index) => {
    const x = padding + step * index;
    const normalized = (entry.bodyFat - effectiveMin) / range;
    const y = padding + (1 - normalized) * usableHeight;
    return { x, y, bodyFat: entry.bodyFat };
  });

  const points = coordinates
    .map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(' ');

  let areaPath = '';
  if (coordinates.length > 0) {
    areaPath = `M ${coordinates[0].x},${baselineY}`;
    areaPath += ` L ${coordinates[0].x},${coordinates[0].y}`;
    coordinates.forEach((coord) => {
      areaPath += ` L ${coord.x},${coord.y}`;
    });
    areaPath += ` L ${coordinates[coordinates.length - 1].x},${baselineY}`;
    areaPath += ' Z';
  }

  return {
    points,
    areaPath,
    min,
    max,
    range: max - min,
    effectiveMin,
    effectiveMax,
    coordinates,
    values: recent,
  };
};
