/**
 * How the user's units reach the AI food chat. The machine payload always stays
 * kcal and grams; only the model's prose follows the display units. Kept apart
 * from `services/openrouter.js` so the pipeline can use it without pulling the
 * lazy-loaded client into its static imports.
 */

import { createUnitFormatter } from './unitFormatter.js';

/**
 * Tells the model which units to use in its prose when the user doesn't use
 * kcal and grams. Empty for kcal + grams, so those requests are exactly as they
 * were before units existed.
 *
 * @param {{ energy?: string, foodWeight?: string }} [displayUnits]
 * @returns {string}
 */
export function buildDisplayUnitsBlock(displayUnits) {
  const lines = [
    displayUnits?.energy === 'kJ' ? 'energy: kJ (1 kcal = 4.184 kJ)' : null,
    displayUnits?.foodWeight === 'oz'
      ? 'food weight: oz (1 oz = 28.35 g)'
      : null,
  ].filter(Boolean);

  return lines.length ? `[DISPLAY_UNITS]\n${lines.join('\n')}` : '';
}

/**
 * Verified amounts already written in the display units, so the model never has
 * to convert a number itself. Sent beside the entries, which stay kcal / grams.
 *
 * @param {Array<{ name?: string, calories?: number, grams?: number }>} entries
 * @param {object} [displayUnits]
 */
export function buildDisplayValues(entries, displayUnits) {
  const { energy, food } = createUnitFormatter(displayUnits);
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    name: entry?.name,
    energy: energy.format(entry?.calories),
    weight: food.format(entry?.grams),
  }));
}
