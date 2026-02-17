export const LIFESTYLE_TIERS = {
  sedentary: {
    key: 'sedentary',
    label: 'Sedentary',
    description: 'Desk-bound most of the day with minimal incidental movement.',
    multiplier: 0.15,
  },
  standing: {
    key: 'standing',
    label: 'Standing',
    description: 'Regular light movement—walking around, chores, errands, occasional standing tasks.',
    multiplier: 0.25,
  },
  physical: {
    key: 'physical',
    label: 'Physical',
    description: 'Physically demanding lifestyle—frequent standing, manual work, lots of daily motion.',
    multiplier: 0.35,
  },
};

export const getLifestyleMultiplier = (tier) => {
  const tierData = LIFESTYLE_TIERS[tier];
  return tierData ? tierData.multiplier : LIFESTYLE_TIERS.sedentary.multiplier;
};

// Legacy exports for backward compatibility (will be removed in later phases)
export const DEFAULT_ACTIVITY_MULTIPLIERS = {
  training: 0.35,
  rest: 0.28,
};

export const ACTIVITY_PRESET_OPTIONS = {
  rest: [
    {
      key: 'default',
      label: 'Moderately Active',
      description:
        'Regular light movement—walking around, chores, errands, occasional standing tasks.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
    },
  ],
  training: [
    {
      key: 'default',
      label: 'Moderately Active',
      description: 'Training plus regular light movement throughout the day.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.training,
    },
  ],
};

export const getActivityPresetByKey = (dayType, key) => {
  if (!dayType || !key || key === 'custom') {
    return null;
  }
  return (
    ACTIVITY_PRESET_OPTIONS[dayType]?.find((option) => option.key === key) ??
    null
  );
};
