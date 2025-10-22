import React from 'react';
import { Save, Edit3, Dumbbell } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const TrainingTypeModal = ({
  isOpen,
  isClosing,
  trainingTypes,
  userData,
  tempTrainingType,
  onSelect,
  onEditCustom,
  onCancel,
  onSave
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="bg-black/80 z-[60]"
    contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
  >
    <div className="flex items-center justify-between mb-4 md:mb-6">
      <h3 className="text-white font-bold text-xl md:text-2xl">Select Training Type</h3>
    </div>

    <div className="grid grid-cols-1 gap-3">
      {Object.entries(trainingTypes).map(([key, type]) => {
        const isCustom = key === 'custom';
        const isActive = tempTrainingType === key;
        const caloriesPerHour = isCustom ? userData.customTrainingCalories : type.caloriesPerHour;
        const description = isCustom ? userData.customTrainingDescription : type.description;
        const label = isCustom ? userData.customTrainingName : type.label;

        return (
          <button
            key={key}
            onClick={() => {
              if (isCustom && isActive) {
                onEditCustom();
              } else {
                onSelect(key);
              }
            }}
            className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left relative ${
              isActive ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-700 border-slate-600 text-slate-300'
            }`}
            type="button"
          >
            <div className="flex items-center gap-4">
              <Dumbbell size={32} className="flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-lg">{label}</p>
                <p className="text-sm opacity-90 mt-1">
                  {caloriesPerHour} cal/hr • {description}
                </p>
              </div>
              {isCustom && <Edit3 size={18} className="flex-shrink-0 opacity-75" />}
              {isActive && !isCustom && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-white" />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>

    <div className="flex gap-2 md:gap-3 mt-4">
      <button
        onClick={onCancel}
        type="button"
        className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        type="button"
        className="flex-1 bg-green-600 active:bg-green-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
      >
        <Save size={20} />
        <span className="hidden sm:inline">Save &amp;</span> Close
      </button>
    </div>
  </ModalShell>
);
