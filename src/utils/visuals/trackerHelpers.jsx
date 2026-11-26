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
import {
  hasTrendData,
  getGoalAlignedTextClass,
} from '../calculations/goalAlignment';
import { METRIC_UNITS } from '../units/unitFormatter';
import {
  getGoalDirectionThreshold,
  getGoalRateBand,
} from '../../constants/goals/goalDefinitions.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DATA_OLD_WARNING_DAYS = 1;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Goal rate bands (verdicts, "Goal:" labels, the trend info sheets) all come
// from the goal table via `getGoalRateBand`, the same bands the trend colours
// use, so a body-fat trend's colour and its words can no longer disagree.

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
  if (!hasTrendData(trend)) {
    return 'text-foreground';
  }
  return getGoalAlignedTextClass(trend, selectedGoal, metricType);
};

/**
 * Produce a short "On track" / "Slower than goal" descriptor + colour class.
 *
 * Takes the whole trend (not just its rate) because "no data" and "stable" both
 * report `weeklyRate: 0`; without the trend there is no way to tell them apart.
 * Returns `null` whenever the trend carries no usable rate, so callers render
 * nothing rather than inventing a verdict.
 *
 * @param {object}  trend        – trend object (must have `.weeklyRate` + `.label`)
 * @param {string}  selectedGoal – goal key
 * @param {string}  metricType   – 'weight' | 'bodyFat'
 * @returns {{ text: string, color: string } | null}
 */
export const getGoalAlignmentText = (
  trend,
  selectedGoal,
  metricType = 'weight'
) => {
  if (!hasTrendData(trend)) return null;
  const weeklyRate = trend.weeklyRate;

  const expectation = getGoalRateBand(selectedGoal, metricType);
  if (!expectation) return null;

  // Flat below the slowest band, so a rate inside the goal's band is never
  // "Not gaining" (body fat's Lean Bulk band starts at 0.08 %/wk).
  const flatBelow = getGoalDirectionThreshold(metricType);
  let actualDirection = 'flat';
  if (weeklyRate < -flatBelow) actualDirection = 'down';
  else if (weeklyRate > flatBelow) actualDirection = 'up';

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
    if (Math.abs(weeklyRate) <= expectation.max)
      return { text: 'On track', color: 'text-accent-green' };
    return { text: 'Deviating from maintenance', color: 'text-accent-yellow' };
  }

  // Directional goal – compare magnitude
  const expectedRate =
    expectation.direction === 'down' ? -weeklyRate : weeklyRate;
  if (expectedRate >= expectation.min && expectedRate <= expectation.max)
    return { text: 'On track', color: 'text-accent-green' };
  if (expectedRate < expectation.min)
    return { text: 'Slower than goal target', color: 'text-accent-blue' };
  if (expectedRate > expectation.max)
    return { text: 'Faster than goal target', color: 'text-accent-yellow' };
  return null;
};

// A band edge as kg and %/wk print it: two decimals at most, one at least
// (0.25, 0.45, 0.5, 1.0).
const formatBandEdge = (value) => value.toFixed(2).replace(/(\.\d)0$/, '$1');

/**
 * Return a human-readable goal rate string, e.g. "+0.25-0.45 kg/wk".
 *
 * @param {string} selectedGoal
 * @param {string} metricType – 'weight' | 'bodyFat'
 * @param {object} [units] – unit formatter (weight only)
 */
export const getGoalWeeklyTarget = (
  selectedGoal,
  metricType = 'weight',
  units = METRIC_UNITS
) => {
  const isBodyFat = metricType === 'bodyFat';
  const { bodyWeight } = units;
  const unit = isBodyFat ? '%/wk' : `${bodyWeight.linearUnit}/wk`;
  const band = getGoalRateBand(selectedGoal, metricType);
  if (!band || band.direction === 'flat') {
    return `0.0 ${unit}`;
  }
  const sign = band.direction === 'down' ? '-' : '+';
  const edges = [band.min, band.max];
  const range =
    isBodyFat || bodyWeight.linearUnit === 'kg'
      ? edges.map(formatBandEdge).join('-')
      : edges.map((kg) => bodyWeight.toNumber(kg).toFixed(1)).join('-');
  return `${sign}${range} ${unit}`;
};

/**
 * A goal's band as the trend info sheets write it, signed low to high, e.g.
 * "+0.25 to +0.45 kg/week", "-0.15 to -0.08 %/week", "-0.1 to +0.1 kg/week".
 * An unknown goal reads as maintenance.
 *
 * @param {string} selectedGoal
 * @param {string} metricType – 'weight' | 'bodyFat'
 * @param {object} [units] – unit formatter (weight only)
 */
export const getGoalRateRangeText = (
  selectedGoal,
  metricType = 'weight',
  units = METRIC_UNITS
) => {
  const isBodyFat = metricType === 'bodyFat';
  const { bodyWeight } = units;
  const unit = isBodyFat ? '%/week' : `${bodyWeight.linearUnit}/week`;
  const band =
    getGoalRateBand(selectedGoal, metricType) ??
    getGoalRateBand('maintenance', metricType);
  const sign = band.direction === 'down' ? -1 : 1;
  const bounds =
    band.direction === 'flat'
      ? [-band.max, band.max]
      : [sign * band.min, sign * band.max].sort((a, b) => a - b);
  const format = (value) => {
    const magnitude =
      isBodyFat || bodyWeight.linearUnit === 'kg'
        ? formatBandEdge(Math.abs(value))
        : Math.abs(bodyWeight.toNumber(value)).toFixed(1);
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${magnitude}`;
  };
  return `${bounds.map(format).join(' to ')} ${unit}`;
};

// ---------------------------------------------------------------------------
// Weekly-rate formatting
// ---------------------------------------------------------------------------

/**
 * Format a signed weekly rate for display.
 *
 * @param {number} value     – signed rate (kg or % per week)
 * @param {string} metricType – 'weight' | 'bodyFat'
 * @param {object} [units]    – unit formatter (weight only)
 */
export const formatWeeklyRate = (
  value,
  metricType = 'weight',
  units = METRIC_UNITS
) => {
  if (metricType !== 'bodyFat') {
    return units.bodyWeight.formatRate(Number.isFinite(value) ? value : 0);
  }
  if (!Number.isFinite(value) || value === 0) {
    return '0.0 %/wk';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} %/wk`;
};

// ---------------------------------------------------------------------------
// Date / data-age helpers
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM-DD date string into a rich long date
 * (e.g. "Thu, 1 Jan 2026"). Used by the tracker selection card and the
 * tracker date captions — the old `formatTooltipDate` name is gone with the
 * floating tooltip system it was named after.
 */
export const formatPanelDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Format a YYYY-MM-DD date string into a compact snapshot label
 * (e.g. "Aug 27"). The year is appended only when the entry is not
 * from the current year, keeping old entries unambiguous while
 * conserving horizontal space in narrow snapshot cards.
 */
export const formatSnapshotDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return '';
  const currentYear = new Date().getFullYear();
  const year = date.getFullYear();
  const base = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return year === currentYear ? base : `${base}, ${year}`;
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
 * fresh (< thresholdDays).
 *
 * @param {string} dateKey       – `YYYY-MM-DD` of the latest data point
 * @param {number} [thresholdDays=DATA_OLD_WARNING_DAYS] – staleness threshold in days
 */
export const getOldDataWarningText = (dateKey, thresholdDays) => {
  const threshold = Number.isFinite(Number(thresholdDays))
    ? Number(thresholdDays)
    : DATA_OLD_WARNING_DAYS;
  const ageDays = getDataAgeInDays(dateKey);
  if (!Number.isFinite(ageDays) || ageDays < threshold) return null;
  const dayLabel = ageDays === 1 ? 'day' : 'days';
  return `${ageDays} ${dayLabel} old`;
};

// ---------------------------------------------------------------------------
// Gap-aware chart slot builder
// ---------------------------------------------------------------------------

/**
 * Build gap-tagged chart points for a day-slot timeline.
 *
 * Real entries map to `{ date, value, x, y, isInterpolated: false }`.
 * Interior missing days are linearly interpolated between their nearest real
 * neighbours and tagged `{ isInterpolated: true, gapLength }` where
 * `gapLength` is the number of consecutive missing days in their gap run —
 * charts use this to pick solid / dashed / broken bridging styles.
 * Leading/trailing empty slots stay `null` (no invented data at the edges).
 *
 * @param {object} params
 * @param {Array<{ date: string, entry: object|null }>} params.days - Timeline day slots
 * @param {Function} params.getValue - Extract the metric value from an entry
 * @param {number} params.minValue - Chart y-scale minimum
 * @param {number} params.range - Chart y-scale range (> 0)
 * @param {number} params.chartWidth - Viewport width of one full window
 * @param {number} params.windowSize - Days per window (7 / 30) for step sizing
 * @param {number} params.chartHeight - Chart drawing height in px
 * @returns {Array<object|null>} Tagged slots aligned with `days`
 */
export const buildTaggedChartSlots = ({
  days,
  getValue,
  minValue,
  range,
  chartWidth,
  windowSize,
  chartHeight,
}) => {
  const total = Array.isArray(days) ? days.length : 0;
  const tagged = new Array(total).fill(null);
  if (!total || range <= 0) {
    return tagged;
  }

  const step = chartWidth / windowSize;
  const pad = step / 2;
  const pointAt = (index, value) => {
    const norm = (value - minValue) / range;
    const bounded = Math.min(Math.max(norm, 0), 1);
    return { x: pad + index * step, y: (1 - bounded) * chartHeight };
  };

  const realIndexes = [];
  for (let i = 0; i < total; i += 1) {
    const entry = days[i]?.entry;
    if (!entry) continue;
    const value = Number(getValue(entry));
    if (!Number.isFinite(value)) continue;
    realIndexes.push(i);
    tagged[i] = {
      date: days[i].date,
      value,
      ...pointAt(i, value),
      isInterpolated: false,
    };
  }

  // Interpolate interior gap runs between consecutive real points.
  for (let r = 0; r < realIndexes.length - 1; r += 1) {
    const startIndex = realIndexes[r];
    const endIndex = realIndexes[r + 1];
    const gapLength = endIndex - startIndex - 1;
    if (gapLength <= 0) continue;

    const startValue = tagged[startIndex].value;
    const endValue = tagged[endIndex].value;
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const t = (i - startIndex) / (endIndex - startIndex);
      const value = startValue + (endValue - startValue) * t;
      tagged[i] = {
        date: days[i].date,
        value,
        ...pointAt(i, value),
        isInterpolated: true,
        gapLength,
      };
    }
  }

  return tagged;
};
