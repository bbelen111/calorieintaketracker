/**
 * The one definition of how big each goal is. Labels, colours and icons live
 * in `goals.js` (UI); everything that reasons about a goal's size reads this:
 *
 * - the daily calorie change a goal applies (`resolveGoalCalorieDelta`),
 * - the weekly weight and body-fat rate bands its verdicts judge against
 *   (`getGoalAlignmentText`, `calculateGoalAlignment`, `getGoalWeeklyTarget`,
 *   the Weight / Body Fat trend info sheets),
 * - which goal a planned daily change belongs to (`resolveGoalForDailyDelta`:
 *   target-mode phases, phase templates).
 *
 * The bands are tied to the calorie changes so the three can never disagree:
 * an aggressive goal starts at its own delta (500 kcal/day, about 0.45 kg/wk
 * at 7,700 kcal/kg). Someone following Aggressive Bulk is inside its band, and
 * a +692 kcal/day plan is an Aggressive Bulk, never a Lean Bulk.
 *
 * Body-fat bands (%/wk) have no calorie equivalent; they are the ones the Body
 * Fat trend sheet has always documented. The verdict text and "Goal:" label
 * used to reuse the weight numbers (0.25-0.5 %/wk, copied when the body-fat
 * tracker was cloned from the weight one), so colours and words disagreed.
 *
 * Pure: no React, so the Node test tier and the store can import it.
 */

/** Energy in a kilogram of mixed body-weight change. */
export const KCAL_PER_KG_BODYWEIGHT = 7700;

/** A planned daily change smaller than this (kcal, either way) is maintenance. */
export const MAINTENANCE_DELTA_TOLERANCE_KCAL = 100;

/** A daily energy change (kcal/day) as a weekly weight change (kg/wk). */
export const kcalPerDayToKgPerWeek = (kcalPerDay) =>
  (Number(kcalPerDay) * 7) / KCAL_PER_KG_BODYWEIGHT;

const MODERATE_DELTA_KCAL = 300;
const AGGRESSIVE_DELTA_KCAL = 500;

// Where a moderate goal's band ends and an aggressive one's starts (kg/wk).
const AGGRESSIVE_RATE_KG = kcalPerDayToKgPerWeek(AGGRESSIVE_DELTA_KCAL);

const band = ([min, max]) => Object.freeze({ min, max });

// Bands are speed in the goal's direction (never negative); maintenance's band
// is how far either way still counts as holding.
const defineGoal = ({ calorieDelta, direction, weightKg, bodyFatPercent }) =>
  Object.freeze({
    calorieDelta,
    direction,
    weeklyRateKg: band(weightKg),
    weeklyRateBodyFat: band(bodyFatPercent),
  });

export const GOAL_DEFINITIONS = Object.freeze({
  aggressive_bulk: defineGoal({
    calorieDelta: AGGRESSIVE_DELTA_KCAL,
    direction: 'up',
    weightKg: [AGGRESSIVE_RATE_KG, 1],
    bodyFatPercent: [0.15, 0.3],
  }),
  bulking: defineGoal({
    calorieDelta: MODERATE_DELTA_KCAL,
    direction: 'up',
    weightKg: [0.25, AGGRESSIVE_RATE_KG],
    bodyFatPercent: [0.08, 0.15],
  }),
  maintenance: defineGoal({
    calorieDelta: 0,
    direction: 'flat',
    weightKg: [0, 0.1],
    bodyFatPercent: [0, 0.1],
  }),
  cutting: defineGoal({
    calorieDelta: -MODERATE_DELTA_KCAL,
    direction: 'down',
    weightKg: [0.25, AGGRESSIVE_RATE_KG],
    bodyFatPercent: [0.08, 0.15],
  }),
  aggressive_cut: defineGoal({
    calorieDelta: -AGGRESSIVE_DELTA_KCAL,
    direction: 'down',
    weightKg: [AGGRESSIVE_RATE_KG, 1],
    bodyFatPercent: [0.15, 0.3],
  }),
});

export const GOAL_KEYS = Object.freeze(Object.keys(GOAL_DEFINITIONS));

/** Whether `goal` is one of the five goal keys. */
export const isGoalKey = (goal) =>
  typeof goal === 'string' && Object.hasOwn(GOAL_DEFINITIONS, goal);

const bandField = (metricType) =>
  metricType === 'bodyFat' ? 'weeklyRateBodyFat' : 'weeklyRateKg';

/**
 * A goal's weekly-rate band for a metric (`'weight'` kg/wk, `'bodyFat'` %/wk)
 * as `{ min, max, direction }`, speeds in the goal's direction; `null` for an
 * unknown goal.
 */
export const getGoalRateBand = (goalKey, metricType = 'weight') => {
  if (!isGoalKey(goalKey)) {
    return null;
  }
  const goal = GOAL_DEFINITIONS[goalKey];
  return { ...goal[bandField(metricType)], direction: goal.direction };
};

/**
 * Where a trend's descriptive label changes (weekly speed, either way), sized
 * from the goal bands so a label never contradicts its verdict: Stable below
 * the "flat" zone, Gradual through the moderate goals' band, Moderate below
 * 80 % of the aggressive band's top, Aggressive below 120 %, Severe beyond.
 * Rounded to two decimals: weight 0.1 / 0.45 / 0.8 / 1.2 kg/wk (as it always
 * was), body fat 0.08 / 0.15 / 0.24 / 0.36 %/wk (it used to reuse the weight
 * numbers, so a Lean Bulk's +0.09 %/wk read "Stable").
 */
export const getTrendLabelThresholds = (metricType = 'weight') => {
  const round2 = (value) => Math.round(value * 100) / 100;
  const moderateTop = getGoalRateBand('bulking', metricType).max;
  const aggressiveTop = getGoalRateBand('aggressive_bulk', metricType).max;
  return Object.freeze({
    stable: round2(getGoalDirectionThreshold(metricType)),
    gradual: round2(moderateTop),
    moderate: round2(aggressiveTop * 0.8),
    aggressive: round2(aggressiveTop * 1.2),
  });
};

/**
 * Below this weekly speed a trend reads as "flat" when judging its direction:
 * the maintenance band, or the slowest directional band if that starts sooner
 * (body fat: 0.08 %/wk), so a rate inside a goal's own band is never "the
 * wrong way". Weight: 0.1 kg/wk.
 */
export const getGoalDirectionThreshold = (metricType = 'weight') => {
  const field = bandField(metricType);
  return Math.min(
    ...Object.values(GOAL_DEFINITIONS).map((goal) =>
      goal.direction === 'flat' ? goal[field].max : goal[field].min
    )
  );
};

/**
 * The goal a planned daily energy change belongs to (kcal/day, positive =
 * surplus): within the maintenance tolerance it is maintenance; otherwise the
 * moderate goal of that direction, or the aggressive one from the aggressive
 * goal's own delta up (+500 is an Aggressive Bulk, +499 a Lean Bulk).
 */
export const resolveGoalForDailyDelta = (kcalPerDay) => {
  const delta = Number(kcalPerDay);
  if (
    !Number.isFinite(delta) ||
    Math.abs(delta) < MAINTENANCE_DELTA_TOLERANCE_KCAL
  ) {
    return 'maintenance';
  }

  const [moderate, aggressive] =
    delta > 0 ? ['bulking', 'aggressive_bulk'] : ['cutting', 'aggressive_cut'];
  return Math.abs(delta) >= Math.abs(GOAL_DEFINITIONS[aggressive].calorieDelta)
    ? aggressive
    : moderate;
};
