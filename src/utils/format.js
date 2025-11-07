// Shared formatting utilities for the app
// formatOne: formats a finite number to one decimal place; leaves non-numbers untouched
export const formatOne = (v) => {
  if (typeof v !== 'number') return v;
  if (!Number.isFinite(v)) return v;
  return v.toFixed(1);
};

export default formatOne;
