import React from 'react';
import { formatOne } from '../../../utils/formatting/format';

/**
 * One micronutrient readout: `Fiber: 5.3g`. Shared by the Tracker's daily row and
 * the Food Portion modal so they read identically.
 *
 * `value == null` means *untracked* and renders `—` (never a misleading 0);
 * `coverage.hasUntracked` marks a partial sum with a leading `~`.
 */
export const MicroStat = ({ label, value, coverage, unit, colorClass }) => {
  const isTracked = value != null && value !== '';
  const isPartial = isTracked && coverage?.hasUntracked === true;
  const displayValue = isTracked
    ? unit === 'mg'
      ? Math.round(Number(value))
      : formatOne(Number(value))
    : '—';

  return (
    <span
      className="text-xs whitespace-nowrap"
      title={isPartial ? 'Some logged foods lack this nutrient' : undefined}
    >
      <span className="text-muted">{label}: </span>
      <span
        className={`font-semibold ${isTracked ? colorClass : 'text-foreground/70'}`}
      >
        {isPartial ? '~' : ''}
        {displayValue}
        {isTracked ? unit : ''}
      </span>
    </span>
  );
};
