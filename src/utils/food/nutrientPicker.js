// Numeric picker fields + value helpers shared by the Manual Food Entry modal
// and the Add Custom Food form. Bounds are canonical: calories in kcal,
// macros/micros in grams, sodium in milligrams. Used with
// `NumericValuePickerModal` so both forms snap values to the same steps.
export const NUTRIENT_PICKER_FIELDS = {
  calories: {
    title: 'Calories',
    unitLabel: 'kcal',
    min: 0,
    max: 5000,
    step: 5,
  },
  protein: {
    title: 'Protein',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
  carbs: {
    title: 'Carbs',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
  fats: {
    title: 'Fats',
    unitLabel: 'grammes',
    min: 0,
    max: 500,
    step: 0.5,
  },
  fiber: {
    title: 'Fiber',
    unitLabel: 'grammes',
    min: 0,
    max: 200,
    step: 0.5,
  },
  sodium: {
    title: 'Sodium',
    unitLabel: 'milligrams',
    min: 0,
    max: 5000,
    step: 10,
  },
  saturatedFats: {
    title: 'Saturated Fat',
    unitLabel: 'grammes',
    min: 0,
    max: 200,
    step: 0.5,
  },
  sugars: {
    title: 'Sugars',
    unitLabel: 'grammes',
    min: 0,
    max: 200,
    step: 0.5,
  },
};

// Custom-portion weight in grams (Add Custom Food only).
export const PORTION_GRAMS_PICKER_FIELD = {
  title: 'Portion Grams',
  unitLabel: 'grammes',
  min: 1,
  max: 1000,
  step: 1,
};

export const getStepPrecision = (step) => {
  const normalized = String(step ?? 1);
  if (!normalized.includes('.')) {
    return 0;
  }

  return normalized.split('.')[1]?.length ?? 0;
};

export const normalizePickerValue = (value, config) => {
  const { min = 0, max = 100, step = 1 } = config ?? {};
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const precision = getStepPrecision(safeStep);
  const scale = 10 ** precision;

  const minInt = Math.round(min * scale);
  const maxInt = Math.round(max * scale);
  const stepInt = Math.max(1, Math.round(safeStep * scale));
  const numericValue = Number.isFinite(value) ? value : min;
  const valueInt = Math.round(
    Math.min(Math.max(numericValue, min), max) * scale
  );
  const steppedInt =
    minInt + Math.round((valueInt - minInt) / stepInt) * stepInt;
  const clampedInt = Math.min(Math.max(steppedInt, minInt), maxInt);

  return clampedInt / scale;
};

export const formatPickerValueForState = (value, step) => {
  const precision = getStepPrecision(step);
  if (precision <= 0) {
    return String(Math.round(value));
  }

  return value
    .toFixed(precision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
};

// Trigger-button label for a picker field: `12.5 g`, `0 g` when unset.
export const formatPickerDisplayValue = (value, unit = '') => {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) {
    return unit ? `0 ${unit}` : '0';
  }

  const formatted = Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1).replace(/\.0$/, '');

  return unit ? `${formatted} ${unit}` : formatted;
};
