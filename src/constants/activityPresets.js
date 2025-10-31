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
