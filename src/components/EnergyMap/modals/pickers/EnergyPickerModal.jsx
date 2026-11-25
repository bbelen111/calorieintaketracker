import React, { useMemo } from 'react';
import { DualWheelModal } from './DualWheelModal';
import { useUnits } from '../../../../hooks/useUnits';
import { buildHundredsWheel } from '../../../../utils/units/wheelConfigs';

const DEFAULT_MAX_KCAL = 5000;

/**
 * Food energy in the user's unit, to the whole unit, so a label's "846 kJ" can
 * be entered exactly. `value` and the saved number are kcal; an untouched value
 * is handed back unchanged.
 */
export const EnergyPickerModal = ({
  isOpen,
  isClosing,
  title,
  value = 0,
  maxKcal = DEFAULT_MAX_KCAL,
  onCancel,
  onSave,
}) => {
  const { energy } = useUnits();
  const config = useMemo(
    () => buildHundredsWheel({ max: energy.toPicker(maxKcal) }),
    [energy, maxKcal]
  );
  const original = Number.isFinite(Number(value)) ? Number(value) : 0;

  return (
    <DualWheelModal
      isOpen={isOpen}
      isClosing={isClosing}
      title={title ?? energy.noun}
      unitLabel={energy.unit}
      value={energy.toPicker(original)}
      config={config}
      preview={(picked) => `${picked.toLocaleString()} ${energy.unit}`}
      onCancel={onCancel}
      onSave={(picked) => onSave?.(energy.fromPicker(picked, original))}
    />
  );
};
