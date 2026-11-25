import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Save } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { TrackerEntryModal } from '../../common/TrackerEntryModal';
import { DualWheel } from '../../common/DualWheel';
import { useUnits } from '../../../../hooks/useUnits';
import { buildBodyWeightWheel } from '../../../../utils/units/wheelConfigs';

const UNIT_HEADINGS = {
  kg: 'Kilograms',
  lb: 'Pounds',
  st: 'Stone and pounds',
};

/**
 * Body weight wheel in the user's unit. `value` and `onChange` are kg. Scrolling
 * back to what the picker opened on hands the original kg back untouched, so
 * opening an entry and saving it never changes it.
 */
export const WeightPicker = ({ value, onChange }) => {
  const { bodyWeight } = useUnits();
  const config = useMemo(() => buildBodyWeightWheel(bodyWeight), [bodyWeight]);
  const originalRef = useRef(value);
  const emittedRef = useRef(value);

  // A value this picker did not emit is a new starting point.
  useEffect(() => {
    if (value !== emittedRef.current) {
      originalRef.current = value;
      emittedRef.current = value;
    }
  }, [value]);

  const handleChange = useCallback(
    (picked) => {
      const kg = bodyWeight.fromPicker(picked, originalRef.current);
      emittedRef.current = kg;
      onChange?.(kg);
    },
    [bodyWeight, onChange]
  );

  return (
    <DualWheel
      value={bodyWeight.toPicker(value) ?? config.min}
      config={config}
      onChange={handleChange}
    />
  );
};

export const WeightPickerModal = ({
  isOpen,
  isClosing,
  value,
  onCancel,
  onSave,
}) => {
  const draftValueRef = useRef(value);
  const { bodyWeight } = useUnits();

  // The sheet outlives one open, so start each one from the current value.
  useEffect(() => {
    if (isOpen) {
      draftValueRef.current = value;
    }
  }, [isOpen, value]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      contentClassName="p-6 w-full max-w-md"
    >
      <h3 className="text-foreground font-bold text-xl mb-4 text-center">
        Select Weight
      </h3>
      <p className="text-muted text-xs text-center mb-2 uppercase tracking-wide">
        {UNIT_HEADINGS[bodyWeight.unit]}
      </p>

      <WeightPicker
        value={value}
        onChange={(nextValue) => {
          draftValueRef.current = nextValue;
        }}
      />

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-surface-highlight active:bg-surface-highlight/80 text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave?.(draftValueRef.current)}
          type="button"
          className="flex-1 bg-primary active:brightness-110 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};

export const WeightEntryModal = ({
  mode = 'add',
  weight,
  onWeightChange,
  ...entryProps
}) => {
  const { bodyWeight } = useUnits();

  return (
    <TrackerEntryModal
      {...entryProps}
      mode={mode}
      title={mode === 'edit' ? 'Edit Weight Entry' : 'Add Weight Entry'}
      unitLabel={UNIT_HEADINGS[bodyWeight.unit]}
      value={weight}
      onValueChange={onWeightChange}
      Picker={WeightPicker}
      pickerProps={{ value: weight }}
      deleteTitle="Delete weight entry?"
      deleteDescription="This will remove the logged weight for the selected day."
    />
  );
};
