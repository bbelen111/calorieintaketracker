// "On target" tolerance: how far (kcal) a day's energy balance may land from its
// goal's daily target and still count as on target in the Daily Ledger card.
//
// The target itself is recorded per day on the snapshot (`goalTarget`, positive
// = deficit); this band is the only judgement call, so it is a user setting
// (Settings -> Food & Macros). The stored value is the kcal number itself, but
// only the listed options are accepted so a corrupt profile cannot reach the UI.

export const ON_TARGET_TOLERANCE_OPTIONS = [
  { value: 50, label: 'Strict' },
  { value: 100, label: 'Default' },
  { value: 150, label: 'Relaxed' },
  { value: 250, label: 'Loose' },
];

export const DEFAULT_ON_TARGET_TOLERANCE_KCAL = 100;

/** A valid tolerance option, or the default for anything else. */
export const normalizeOnTargetTolerance = (value) => {
  const numeric = Number(value);
  return ON_TARGET_TOLERANCE_OPTIONS.some((option) => option.value === numeric)
    ? numeric
    : DEFAULT_ON_TARGET_TOLERANCE_KCAL;
};
