const MS_PER_MILLISECOND = 1;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getStartOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

export const buildHealthConnectStepReadWindow = (
  referenceDate = new Date()
) => {
  const resolvedReferenceDate =
    referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (Number.isNaN(resolvedReferenceDate.getTime())) {
    return null;
  }

  const startDate = new Date(
    getStartOfLocalDay(resolvedReferenceDate).getTime() + MS_PER_SECOND
  );
  let endDate = new Date(resolvedReferenceDate.getTime());

  if (endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(startDate.getTime() + MS_PER_MILLISECOND);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

export const buildHealthConnectFallbackReadWindow = (
  referenceDate = new Date()
) => {
  const resolvedReferenceDate =
    referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (Number.isNaN(resolvedReferenceDate.getTime())) {
    return null;
  }

  const endDate = new Date(resolvedReferenceDate.getTime());
  const startDate = new Date(endDate.getTime() - MS_PER_DAY);

  if (endDate.getTime() <= startDate.getTime()) {
    return null;
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

/**
 * `[local 00:00, next local 00:00)` for a `YYYY-MM-DD` day, clipped to `now`
 * for today. Built from the calendar date (not "start + 24 h"), so a DST day
 * is correctly 23 or 25 hours long. Heart-rate reads query ONE local day per
 * call for exactly this reason: a multi-day `bucket: 'day'` aggregate is a
 * fixed 24 h duration on Android and drifts an hour across a DST change.
 *
 * @returns {{ startDate: string, endDate: string } | null} ISO strings, or
 *   `null` for an invalid key or a day that has not started yet.
 */
export const buildLocalDayReadWindow = (dateKey, now = new Date()) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? '').trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(year, month, day, 0, 0, 0, 0);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month ||
    start.getDate() !== day
  ) {
    return null;
  }
  const nextStart = new Date(year, month, day + 1, 0, 0, 0, 0);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs) || nowMs <= start.getTime()) {
    return null;
  }
  const end = new Date(Math.min(nextStart.getTime(), nowMs));
  return { startDate: start.toISOString(), endDate: end.toISOString() };
};

/** Local `YYYY-MM-DD` of an ISO timestamp / Date / epoch ms (null if invalid). */
export const toLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Aggregate Health Connect step samples, deduping across multiple sources.
 *
 * Health Connect may return overlapping records from several apps
 * (e.g. Samsung Health + Google Fit), so we group by source package/id and
 * take the maximum total from any single source to avoid double counting.
 *
 * @param {{ samples?: Array<{ value?: number|string, count?: number|string, sourceId?: string, sourceName?: string }> }} result
 * @returns {number} The max step total from a single source (0 if none).
 */
export const aggregateStepsBySource = (result) => {
  if (!result?.samples || !Array.isArray(result.samples)) {
    return 0;
  }

  const stepsBySource = {};

  result.samples.forEach((sample) => {
    // Health Connect may return steps in 'value' or 'count' field
    const stepValue = Number(sample.value) || Number(sample.count) || 0;
    // Use sourceId (package name) or sourceName as the grouping key, fallback to 'unknown'
    const sourceKey = sample.sourceId || sample.sourceName || 'unknown';

    if (!stepsBySource[sourceKey]) {
      stepsBySource[sourceKey] = 0;
    }
    stepsBySource[sourceKey] += stepValue;
  });

  // Take the maximum steps from any single source
  return Math.max(0, ...Object.values(stepsBySource));
};
