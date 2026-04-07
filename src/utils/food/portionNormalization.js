const DEFAULT_UNIT_GRAMS = Object.freeze({
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  pound: 453.592,
  pounds: 453.592,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  cup: 240,
  cups: 240,
  slice: 30,
  slices: 30,
  piece: 50,
  pieces: 50,
  serving: 100,
  servings: 100,
});

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizePortionUnit = (unit) => {
  return String(unit ?? '')
    .trim()
    .toLowerCase();
};

export const resolveEntryGrams = (entry, options = {}) => {
  const fallbackGrams = Math.max(1, Number(options.fallbackGrams) || 100);
  const unitGramMap = {
    ...DEFAULT_UNIT_GRAMS,
    ...(options.unitGramMap && typeof options.unitGramMap === 'object'
      ? options.unitGramMap
      : {}),
  };

  const explicitGrams = toFiniteNumber(entry?.grams);
  if (explicitGrams && explicitGrams > 0) {
    return {
      grams: explicitGrams,
      method: 'explicit_grams',
      assumed: false,
    };
  }

  const quantity = toFiniteNumber(entry?.quantity);
  const unit = normalizePortionUnit(entry?.unit);
  const unitGrams = unit ? toFiniteNumber(unitGramMap[unit]) : null;

  if (quantity && quantity > 0 && unitGrams && unitGrams > 0) {
    return {
      grams: quantity * unitGrams,
      method: `quantity_unit:${unit}`,
      assumed: true,
    };
  }

  return {
    grams: fallbackGrams,
    method: 'fallback_default',
    assumed: true,
  };
};

export const scaleMacrosFromPer100g = (per100g = {}, grams = 100) => {
  const safeGrams = Math.max(1, Number(grams) || 100);
  const factor = safeGrams / 100;

  const calories = Math.max(
    0,
    Math.round((Number(per100g?.calories) || 0) * factor)
  );
  const protein = Math.max(
    0,
    Math.round((Number(per100g?.protein) || 0) * factor * 10) / 10
  );
  const carbs = Math.max(
    0,
    Math.round((Number(per100g?.carbs) || 0) * factor * 10) / 10
  );
  const fats = Math.max(
    0,
    Math.round((Number(per100g?.fats) || 0) * factor * 10) / 10
  );

  return {
    calories,
    protein,
    carbs,
    fats,
  };
};
