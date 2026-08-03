const MS_PER_MILLISECOND = 1;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getStartOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

export const buildHealthConnectStepReadWindow = (referenceDate = new Date()) => {
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