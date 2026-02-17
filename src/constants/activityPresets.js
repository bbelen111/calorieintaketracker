// Legacy default multipliers - kept for backward compatibility
export const DEFAULT_ACTIVITY_MULTIPLIERS = {
  training: 0.35,
  rest: 0.28,
};

// New three-tier activity system
export const ACTIVITY_TIERS = {
  sedentary: {
    key: 'sedentary',
    label: 'Sedentary',
    description:
      'Mostly sitting or lying down throughout the day (desk job, minimal movement)',
    multiplier: 0.2,
  },
  standing: {
    key: 'standing',
    label: 'Lightly Active',
    description:
      'Light activity with some standing and walking (retail, teaching, light housework)',
    multiplier: 0.3,
  },
  physical: {
    key: 'physical',
    label: 'Very Active',
    description:
      'Physically demanding work or lifestyle (construction, manual labor, very active job)',
    multiplier: 0.4,
  },
};

export const DEFAULT_ACTIVITY_TIER = 'standing';

// Legacy preset options - kept for backward compatibility during migration
export const ACTIVITY_PRESET_OPTIONS = {
  rest: [
    {
      key: 'default',
      label: 'Moderately Active',
      description:
        'Regular light movement—walking around, chores, errands, occasional standing tasks.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
    },
    {
      key: 'light',
      label: 'Sedentary',
      description:
        'Desk-bound most of the day with minimal incidental movement.',
      value: 0.22,
    },
    {
      key: 'active',
      label: 'Highly Active',
      description:
        'Physically demanding lifestyle—frequent standing, manual work, lots of daily motion.',
      value: 0.32,
    },
  ],
  training: [
    {
      key: 'default',
      label: 'Moderately Active',
      description: 'Training plus regular light movement throughout the day.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.training,
    },
    {
      key: 'light',
      label: 'Sedentary',
      description:
        'Train, then mostly sit—minimal incidental movement beyond the workout.',
      value: 0.3,
    },
    {
      key: 'intense',
      label: 'Highly Active',
      description:
        'Training plus a demanding schedule—standing work, manual tasks, or active commuting.',
      value: 0.4,
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

export const getActivityTierByKey = (key) => {
  return ACTIVITY_TIERS[key] ?? ACTIVITY_TIERS[DEFAULT_ACTIVITY_TIER];
};

export const getActivityTierMultiplier = (key) => {
  const tier = getActivityTierByKey(key);
  return tier.multiplier;
};
