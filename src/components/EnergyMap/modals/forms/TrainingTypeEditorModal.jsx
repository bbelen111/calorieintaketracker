import React from 'react';
import { Save, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { getDefaultEnergyMapData } from '../../../../utils/storage';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { CaloriesPerHourGuideModal } from '../info/CaloriesPerHourGuideModal';
import { CaloriesPerHourPickerModal } from '../pickers/CaloriesPerHourPickerModal';

const defaultTrainingTypeCatalog =
  getDefaultEnergyMapData().trainingType ?? {};

const getDefaultValuesForType = (typeKey) => {
  if (!typeKey) return { label: '', caloriesPerHour: 0 };
  return (
    defaultTrainingTypeCatalog[typeKey] ?? {
      label: typeKey,
      caloriesPerHour: 0,
    }
  );
};

export const TrainingTypeEditorModal = ({
  isOpen,
  isClosing,
  typeKey,
  name,
  calories,
  onNameChange,
  onCaloriesChange,
  onCancel,
  onSave,
}) => {
  const defaults = getDefaultValuesForType(typeKey);
  const safeName = name ?? '';
  const safeCalories = Number.isFinite(Number(calories))
    ? calories
    : defaults.caloriesPerHour;
  const infoModal = useAnimatedModal(false, 220);
  const caloriesPickerModal = useAnimatedModal(false, 220);

  const formattedCalories = Number.isFinite(Number(safeCalories))
    ? `${Math.round(Number(safeCalories)).toLocaleString()} kcal/hr`
    : 'Select calories per hour';

  React.useEffect(() => {
    if (!isOpen) {
      infoModal.forceClose();
      caloriesPickerModal.forceClose();
    }
  }, [caloriesPickerModal, infoModal, isOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      overlayClassName="bg-black/90 z-[70]"
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Edit Training Type
      </h3>

      <div className="space-y-4">
        <div>
          <label className="text-muted text-sm block mb-2">Training Name</label>
          <input
            type="text"
            value={safeName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={defaults.label}
            className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border focus:border-blue-400 focus:outline-none text-base"
          />
        </div>

        <div>
          <label className="text-muted text-sm block mb-2">
            Calories Per Hour
          </label>
          <button
            type="button"
            onClick={caloriesPickerModal.open}
            className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
            aria-label="Open calories per hour picker"
          >
            <span className="font-medium text-base">{formattedCalories}</span>
            <ChevronsUpDown size={16} className="text-muted shrink-0" />
          </button>
          <button
            type="button"
            onClick={infoModal.open}
            className="mt-2 text-xs text-accent-blue/80 md:hover:text-accent-blue underline underline-offset-2 transition-colors focus-ring"
          >
            Not sure what number fits? View the quick guide.
          </button>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
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
      <CaloriesPerHourGuideModal
        isOpen={infoModal.isOpen}
        isClosing={infoModal.isClosing}
        onClose={infoModal.requestClose}
      />
      <CaloriesPerHourPickerModal
        isOpen={caloriesPickerModal.isOpen}
        isClosing={caloriesPickerModal.isClosing}
        value={safeCalories}
        onCancel={caloriesPickerModal.requestClose}
        onSave={(nextCalories) => {
          onCaloriesChange(nextCalories);
          caloriesPickerModal.requestClose();
        }}
      />
    </ModalShell>
  );
};
