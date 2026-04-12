/**
 * Goal-aligned color system for weight and body fat tracking
 * Colors represent how "on track" progress is relative to the selected goal
 */

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
  // Goal expectations in terms of weekly rates
  const goalExpectations = {
    aggressive_bulk: {
      min: metricType === 'weight' ? 0.5 : 0.15,
      max: metricType === 'weight' ? 1.0 : 0.3,
      direction: 'up',
      idealMid: metricType === 'weight' ? 0.75 : 0.225,
    },
    bulking: {
      min: metricType === 'weight' ? 0.25 : 0.08,
      max: metricType === 'weight' ? 0.5 : 0.15,
      direction: 'up',
      idealMid: metricType === 'weight' ? 0.375 : 0.115,
    },
    maintenance: {
      min: -0.1,
      max: 0.1,
      direction: 'flat',
      idealMid: 0,
    },
    cutting: {
      min: metricType === 'weight' ? -0.5 : -0.15,
      max: metricType === 'weight' ? -0.25 : -0.08,
      direction: 'down',
      idealMid: metricType === 'weight' ? -0.375 : -0.115,
    },
    aggressive_cut: {
      min: metricType === 'weight' ? -1.0 : -0.3,
      max: metricType === 'weight' ? -0.5 : -0.15,
      direction: 'down',
      idealMid: metricType === 'weight' ? -0.75 : -0.225,
    },
  };

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

  // Determine actual direction
  let actualDirection = 'flat';
  if (weeklyRate < -0.1) actualDirection = 'down';
  else if (weeklyRate > 0.1) actualDirection = 'up';

  // Check if direction matches goal (most critical alignment factor)
  const directionMatches =
    actualDirection === expectation.direction ||
    expectation.direction === 'flat';

  // For maintenance, check if within tolerance
  if (expectation.direction === 'flat') {
    if (absRate <= 0.1) {
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
  if (
    !trend ||
    trend.label === 'Need more data' ||
    trend.label === 'No data yet' ||
    !Number.isFinite(trend.weeklyRate)
  ) {
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
