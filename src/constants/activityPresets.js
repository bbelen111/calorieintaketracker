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
