const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 210;

export const clampWeight = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const clamped = Math.min(Math.max(numeric, MIN_WEIGHT_KG), MAX_WEIGHT_KG);
  const rounded = Math.round(clamped * 10) / 10;
  return rounded;
};

export const normalizeDateKey = (value) => {
  if (value == null) {
    return null;
  }

  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!DATE_KEY_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
};

export const sortWeightEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const date = normalizeDateKey(entry.date);
      const weight = clampWeight(entry.weight);

      if (!date || weight == null) {
        return null;
      }

      return { date, weight };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
};

const getDateFromKey = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

export const formatWeight = (value) => {
  const numeric = clampWeight(value);
  if (numeric == null) {
    return null;
  }
  return Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1);
};

export const formatDateLabel = (dateKey, options) => {
  const date = getDateFromKey(dateKey);
  if (!date) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat(undefined, options ?? {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return formatter.format(date);
};

const resolveTrendLabel = (weeklyRate) => {
  const absRate = Math.abs(weeklyRate);

  if (absRate < 0.1) {
    return 'Stable';
  }

  if (weeklyRate < 0) {
    if (weeklyRate <= -1.2) return 'Severe weight loss';
    if (weeklyRate <= -0.8) return 'Aggressive weight loss';
    if (weeklyRate <= -0.45) return 'Moderate weight loss';
    return 'Gradual weight loss';
  }

  if (weeklyRate >= 1.2) return 'Severe weight gain';
  if (weeklyRate >= 0.8) return 'Aggressive weight gain';
  if (weeklyRate >= 0.45) return 'Moderate weight gain';
  return 'Gradual weight gain';
};

export const calculateWeightTrend = (entries, windowDays = 30) => {
  const sorted = sortWeightEntries(entries);
  if (sorted.length < 2) {
    return {
      label: sorted.length ? 'Need more data' : 'No data yet',
      delta: 0,
      weeklyRate: 0,
      direction: 'flat',
      sampleRange: sorted
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
      sampleRange: sorted.slice(-2)
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
      sampleRange: sample
    };
  }

  const dayCount = Math.max(Math.round((finalDate.getTime() - firstDate.getTime()) / MS_PER_DAY), 1);
  const delta = final.weight - first.weight;
  const weeklyRate = (delta / dayCount) * 7;
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const label = resolveTrendLabel(weeklyRate);

  return {
    label,
    delta,
    weeklyRate,
    direction,
    sampleRange: sample
  };
};

export const createSparklinePoints = (entries, {
  width = 100,
  height = 32,
  padding = 4,
  limit = 8
} = {}) => {
  const sorted = sortWeightEntries(entries);
  const recent = sorted.slice(-limit);
  if (!recent.length) {
    return {
      points: '',
      areaPath: '',
      min: null,
      max: null,
      range: 0,
      values: []
    };
  }

  const weights = recent.map(entry => entry.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  let range = max - min;
  
  // For stable weight (small or zero range), create a visible range
  // This ensures the graph is still drawn with some visual variation
  const minVisibleRange = 2; // kg - minimum range to show on the graph
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

  // Calculate baseline Y position (bottom of the chart)
  const baselineY = height - padding;

  const coordinates = recent.map((entry, index) => {
    const x = padding + step * index;
    const normalized = (entry.weight - effectiveMin) / range;
    const y = padding + (1 - normalized) * usableHeight;
    return { x, y, weight: entry.weight };
  });

  // Create line points
  const points = coordinates
    .map(coord => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(' ');

  // Create area path (line + fill to baseline)
  let areaPath = '';
  if (coordinates.length > 0) {
    // Start at bottom-left
    areaPath = `M ${coordinates[0].x},${baselineY}`;
    // Line up to first point
    areaPath += ` L ${coordinates[0].x},${coordinates[0].y}`;
    // Draw through all points
    coordinates.forEach(coord => {
      areaPath += ` L ${coord.x},${coord.y}`;
    });
    // Line down to bottom-right
    areaPath += ` L ${coordinates[coordinates.length - 1].x},${baselineY}`;
    // Close path back to start
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
    values: recent
  };
};

export const getTotalWeightChange = (entries) => {
  const sorted = sortWeightEntries(entries);
  if (sorted.length < 2) {
    return 0;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return last.weight - first.weight;
};
