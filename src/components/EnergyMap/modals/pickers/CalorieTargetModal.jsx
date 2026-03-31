import React from 'react';
import { Flame } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';

const formatStepsLabel = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return `${value.toLocaleString()} steps`;
  return `${value} steps`;
};

export const CalorieTargetModal = ({
  isOpen,
  isClosing,
  onClose,
  options = [],
  selectedKey,
  onSelect,
}) => {
  const handleSelect = (option) => {
    onSelect?.(option);
    onClose?.();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={onClose}
      contentClassName="w-full md:max-w-md p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Flame className="text-accent-blue" size={20} />
        <h3 className="text-foreground font-bold text-xl">Calorie Target</h3>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {options.map((option) => {
          const isSelected = option.key === selectedKey;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-all pressable-card focus-ring ${
                isSelected
                  ? 'border-primary bg-primary'
                  : 'border-border bg-surface-highlight md:hover:bg-surface-highlight/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-foreground font-semibold text-sm flex items-center gap-1.5">
                    <span>{option.label}</span>
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground' : 'text-muted'}`}
                  >
                    {formatStepsLabel(option.steps)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-lg font-bold text-foreground">
                    {Math.round(option.targetCalories || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-3 rounded-lg bg-surface-highlight text-foreground transition-all press-feedback focus-ring md:hover:bg-surface"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
};
