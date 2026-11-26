import { describe, expect, it } from 'vitest';

import {
  getGoalAlignmentText,
  getGoalRateRangeText,
  getGoalWeeklyTarget,
} from './trackerHelpers';
import { calculateGoalAlignment } from '../calculations/goalAlignment';
import {
  GOAL_DEFINITIONS,
  GOAL_KEYS,
  kcalPerDayToKgPerWeek,
} from '../../constants/goals/goalDefinitions';

/**
 * The verdict text and band labels read the goal table
 * (`constants/goals/goalDefinitions.js`). Lives in the UI tier only because
 * the module is JSX; the table itself is covered by
 * `tests/constants/goalDefinitions.test.js`.
 */
const trend = (weeklyRate) => ({ label: 'Trend', weeklyRate });

describe('trackerHelpers goal bands', () => {
  it('every goal followed exactly is "On track" by its own verdict', () => {
    // Aggressive Bulk at +500 kcal used to read "Slower than goal target".
    GOAL_KEYS.forEach((key) => {
      const rate = kcalPerDayToKgPerWeek(GOAL_DEFINITIONS[key].calorieDelta);
      expect(getGoalAlignmentText(trend(rate), key)?.text, key).toBe(
        'On track'
      );
    });
  });

  it('a +692 kcal/day plan is on track as an Aggressive Bulk, too fast as a Lean Bulk', () => {
    const rate = kcalPerDayToKgPerWeek(692);
    expect(getGoalAlignmentText(trend(rate), 'aggressive_bulk')?.text).toBe(
      'On track'
    );
    expect(getGoalAlignmentText(trend(rate), 'bulking')?.text).toBe(
      'Faster than goal target'
    );
  });

  it('labels every band from the table', () => {
    expect(getGoalWeeklyTarget('bulking')).toBe('+0.25-0.45 kg/wk');
    expect(getGoalWeeklyTarget('aggressive_bulk')).toBe('+0.45-1.0 kg/wk');
    expect(getGoalWeeklyTarget('cutting')).toBe('-0.25-0.45 kg/wk');
    expect(getGoalWeeklyTarget('aggressive_cut')).toBe('-0.45-1.0 kg/wk');
    expect(getGoalWeeklyTarget('maintenance')).toBe('0.0 kg/wk');
    // Body fat used to print the weight numbers (+0.25-0.5 %/wk).
    expect(getGoalWeeklyTarget('bulking', 'bodyFat')).toBe('+0.08-0.15 %/wk');
    expect(getGoalWeeklyTarget('aggressive_bulk', 'bodyFat')).toBe(
      '+0.15-0.3 %/wk'
    );
    expect(getGoalWeeklyTarget('cutting', 'bodyFat')).toBe('-0.08-0.15 %/wk');
    expect(getGoalWeeklyTarget('aggressive_cut', 'bodyFat')).toBe(
      '-0.15-0.3 %/wk'
    );
  });

  it('writes the info-sheet ranges from the same table', () => {
    expect(getGoalRateRangeText('bulking')).toBe('+0.25 to +0.45 kg/week');
    expect(getGoalRateRangeText('aggressive_cut')).toBe(
      '-1.0 to -0.45 kg/week'
    );
    expect(getGoalRateRangeText('maintenance')).toBe('-0.1 to +0.1 kg/week');
    expect(getGoalRateRangeText('cutting', 'bodyFat')).toBe(
      '-0.15 to -0.08 %/week'
    );
    expect(getGoalRateRangeText('aggressive_bulk', 'bodyFat')).toBe(
      '+0.15 to +0.3 %/week'
    );
    expect(getGoalRateRangeText('unknown', 'bodyFat')).toBe(
      '-0.1 to +0.1 %/week'
    );
  });

  it('a body-fat trend’s words agree with its colour', () => {
    // Each case: [%/wk, goal, verdict text]. The colour system has always used
    // these bands; the text used to judge by the weight numbers.
    [
      [-0.12, 'cutting', 'On track'],
      [-0.3, 'cutting', 'Faster than goal target'],
      [-0.2, 'aggressive_cut', 'On track'],
      [0.1, 'bulking', 'On track'],
      [0.25, 'aggressive_bulk', 'On track'],
      [0.05, 'maintenance', 'On track'],
    ].forEach(([rate, goal, text]) => {
      expect(getGoalAlignmentText(trend(rate), goal, 'bodyFat')?.text).toBe(
        text
      );
      const colour = calculateGoalAlignment(rate, goal, 'bodyFat');
      expect(['perfect', 'good', 'acceptable'].includes(colour.alignment)).toBe(
        text === 'On track'
      );
    });
  });

  it('a body-fat rate inside a goal’s band is never "the wrong way"', () => {
    // Lean Bulk starts at 0.08 %/wk, under the 0.1 that once meant "flat".
    expect(getGoalAlignmentText(trend(0.09), 'bulking', 'bodyFat')?.text).toBe(
      'On track'
    );
    expect(
      calculateGoalAlignment(0.09, 'bulking', 'bodyFat').description
    ).not.toBe('Not progressing as expected');
    expect(getGoalAlignmentText(trend(-0.09), 'cutting', 'bodyFat')?.text).toBe(
      'On track'
    );
    // Weight keeps its 0.1 kg/wk flat zone.
    expect(getGoalAlignmentText(trend(0.09), 'bulking')?.text).toBe(
      'Not gaining as expected'
    );
  });
});
