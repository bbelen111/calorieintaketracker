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
