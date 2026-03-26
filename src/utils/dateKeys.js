const pad2 = (value) => String(value).padStart(2, '0');

const isValidDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const formatDateKeyLocal = (date) => {
  if (!isValidDate(date)) {
    return null;
  }

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

export const formatDateKeyUtc = (date) => {
  if (!isValidDate(date)) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
};

export const getTodayDateKey = () => formatDateKeyLocal(new Date());
