import React from 'react';
import { Save, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { MetValuePickerModal } from './MetValuePickerModal';

const MET_MIN_VALUE = 0.5;
const MET_MAX_VALUE = 20;
const MET_STEP_VALUE = 0.1;

export const CustomCardioTypeModal = ({
  isOpen,
  isClosing,
  name,
  metLight,
  metModerate,
  metVigorous,
  onNameChange,
  onMetLightChange,
  onMetModerateChange,
  onMetVigorousChange,
  onCancel,
  onSave,
  canSave
}) => {
  const {
    isOpen: isMetPickerOpen,
    isClosing: isMetPickerClosing,
    open: openMetPicker,
    requestClose: requestMetPickerClose,
    forceClose: forceMetPickerClose
  } = useAnimatedModal(false);
  const [activeField, setActiveField] = React.useState(null);

  const getFieldConfig = React.useCallback(
    (fieldKey) => {
      switch (fieldKey) {
        case 'light':
          return { label: 'Light MET', value: metLight, onChange: onMetLightChange };
        case 'moderate':
          return { label: 'Moderate MET', value: metModerate, onChange: onMetModerateChange };
        case 'vigorous':
          return { label: 'Vigorous MET', value: metVigorous, onChange: onMetVigorousChange };
        default:
          return null;
      }
    },
    [metLight, metModerate, metVigorous, onMetLightChange, onMetModerateChange, onMetVigorousChange]
  );

  const parseMetValue = React.useCallback((rawValue) => {
    const numeric = Number.parseFloat(rawValue);
    if (!Number.isFinite(numeric)) {
      return MET_MIN_VALUE;
    }

    return Math.min(Math.max(numeric, MET_MIN_VALUE), MET_MAX_VALUE);
  }, []);

  const handleOpenMetPicker = React.useCallback(
    (fieldKey) => {
      setActiveField(fieldKey);
      openMetPicker();
    },
    [openMetPicker]
  );

  const applyMetValue = React.useCallback(
    (fieldKey, nextValue) => {
      const fieldConfig = getFieldConfig(fieldKey);
      if (!fieldConfig?.onChange) {
        return;
      }

      const formatted = nextValue.toFixed(1);
      const currentNumeric = Number.parseFloat(fieldConfig.value);
      if (Number.isFinite(currentNumeric) && Math.abs(currentNumeric - nextValue) < 0.0001) {
        return;
      }

      fieldConfig.onChange(formatted);
    },
    [getFieldConfig]
  );

  const handleMetPickerChange = React.useCallback(
    (nextValue) => {
      if (!activeField) {
        return;
      }

      applyMetValue(activeField, nextValue);
    },
    [activeField, applyMetValue]
  );

  const handleMetPickerSave = React.useCallback(
    (nextValue) => {
      if (!activeField) {
        requestMetPickerClose();
        return;
      }

      applyMetValue(activeField, nextValue);
      requestMetPickerClose();
    },
    [activeField, applyMetValue, requestMetPickerClose]
  );

  const handleMetPickerCancel = React.useCallback(() => {
    requestMetPickerClose();
  }, [requestMetPickerClose]);

  React.useEffect(() => {
    if (!isOpen) {
      forceMetPickerClose();
      setActiveField(null);
    }
  }, [forceMetPickerClose, isOpen]);

  React.useEffect(() => {
    if (!isMetPickerOpen && !isMetPickerClosing) {
      setActiveField(null);
    }
  }, [isMetPickerClosing, isMetPickerOpen]);

  const activeConfig = activeField ? getFieldConfig(activeField) : null;
  const activeMetValue = activeConfig ? parseMetValue(activeConfig.value) : MET_MIN_VALUE;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="bg-black/90 z-[80]"
        contentClassName="p-6 w-full max-w-md"
      >
        <h3 className="text-white font-bold text-xl mb-4 text-center">Create Custom Cardio</h3>

        <div className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm block mb-2">Cardio Name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g., Outdoor Soccer Scrimmage"
              className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 text-sm block mb-2">Light MET</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={metLight}
                  onChange={(event) => onMetLightChange(event.target.value)}
                  className="w-full bg-slate-700 text-white px-4 pr-14 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                />
                <button
                  type="button"
                  onClick={() => handleOpenMetPicker('light')}
                  className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                  aria-label="Open light MET picker"
                >
                  <ChevronsUpDown size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-slate-300 text-sm block mb-2">Moderate MET</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={metModerate}
                  onChange={(event) => onMetModerateChange(event.target.value)}
                  className="w-full bg-slate-700 text-white px-4 pr-14 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                />
                <button
                  type="button"
                  onClick={() => handleOpenMetPicker('moderate')}
                  className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                  aria-label="Open moderate MET picker"
                >
                  <ChevronsUpDown size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-slate-300 text-sm block mb-2">Vigorous MET</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={metVigorous}
                  onChange={(event) => onMetVigorousChange(event.target.value)}
                  className="w-full bg-slate-700 text-white px-4 pr-14 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-base"
                />
                <button
                  type="button"
                  onClick={() => handleOpenMetPicker('vigorous')}
                  className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                  aria-label="Open vigorous MET picker"
                >
                  <ChevronsUpDown size={16} />
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            MET values estimate intensity: light for easy pace, moderate for steady work, vigorous for all-out efforts.
          </p>
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
            disabled={!canSave}
            className={`flex-1 bg-green-600 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium ${
              canSave ? 'active:bg-green-700' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <Save size={20} />
            Save
          </button>
        </div>
      </ModalShell>

      <MetValuePickerModal
        isOpen={isMetPickerOpen}
        isClosing={isMetPickerClosing}
        title={activeConfig ? `Select ${activeConfig.label}` : 'Select MET Value'}
        value={activeMetValue}
        min={MET_MIN_VALUE}
        max={MET_MAX_VALUE}
        step={MET_STEP_VALUE}
        onCancel={handleMetPickerCancel}
        onChange={handleMetPickerChange}
        onSave={handleMetPickerSave}
      />
    </>
  );
};
