const PROTEIN_CALORIES_PER_GRAM = 4;
const CARB_CALORIES_PER_GRAM = 4;
const FAT_CALORIES_PER_GRAM = 9;
const DEFAULT_WEIGHT_KG = 70;
const PROTEIN_FLOOR_PER_KG = 1.6;
const PROTEIN_CEILING_PER_KG = 2.8;
const FAT_FLOOR_PER_KG = 0.6;
const FAT_CEILING_PER_KG = 1.6;
const CARB_SOFT_FLOOR_GRAMS = 50;

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
const roundToHundredth = (value) => Math.round(value * 100) / 100;
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const toPositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
};

const toBodyFatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric >= 100) {
    return null;
  }
  return numeric;
};

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

const resolveProteinMassContext = (userData = {}) => {
  const bodyweightKg = toPositiveNumber(userData?.weight, DEFAULT_WEIGHT_KG);
  const bodyFatTrackingEnabled = Boolean(userData?.bodyFatTrackingEnabled);
  const bodyFatEntries = Array.isArray(userData?.bodyFatEntries)
    ? userData.bodyFatEntries
    : [];
  let leanMassKg = null;

  if (bodyFatTrackingEnabled && bodyFatEntries.length > 0) {
    for (let index = bodyFatEntries.length - 1; index >= 0; index -= 1) {
      const entry = bodyFatEntries[index];
      const bodyFatPercent = toBodyFatPercent(entry?.bodyFat);
      if (bodyFatPercent == null) {
        continue;
      }

      const computedLeanMass = bodyweightKg * (1 - bodyFatPercent / 100);
      if (Number.isFinite(computedLeanMass) && computedLeanMass > 0) {
        leanMassKg = computedLeanMass;
        break;
      }
    }
  }

  const massForProteinKg = leanMassKg ?? bodyweightKg;

  return {
    bodyweightKg,
    leanMassKg,
    massForProteinKg,
  };
};

const computeMacroBounds = ({ targetCalories, userData }) => {
  const safeTargetCalories = Math.max(0, Number(targetCalories) || 0);
  const proteinMassContext = resolveProteinMassContext(userData);
  const proteinMin = proteinMassContext.massForProteinKg * PROTEIN_FLOOR_PER_KG;
  const proteinMax =
    proteinMassContext.massForProteinKg * PROTEIN_CEILING_PER_KG;
  const fatsMin = proteinMassContext.bodyweightKg * FAT_FLOOR_PER_KG;
  const fatsMax = proteinMassContext.bodyweightKg * FAT_CEILING_PER_KG;
  const hardFloorCalories =
    proteinMin * PROTEIN_CALORIES_PER_GRAM + fatsMin * FAT_CALORIES_PER_GRAM;
  const softFloorCalories =
    hardFloorCalories + CARB_SOFT_FLOOR_GRAMS * CARB_CALORIES_PER_GRAM;
  const carbsMax = Math.max(
    0,
    (safeTargetCalories -
      proteinMin * PROTEIN_CALORIES_PER_GRAM -
      fatsMin * FAT_CALORIES_PER_GRAM) /
      CARB_CALORIES_PER_GRAM
  );

  return {
    protein: {
      min: proteinMin,
      max: proteinMax,
    },
    fats: {
      min: fatsMin,
      max: fatsMax,
    },
    carbs: {
      min: CARB_SOFT_FLOOR_GRAMS,
      max: carbsMax,
      softMin: CARB_SOFT_FLOOR_GRAMS,
    },
    massForProteinKg: proteinMassContext.massForProteinKg,
    bodyweightKg: proteinMassContext.bodyweightKg,
    leanMassKg: proteinMassContext.leanMassKg,
    hardFloorCalories,
    softFloorCalories,
    isHardFloorInfeasible: hardFloorCalories > safeTargetCalories,
    isSoftFloorInfeasible: softFloorCalories > safeTargetCalories,
  };
};

const projectSplitToConstrainedGrams = ({
  targetCalories,
  macroSplit,
  userData,
}) => {
  const safeTargetCalories = Math.max(0, Number(targetCalories) || 0);
  const normalizedSplit = normalizeMacroRecommendationSplit(macroSplit);
  const bounds = computeMacroBounds({
    targetCalories: safeTargetCalories,
    userData,
  });

  if (safeTargetCalories <= 0) {
    return {
      split: normalizedSplit,
      constrainedSplit: DEFAULT_MACRO_RECOMMENDATION_SPLIT,
      grams: {
        protein: 0,
        carbs: 0,
        fats: 0,
      },
      calories: {
        protein: 0,
        carbs: 0,
        fats: 0,
      },
      bounds,
      warnings: ['zero_target_calories'],
      isConstrained: true,
      calorieDelta: 0,
    };
  }

  const requestedProtein =
    (safeTargetCalories * normalizedSplit.protein) / PROTEIN_CALORIES_PER_GRAM;
  const requestedFats =
    (safeTargetCalories * normalizedSplit.fats) / FAT_CALORIES_PER_GRAM;

  let protein = Math.min(
    Math.max(requestedProtein, bounds.protein.min),
    bounds.protein.max
  );
  let fats = Math.min(Math.max(requestedFats, bounds.fats.min), bounds.fats.max);
  let carbs =
    (safeTargetCalories -
      protein * PROTEIN_CALORIES_PER_GRAM -
      fats * FAT_CALORIES_PER_GRAM) /
    CARB_CALORIES_PER_GRAM;

  const warnings = [];

  if (carbs < bounds.carbs.softMin) {
    const carbDeficit = bounds.carbs.softMin - carbs;
    const neededKcal = carbDeficit * CARB_CALORIES_PER_GRAM;
    const reducibleFatKcal = Math.max(
      0,
      (fats - bounds.fats.min) * FAT_CALORIES_PER_GRAM
    );
    const fatKcalShift = Math.min(neededKcal, reducibleFatKcal);

    if (fatKcalShift > 0) {
      fats -= fatKcalShift / FAT_CALORIES_PER_GRAM;
      carbs += fatKcalShift / CARB_CALORIES_PER_GRAM;
    }
  }

  if (carbs < bounds.carbs.softMin) {
    warnings.push('carb_soft_floor_relaxed');
  }

  if (carbs < 0) {
    warnings.push('hard_floor_exceeds_budget');
  }

  const proteinCalories = protein * PROTEIN_CALORIES_PER_GRAM;
  const fatCalories = fats * FAT_CALORIES_PER_GRAM;
  const carbCalories = carbs * CARB_CALORIES_PER_GRAM;
  const totalCalories = proteinCalories + fatCalories + carbCalories;
  const constrainedSplit = normalizeMacroRecommendationSplit({
    protein: proteinCalories,
    carbs: carbCalories,
    fats: fatCalories,
  });

  const hasConstraintDelta =
    Math.abs(protein - requestedProtein) > 1e-6 ||
    Math.abs(fats - requestedFats) > 1e-6 ||
    warnings.length > 0;

  return {
    split: normalizedSplit,
    constrainedSplit,
    grams: {
      protein: roundToTenth(protein),
      carbs: roundToTenth(carbs),
      fats: roundToTenth(fats),
    },
    calories: {
      protein: Math.round(proteinCalories),
      carbs: Math.round(carbCalories),
      fats: Math.round(fatCalories),
    },
    bounds,
    warnings,
    isConstrained: hasConstraintDelta,
    calorieDelta: Math.round(totalCalories - safeTargetCalories),
  };
};

export const projectMacroSplitToConstraints = ({
  targetCalories,
  macroSplit,
  userData,
}) =>
  projectSplitToConstrainedGrams({
    targetCalories,
    macroSplit,
    userData,
  });

export const calculateMacroRecommendations = ({
  targetCalories,
  macroSplit,
  userData,
}) => {
  const safeTargetCalories = Math.max(0, Number(targetCalories) || 0);
  const projected = projectSplitToConstrainedGrams({
    targetCalories: safeTargetCalories,
    macroSplit,
    userData,
  });
  const { grams, calories, split, constrainedSplit, bounds, isConstrained } =
    projected;

  return {
    targetCalories: Math.round(safeTargetCalories),
    split,
    constrainedSplit,
    calories,
    grams,
    bounds: {
      protein: {
        min: roundToTenth(bounds.protein.min),
        max: roundToTenth(bounds.protein.max),
      },
      carbs: {
        min: roundToTenth(bounds.carbs.min),
        max: roundToTenth(bounds.carbs.max),
        softMin: roundToTenth(bounds.carbs.softMin),
      },
      fats: {
        min: roundToTenth(bounds.fats.min),
        max: roundToTenth(bounds.fats.max),
      },
      massForProteinKg: roundToTenth(bounds.massForProteinKg),
      bodyweightKg: roundToTenth(bounds.bodyweightKg),
      leanMassKg:
        bounds.leanMassKg == null ? null : roundToTenth(bounds.leanMassKg),
      hardFloorCalories: Math.round(bounds.hardFloorCalories),
      softFloorCalories: Math.round(bounds.softFloorCalories),
      isHardFloorInfeasible: bounds.isHardFloorInfeasible,
      isSoftFloorInfeasible: bounds.isSoftFloorInfeasible,
    },
    isConstrained,
    warnings: projected.warnings,
    calorieDelta: projected.calorieDelta,
    ranges: {
      protein: {
        min: Math.round(bounds.protein.min),
        max: Math.round(bounds.protein.max),
      },
      fats: {
        min: Math.round(bounds.fats.min),
        max: Math.round(bounds.fats.max),
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
    protein: roundToHundredth(normalized.protein),
    carbs: roundToHundredth(normalized.carbs),
    fats: roundToHundredth(normalized.fats),
  };
};

const getConstrainedTriangleVertexMacros = ({ targetCalories, userData }) => {
  const safeTargetCalories = Math.max(0, Number(targetCalories) || 0);
  if (safeTargetCalories <= 0) {
    return {
      protein: { protein: 0, fats: 0, carbs: 0 },
      fats: { protein: 0, fats: 0, carbs: 0 },
      carbs: { protein: 0, fats: 0, carbs: 0 },
    };
  }

  const proteinVertex = calculateMacroRecommendations({
    targetCalories: safeTargetCalories,
    macroSplit: { protein: 1, fats: 0, carbs: 0 },
    userData,
  }).grams;
  const fatsVertex = calculateMacroRecommendations({
    targetCalories: safeTargetCalories,
    macroSplit: { protein: 0, fats: 1, carbs: 0 },
    userData,
  }).grams;
  const carbsVertex = calculateMacroRecommendations({
    targetCalories: safeTargetCalories,
    macroSplit: { protein: 0, fats: 0, carbs: 1 },
    userData,
  }).grams;

  return {
    protein: proteinVertex,
    fats: fatsVertex,
    carbs: carbsVertex,
  };
};

const blendConstrainedVertexMacros = ({ weights, vertices }) => ({
  protein:
    weights.protein * vertices.protein.protein +
    weights.fats * vertices.fats.protein +
    weights.carbs * vertices.carbs.protein,
  fats:
    weights.protein * vertices.protein.fats +
    weights.fats * vertices.fats.fats +
    weights.carbs * vertices.carbs.fats,
  carbs:
    weights.protein * vertices.protein.carbs +
    weights.fats * vertices.fats.carbs +
    weights.carbs * vertices.carbs.carbs,
});

const normalizeBarycentricWeights = (weights) => {
  const safeWeights = {
    protein: clamp01(weights?.protein),
    fats: clamp01(weights?.fats),
    carbs: clamp01(weights?.carbs),
  };
  return normalizeMacroRecommendationSplit(safeWeights);
};

const barycentricFromMacroBlend = ({ grams, vertices }) => {
  const triangle = {
    protein: {
      x: vertices.protein.protein,
      y: vertices.protein.fats,
    },
    fats: {
      x: vertices.fats.protein,
      y: vertices.fats.fats,
    },
    carbs: {
      x: vertices.carbs.protein,
      y: vertices.carbs.fats,
    },
  };

  const raw = toBarycentric(
    {
      x: grams.protein,
      y: grams.fats,
    },
    triangle
  );

  return normalizeBarycentricWeights(raw);
};

export const macroSplitFromConstrainedTrianglePoint = (
  point,
  geometry,
  options = {}
) => {
  const projected = projectPointToMacroTriangle(point, geometry);
  const weights = normalizeBarycentricWeights(
    toBarycentric(projected, geometry.vertices)
  );
  const vertices = getConstrainedTriangleVertexMacros({
    targetCalories: options.targetCalories,
    userData: options.userData,
  });
  const blended = blendConstrainedVertexMacros({ weights, vertices });
  const blendedSplit = normalizeMacroRecommendationSplit({
    protein: blended.protein * PROTEIN_CALORIES_PER_GRAM,
    fats: blended.fats * FAT_CALORIES_PER_GRAM,
    carbs: blended.carbs * CARB_CALORIES_PER_GRAM,
  });

  return calculateMacroRecommendations({
    targetCalories: options.targetCalories,
    macroSplit: blendedSplit,
    userData: options.userData,
  }).constrainedSplit;
};

export const macroSplitToConstrainedTrianglePoint = (
  macroSplit,
  geometry,
  options = {}
) => {
  const recommendation = calculateMacroRecommendations({
    targetCalories: options.targetCalories,
    macroSplit,
    userData: options.userData,
  });
  const vertices = getConstrainedTriangleVertexMacros({
    targetCalories: options.targetCalories,
    userData: options.userData,
  });
  const barycentric = barycentricFromMacroBlend({
    grams: recommendation.grams,
    vertices,
  });

  return fromBarycentric(barycentric, geometry.vertices);
};

export const constrainMacroSplitForTarget = ({
  macroSplit,
  targetCalories,
  userData,
}) => {
  const recommendation = calculateMacroRecommendations({
    targetCalories,
    macroSplit,
    userData,
  });
  return {
    ...recommendation.constrainedSplit,
  };
};

export const macroSplitToTrianglePoint = (macroSplit, geometry, options = {}) => {
  const constrained = options?.targetCalories
    ? constrainMacroSplitForTarget({
        macroSplit,
        targetCalories: options.targetCalories,
        userData: options.userData,
      })
    : normalizeMacroRecommendationSplit(macroSplit);
  const normalized = normalizeMacroRecommendationSplit(constrained);
  return fromBarycentric(normalized, geometry.vertices);
};

export const formatMacroSplitPercent = (macroSplit) => {
  const normalized = normalizeMacroRecommendationSplit(macroSplit);
  return MACRO_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(normalized[key] * 100);
    return acc;
  }, {});
};
