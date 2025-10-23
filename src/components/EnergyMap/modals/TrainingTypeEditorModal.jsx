import React from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { trainingTypes as baseTrainingTypes } from '../../../constants/trainingTypes';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { CaloriesPerHourGuideModal } from './CaloriesPerHourGuideModal';

const getDefaultValuesForType = (typeKey) => {
  if (!typeKey) return { label: '', caloriesPerHour: 0, description: '' };
  return baseTrainingTypes[typeKey] ?? { label: typeKey, caloriesPerHour: 0, description: '' };
};

export const TrainingTypeEditorModal = ({
  isOpen,
  isClosing,
  typeKey,
  name,
  calories,
  description,
  onNameChange,
  onCaloriesChange,
  onDescriptionChange,
  onCancel,
  onSave
}) => {
  const defaults = getDefaultValuesForType(typeKey);
  const safeName = name ?? '';
  const safeDescription = description ?? '';
  const safeCalories = Number.isFinite(Number(calories)) ? calories : defaults.caloriesPerHour;
  const infoModal = useAnimatedModal(false, 220);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/90 z-[70]"
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-white font-bold text-xl mb-4 text-center">
        {typeKey ? `Edit ${defaults.label}` : 'Edit Training Type'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="text-slate-300 text-sm block mb-2">Training Name</label>
          <input
            type="text"
            value={safeName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={defaults.label}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Description</label>
          <input
            type="text"
            value={safeDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={defaults.description}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">Calories Per Hour</label>
          <input
            type="number"
            value={safeCalories}
            onChange={(event) => onCaloriesChange(parseFloat(event.target.value))}
            placeholder={defaults.caloriesPerHour}
            className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
          />
          <button
            type="button"
            onClick={infoModal.open}
            className="mt-2 text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2 transition-colors"
          >
            Not sure what number fits? View the quick guide.
          </button>
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
      <CaloriesPerHourGuideModal
        isOpen={infoModal.isOpen}
        isClosing={infoModal.isClosing}
        onClose={infoModal.requestClose}
      />
    </ModalShell>
  );
};
