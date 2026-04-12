const normalizeNameForDiff = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isSignificantNameRewrite = (verifiedName, presentedName) => {
  const normalizedVerified = normalizeNameForDiff(verifiedName);
  const normalizedPresented = normalizeNameForDiff(presentedName);

  if (!normalizedVerified || !normalizedPresented) {
    return false;
  }

  if (normalizedVerified === normalizedPresented) {
    return false;
  }

  const verifiedTokens = new Set(normalizedVerified.split(' '));
  const presentedTokens = new Set(normalizedPresented.split(' '));

  let overlap = 0;
  verifiedTokens.forEach((token) => {
    if (presentedTokens.has(token)) {
      overlap += 1;
    }
  });

  const tokenSimilarity =
    overlap / Math.max(verifiedTokens.size, presentedTokens.size, 1);
  return tokenSimilarity < 0.5;
};

const roundNutritionValue = (value, decimals = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  const factor = 10 ** Math.max(0, decimals);
  return Math.round(parsed * factor) / factor;
};

export const resolveEntryNutritionFromPresentation = (
  verifiedEntry,
  presentedEntry
) => {
  const safeVerifiedCalories = Math.max(0, Number(verifiedEntry?.calories) || 0);
  const safeVerifiedProtein = Math.max(0, Number(verifiedEntry?.protein) || 0);
  const safeVerifiedCarbs = Math.max(0, Number(verifiedEntry?.carbs) || 0);
  const safeVerifiedFats = Math.max(0, Number(verifiedEntry?.fats) || 0);

  const fallbackNutrition = {
    calories: safeVerifiedCalories,
    protein: safeVerifiedProtein,
    carbs: safeVerifiedCarbs,
    fats: safeVerifiedFats,
    integrityIssue: false,
    integrityReason: null,
    source: 'verified',
  };

  if (!presentedEntry || typeof presentedEntry !== 'object') {
    return fallbackNutrition;
  }

  const providedCalories = roundNutritionValue(presentedEntry.calories, 0);
  const providedProtein = roundNutritionValue(presentedEntry.protein, 1);
  const providedCarbs = roundNutritionValue(presentedEntry.carbs, 1);
  const providedFats = roundNutritionValue(presentedEntry.fats, 1);

  const hasPresentedNutrition =
    providedCalories != null ||
    providedProtein != null ||
    providedCarbs != null ||
    providedFats != null;

  if (!hasPresentedNutrition) {
    return fallbackNutrition;
  }

  const normalizedCalories =
    providedCalories != null ? providedCalories : safeVerifiedCalories;
  const normalizedProtein =
    providedProtein != null ? providedProtein : safeVerifiedProtein;
  const normalizedCarbs =
    providedCarbs != null ? providedCarbs : safeVerifiedCarbs;
  const normalizedFats = providedFats != null ? providedFats : safeVerifiedFats;

  const macroCalories =
    normalizedProtein * 4 + normalizedCarbs * 4 + normalizedFats * 9;
  const allowedDifference = Math.max(30, normalizedCalories * 0.2);
  const calorieDifference = Math.abs(macroCalories - normalizedCalories);

  if (calorieDifference > allowedDifference) {
    return {
      ...fallbackNutrition,
      integrityIssue: true,
      integrityReason: 'presentation_macro_calorie_mismatch',
      source: 'verified_with_guardrail',
    };
  }

  return {
    calories: normalizedCalories,
    protein: normalizedProtein,
    carbs: normalizedCarbs,
    fats: normalizedFats,
    integrityIssue: false,
    integrityReason: null,
    source: 'presentation',
  };
};

export const mergePresentationEntriesWithVerified = ({
  verifiedEntries = [],
  presentationEntries = [],
} = {}) => {
  const safeVerifiedEntries = Array.isArray(verifiedEntries)
    ? verifiedEntries.filter(Boolean)
    : [];
  const safePresentationEntries = Array.isArray(presentationEntries)
    ? presentationEntries
    : [];

  const hasPresentationLengthMismatch =
    safePresentationEntries.length > 0 &&
    safePresentationEntries.length !== safeVerifiedEntries.length;

  const hasSparsePresentationEntries =
    safePresentationEntries.length > 0 &&
    safeVerifiedEntries.some(
      (_entry, index) =>
        !safePresentationEntries[index] ||
        typeof safePresentationEntries[index] !== 'object'
    );

  const mergedEntries = safeVerifiedEntries.map((verifiedEntry, index) => {
    const presentedEntry =
      safePresentationEntries[index] &&
      typeof safePresentationEntries[index] === 'object'
        ? safePresentationEntries[index]
        : null;

    const presentedName = String(presentedEntry?.name || '').trim();
    const hasSignificantRewrite = isSignificantNameRewrite(
      verifiedEntry.name,
      presentedName
    );

    const presentedNutrition = resolveEntryNutritionFromPresentation(
      verifiedEntry,
      presentedEntry
    );

    const mergedAssumptions =
      Array.isArray(presentedEntry?.assumptions) &&
      presentedEntry.assumptions.length > 0
        ? presentedEntry.assumptions
        : verifiedEntry.assumptions;

    const shouldAddSparseFallbackAssumption = !presentedEntry;

    const integrityAssumptions = [];
    if (shouldAddSparseFallbackAssumption) {
      integrityAssumptions.push(
        'Presentation output omitted this entry; preserved verified values.'
      );
    }

    if (presentedNutrition.integrityIssue) {
      integrityAssumptions.push(
        'Presentation macros/calories were inconsistent; preserved verified nutrition values.'
      );
    }

    return {
      ...verifiedEntry,
      name:
        hasSignificantRewrite || !presentedName
          ? verifiedEntry.name
          : presentedName,
      calories: presentedNutrition.calories,
      protein: presentedNutrition.protein,
      carbs: presentedNutrition.carbs,
      fats: presentedNutrition.fats,
      rationale: presentedEntry?.rationale || verifiedEntry.rationale,
      assumptions: [
        ...(Array.isArray(mergedAssumptions) ? mergedAssumptions : []),
        ...(hasSignificantRewrite
          ? [
              `Name rewrite suppressed from "${presentedName}" to preserve verified source label.`,
            ]
          : []),
        ...integrityAssumptions,
      ],
      nameRewriteSuppressed: hasSignificantRewrite,
      nameRewriteWarning:
        !hasSignificantRewrite &&
        presentedName &&
        normalizeNameForDiff(verifiedEntry.name) !==
          normalizeNameForDiff(presentedName),
      nutritionIntegrityIssue: presentedNutrition.integrityIssue,
      nutritionIntegrityReason: presentedNutrition.integrityReason,
      nutritionValuesSource: presentedNutrition.source,
    };
  });

  return {
    mergedEntries,
    hasPresentationLengthMismatch,
    hasSparsePresentationEntries,
  };
};
