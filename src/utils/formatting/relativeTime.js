/**
 * Short "how long ago" label for a past moment (`just now`, `5 min ago`,
 * `3 h ago`, `2 d ago`). Used for sync status lines, where a precise clock time
 * is noise and a stale sync is the thing worth noticing.
 *
 * Returns `null` for anything that is not a usable timestamp so callers can
 * omit the label instead of rendering "NaN d ago". A moment slightly in the
 * future (clock skew) reads as `just now`.
 *
 * @param {Date | number | null | undefined} value Past moment.
 * @param {Date | number} [now] Injectable clock for tests.
 * @returns {string | null}
 */
export const formatRelativeTime = (value, now = new Date()) => {
  if (value == null) {
    return null;
  }
  const thenMs = value instanceof Date ? value.getTime() : Number(value);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) {
    return null;
  }

  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 45) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }

  return `${Math.round(hours / 24)} d ago`;
};
