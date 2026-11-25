// The one place units are converted and written out.
//
// Canonical values are kg, cm, km, g and kcal. Everything here converts FROM a
// canonical value for display, or back TO one from a picker. Rules:
//
// - Convert from the unrounded canonical value and round last.
// - Formatters never clamp; range limits belong to the pickers and sanitizers.
// - Metric output matches what the app printed before units existed.
// - `fromPicker(value, original)` returns `original` untouched when the picker
//   still shows it, so opening an entry and saving it never changes it.
import {
  DEFAULT_UNIT_PREFERENCES,
  normalizeUnitPreferences,
} from '../../constants/units/units.js';
import { formatOne } from '../formatting/format.js';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '../measurements/weight.js';
import { HEIGHT_MAX, HEIGHT_MIN } from '../measurements/profile.js';

export const KG_PER_LB = 0.45359237;
export const LB_PER_STONE = 14;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;
export const KM_PER_MILE = 1.609344;
export const GRAMS_PER_OUNCE = 28.349523125;
export const KJ_PER_KCAL = 4.184;

const DASH = '—';

const toFinite = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** Half-up rounding shared by displays and pickers so they always agree. */
export const roundTo = (value, decimals = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return NaN;
  }
  const factor = 10 ** decimals;
  const rounded =
    Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * factor) /
    factor;
  return rounded === 0 ? 0 : rounded;
};

/** Up to one decimal, without a trailing `.0`. */
const trimOne = (value) => {
  const rounded = roundTo(value, 1);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const withUnit = (value, unit, space = true) =>
  `${value}${space ? ' ' : ''}${unit}`;

// --- Body weight -------------------------------------------------------------

/** Whole stone + remaining pounds (1 decimal); 13.96 lb carries a stone. */
export const kgToStoneParts = (kg) => {
  const totalPounds = roundTo(Number(kg) / KG_PER_LB, 1);
  const stone = Math.floor(totalPounds / LB_PER_STONE);
  return {
    stone,
    pounds: roundTo(totalPounds - stone * LB_PER_STONE, 1),
  };
};

const createBodyWeight = (unit) => {
  const isStone = unit === 'st';
  // Absolute values in stone mode are written "11 st 10.2 lb"; changes, rates
  // and picker values are in pounds.
  const linearUnit = unit === 'kg' ? 'kg' : 'lb';
  const kgPerLinear = unit === 'kg' ? 1 : KG_PER_LB;

  const toNumber = (kg) => {
    const numeric = toFinite(kg);
    return numeric == null ? null : numeric / kgPerLinear;
  };

  /** `{ value, unit }` for surfaces that style the number and unit apart. */
  const parts = (kg, { fixed = null } = {}) => {
    const numeric = toFinite(kg);
    if (numeric == null) {
      return null;
    }
    if (isStone) {
      const { stone, pounds } = kgToStoneParts(numeric);
      const poundsText =
        fixed != null ? pounds.toFixed(fixed) : trimOne(pounds);
      return { value: `${stone} st ${poundsText}`, unit: 'lb' };
    }
    const converted = numeric / kgPerLinear;
    return {
      value: fixed != null ? converted.toFixed(fixed) : trimOne(converted),
      unit: linearUnit,
    };
  };

  const format = (kg, { space = true, fixed = null, fallback = DASH } = {}) => {
    const resolved = parts(kg, { fixed });
    if (!resolved) {
      return fallback;
    }
    return withUnit(resolved.value, resolved.unit, isStone ? true : space);
  };

  /** Unsigned magnitude of a change, e.g. `0.15 kg`. */
  const formatAmount = (kg, { digits = 1, space = true } = {}) => {
    const converted = toNumber(kg);
    return converted == null
      ? ''
      : withUnit(Math.abs(converted).toFixed(digits), linearUnit, space);
  };

  /** Signed change, e.g. `+0.4 kg`. Empty for non-finite input. */
  const formatDelta = (kg, { digits = 1, space = true } = {}) => {
    const converted = toNumber(kg);
    if (converted == null) {
      return '';
    }
    const sign = converted > 0 ? '+' : converted < 0 ? '-' : '';
    return withUnit(
      `${sign}${Math.abs(converted).toFixed(digits)}`,
      linearUnit,
      space
    );
  };

  /** Signed weekly rate, e.g. `+0.25 kg/wk`; zero reads `0.0 kg/wk`. */
  const formatRate = (kgPerWeek, { digits = 2, per = 'wk' } = {}) => {
    const converted = toNumber(kgPerWeek);
    if (converted == null || converted === 0) {
      return `0.0 ${linearUnit}/${per}`;
    }
    const sign = converted > 0 ? '+' : '';
    return `${sign}${converted.toFixed(digits)} ${linearUnit}/${per}`;
  };

  /** Chart axis label (no unit in kg / lb, compact stone otherwise). */
  const formatTick = (kg) => {
    const numeric = toFinite(kg);
    if (numeric == null) {
      return '';
    }
    if (isStone) {
      const total = Math.round(numeric / KG_PER_LB);
      return `${Math.floor(total / LB_PER_STONE)}st ${total % LB_PER_STONE}`;
    }
    return trimOne(numeric / kgPerLinear);
  };

  const pickerStep = isStone ? 0.5 : 0.1;

  /** The value a picker shows for a canonical weight (lb in stone mode). */
  const toPicker = (kg) => {
    const converted = toNumber(kg);
    if (converted == null) {
      return null;
    }
    return isStone ? roundTo(converted * 2, 0) / 2 : roundTo(converted, 1);
  };

  const fromPicker = (value, originalKg = null) => {
    const numeric = toFinite(value);
    if (numeric == null) {
      return toFinite(originalKg);
    }
    const original = toFinite(originalKg);
    if (original != null && toPicker(original) === numeric) {
      return original;
    }
    const kg = roundTo(numeric * kgPerLinear, 2);
    return Math.min(Math.max(kg, MIN_WEIGHT_KG), MAX_WEIGHT_KG);
  };

  return {
    unit,
    linearUnit,
    isStone,
    // Decimals the averaging helpers keep: kg keeps today's one decimal, other
    // units need two so the converted figure rounds correctly.
    mathPrecision: unit === 'kg' ? 1 : 2,
    pickerStep,
    pickerRange: {
      min: toPicker(MIN_WEIGHT_KG),
      max: toPicker(MAX_WEIGHT_KG),
    },
    toNumber,
    parts,
    format,
    formatAmount,
    formatDelta,
    formatRate,
    formatTick,
    toPicker,
    fromPicker,
  };
};

// --- Height ------------------------------------------------------------------

export const cmToFeetInches = (cm) => {
  const totalInches = Math.round(Number(cm) / CM_PER_INCH);
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
};

const createHeight = (unit) => {
  const isFeet = unit === 'ft';

  const format = (cm, { fallback = DASH } = {}) => {
    const numeric = toFinite(cm);
    if (numeric == null) {
      return fallback;
    }
    if (isFeet) {
      const { feet, inches } = cmToFeetInches(numeric);
      return `${feet}′${inches}″`;
    }
    return `${numeric} cm`;
  };

  const fromParts = (feet, inches, originalCm = null) => {
    const total = Number(feet) * INCHES_PER_FOOT + Number(inches);
    const original = toFinite(originalCm);
    if (original != null && Math.round(original / CM_PER_INCH) === total) {
      return original;
    }
    const cm = Math.round(total * CM_PER_INCH);
    return Math.min(Math.max(cm, HEIGHT_MIN), HEIGHT_MAX);
  };

  return {
    unit,
    isFeet,
    inchRange: {
      min: Math.round(HEIGHT_MIN / CM_PER_INCH),
      max: Math.round(HEIGHT_MAX / CM_PER_INCH),
    },
    toParts: cmToFeetInches,
    fromParts,
    format,
  };
};

// --- Distance ----------------------------------------------------------------

const createDistance = (unit) => {
  const kmPerUnit = unit === 'mi' ? KM_PER_MILE : 1;

  const toNumber = (km) => {
    const numeric = toFinite(km);
    return numeric == null ? null : numeric / kmPerUnit;
  };

  return {
    unit,
    kmPerUnit,
    toNumber,
    format: (km, { digits = 1, fallback = DASH } = {}) => {
      const converted = toNumber(km);
      return converted == null
        ? fallback
        : `${converted.toFixed(digits)} ${unit}`;
    },
  };
};

// --- Food weight -------------------------------------------------------------

export const createFoodUnit = (unit) => {
  const isOunce = unit === 'oz';
  const gramsPerUnit = isOunce ? GRAMS_PER_OUNCE : 1;
  const basisGrams = isOunce ? GRAMS_PER_OUNCE : 100;

  const toNumber = (grams) => {
    const numeric = toFinite(grams);
    return numeric == null ? null : numeric / gramsPerUnit;
  };

  /** The number alone: `174`, `6.1`. */
  const value = (grams) => {
    const converted = toNumber(grams);
    if (converted == null) {
      return DASH;
    }
    return isOunce ? trimOne(converted) : formatOne(converted);
  };

  const format = (grams, { space = true } = {}) => {
    if (toFinite(grams) == null) {
      return DASH;
    }
    return withUnit(value(grams), unit, space);
  };

  /** A per-100g value restated for the display basis (per 100 g or per oz). */
  const perBasis = (per100gValue) => {
    const numeric = toFinite(per100gValue);
    if (numeric == null) {
      return per100gValue ?? null;
    }
    return isOunce ? (numeric * GRAMS_PER_OUNCE) / 100 : numeric;
  };

  /** Re-writes a label that is only a weight ("100g"); "1 cup" is kept. */
  const formatPortionLabel = (label) => {
    if (!isOunce) {
      return label;
    }
    const match = /^\s*(\d+(?:\.\d+)?)\s*(?:g|grams?|grammes?)\s*$/i.exec(
      String(label ?? '')
    );
    return match ? format(Number(match[1])) : label;
  };

  const toPicker = (grams) => {
    const converted = toNumber(grams);
    return converted == null ? null : roundTo(converted, 1);
  };

  const fromPicker = (picked, originalGrams = null) => {
    const numeric = toFinite(picked);
    const original = toFinite(originalGrams);
    if (numeric == null) {
      return original;
    }
    if (original != null && toPicker(original) === numeric) {
      return original;
    }
    return roundTo(numeric * gramsPerUnit, 1);
  };

  return {
    unit,
    isOunce,
    gramsPerUnit,
    basisGrams,
    basisLabel: isOunce ? 'per oz' : 'per 100g',
    basisAmountLabel: isOunce ? '1 oz' : '100 g',
    toNumber,
    value,
    format,
    perBasis,
    formatPortionLabel,
    toPicker,
    fromPicker,
  };
};

// --- Energy ------------------------------------------------------------------

const createEnergy = (unit) => {
  const isKj = unit === 'kJ';
  const factor = isKj ? KJ_PER_KCAL : 1;

  const toNumber = (kcal) => {
    const numeric = toFinite(kcal);
    return numeric == null ? null : numeric * factor;
  };

  /** Whole number, optionally signed (`+350`) or without separators. */
  const value = (
    kcal,
    { grouping = true, signed = false, fallback = DASH } = {}
  ) => {
    const converted = toNumber(kcal);
    if (converted == null) {
      return fallback;
    }
    const rounded = Math.round(converted) || 0;
    const text = grouping ? rounded.toLocaleString() : String(rounded);
    return signed && rounded > 0 ? `+${text}` : text;
  };

  const format = (kcal, options = {}) => {
    if (toFinite(kcal) == null) {
      return options.fallback ?? DASH;
    }
    return `${value(kcal, options)} ${unit}`;
  };

  /**
   * Food amounts: kcal keep one decimal (`formatOne`), kJ are whole numbers.
   */
  const compact = (kcal) => {
    if (!isKj) {
      return formatOne(kcal);
    }
    return value(kcal);
  };

  /** Fixed decimals for formula lines. */
  const decimal = (kcal, digits = 1) => {
    const converted = toNumber(kcal);
    return converted == null ? DASH : converted.toFixed(digits);
  };

  const toPicker = (kcal) => {
    const converted = toNumber(kcal);
    if (converted == null) {
      return null;
    }
    return isKj ? Math.round(converted) : converted;
  };

  const fromPicker = (picked, originalKcal = null) => {
    const numeric = toFinite(picked);
    const original = toFinite(originalKcal);
    if (numeric == null) {
      return original;
    }
    if (original != null && toPicker(original) === numeric) {
      return original;
    }
    return isKj ? roundTo(numeric / KJ_PER_KCAL, 2) : numeric;
  };

  return {
    unit,
    isKj,
    noun: isKj ? 'Energy' : 'Calories',
    // The word some cards print after a bare number.
    shortUnit: isKj ? 'kJ' : 'cal',
    longUnit: isKj ? 'kJ' : 'calories',
    toNumber,
    value,
    format,
    compact,
    decimal,
    toPicker,
    fromPicker,
  };
};

// --- Formatter ---------------------------------------------------------------

const build = (preferences) =>
  Object.freeze({
    preferences,
    bodyWeight: createBodyWeight(preferences.bodyWeight),
    height: createHeight(preferences.height),
    distance: createDistance(preferences.distance),
    food: createFoodUnit(preferences.foodWeight),
    energy: createEnergy(preferences.energy),
  });

export const METRIC_UNITS = build({ ...DEFAULT_UNIT_PREFERENCES });

const cache = new WeakMap();

/**
 * Formatter for a stored preference object, cached by reference so components
 * can use it as a stable `useMemo` dependency.
 */
export const createUnitFormatter = (preferences) => {
  if (!preferences || typeof preferences !== 'object') {
    return METRIC_UNITS;
  }
  let formatter = cache.get(preferences);
  if (!formatter) {
    formatter = build(normalizeUnitPreferences(preferences));
    cache.set(preferences, formatter);
  }
  return formatter;
};
