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
