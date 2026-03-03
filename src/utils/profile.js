export const AGE_MIN = 1;
export const AGE_MAX = 100;
export const HEIGHT_MIN = 120;
export const HEIGHT_MAX = 220;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const toNumber = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return NaN;
    }
    return Number(trimmed);
  }
  return Number(value);
};

export const sanitizeAge = (value, fallback = 21) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return clamp(Math.round(fallback), AGE_MIN, AGE_MAX);
  }
  return clamp(Math.round(numeric), AGE_MIN, AGE_MAX);
};

export const sanitizeHeight = (value, fallback = 168) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return clamp(Math.round(fallback), HEIGHT_MIN, HEIGHT_MAX);
  }
  return clamp(Math.round(numeric), HEIGHT_MIN, HEIGHT_MAX);
};
