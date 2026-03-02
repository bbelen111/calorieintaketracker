/**
 * Shared helpers for weight / body-fat tracker modals and snapshot widgets.
 *
 * Every function here was previously duplicated across:
 *   - WeightTrackerModal.jsx
 *   - BodyFatTrackerModal.jsx
 *   - InsightsScreen.jsx
 *
 * Centralising them guarantees identical assessment logic, wording, and
 * colour mapping between the Insights "preview" cards and the full-screen
 * tracker modals.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getGoalAlignedTextClass } from './goalAlignment';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DATA_OLD_WARNING_DAYS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

/** Directional trend arrow (↑ / ↓ / —) */
export const TrendIcon = ({ direction, size = 18 }) => {
  if (direction === 'up') return <TrendingUp size={size} />;
  if (direction === 'down') return <TrendingDown size={size} />;
  return <Minus size={size} />;
};

// ---------------------------------------------------------------------------
// Trend / goal-alignment text helpers
// ---------------------------------------------------------------------------

/**
 * Return a Tailwind text-colour class based on how the trend aligns with the
 * selected goal.  Delegates to the shared `goalAlignment.js` utility.
 *
 * @param {object}  trend        – trend object (must have `.label`)
 * @param {string}  selectedGoal – e.g. 'bulking', 'cutting', …
 * @param {string}  metricType   – 'weight' | 'bodyFat'
 */
export const getTrendToneClass = (trend, selectedGoal, metricType) => {
  if (
    !trend ||
    trend.label === 'Need more data' ||
    trend.label === 'No data yet'
  ) {
    return 'text-foreground';
  }
  return getGoalAlignedTextClass(trend, selectedGoal, metricType);
};

/**
 * Produce a short "On track" / "Slower than goal" descriptor + colour class.
 *
 * @param {number} weeklyRate   – signed weekly rate (kg/wk or %/wk)
 * @param {string} selectedGoal – goal key
 * @param {string} metricType   – 'weight' | 'bodyFat'
 * @returns {{ text: string, color: string } | null}
 */
export const getGoalAlignmentText = (
  weeklyRate,
  selectedGoal,
  metricType = 'weight'
) => {
  const goalExpectations = {
    aggressive_bulk: { min: 0.5, max: 1.0, direction: 'up' },
    bulking: { min: 0.25, max: 0.5, direction: 'up' },
    maintenance: { min: -0.1, max: 0.1, direction: 'flat' },
    cutting: { min: 0.25, max: 0.5, direction: 'down' },
    aggressive_cut: { min: 0.5, max: 1.0, direction: 'down' },
  };

  const expectation = goalExpectations[selectedGoal];
  if (!expectation) return null;

  let actualDirection = 'flat';
  if (weeklyRate < -0.1) actualDirection = 'down';
  else if (weeklyRate > 0.1) actualDirection = 'up';

  // Direction mismatch
  if (
    actualDirection !== expectation.direction &&
    expectation.direction !== 'flat'
  ) {
    const verb =
      metricType === 'bodyFat'
        ? expectation.direction === 'up'
          ? 'Not gaining as expected'
          : 'Not reducing as expected'
        : expectation.direction === 'up'
          ? 'Not gaining as expected'
          : 'Not losing as expected';
    return { text: verb, color: 'text-accent-yellow' };
  }

  // Maintenance
  if (expectation.direction === 'flat') {
    if (Math.abs(weeklyRate) <= 0.1)
      return { text: 'On track with goal', color: 'text-accent-green' };
    return { text: 'Deviating from maintenance', color: 'text-accent-yellow' };
  }

  // Directional goal – compare magnitude
  const expectedRate =
    expectation.direction === 'down' ? -weeklyRate : weeklyRate;
  if (expectedRate >= expectation.min && expectedRate <= expectation.max)
    return { text: 'On track with goal', color: 'text-accent-green' };
  if (expectedRate < expectation.min)
    return { text: 'Slower than goal target', color: 'text-accent-blue' };
  if (expectedRate > expectation.max)
    return { text: 'Faster than goal target', color: 'text-accent-yellow' };
  return null;
};

/**
 * Return a human-readable goal rate string, e.g. "+0.25-0.5 kg/wk".
 *
 * @param {string} selectedGoal
 * @param {string} metricType – 'weight' | 'bodyFat'
 */
export const getGoalWeeklyTarget = (selectedGoal, metricType = 'weight') => {
  const unit = metricType === 'bodyFat' ? '%/wk' : 'kg/wk';
  const goalTargets = {
    aggressive_bulk: `+0.5-1.0 ${unit}`,
    bulking: `+0.25-0.5 ${unit}`,
    maintenance: `0.0 ${unit}`,
    cutting: `-0.25-0.5 ${unit}`,
    aggressive_cut: `-0.5-1.0 ${unit}`,
  };
  return goalTargets[selectedGoal] || `0.0 ${unit}`;
};

// ---------------------------------------------------------------------------
// Weekly-rate formatting
// ---------------------------------------------------------------------------

/**
 * Format a signed weekly rate for display.
 *
 * @param {number} value     – signed rate
 * @param {string} metricType – 'weight' | 'bodyFat'
 */
export const formatWeeklyRate = (value, metricType = 'weight') => {
  const unit = metricType === 'bodyFat' ? '%/wk' : 'kg/wk';
  if (!Number.isFinite(value) || value === 0) {
    return `0.0 ${unit}`;
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} ${unit}`;
};

// ---------------------------------------------------------------------------
// Date / data-age helpers
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM-DD date string into a rich tooltip date
 * (e.g. "Thu, 1 Jan 2026").
 */
export const formatTooltipDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * How many full days ago was `dateKey` (YYYY-MM-DD)?
 * Returns `null` for invalid / missing input.
 */
export const getDataAgeInDays = (dateKey) => {
  if (!dateKey) return null;
  const entryDate = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(entryDate.getTime())) return null;

  const now = new Date();
  const utcToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const utcEntry = Date.UTC(
    entryDate.getUTCFullYear(),
    entryDate.getUTCMonth(),
    entryDate.getUTCDate()
  );
  return Math.max(0, Math.floor((utcToday - utcEntry) / MS_PER_DAY));
};

/**
 * Return a human-readable "X days old" warning, or `null` if the data is
 * fresh (< DATA_OLD_WARNING_DAYS).
 */
export const getOldDataWarningText = (dateKey) => {
  const ageDays = getDataAgeInDays(dateKey);
  if (!Number.isFinite(ageDays) || ageDays < DATA_OLD_WARNING_DAYS) return null;
  const dayLabel = ageDays === 1 ? 'day' : 'days';
  return `${ageDays} ${dayLabel} old`;
};
