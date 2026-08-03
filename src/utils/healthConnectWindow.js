const MS_PER_MILLISECOND = 1;

const getStartOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

export const buildHealthConnectStepReadWindow = (referenceDate = new Date()) => {
  const resolvedReferenceDate =
    referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (Number.isNaN(resolvedReferenceDate.getTime())) {
    return null;
  }

  const startDate = getStartOfLocalDay(resolvedReferenceDate);
  let endDate = new Date(resolvedReferenceDate.getTime());

  if (endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(startDate.getTime() + MS_PER_MILLISECOND);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};