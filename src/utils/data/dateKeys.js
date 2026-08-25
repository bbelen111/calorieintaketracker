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

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build an inclusive list of exactly `n` consecutive UTC date keys ending at
 * `endDateKey` (i.e. `[E-(n-1), ..., E]`). Uses UTC-midnight arithmetic so
 * results are stable across timezones/DST.
 *
 * @param {string} endDateKey - Anchor date key (`YYYY-MM-DD`), window end.
 * @param {number} n - Window size in days (must be >= 1).
 * @returns {string[]} Ordered date keys (oldest first), or [] on invalid input.
 */
export const getWindowDateKeys = (endDateKey, n) => {
  if (typeof endDateKey !== 'string') {
    return [];
  }

  const trimmedKey = endDateKey.trim();
  if (!DATE_KEY_PATTERN.test(trimmedKey)) {
    return [];
  }

  const count = Math.floor(Number(n));
  if (!Number.isFinite(count) || count < 1) {
    return [];
  }

  const endDate = new Date(`${trimmedKey}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) {
    return [];
  }

  // Guard against non-canonical keys (e.g. '2026-02-31') that JS may coerce.
  if (formatDateKeyUtc(endDate) !== trimmedKey) {
    return [];
  }

  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(endDate);
    day.setUTCDate(day.getUTCDate() - offset);
    keys.push(formatDateKeyUtc(day));
  }
  return keys;
};
