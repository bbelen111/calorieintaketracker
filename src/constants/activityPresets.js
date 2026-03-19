export const DEFAULT_ACTIVITY_MULTIPLIERS = {
  training: 0.35,
  rest: 0.28,
};

export const MIN_CUSTOM_ACTIVITY_MULTIPLIER = 0.1;
export const MIN_CUSTOM_ACTIVITY_PERCENT = MIN_CUSTOM_ACTIVITY_MULTIPLIER * 100;

const MAX_ACTIVITY_MULTIPLIER = 1;
const MAX_ACTIVITY_PERCENT = 100;

const roundActivityMultiplier = (value) => Math.round(value * 1000) / 1000;

const roundActivityPercent = (value) => Math.round(value * 10) / 10;

export const clampCustomActivityMultiplier = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return MIN_CUSTOM_ACTIVITY_MULTIPLIER;
  }

  return roundActivityMultiplier(
    Math.min(
      Math.max(numericValue, MIN_CUSTOM_ACTIVITY_MULTIPLIER),
      MAX_ACTIVITY_MULTIPLIER
    )
  );
};

export const clampCustomActivityPercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return MIN_CUSTOM_ACTIVITY_PERCENT;
  }

  return roundActivityPercent(
    Math.min(
      Math.max(numericValue, MIN_CUSTOM_ACTIVITY_PERCENT),
      MAX_ACTIVITY_PERCENT
    )
  );
};

export const getCustomActivityPercent = (value) =>
  roundActivityPercent(clampCustomActivityMultiplier(value) * 100);

export const ACTIVITY_PRESET_OPTIONS = {
  rest: [
    {
      key: 'light',
      label: 'Sedentary',
      description:
        'Desk-bound most of the day with minimal incidental movement.',
      value: 0.14,
    },
    {
      key: 'default',
      label: 'Moderately Active',
      description: 'Regular light chores, errands, occasional standing tasks.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
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
      key: 'light',
      label: 'Sedentary',
      description:
        'Train, then mostly sit—minimal incidental movement beyond the workout.',
      value: 0.14,
    },
    {
      key: 'default',
      label: 'Moderately Active',
      description: 'Training plus regular light movement throughout the day.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.training,
    },
    {
      key: 'intense',
      label: 'Highly Active',
      description:
        'Training plus a demanding schedule—standing work, manual tasks, or active commuting.',
      value: 0.32,
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
