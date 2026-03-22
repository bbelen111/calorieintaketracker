import React from 'react';
import { Save, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { MetValuePickerModal } from '../pickers/MetValuePickerModal';

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
  canSave,
}) => {
  const {
    isOpen: isMetPickerOpen,
    isClosing: isMetPickerClosing,
    open: openMetPicker,
    requestClose: requestMetPickerClose,
    forceClose: forceMetPickerClose,
  } = useAnimatedModal(false);
  const [activeField, setActiveField] = React.useState(null);

  const getFieldConfig = React.useCallback(
    (fieldKey) => {
      switch (fieldKey) {
        case 'light':
          return {
            label: 'Light MET',
            value: metLight,
            onChange: onMetLightChange,
          };
        case 'moderate':
          return {
            label: 'Moderate MET',
            value: metModerate,
            onChange: onMetModerateChange,
          };
        case 'vigorous':
          return {
            label: 'Vigorous MET',
            value: metVigorous,
            onChange: onMetVigorousChange,
          };
        default:
          return null;
      }
    },
    [
      metLight,
      metModerate,
      metVigorous,
      onMetLightChange,
      onMetModerateChange,
      onMetVigorousChange,
    ]
  );

  const parseMetValue = React.useCallback((rawValue) => {
    const numeric = Number.parseFloat(rawValue);
    if (!Number.isFinite(numeric)) {
      return MET_MIN_VALUE;
    }

    return Math.min(Math.max(numeric, MET_MIN_VALUE), MET_MAX_VALUE);
  }, []);

  const formatMetDisplay = React.useCallback((rawValue) => {
    const numeric = Number.parseFloat(rawValue);
    if (!Number.isFinite(numeric)) {
      return '--';
    }

    return numeric.toFixed(1);
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
      if (
        Number.isFinite(currentNumeric) &&
        Math.abs(currentNumeric - nextValue) < 0.0001
      ) {
        return;
      }

      fieldConfig.onChange(formatted);
    },
    [getFieldConfig]
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
  const activeMetValue = activeConfig
    ? parseMetValue(activeConfig.value)
    : MET_MIN_VALUE;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        overlayClassName="bg-black/90 z-[80]"
        contentClassName="p-6 w-full max-w-md"
      >
        <h3 className="text-foreground font-bold text-xl mb-4 text-center">
          Create Custom Cardio
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-foreground text-sm block mb-2">
              Cardio Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g., Outdoor Soccer Scrimmage"
              className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border focus:border-blue-400 focus:outline-none text-base"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-foreground text-sm block mb-2">
                Light MET
              </label>
              <button
                type="button"
                onClick={() => handleOpenMetPicker('light')}
                className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                aria-label="Open light MET picker"
              >
                <span className="font-medium text-base">
                  {formatMetDisplay(metLight)} MET
                </span>
                <ChevronsUpDown size={16} className="text-muted shrink-0" />
              </button>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-2">
                Moderate MET
              </label>
              <button
                type="button"
                onClick={() => handleOpenMetPicker('moderate')}
                className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                aria-label="Open moderate MET picker"
              >
                <span className="font-medium text-base">
                  {formatMetDisplay(metModerate)} MET
                </span>
                <ChevronsUpDown size={16} className="text-muted shrink-0" />
              </button>
            </div>
            <div>
              <label className="text-foreground text-sm block mb-2">
                Vigorous MET
              </label>
              <button
                type="button"
                onClick={() => handleOpenMetPicker('vigorous')}
                className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-2 pressable-inline"
                aria-label="Open vigorous MET picker"
              >
                <span className="font-medium text-base">
                  {formatMetDisplay(metVigorous)} MET
                </span>
                <ChevronsUpDown size={16} className="text-muted shrink-0" />
              </button>
            </div>
          </div>

          <p className="text-xs text-muted text-center">
            MET values estimate intensity: light for easy pace, moderate for
            steady work, vigorous for all-out efforts.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-6 py-3 rounded-lg transition-all active:scale-95 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            type="button"
            disabled={!canSave}
            className={`flex-1 bg-accent-blue active:bg-accent-blue/90 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium ${
              canSave
                ? 'bg-surface-highlight/80'
                : 'opacity-60 cursor-not-allowed'
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
        title={
          activeConfig ? `Select ${activeConfig.label}` : 'Select MET Value'
        }
        value={activeMetValue}
        min={MET_MIN_VALUE}
        max={MET_MAX_VALUE}
        step={MET_STEP_VALUE}
        onCancel={handleMetPickerCancel}
        onSave={handleMetPickerSave}
      />
    </>
  );
};
