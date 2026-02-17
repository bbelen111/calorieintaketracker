import React from 'react';
import { Check } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { ACTIVITY_TIERS } from '../../../constants/activityPresets';

export const DailyActivityTierModal = ({
  isOpen,
  isClosing,
  currentTier,
  onSelectTier,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  const activeTier = currentTier || 'standing';

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/80 z-[70]"
      contentClassName="p-4 md:p-6 w-full md:max-w-xl"
    >
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h3 className="text-foreground font-bold text-xl md:text-2xl">
          Daily Activity Level
        </h3>
      </div>

      <p className="text-muted text-sm mb-4">
        Select your general activity level for the day (not including training
        or cardio sessions)
      </p>

      <div className="space-y-3">
        {Object.values(ACTIVITY_TIERS).map((tier) => {
          const isActive = activeTier === tier.key;
          const multiplierPercent = Math.round(tier.multiplier * 100);

          return (
            <button
              key={tier.key}
              type="button"
              onClick={() => onSelectTier(tier.key)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-3 active:scale-[0.98] focus-ring ${
                isActive
                  ? 'bg-accent-blue border-blue-400 text-white shadow-lg'
                  : 'bg-surface border-border text-foreground md:hover:border-blue-400'
              }`}
            >
              <div className="flex-1">
                <p className="font-semibold text-lg">{tier.label}</p>
                <p
                  className={`text-sm mt-1 ${isActive ? 'opacity-90' : 'text-muted'}`}
                >
                  {tier.description}
                </p>
                <p
                  className={`text-xs mt-3 ${isActive ? 'opacity-75' : 'text-muted'}`}
                >
                  NEAT multiplier: {multiplierPercent}% of BMR
                </p>
              </div>
              {isActive && (
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
                  <Check size={18} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onClose}
          type="button"
          className="flex-1 bg-surface border border-border text-foreground px-4 py-3 rounded-xl transition-all press-feedback focus-ring md:hover:bg-surface-highlight"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};
