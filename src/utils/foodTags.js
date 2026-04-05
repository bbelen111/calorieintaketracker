export const FOOD_SOURCE_TYPES = {
  CACHED: 'cached',
  LOCAL: 'local',
  MANUAL: 'manual',
  CUSTOM: 'custom',
  AI: 'ai',
};

const FOOD_CATEGORY_META = {
  protein: { label: 'Proteins', color: 'red' },
  carbs: { label: 'Carbs', color: 'amber' },
  vegetables: { label: 'Vegetables', color: 'green' },
  fats: { label: 'Fats', color: 'yellow' },
  supplements: { label: 'Supplements', color: 'purple' },
  custom: { label: 'Custom', color: 'blue' },
  manual: { label: 'Manual', color: 'indigo' },
};

const TAG_COLOR_CLASS_MAP = {
  red: 'bg-accent-red/20 text-accent-red',
  amber: 'bg-accent-amber/20 text-accent-amber',
  green: 'bg-accent-green/20 text-accent-green',
  yellow: 'bg-accent-yellow/20 text-accent-yellow',
  purple: 'bg-accent-purple/20 text-accent-purple',
  blue: 'bg-accent-blue/20 text-accent-blue',
  emerald: 'bg-accent-emerald/20 text-accent-emerald',
  slate: 'bg-surface-highlight/60 text-muted',
  indigo: 'bg-accent-indigo/20 text-accent-indigo',
};

const SOURCE_META = {
  [FOOD_SOURCE_TYPES.CACHED]: { label: 'Cached', color: 'purple' },
  [FOOD_SOURCE_TYPES.MANUAL]: { label: 'Manual', color: 'indigo' },
  [FOOD_SOURCE_TYPES.CUSTOM]: { label: 'Custom', color: 'blue' },
  [FOOD_SOURCE_TYPES.AI]: { label: 'AI', color: 'blue' },
  [FOOD_SOURCE_TYPES.LOCAL]: { label: 'Local', color: 'slate' },
};

export const getFoodTagClassByColor = (color) => {
  return TAG_COLOR_CLASS_MAP[color] || TAG_COLOR_CLASS_MAP.slate;
};

export const resolveFoodSourceType = (food) => {
  const source = String(food?.source ?? '').toLowerCase();
  const foodId = String(food?.id ?? food?.foodId ?? '').toLowerCase();
  const category = String(food?.category ?? '').toLowerCase();

  if (
    source === 'openfoodfacts' ||
    foodId.startsWith('fs_') ||
    foodId.startsWith('off_') ||
    category === 'cached'
  ) {
    return FOOD_SOURCE_TYPES.CACHED;
  }

  if (source === 'manual' || category === 'manual') {
    return FOOD_SOURCE_TYPES.MANUAL;
  }

  if (source === 'user' || source === 'custom' || food?.isCustom) {
    return FOOD_SOURCE_TYPES.CUSTOM;
  }

  if (source === 'ai') {
    return FOOD_SOURCE_TYPES.AI;
  }

  return FOOD_SOURCE_TYPES.LOCAL;
};

export const getFoodSourceBadgeMeta = (food) => {
  const sourceType = resolveFoodSourceType(food);
  return {
    sourceType,
    ...(SOURCE_META[sourceType] || SOURCE_META[FOOD_SOURCE_TYPES.LOCAL]),
  };
};

export const getFoodCategoryMeta = (category) => {
  const safeCategory = String(category ?? '').toLowerCase();
  const definition = FOOD_CATEGORY_META[safeCategory];

  if (!definition) {
    return null;
  }

  return {
    key: safeCategory,
    label: definition.label,
    color: definition.color,
  };
};
