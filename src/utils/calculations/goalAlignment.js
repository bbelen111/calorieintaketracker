/**
 * Goal-aligned color system for weight and body fat tracking
 * Colors represent how "on track" progress is relative to the selected goal
 */

import {
  GOAL_KEYS,
  getGoalDirectionThreshold,
  getGoalRateBand,
} from '../../constants/goals/goalDefinitions.js';

const GOAL_ALIGNMENT_PALETTE = {
  neutral: {
    color: 'rgb(var(--accent-blue))',
    textClass: 'text-accent-blue',
  },
  success: {
    color: 'rgb(var(--accent-green))',
    textClass: 'text-accent-green',
  },
  positive: {
    color: 'rgb(var(--accent-lime))',
    textClass: 'text-accent-lime',
  },
  caution: {
    color: 'rgb(var(--accent-yellow))',
    textClass: 'text-accent-yellow',
  },
  warning: {
    color: 'rgb(var(--accent-orange))',
    textClass: 'text-accent-orange',
  },
  danger: {
    color: 'rgb(var(--accent-red))',
    textClass: 'text-accent-red',
  },
};

const buildAlignmentResult = (
  alignment,
  tone,
  topOpacity,
  bottomOpacity,
  description
) => {
  const resolvedTone = GOAL_ALIGNMENT_PALETTE[tone] ? tone : 'neutral';
  const palette = GOAL_ALIGNMENT_PALETTE[resolvedTone];

  return {
    alignment,
    tone: resolvedTone,
    color: palette.color,
    textClass: palette.textClass,
    topOpacity,
    bottomOpacity,
    description,
  };
};

/**
 * Does a trend object carry a usable rate?
 *
 * Trend calculators return `weeklyRate: 0` for "no entries" and "insufficient
 * data" just as they do for a genuinely stable rate, so the number alone can
 * never answer this. Anything that makes a claim about goal alignment must
 * check here first — otherwise an empty log reads as "on track with goal".
 *
 * @param {object} trend - trend from calculateWeightTrend / calculateBodyFatTrend
 * @returns {boolean}
 */
export const hasTrendData = (trend) =>
  Boolean(trend) &&
  Number.isFinite(trend.weeklyRate) &&
  trend.label !== 'No data yet' &&
  trend.label !== 'Need more data';

// Signed weekly-rate expectations per goal and metric, built from the goal
// table so this colour system, the verdict text and the "Goal:" labels judge
// by the same bands (weight bands are also tied to the goal's calories).
const buildExpectations = (metricType) =>
  Object.freeze(
    Object.fromEntries(
      GOAL_KEYS.map((key) => {
        const { min, max, direction } = getGoalRateBand(key, metricType);
        if (direction === 'flat') {
          return [key, { min: -max, max, direction, idealMid: 0 }];
        }
        const sign = direction === 'down' ? -1 : 1;
        const [low, high] = [sign * min, sign * max].sort((a, b) => a - b);
        return [
          key,
          {
            min: low,
            max: high,
            direction,
            idealMid: (sign * (min + max)) / 2,
          },
        ];
      })
    )
  );

const GOAL_EXPECTATIONS = Object.freeze({
  weight: buildExpectations('weight'),
  bodyFat: buildExpectations('bodyFat'),
});

/**
 * Calculate how aligned the actual weekly rate is with the goal's expectations
 * @param {number} weeklyRate - The actual weekly rate (kg/wk or %/wk)
 * @param {string} selectedGoal - The selected goal ('aggressive_bulk', 'bulking', 'maintenance', 'cutting', 'aggressive_cut')
 * @param {string} metricType - Either 'weight' or 'bodyFat'
 * @returns {object} Color configuration with alignment score
 */
export const calculateGoalAlignment = (
  weeklyRate,
  selectedGoal,
  metricType = 'weight'
) => {
  const goalExpectations =
    metricType === 'bodyFat'
      ? GOAL_EXPECTATIONS.bodyFat
      : GOAL_EXPECTATIONS.weight;
  const expectation =
    goalExpectations[selectedGoal] || goalExpectations.maintenance;

  // Handle invalid/no data
  if (!Number.isFinite(weeklyRate)) {
    return buildAlignmentResult(
      'no-data',
      'neutral',
      0.3,
      0.05,
      'Insufficient data'
    );
  }

  const absRate = Math.abs(weeklyRate);

  // Determine actual direction (flat below the slowest band, so a rate inside
  // a goal's own band is never read as going the wrong way)
  const flatBelow = getGoalDirectionThreshold(metricType);
  let actualDirection = 'flat';
  if (weeklyRate < -flatBelow) actualDirection = 'down';
  else if (weeklyRate > flatBelow) actualDirection = 'up';

  // Check if direction matches goal (most critical alignment factor)
  const directionMatches =
    actualDirection === expectation.direction ||
    expectation.direction === 'flat';

  // For maintenance, check if within tolerance
  if (expectation.direction === 'flat') {
    if (absRate <= expectation.max) {
      return buildAlignmentResult(
        'perfect',
        'success',
        0.35,
        0.05,
        'Maintaining perfectly'
      );
    } else if (absRate <= 0.25) {
      return buildAlignmentResult(
        'good',
        'positive',
        0.3,
        0.05,
        'Close to maintenance'
      );
    } else if (absRate <= 0.5) {
      return buildAlignmentResult(
        'moderate',
        'caution',
        0.3,
        0.05,
        'Drifting from goal'
      );
    } else {
      return buildAlignmentResult(
        'poor',
        'warning',
        0.3,
        0.05,
        'Significantly off track'
      );
    }
  }

  // For non-maintenance goals
  if (!directionMatches) {
    // Moving in opposite direction
    if (absRate > 0.5) {
      return buildAlignmentResult(
        'very-poor',
        'danger',
        0.35,
        0.05,
        'Opposite direction'
      );
    } else if (absRate > 0.25) {
      return buildAlignmentResult(
        'poor',
        'warning',
        0.3,
        0.05,
        'Moving wrong way'
      );
    } else {
      return buildAlignmentResult(
        'moderate',
        'caution',
        0.3,
        0.05,
        'Not progressing as expected'
      );
    }
  }

  // Direction matches - now check rate magnitude
  const targetRange = Math.abs(expectation.max - expectation.min);
  const targetMid = Math.abs(expectation.idealMid);
  const deviationFromIdeal = Math.abs(Math.abs(weeklyRate) - targetMid);

  // Within ideal range
  if (
    Math.abs(weeklyRate) >=
      Math.min(Math.abs(expectation.min), Math.abs(expectation.max)) &&
    Math.abs(weeklyRate) <=
      Math.max(Math.abs(expectation.min), Math.abs(expectation.max))
  ) {
    // Calculate how close to ideal center
    const normalizedDeviation = deviationFromIdeal / (targetRange / 2);

    if (normalizedDeviation < 0.3) {
      return buildAlignmentResult(
        'perfect',
        'success',
        0.35,
        0.05,
        'Perfectly on track'
      );
    } else if (normalizedDeviation < 0.7) {
      return buildAlignmentResult('good', 'positive', 0.3, 0.05, 'On track');
    } else {
      return buildAlignmentResult(
        'acceptable',
        'positive',
        0.3,
        0.05,
        'Within acceptable range'
      );
    }
  }

  // Going too fast (overshooting)
  const maxExpected = Math.max(
    Math.abs(expectation.min),
    Math.abs(expectation.max)
  );
  if (Math.abs(weeklyRate) > maxExpected) {
    const overshoot = Math.abs(weeklyRate) - maxExpected;

    if (overshoot > targetRange) {
      return buildAlignmentResult(
        'poor',
        'warning',
        0.3,
        0.05,
        'Progressing too rapidly'
      );
    } else if (overshoot > targetRange * 0.5) {
      return buildAlignmentResult(
        'moderate',
        'caution',
        0.3,
        0.05,
        'Slightly too fast'
      );
    } else {
      return buildAlignmentResult(
        'acceptable',
        'positive',
        0.3,
        0.05,
        'Just above target range'
      );
    }
  }

  // Going too slow (undershooting)
  const minExpected = Math.min(
    Math.abs(expectation.min),
    Math.abs(expectation.max)
  );
  if (Math.abs(weeklyRate) < minExpected) {
    const undershoot = minExpected - Math.abs(weeklyRate);

    if (undershoot > targetRange * 0.5) {
      return buildAlignmentResult(
        'moderate',
        'caution',
        0.3,
        0.05,
        'Progressing too slowly'
      );
    } else {
      return buildAlignmentResult(
        'acceptable',
        'positive',
        0.3,
        0.05,
        'Just below target range'
      );
    }
  }

  // Fallback
  return buildAlignmentResult(
    'moderate',
    'neutral',
    0.3,
    0.05,
    'Progress tracking'
  );
};

/**
 * Get visual style for trend based on goal alignment
 * @param {object} trend - Trend data with weeklyRate and direction
 * @param {string} selectedGoal - The selected goal
 * @param {string} metricType - Either 'weight' or 'bodyFat'
 * @returns {object} Visual style configuration
 */
export const getGoalAlignedStyle = (
  trend,
  selectedGoal,
  metricType = 'weight'
) => {
  // Handle no data case
  if (!hasTrendData(trend)) {
    return buildAlignmentResult(
      'no-data',
      'neutral',
      0.3,
      0.05,
      'Insufficient data'
    );
  }

  const alignment = calculateGoalAlignment(
    trend.weeklyRate,
    selectedGoal,
    metricType
  );

  return alignment;
};

/**
 * Get text color class based on goal alignment
 * @param {object} trend - Trend data
 * @param {string} selectedGoal - The selected goal
 * @param {string} metricType - Either 'weight' or 'bodyFat'
 * @returns {string} Tailwind text color class
 */
export const getGoalAlignedTextClass = (
  trend,
  selectedGoal,
  metricType = 'weight'
) => {
  const style = getGoalAlignedStyle(trend, selectedGoal, metricType);

  return style.textClass || 'text-accent-slate';
};
