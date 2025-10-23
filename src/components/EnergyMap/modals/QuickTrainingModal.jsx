import React, { useMemo } from 'react';
import { Save, Edit3 } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { formatDurationLabel, roundDurationHours } from '../../../utils/time';

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
  onSave
}) => {
  const selectedTraining = trainingTypes[tempTrainingType];
  const caloriesPerHour = selectedTraining?.caloriesPerHour ?? 0;

  const estimatedBurn = Math.round(caloriesPerHour * tempTrainingDuration);
  const formattedDuration = formatDurationLabel(tempTrainingDuration);
  const roundedDuration = useMemo(() => roundDurationHours(tempTrainingDuration), [tempTrainingDuration]);

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="p-6 w-full max-w-md">
      <h3 className="text-white font-bold text-xl mb-4 text-center">Training Settings</h3>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-slate-300 text-sm">Training Type</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(trainingTypes).map(([key, type]) => {
              const isActive = tempTrainingType === key;

              return (
                <button
                  key={key}
                  onClick={() => {
                    onTrainingTypeSelect(key);
                  }}
                  type="button"
                  className={`p-3 rounded-lg border-2 transition-all text-sm relative text-left ${
                    isActive ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600'
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
                    <div className="font-bold text-base leading-tight">{type.label}</div>
                    <div className="text-xs opacity-75 leading-tight">{type.caloriesPerHour} cal/hr</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Training Duration (hours)</label>
          <button
            onClick={onDurationClick}
            type="button"
            className="w-full text-left p-3 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98]"
          >
            <div className="font-semibold text-base">{formattedDuration}</div>
            <div className="text-xs opacity-90 mt-1">~{roundedDuration.toFixed(2)} hours</div>
            <div className="text-xs opacity-75 mt-2">Tap to change</div>
          </button>
          <div className="bg-slate-700/50 rounded-lg p-3 mt-3">
            <p className="text-slate-400 text-xs text-center mb-1">Estimated Burn:</p>
            <p className="text-white font-bold text-xl text-center">~{estimatedBurn} calories</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          className="flex-1 bg-green-600 active:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};
