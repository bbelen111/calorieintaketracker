import React from 'react';
import { DAY_LEDGER_BALANCE_META } from '../../../utils/calculations/dayLedgerPresentation';

// A day's bar spans 30–100 % of the strip height; 1,000 kcal either side of
// maintenance fills it. The floor keeps a near-maintenance day visible.
const STRIP_FULL_BAR_KCAL = 1000;
const STRIP_MIN_BAR_PERCENT = 30;

const getStripBarHeightPercent = (balance) => {
  const ratio = Math.min(1, Math.abs(balance) / STRIP_FULL_BAR_KCAL);
  return Math.round(
    STRIP_MIN_BAR_PERCENT + ratio * (100 - STRIP_MIN_BAR_PERCENT)
  );
};

/**
 * One bar per finished day from `buildDayLedgerCardSummary(...).days`:
 * coloured by balance kind (the ledger calendar's colours), sized by distance
 * from maintenance, dimmed when the day missed its target. An unlogged day is
 * a thin grey stub - a gap, never a zero bar. Shared by the Logbook's Daily
 * Ledger card (`variant="bars"`) and the Home goal card (`variant="flat"`:
 * equal-height blocks, colour and dimming only, unlogged days a grey block).
 */
export const DayBalanceStrip = ({
  days,
  ariaLabel,
  testId,
  heightClass = 'h-9',
  getDayTitle,
  variant = 'bars',
}) => (
  <div
    role="img"
    aria-label={ariaLabel}
    data-testid={testId}
    className={`flex ${heightClass} items-end ${
      variant === 'flat' ? 'gap-1.5' : 'gap-1'
    }`}
  >
    {days.map((day) => {
      const meta = day.kind ? DAY_LEDGER_BALANCE_META[day.kind] : null;
      return (
        <div
          key={day.date}
          title={getDayTitle?.(day.date)}
          className="flex h-full flex-1 items-end"
        >
          {meta ? (
            <div
              data-on-target={day.onTarget ? 'true' : 'false'}
              className={`w-full rounded-sm ${meta.dotClass} ${
                day.deviation === null || day.onTarget
                  ? 'opacity-100'
                  : 'opacity-50'
              }`}
              style={{
                height:
                  variant === 'flat'
                    ? '100%'
                    : `${getStripBarHeightPercent(day.balance)}%`,
              }}
            />
          ) : (
            <div
              data-logged="false"
              className={`w-full ${
                variant === 'flat'
                  ? 'h-full rounded-sm bg-border/60'
                  : 'h-1.5 rounded-full bg-border/60'
              }`}
            />
          )}
        </div>
      );
    })}
  </div>
);
