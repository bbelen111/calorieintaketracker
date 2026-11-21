import React from 'react';

/**
 * The big number in the top-right of an Insights card header (resting heart
 * rate, adaptive-thermogenesis correction…): a large bold value with an
 * optional small muted unit beside it, so a long unit ("kcal/day") never
 * crowds the card title. One component so the cards that use it cannot drift
 * apart in size.
 *
 * `valueClass` colours the value (accent token); the unit is always muted.
 */
export const InsightHeadline = ({
  value,
  unit = null,
  valueClass = 'text-foreground',
  testId,
}) => (
  <span
    data-testid={testId}
    className={`block text-3xl font-bold leading-none ${valueClass}`}
  >
    <span>{value}</span>
    {unit && (
      <span className="ml-1 text-base font-medium text-muted">{unit}</span>
    )}
  </span>
);

/**
 * The top-right of an Insights card header when there is NO number to show
 * ("Off", "No data", "Inactive"): a small status chip, the same grammar as the
 * mode badge inside the Adaptive Thermogenesis screen. A state is not a
 * measurement, so it is never set in the big headline type.
 */
export const InsightStatus = ({ label, testId }) => (
  <span
    data-testid={testId}
    className="inline-flex items-center gap-1.5 rounded-full bg-surface-highlight px-2.5 py-1 text-[11px] font-semibold text-muted"
  >
    <span className="h-1.5 w-1.5 rounded-full bg-muted" />
    {label}
  </span>
);
