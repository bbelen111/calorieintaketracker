export const DEFAULT_ACTIVITY_MULTIPLIERS = {
  training: 0.2,
  rest: 0.22,
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
        'Mostly seated all day—desk work, driving, or relaxing with minimal pacing.',
      value: 0.15,
    },
    {
      key: 'default',
      label: 'Moderately Active',
      description:
        'Frequently on your feet—teaching, retail, or chores with steady incidental movement.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.rest,
    },
    {
      key: 'active',
      label: 'Highly Active',
      description:
        'Physically demanding day—manual labor, carrying loads, or constant physical exertion.',
      value: 0.35,
    },
  ],
  training: [
    {
      key: 'light',
      label: 'Sedentary',
      description:
        'Train, then mostly sit—minimal incidental movement beyond the workout.',
      value: 0.13,
    },
    {
      key: 'default',
      label: 'Moderately Active',
      description:
        'Train, plus regular daily movement, but subconsciously resting more post-workout.',
      value: DEFAULT_ACTIVITY_MULTIPLIERS.training,
    },
    {
      key: 'intense',
      label: 'Highly Active',
      description:
        'Train, plus physical labor, leading to heavy systemic fatigue and deep evening rest.',
      value: 0.3,
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
