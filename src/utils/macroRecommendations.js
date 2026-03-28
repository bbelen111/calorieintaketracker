const PROTEIN_CALORIES_PER_GRAM = 4;
const CARB_CALORIES_PER_GRAM = 4;
const FAT_CALORIES_PER_GRAM = 9;

export const DEFAULT_MACRO_RECOMMENDATION_SPLIT = {
  protein: 0.3,
  carbs: 0.4,
  fats: 0.3,
};

const MACRO_KEYS = ['protein', 'carbs', 'fats'];

const toSafeRatio = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
};

const roundToTenth = (value) => Math.round(value * 10) / 10;

export const normalizeMacroRecommendationSplit = (value) => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : DEFAULT_MACRO_RECOMMENDATION_SPLIT;

  const raw = {
    protein: toSafeRatio(source.protein),
    carbs: toSafeRatio(source.carbs),
    fats: toSafeRatio(source.fats),
  };

  const total = raw.protein + raw.carbs + raw.fats;
  const fallbackTotal =
    DEFAULT_MACRO_RECOMMENDATION_SPLIT.protein +
    DEFAULT_MACRO_RECOMMENDATION_SPLIT.carbs +
    DEFAULT_MACRO_RECOMMENDATION_SPLIT.fats;

  if (total <= 0) {
    return {
      protein:
        DEFAULT_MACRO_RECOMMENDATION_SPLIT.protein / (fallbackTotal || 1),
      carbs: DEFAULT_MACRO_RECOMMENDATION_SPLIT.carbs / (fallbackTotal || 1),
      fats: DEFAULT_MACRO_RECOMMENDATION_SPLIT.fats / (fallbackTotal || 1),
    };
  }

  return {
    protein: raw.protein / total,
    carbs: raw.carbs / total,
    fats: raw.fats / total,
  };
};

export const calculateMacroRecommendations = ({
  targetCalories,
  macroSplit,
}) => {
  const split = normalizeMacroRecommendationSplit(macroSplit);
  const safeTargetCalories = Math.max(0, Number(targetCalories) || 0);

  const proteinCalories = safeTargetCalories * split.protein;
  const carbsCalories = safeTargetCalories * split.carbs;
  const fatsCalories = safeTargetCalories * split.fats;

  const proteinGrams = Math.round(proteinCalories / PROTEIN_CALORIES_PER_GRAM);
  const carbsGrams = Math.round(carbsCalories / CARB_CALORIES_PER_GRAM);
  const fatsGrams = Math.round(fatsCalories / FAT_CALORIES_PER_GRAM);

  return {
    targetCalories: Math.round(safeTargetCalories),
    split,
    calories: {
      protein: Math.round(proteinCalories),
      carbs: Math.round(carbsCalories),
      fats: Math.round(fatsCalories),
    },
    grams: {
      protein: proteinGrams,
      carbs: carbsGrams,
      fats: fatsGrams,
    },
    ranges: {
      protein: {
        min: proteinGrams,
        max: Math.round(proteinGrams * 1.2),
      },
      fats: {
        min: fatsGrams,
        max: Math.round(fatsGrams * 1.25),
      },
    },
  };
};

export const createMacroTriangleGeometry = ({
  width = 320,
  height = 280,
  padding = 24,
} = {}) => {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const triangleHeight = Math.min(
    usableHeight,
    (Math.sqrt(3) / 2) * usableWidth
  );
  const triangleWidth = (2 / Math.sqrt(3)) * triangleHeight;
  const left = (width - triangleWidth) / 2;
  const right = left + triangleWidth;
  const bottom = height - padding;
  const top = bottom - triangleHeight;

  return {
    width,
    height,
    vertices: {
      protein: { x: (left + right) / 2, y: top },
      fats: { x: left, y: bottom },
      carbs: { x: right, y: bottom },
    },
  };
};

const toBarycentric = ({ x, y }, vertices) => {
  const { protein, fats, carbs } = vertices;
  const denominator =
    (fats.y - carbs.y) * (protein.x - carbs.x) +
    (carbs.x - fats.x) * (protein.y - carbs.y);

  if (Math.abs(denominator) < 1e-9) {
    return { protein: 1 / 3, fats: 1 / 3, carbs: 1 / 3 };
  }

  const proteinWeight =
    ((fats.y - carbs.y) * (x - carbs.x) + (carbs.x - fats.x) * (y - carbs.y)) /
    denominator;
  const fatsWeight =
    ((carbs.y - protein.y) * (x - carbs.x) +
      (protein.x - carbs.x) * (y - carbs.y)) /
    denominator;
  const carbsWeight = 1 - proteinWeight - fatsWeight;

  return {
    protein: proteinWeight,
    fats: fatsWeight,
    carbs: carbsWeight,
  };
};

const fromBarycentric = (weights, vertices) => {
  const { protein, fats, carbs } = vertices;
  const proteinWeight = toSafeRatio(weights.protein);
  const fatsWeight = toSafeRatio(weights.fats);
  const carbsWeight = toSafeRatio(weights.carbs);
  const sum = proteinWeight + fatsWeight + carbsWeight || 1;

  const normalized = {
    protein: proteinWeight / sum,
    fats: fatsWeight / sum,
    carbs: carbsWeight / sum,
  };

  return {
    x:
      normalized.protein * protein.x +
      normalized.fats * fats.x +
      normalized.carbs * carbs.x,
    y:
      normalized.protein * protein.y +
      normalized.fats * fats.y +
      normalized.carbs * carbs.y,
  };
};

export const projectPointToMacroTriangle = (point, geometry) => {
  const barycentric = toBarycentric(point, geometry.vertices);
  return fromBarycentric(barycentric, geometry.vertices);
};

export const macroSplitFromTrianglePoint = (point, geometry) => {
  const projected = projectPointToMacroTriangle(point, geometry);
  const raw = toBarycentric(projected, geometry.vertices);
  const normalized = normalizeMacroRecommendationSplit(raw);

  return {
    protein: roundToTenth(normalized.protein * 100) / 100,
    carbs: roundToTenth(normalized.carbs * 100) / 100,
    fats: roundToTenth(normalized.fats * 100) / 100,
  };
};

export const macroSplitToTrianglePoint = (macroSplit, geometry) => {
  const normalized = normalizeMacroRecommendationSplit(macroSplit);
  return fromBarycentric(normalized, geometry.vertices);
};

export const formatMacroSplitPercent = (macroSplit) => {
  const normalized = normalizeMacroRecommendationSplit(macroSplit);
  return MACRO_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(normalized[key] * 100);
    return acc;
  }, {});
};
