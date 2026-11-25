import React from 'react';
import { Info } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { useUnits } from '../../../../hooks/useUnits';

const REFERENCE_WEIGHT_KG = 75;

export const CaloriesPerHourGuideModal = ({ isOpen, isClosing, onClose }) => {
  const units = useUnits();
  const { energy } = units;
  // Typical ranges are known in kcal per hour.
  const ladder = (low, high) =>
    `~${energy.value(low, { grouping: false })}-${energy.value(high, {
      grouping: false,
    })} ${energy.unit}`;

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-surface/90 z-75"
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-center gap-3 mb-4">
        <Info size={28} className="text-accent-blue" />
        <h3 className="text-foreground font-bold text-xl">
          Choosing {energy.noun} Per Hour
        </h3>
      </div>

      <div className="space-y-4 text-muted text-sm md:text-base">
        <p>
          Calories-per-hour for resistance work balances load moved, pace, and
          how gassed you feel. Pick the number that mirrors a typical session so
          recovery and nutrition stay on target.
        </p>

        <div className="bg-surface/70 border border-border rounded-lg p-4 space-y-2">
          <p className="text-foreground font-semibold text-sm uppercase tracking-wide">
            Quick Ladder
          </p>
          <div className="grid gap-2">
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-muted">Heavy strength, long rest</span>
              <span className="text-foreground font-semibold">
                {ladder(180, 240)}
              </span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-muted">Hypertrophy / accessories</span>
              <span className="text-foreground font-semibold">
                {ladder(240, 320)}
              </span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-muted">CrossFit / metcon density</span>
              <span className="text-foreground font-semibold">
                {ladder(320, 420)}
              </span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-muted">
                Olympic lifting + accessory work
              </span>
              <span className="text-foreground font-semibold">
                {ladder(260, 360)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-accent-blue/15 border border-accent-blue/50 rounded-lg p-4 space-y-2 text-xs md:text-sm">
          <p className="text-accent-blue font-semibold">Fine Tune It</p>
          <p>
            <span className="text-foreground font-semibold">Body weight:</span>{' '}
            scale the range by your weight ÷{' '}
            {units.bodyWeight.format(REFERENCE_WEIGHT_KG)}.
          </p>
          <p>
            <span className="text-foreground font-semibold">Pace:</span>{' '}
            work:rest 1:1 or faster? nudge the number up 10-20%.
          </p>
          <p>
            <span className="text-foreground font-semibold">RPE guide:</span>{' '}
            RPE 5 feels easy → lower bound; RPE 8-9 → upper bound.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs md:text-sm">
          <span className="text-foreground font-semibold">Tip:</span> Not sure?
          Start at the middle value, log a week, then adjust if you consistently
          feel over- or under-fueled.
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Got it!
        </button>
      </div>
    </ModalShell>
  );
};
