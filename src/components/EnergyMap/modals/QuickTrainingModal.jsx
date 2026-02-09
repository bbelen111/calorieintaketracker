import React, { useMemo } from 'react';
import { Save, Edit3 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatDurationLabel, roundDurationHours } from '../../../utils/time';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

export const QuickTrainingModal = ({
  isOpen,
  isClosing,
  trainingTypes,
  tempTrainingType,
  tempTrainingDuration,
  onTrainingTypeSelect,
  onEditTrainingType,
  onDurationClick,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({ trainingTypes: state.trainingTypes ?? {} }),
    shallow
  );
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const selectedTraining = resolvedTrainingTypes[tempTrainingType];
  const caloriesPerHour = selectedTraining?.caloriesPerHour ?? 0;

  const estimatedBurn = Math.round(caloriesPerHour * tempTrainingDuration);
  const formattedDuration = formatDurationLabel(tempTrainingDuration);
  const roundedDuration = useMemo(
    () => roundDurationHours(tempTrainingDuration),
    [tempTrainingDuration]
  );

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Training Settings
      </h3>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-foreground/80 text-sm">Training Type</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(resolvedTrainingTypes).map(([key, type]) => {
              const isActive = tempTrainingType === key;

              return (
                <button
                  key={key}
                  onClick={() => {
                    onTrainingTypeSelect(key);
                  }}
                  type="button"
                  className={`p-3 rounded-lg border-2 transition-all text-sm relative text-left focus-ring pressable ${
                    isActive
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-surface-highlight border-border/80 text-foreground/80 active:bg-surface-highlight/90 md:hover:border-purple-400'
                  }`}
                >
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditTrainingType(key);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <Edit3 size={12} />
                  </span>
                  <div className="pr-10 space-y-1">
                    <div className="font-bold text-base leading-tight">
                      {type.label}
                    </div>
                    <div className="text-xs opacity-75 leading-tight">
                      {type.caloriesPerHour} kcal/hr
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-foreground/80 text-sm block mb-2">
            Training Duration (hours)
          </label>
          <button
            onClick={onDurationClick}
            type="button"
            className="w-full px-3 py-2 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 focus-ring press-feedback"
          >
            <span className="font-semibold text-sm md:text-base">
              {formattedDuration}
            </span>
            <span className="text-xs opacity-90">
              ~{roundedDuration.toFixed(2)} hours
            </span>
            <span className="text-[11px] opacity-75 ml-auto">
              Tap to change
            </span>
          </button>
          <div className="bg-surface-highlight/50 rounded-lg p-3 mt-3">
            <p className="text-muted text-xs text-center mb-1">
              Estimated Burn:
            </p>
            <p className="text-foreground font-bold text-xl text-center">
              ~{estimatedBurn} calories
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/90 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
