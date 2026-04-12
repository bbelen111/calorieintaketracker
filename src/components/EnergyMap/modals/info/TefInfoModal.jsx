import React from 'react';
import { Info, X } from 'lucide-react';
import {
  TEF_CARB_RATE,
  TEF_FAT_RATE,
  TEF_MULTIPLIER_OFFSET,
  TEF_PROTEIN_RATE,
} from '../../../../utils/calculations/calculations';
import { ModalShell } from '../../common/ModalShell';

const formatPercent = (value) => `${Math.round(value * 100)}%`;

export const TefInfoModal = ({ isOpen, isClosing, onClose }) => {
  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 max-w-lg w-full"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Info size={28} className="text-accent-blue" />
          <h3 className="text-foreground font-bold text-xl">Smart TEF</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted md:hover:text-foreground transition-colors focus-ring"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 text-muted">
        <p>
          <span className="font-bold text-foreground">
            TEF (Thermic Effect of Food)
          </span>{' '}
          is the energy cost of digesting and processing food. Smart TEF swaps a
          one-size-fits-all estimate for a macro-based version.
        </p>

        <div className="bg-surface-highlight/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-bold">
            <Info size={18} className="text-accent-blue" />
            <span>Baseline offset</span>
          </div>
          <p className="text-sm">
            The app has historically assumed TEF is already bundled into your
            NEAT/activity multiplier. Smart TEF makes that explicit by removing
            a baseline {formatPercent(TEF_MULTIPLIER_OFFSET)} from the selected
            NEAT multiplier, then adding TEF back as its own line item.
          </p>
          <p className="text-sm">
            Example: if you select a 14% NEAT multiplier, Smart TEF shows the
            effective NEAT as 4% and moves the remaining 10% into the Smart TEF
            calculation.
          </p>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4">
          <p className="font-bold text-accent-blue mb-2">
            Macro-based TEF rates
          </p>
          <div className="text-sm space-y-1">
            <p>
              Protein:{' '}
              <span className="text-foreground font-semibold">
                {formatPercent(TEF_PROTEIN_RATE)}
              </span>
            </p>
            <p>
              Carbs:{' '}
              <span className="text-foreground font-semibold">
                {formatPercent(TEF_CARB_RATE)}
              </span>
            </p>
            <p>
              Fat:{' '}
              <span className="text-foreground font-semibold">
                {formatPercent(TEF_FAT_RATE)}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-4 space-y-2 text-sm">
          <p className="font-bold text-accent-blue">How the modes work</p>
          <p>
            <span className="text-foreground font-semibold">Target mode</span>{' '}
            uses your saved split as the preference, then applies profile-based
            anchors before TEF is calculated: protein is bounded around 1.6-2.8
            g/kg (lean mass when available, bodyweight fallback), fat around
            0.6-1.6 g/kg bodyweight, and carbs take the remaining calories.
          </p>
          <p>
            <span className="text-foreground font-semibold">Dynamic mode</span>{' '}
            uses the macros you have actually logged so far, which makes the
            live steps card feel more like a coach and less like a spreadsheet.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-xs">
          <span className="text-foreground font-semibold">Note:</span> Because
          Smart TEF calculates digestion separately, your overall activity
          multiplier will appear lower. This is expected behavior: your daily
          calorie target is being redistributed for better accuracy, not
          decreased.
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={onClose}
          type="button"
          className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg transition-all press-feedback focus-ring font-medium md:hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
};
