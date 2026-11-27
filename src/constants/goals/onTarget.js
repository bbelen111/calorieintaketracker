// "On target" tolerance: how far (kcal) a day may land from its target and
// still count as on target. The Daily Ledger judges a day's energy balance
// against its goal's daily target; the Tracker shows its calorie target as a
// range this wide and judges intake against it.
//
// The ledger's target is recorded per day on the snapshot (`goalTarget`,
// positive = deficit); this band is the only judgement call, so it is a user
// setting (Settings -> Food & Macros). The stored value is the kcal number
// itself, but only the listed options are accepted so a corrupt profile cannot
// reach the UI.

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
