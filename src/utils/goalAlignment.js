/**
 * Goal-aligned color system for weight and body fat tracking
 * Colors represent how "on track" progress is relative to the selected goal
 */

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
    return {
      alignment: 'no-data',
      color: '#60a5fa', // Blue - neutral
      topOpacity: 0.3,
      bottomOpacity: 0.05,
      description: 'Insufficient data',
    };
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
      return {
        alignment: 'perfect',
        color: '#22c55e', // Green - on track
        topOpacity: 0.35,
        bottomOpacity: 0.05,
        description: 'Maintaining perfectly',
      };
    } else if (absRate <= 0.25) {
      return {
        alignment: 'good',
        color: '#84cc16', // Lime - slightly off but acceptable
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Close to maintenance',
      };
    } else if (absRate <= 0.5) {
      return {
        alignment: 'moderate',
        color: '#eab308', // Yellow - drifting
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Drifting from goal',
      };
    } else {
      return {
        alignment: 'poor',
        color: '#f97316', // Orange - significantly off
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Significantly off track',
      };
    }
  }

  // For non-maintenance goals
  if (!directionMatches) {
    // Moving in opposite direction
    if (absRate > 0.5) {
      return {
        alignment: 'very-poor',
        color: '#ef4444', // Red - completely wrong direction, high rate
        topOpacity: 0.35,
        bottomOpacity: 0.05,
        description: 'Opposite direction',
      };
    } else if (absRate > 0.25) {
      return {
        alignment: 'poor',
        color: '#f97316', // Orange - wrong direction, moderate rate
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Moving wrong way',
      };
    } else {
      return {
        alignment: 'moderate',
        color: '#eab308', // Yellow - wrong direction but slow
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Not progressing as expected',
      };
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
      return {
        alignment: 'perfect',
        color: '#22c55e', // Green - perfectly on track
        topOpacity: 0.35,
        bottomOpacity: 0.05,
        description: 'Perfectly on track',
      };
    } else if (normalizedDeviation < 0.7) {
      return {
        alignment: 'good',
        color: '#84cc16', // Lime - on track
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'On track',
      };
    } else {
      return {
        alignment: 'acceptable',
        color: '#a3e635', // Light lime - acceptable
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Within acceptable range',
      };
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
      return {
        alignment: 'poor',
        color: '#f97316', // Orange - way too fast
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Progressing too rapidly',
      };
    } else if (overshoot > targetRange * 0.5) {
      return {
        alignment: 'moderate',
        color: '#eab308', // Yellow - too fast
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Slightly too fast',
      };
    } else {
      return {
        alignment: 'acceptable',
        color: '#a3e635', // Light lime - just over target
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Just above target range',
      };
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
      return {
        alignment: 'moderate',
        color: '#eab308', // Yellow - too slow
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Progressing too slowly',
      };
    } else {
      return {
        alignment: 'acceptable',
        color: '#a3e635', // Light lime - just under target
        topOpacity: 0.3,
        bottomOpacity: 0.05,
        description: 'Just below target range',
      };
    }
  }

  // Fallback
  return {
    alignment: 'moderate',
    color: '#60a5fa', // Blue - neutral
    topOpacity: 0.3,
    bottomOpacity: 0.05,
    description: 'Progress tracking',
  };
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
    return {
      color: '#60a5fa',
      topOpacity: 0.3,
      bottomOpacity: 0.05,
      alignment: 'no-data',
    };
  }

  const alignment = calculateGoalAlignment(
    trend.weeklyRate,
    selectedGoal,
    metricType
  );

  return {
    color: alignment.color,
    topOpacity: alignment.topOpacity,
    bottomOpacity: alignment.bottomOpacity,
    alignment: alignment.alignment,
    description: alignment.description,
  };
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

  const colorMap = {
    '#ef4444': 'text-accent-red',
    '#f97316': 'text-accent-orange',
    '#eab308': 'text-accent-yellow',
    '#a3e635': 'text-accent-lime',
    '#84cc16': 'text-accent-lime',
    '#22c55e': 'text-accent-green',
    '#60a5fa': 'text-accent-blue',
  };

  return colorMap[style.color] || 'text-accent-slate';
};
