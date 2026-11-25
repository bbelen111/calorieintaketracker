import React from 'react';
import { ChevronDown, Flame } from 'lucide-react';
import { formatOne } from '../../../utils/formatting/format';
import { useUnits } from '../../../hooks/useUnits';

const ROWS = [
  {
    key: 'protein',
    label: 'Protein',
    gramsKey: 'proteinGrams',
    kcalKey: 'proteinTefCalories',
    formula: '× 4 × 25%',
    textClass: 'text-accent-red',
    dotClass: 'bg-accent-red',
  },
  {
    key: 'carbs',
    label: 'Carbs',
    gramsKey: 'carbsGrams',
    kcalKey: 'carbsTefCalories',
    formula: '× 4 × 8%',
    textClass: 'text-accent-amber',
    dotClass: 'bg-accent-amber',
  },
  {
    key: 'fats',
    label: 'Fats',
    gramsKey: 'fatsGrams',
    kcalKey: 'fatsTefCalories',
    formula: '× 9 × 2%',
    textClass: 'text-accent-yellow',
    dotClass: 'bg-accent-yellow',
  },
];

/**
 * Smart TEF readout shared by the Food Portion and Manual Food Entry modals.
 * Controlled (`expanded` / `onToggle`) so each modal can reset it on open.
 * The breakdown expands by animating `grid-template-rows` 0fr -> 1fr, which
 * tracks the content's real height (no max-height guess) and stays smooth.
 */
export const TefBurnCard = ({ breakdown, expanded, onToggle, className }) => {
  const { energy } = useUnits();
  if (!breakdown) return null;

  return (
    <div
      className={`overflow-hidden rounded-xl border border-accent-blue/25 bg-accent-blue/10 ${
        className ?? ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors pressable-card focus-ring md:hover:bg-accent-blue/5"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-blue/15 text-accent-blue"
          aria-hidden="true"
        >
          <Flame size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            TEF Burn
          </span>
          <span className="block text-xs text-muted">
            {expanded ? 'Hide breakdown' : 'Tap for breakdown'}
          </span>
        </span>
        <span className="whitespace-nowrap text-base font-bold tabular-nums text-accent-blue">
          {energy.value(breakdown.roundedTotalCalories)}{' '}
          <span className="text-xs font-semibold text-accent-blue/80">
            {energy.unit}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform duration-300 ease-out ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        aria-hidden={!expanded}
        className={`grid transition-all duration-300 ease-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mx-3.5 mb-3.5 space-y-2 border-t border-accent-blue/20 pt-3 text-xs">
            {ROWS.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3"
              >
                <p className="flex min-w-0 items-center gap-2 text-muted">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.dotClass}`}
                  />
                  <span className={`font-semibold ${row.textClass}`}>
                    {row.label}
                  </span>
                  <span className="tabular-nums">
                    {formatOne(breakdown[row.gramsKey])}g {row.formula}
                  </span>
                </p>
                <p
                  className={`whitespace-nowrap font-semibold tabular-nums ${row.textClass}`}
                >
                  {energy.compact(breakdown[row.kcalKey])} {energy.unit}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-accent-blue/20 pt-2">
              <p className="font-semibold text-foreground">Total (rounded)</p>
              <p className="whitespace-nowrap font-bold tabular-nums text-foreground">
                {energy.value(breakdown.roundedTotalCalories, {
                  grouping: false,
                })}{' '}
                {energy.unit}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
