import { resolveGoalCalorieDelta } from '../calculations/calculations.js';

/**
 * A goal's daily energy change in the user's energy unit. The goal's own text
 * (`desc`, written in kcal) is used as it is in kcal mode, and for goals that
 * carry no calorie change.
 */
export const describeGoal = (goalKey, goal, units) => {
  if (!units?.energy.isKj) {
    return goal?.desc;
  }
  const delta = resolveGoalCalorieDelta(goalKey);
  if (!delta) {
    return goal?.desc;
  }
  const amount = units.energy.format(Math.abs(delta));
  return delta > 0 ? `+${amount} surplus` : `-${amount} deficit`;
};

/**
 * Like `describeGoal`, but for the daily balance target actually in force
 * (`goalDailyBalanceTarget`, positive = deficit). An active phase can own a
 * smart delta that differs from the goal's nominal one; then that delta is
 * written out ("-550 kcal deficit"). When it matches the goal (or is unknown)
 * this is exactly `describeGoal`.
 */
export const describeActiveGoalTarget = (
  goalKey,
  goal,
  units,
  balanceTarget
) => {
  const target = Number(balanceTarget);
  if (balanceTarget == null || !Number.isFinite(target)) {
    return describeGoal(goalKey, goal, units);
  }
  const delta = -Math.round(target);
  if (delta === resolveGoalCalorieDelta(goalKey)) {
    return describeGoal(goalKey, goal, units);
  }
  if (delta === 0) {
    return 'At TDEE';
  }
  const amount = units.energy.format(Math.abs(delta));
  return delta > 0 ? `+${amount} surplus` : `-${amount} deficit`;
};
