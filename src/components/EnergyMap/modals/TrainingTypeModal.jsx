import React from 'react';
import { Save, Edit3, Dumbbell } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';

export const TrainingTypeModal = ({
  isOpen,
  isClosing,
  trainingTypes,
  tempTrainingType,
  onSelect,
  onEditTrainingType,
  onCancel,
  onSave,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    overlayClassName="bg-black/80 z-[60]"
    contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
  >
    <div className="flex items-center justify-between mb-4 md:mb-6">
      <h3 className="text-white font-bold text-xl md:text-2xl">
        Select Training Type
      </h3>
    </div>

    <div className="grid grid-cols-1 gap-3">
      {Object.entries(trainingTypes).map(([key, type]) => {
        const isActive = tempTrainingType === key;

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left relative flex items-center gap-4 ${
              isActive
                ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                : 'bg-slate-700 border-slate-600 text-slate-300'
            }`}
            type="button"
          >
            <Dumbbell size={32} className="flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-lg">{type.label}</p>
              <p className="text-sm opacity-90 mt-1">
                {type.caloriesPerHour} cal/hr • {type.description}
              </p>
            </div>
            <span
              onClick={(event) => {
                event.stopPropagation();
                onEditTrainingType(key);
              }}
              className="flex-shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer"
            >
              <Edit3 size={18} />
            </span>
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
