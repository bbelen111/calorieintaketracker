// Home hero readouts: three slots on the Home card, each showing one metric for
// today and opening the screen that owns it.
//
//   pill  - the button beside the "Energy Map" title   (`heroActionMetric`)
//   left  - the first tile, formerly always Weight      (`heroTileLeftMetric`)
//   right - the second tile, formerly always Body Fat   (`heroTileRightMetric`)
//
// The two tiles choose from all 12 options (`HERO_ACTION_OPTIONS`); the pill
// chooses from the 10 non-measurement options (Weight and Body Fat are tile-only).
// Settings -> Home & Tips owns the choices.
//
// The stored value is the option KEY. Only the listed keys are accepted so a
// corrupt or future profile can never reach the UI. No metric can appear in two
// slots at once: Settings swaps a pick with the slot already showing it (or
// moves the displaced slot to a free allowed metric if a direct swap isn't
// allowed in that slot), the store enforces the same rule, and
// `resolveHeroSlots` is the last line of defence at load and render time. Body
// Fat is only available while body fat tracking is on, and Resting HR only
// while heart rate tracking is on.
//
// Icons are presentation and live with the components (`HeroActionPill`,
// `SettingsModal`); this module is plain data so storage and the store can
// import it without pulling React in.

import { isHeartRateTrackingEnabled } from '../health/heartRate.js';

export const HERO_ACTION_METRICS = {
  CALORIES: 'calories',
  CALORIES_LEFT: 'caloriesLeft',
  PROTEIN: 'protein',
  STEPS: 'steps',
  DEFICIT: 'deficit',
  BALANCE_7D: 'balance7d',
  PHASE: 'phase',
  STREAK: 'streak',
  RESTING_HR: 'restingHr',
  BURN: 'burn',
  WEIGHT: 'weight',
  BODY_FAT: 'bodyFat',
};

export const HERO_SLOTS = {
  PILL: 'pill',
  LEFT: 'left',
  RIGHT: 'right',
};

const SLOT_ORDER = [HERO_SLOTS.PILL, HERO_SLOTS.LEFT, HERO_SLOTS.RIGHT];

/** The `userData` field that stores each slot's metric. */
export const HERO_SLOT_FIELDS = {
  [HERO_SLOTS.PILL]: 'heroActionMetric',
  [HERO_SLOTS.LEFT]: 'heroTileLeftMetric',
  [HERO_SLOTS.RIGHT]: 'heroTileRightMetric',
};

/** Out of the box Home looks as it always did: calories, Weight, Body Fat. */
export const HERO_SLOT_DEFAULTS = {
  [HERO_SLOTS.PILL]: HERO_ACTION_METRICS.CALORIES,
  [HERO_SLOTS.LEFT]: HERO_ACTION_METRICS.WEIGHT,
  [HERO_SLOTS.RIGHT]: HERO_ACTION_METRICS.BODY_FAT,
};

export const DEFAULT_HERO_ACTION_METRIC = HERO_SLOT_DEFAULTS[HERO_SLOTS.PILL];
export const DEFAULT_HERO_TILE_LEFT_METRIC =
  HERO_SLOT_DEFAULTS[HERO_SLOTS.LEFT];
export const DEFAULT_HERO_TILE_RIGHT_METRIC =
  HERO_SLOT_DEFAULTS[HERO_SLOTS.RIGHT];

export const HERO_ACTION_OPTIONS = [
  {
    key: HERO_ACTION_METRICS.CALORIES,
    label: 'Calories',
    description: 'Calories eaten against today’s target. Tap to add a meal.',
  },
  {
    key: HERO_ACTION_METRICS.CALORIES_LEFT,
    label: 'Calories left',
    description: 'What is left of today’s target. Tap to add a meal.',
  },
  {
    key: HERO_ACTION_METRICS.PROTEIN,
    label: 'Protein',
    description: 'Protein eaten against your macro target. Tap to add a meal.',
  },
  {
    key: HERO_ACTION_METRICS.STEPS,
    label: 'Steps',
    description:
      'Today’s steps against your step goal. Opens the Step tracker.',
  },
  {
    key: HERO_ACTION_METRICS.DEFICIT,
    label: 'Today’s balance',
    description:
      'Deficit or surplus so far against your goal’s daily target. Opens today’s ledger.',
  },
  {
    key: HERO_ACTION_METRICS.BALANCE_7D,
    label: '7-day balance',
    description:
      'Total energy balance over the last 7 days. Opens Rolling Energy Balance.',
  },
  {
    key: HERO_ACTION_METRICS.PHASE,
    label: 'Phase',
    description:
      'How far through your active phase you are. Opens that phase in the Logbook.',
  },
  {
    key: HERO_ACTION_METRICS.STREAK,
    label: 'Streak',
    description:
      'Consecutive on-target days, ending yesterday. Opens the Daily Ledger.',
  },
  {
    key: HERO_ACTION_METRICS.RESTING_HR,
    label: 'Resting HR',
    description:
      'Your resting heart rate baseline. Opens the heart-rate tracker. Needs heart rate tracking on.',
  },
  {
    key: HERO_ACTION_METRICS.BURN,
    label: 'Exercise burn',
    description:
      'Calories burned by today’s training and cardio. Opens today’s breakdown.',
  },
  {
    key: HERO_ACTION_METRICS.WEIGHT,
    label: 'Weight',
    description: 'Your latest weigh-in. Opens the Weight tracker.',
  },
  {
    key: HERO_ACTION_METRICS.BODY_FAT,
    label: 'Body fat',
    description:
      'Your latest body fat reading. Opens the Body Fat tracker. Needs body fat tracking on.',
  },
];

export const HERO_ACTION_CATEGORIES = [
  {
    id: 'food',
    label: 'Food',
    metrics: [
      HERO_ACTION_METRICS.CALORIES,
      HERO_ACTION_METRICS.CALORIES_LEFT,
      HERO_ACTION_METRICS.PROTEIN,
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    metrics: [
      HERO_ACTION_METRICS.STEPS,
      HERO_ACTION_METRICS.BURN,
      HERO_ACTION_METRICS.STREAK,
    ],
  },
  {
    id: 'body',
    label: 'Body',
    metrics: [
      HERO_ACTION_METRICS.WEIGHT,
      HERO_ACTION_METRICS.BODY_FAT,
      HERO_ACTION_METRICS.RESTING_HR,
    ],
  },
  {
    id: 'trends',
    label: 'Trends',
    metrics: [
      HERO_ACTION_METRICS.DEFICIT,
      HERO_ACTION_METRICS.BALANCE_7D,
      HERO_ACTION_METRICS.PHASE,
    ],
  },
];

const OPTION_BY_KEY = Object.fromEntries(
  HERO_ACTION_OPTIONS.map((option) => [option.key, option])
);

const ALL_KEYS = HERO_ACTION_OPTIONS.map((option) => option.key);
const VALID_KEYS = new Set(ALL_KEYS);

// Weight and Body Fat belong on the two tiles beneath the title, not in the
// top-right shortcut pill.
const TILE_ONLY_METRICS = new Set([
  HERO_ACTION_METRICS.WEIGHT,
  HERO_ACTION_METRICS.BODY_FAT,
]);

// When a slot has to move off a metric another slot already shows, take the
// first of these that is free: the most generally useful readouts first.
const FALLBACK_ORDER = [
  HERO_ACTION_METRICS.STEPS,
  HERO_ACTION_METRICS.PROTEIN,
  HERO_ACTION_METRICS.CALORIES,
  HERO_ACTION_METRICS.DEFICIT,
  HERO_ACTION_METRICS.STREAK,
  ...ALL_KEYS,
];

/** A valid metric key, or `fallback` for anything else. */
export const normalizeHeroMetric = (
  value,
  fallback = DEFAULT_HERO_ACTION_METRIC
) => (typeof value === 'string' && VALID_KEYS.has(value) ? value : fallback);

/** A valid pill metric key (excludes tile-only Weight / Body Fat), or the pill default. */
export const normalizeHeroActionMetric = (value) =>
  typeof value === 'string' &&
  VALID_KEYS.has(value) &&
  !TILE_ONLY_METRICS.has(value)
    ? value
    : DEFAULT_HERO_ACTION_METRIC;

/**
 * The tracking switches that decide which metrics a user may pick. Every
 * function below takes this shape as its optional last argument; a switch left
 * out counts as on.
 */
export const getHeroAvailability = (userData) => ({
  bodyFatTrackingEnabled: userData?.bodyFatTrackingEnabled !== false,
  heartRateTrackingEnabled: isHeartRateTrackingEnabled(userData),
});

/** The metric key is one the user may pick given their settings. */
export const isHeroMetricAvailable = (
  metric,
  { bodyFatTrackingEnabled = true, heartRateTrackingEnabled = true } = {}
) =>
  VALID_KEYS.has(metric) &&
  (bodyFatTrackingEnabled || metric !== HERO_ACTION_METRICS.BODY_FAT) &&
  (heartRateTrackingEnabled || metric !== HERO_ACTION_METRICS.RESTING_HR);

/** Whether `metric` is allowed in `slot` under the user's current settings. */
export const isHeroMetricAllowedInSlot = (slot, metric, availability) =>
  SLOT_ORDER.includes(slot) &&
  isHeroMetricAvailable(metric, availability) &&
  (slot !== HERO_SLOTS.PILL || !TILE_ONLY_METRICS.has(metric));

/** Options offered in Settings for one Home slot. */
export const getHeroOptionsForSlot = (slot) =>
  slot === HERO_SLOTS.PILL
    ? HERO_ACTION_OPTIONS.filter((option) => !TILE_ONLY_METRICS.has(option.key))
    : HERO_ACTION_OPTIONS;

/** Categorised options for the Settings metric picker, filtered for one slot. */
export const getHeroOptionGroupsForSlot = (slot) => {
  const allowedKeys = new Set(
    getHeroOptionsForSlot(slot).map((option) => option.key)
  );
  return HERO_ACTION_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    options: category.metrics
      .filter((key) => allowedKeys.has(key))
      .map((key) => OPTION_BY_KEY[key])
      .filter(Boolean),
  })).filter((group) => group.options.length > 0);
};

/**
 * The three slots as they should actually render: every pick valid, available
 * for its slot and unique. Slots are settled in order (pill, left, right), so
 * an earlier slot keeps its pick and a later one that collides moves to its own
 * default if that is free, otherwise the first free fallback.
 *
 * Pass the user's availability (`getHeroAvailability`) at render time so a Body
 * Fat or Resting HR pick steps aside while its tracking is off; the *stored*
 * pick is left alone (load-time normalisation never passes it) so it comes back
 * when tracking does.
 */
export const resolveHeroSlots = (slots = {}, availability) => {
  const used = new Set();
  const resolved = {};

  SLOT_ORDER.forEach((slot) => {
    const isFree = (key) =>
      isHeroMetricAllowedInSlot(slot, key, availability) && !used.has(key);
    const picked = slots?.[slot];
    const metric = isFree(picked)
      ? picked
      : [HERO_SLOT_DEFAULTS[slot], ...FALLBACK_ORDER].find(isFree);
    resolved[slot] = metric;
    used.add(metric);
  });

  return resolved;
};

/** The three slots stored on a `userData`-shaped object, resolved. */
export const readHeroSlots = (userData, options) =>
  resolveHeroSlots(
    {
      [HERO_SLOTS.PILL]: userData?.[HERO_SLOT_FIELDS[HERO_SLOTS.PILL]],
      [HERO_SLOTS.LEFT]: userData?.[HERO_SLOT_FIELDS[HERO_SLOTS.LEFT]],
      [HERO_SLOTS.RIGHT]: userData?.[HERO_SLOT_FIELDS[HERO_SLOTS.RIGHT]],
    },
    options
  );

/**
 * Put `metric` in `slot`. If another slot already shows it, the two swap when
 * the displaced metric is allowed in that other slot; otherwise the other slot
 * moves to its first free allowed fallback (e.g. a tile holding Weight takes
 * the pill's metric, so the pill moves to a free pill metric instead of Weight).
 * An unknown metric, a tile-only metric on the pill, or a metric whose tracking
 * is off changes nothing.
 */
export const assignHeroSlot = (slots, slot, metric, availability) => {
  if (!isHeroMetricAllowedInSlot(slot, metric, availability)) {
    return slots;
  }
  const current = slots[slot];
  if (current === metric) {
    return slots;
  }
  const holder = SLOT_ORDER.find((other) => slots[other] === metric);
  const next = { ...slots, [slot]: metric };
  if (holder) {
    if (isHeroMetricAllowedInSlot(holder, current, availability)) {
      next[holder] = current;
    } else {
      const used = new Set(
        SLOT_ORDER.filter((other) => other !== holder).map(
          (other) => next[other]
        )
      );
      next[holder] = [HERO_SLOT_DEFAULTS[holder], ...FALLBACK_ORDER].find(
        (key) =>
          isHeroMetricAllowedInSlot(holder, key, availability) && !used.has(key)
      );
    }
  }
  return next;
};
