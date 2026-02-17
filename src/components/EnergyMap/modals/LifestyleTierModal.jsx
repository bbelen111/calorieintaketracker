import React, { useState } from 'react';
import { ModalShell } from '../common/ModalShell';
import { LIFESTYLE_TIERS } from '../../../constants/activityPresets';

export const LifestyleTierModal = ({
  isOpen,
  isClosing,
  currentTier = 'sedentary',
  onSave,
  onClose,
}) => {
  const [selectedTier, setSelectedTier] = useState(currentTier);

  const handleSave = () => {
    onSave(selectedTier);
  };

  const tiers = Object.values(LIFESTYLE_TIERS);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-2 text-center">
        Lifestyle Tier
      </h3>
      <p className="text-muted text-sm mb-4 text-center">
        Select your baseline daily activity level (excluding steps, training,
        and cardio)
      </p>

      <div className="space-y-3">
        {tiers.map((tier) => {
          const isActive = selectedTier === tier.key;

          return (
            <button
              key={tier.key}
              onClick={() => setSelectedTier(tier.key)}
              type="button"
              className={`w-full p-4 rounded-xl border-2 transition-all text-left focus-ring pressable ${
                isActive
                  ? 'bg-blue-600 border-blue-400 text-white'
                  : 'bg-surface-highlight border-border text-foreground md:hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-base">{tier.label}</span>
                <span className="text-sm opacity-90">
                  ×{tier.multiplier.toFixed(2)}
                </span>
              </div>
              <p className="text-sm opacity-80 leading-snug">
                {tier.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 bg-surface-highlight/50 rounded-lg p-3">
        <p className="text-xs text-muted text-center">
          Base = BMR × {LIFESTYLE_TIERS[selectedTier].multiplier.toFixed(2)}
        </p>
        <p className="text-xs text-muted text-center mt-1 opacity-75">
          Steps, training, and cardio are tracked separately
        </p>
      </div>

      <div className="flex gap-3 mt-5">
        <button
          onClick={onClose}
          type="button"
          className="flex-1 bg-surface md:hover:bg-surface-highlight text-foreground py-3 rounded-lg transition-all press-feedback focus-ring"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="flex-1 bg-blue-600 md:hover:brightness-110 text-white py-3 rounded-lg transition-all press-feedback focus-ring"
        >
          Save
        </button>
      </div>
    </ModalShell>
  );
};
