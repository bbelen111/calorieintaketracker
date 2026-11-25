// Measurement unit preferences: which unit each quantity is shown and entered in.
//
// This only affects display and input. Stored data and every calculation stay
// kg, cm, km, g and kcal; `utils/units/unitFormatter.js` converts at the edges.
//
// Persisted as `userData.unitPreferences` (profile scope), one key per quantity.

export const UNIT_OPTIONS = Object.freeze({
  bodyWeight: [
    { key: 'kg', label: 'kg' },
    { key: 'lb', label: 'lb' },
    { key: 'st', label: 'st' },
  ],
  height: [
    { key: 'cm', label: 'cm' },
    { key: 'ft', label: 'ft + in' },
  ],
  distance: [
    { key: 'km', label: 'km' },
    { key: 'mi', label: 'mi' },
  ],
  foodWeight: [
    { key: 'g', label: 'g' },
    { key: 'oz', label: 'oz' },
  ],
  energy: [
    { key: 'kcal', label: 'kcal' },
    { key: 'kJ', label: 'kJ' },
  ],
});

export const UNIT_QUANTITIES = Object.freeze(Object.keys(UNIT_OPTIONS));

export const DEFAULT_UNIT_PREFERENCES = Object.freeze({
  bodyWeight: 'kg',
  height: 'cm',
  distance: 'km',
  foodWeight: 'g',
  energy: 'kcal',
});

// Presets deliberately leave energy alone: kcal vs kJ does not follow the
// metric / imperial split (the US and UK use kcal, Australia pairs kJ with
// metric).
export const UNIT_PRESETS = Object.freeze([
  {
    key: 'metric',
    label: 'Metric',
    values: {
      bodyWeight: 'kg',
      height: 'cm',
      distance: 'km',
      foodWeight: 'g',
    },
  },
  {
    key: 'us',
    label: 'US',
    values: {
      bodyWeight: 'lb',
      height: 'ft',
      distance: 'mi',
      foodWeight: 'oz',
    },
  },
  {
    key: 'uk',
    label: 'UK',
    values: {
      bodyWeight: 'st',
      height: 'ft',
      distance: 'mi',
      foodWeight: 'g',
    },
  },
]);

const normalizeUnitKey = (quantity, value) => {
  const wanted = String(value ?? '')
    .trim()
    .toLowerCase();
  const match = UNIT_OPTIONS[quantity].find(
    (option) => option.key.toLowerCase() === wanted
  );
  return match ? match.key : DEFAULT_UNIT_PREFERENCES[quantity];
};

/** A complete, valid preference object; unknown values fall back per key. */
export const normalizeUnitPreferences = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    UNIT_QUANTITIES.map((quantity) => [
      quantity,
      normalizeUnitKey(quantity, source[quantity]),
    ])
  );
};

export const areUnitPreferencesEqual = (left, right) => {
  const a = normalizeUnitPreferences(left);
  const b = normalizeUnitPreferences(right);
  return UNIT_QUANTITIES.every((quantity) => a[quantity] === b[quantity]);
};

/** The preset the preferences currently match, or `null` for a custom mix. */
export const matchUnitPreset = (preferences) => {
  const normalized = normalizeUnitPreferences(preferences);
  const preset = UNIT_PRESETS.find(({ values }) =>
    Object.entries(values).every(
      ([quantity, unit]) => normalized[quantity] === unit
    )
  );
  return preset?.key ?? null;
};

/** Preferences with a preset applied (energy is kept as it is). */
export const applyUnitPreset = (preferences, presetKey) => {
  const preset = UNIT_PRESETS.find(({ key }) => key === presetKey);
  const normalized = normalizeUnitPreferences(preferences);
  return preset ? { ...normalized, ...preset.values } : normalized;
};
