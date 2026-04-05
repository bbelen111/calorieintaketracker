// Shared formatting utilities for the app
// formatOne: formats a finite number to one decimal place; leaves non-numbers untouched
export const formatOne = (v) => {
  // Leave non-number values untouched (preserve original behavior)
  if (typeof v !== 'number') return v;
  if (!Number.isFinite(v)) return v;

  // If value is an integer (e.g. 12.0), return without decimal.
  if (Number.isInteger(v)) return String(v);

  // Otherwise show one decimal place (e.g. 12.5)
  return v.toFixed(1);
};

export default formatOne;
