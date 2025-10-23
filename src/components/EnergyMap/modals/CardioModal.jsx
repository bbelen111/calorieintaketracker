import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { useAnimatedModal } from '../../../hooks/useAnimatedModal';
import { CardioTypePickerModal } from './CardioTypePickerModal';
import { CustomCardioTypeModal } from './CustomCardioTypeModal';
import { CardioDurationPickerModal } from './CardioDurationPickerModal';
import { calculateCardioCalories } from '../../../utils/calculations';

export const CardioModal = ({
  isOpen,
  isClosing,
  cardioTypes,
  customCardioTypes,
  onAddCustomCardioType,
  onDeleteCustomCardioType,
  session,
  onChange,
  onCancel,
  onSave,
  userWeight,
  userAge,
  userGender
}) => {
  const effortType = session.effortType ?? 'intensity';
  const isEditing = session?.id != null;
  const estimatedBurn = calculateCardioCalories(
    session,
    { weight: userWeight, age: userAge, gender: userGender },
    cardioTypes
  );
  const hasValidDuration = Number.isFinite(Number(session.duration)) && Number(session.duration) > 0;
  const hasValidHeartRate =
    effortType === 'heartRate'
      ? Number.isFinite(Number(session.averageHeartRate)) && Number(session.averageHeartRate) > 0
      : true;
  const canSave = hasValidDuration && hasValidHeartRate;
  const intensityValue = session.intensity ?? 'moderate';
  const heartRateValue =
    session.averageHeartRate === '' || session.averageHeartRate == null
      ? ''
      : session.averageHeartRate;
  const sessionDurationMinutes = React.useMemo(() => {
    const numeric = Number(session.duration);
    return Number.isFinite(numeric) ? numeric : 0;
  }, [session.duration]);

  const {
    isOpen: isTypePickerOpen,
    isClosing: isTypePickerClosing,
    open: openTypePicker,
    requestClose: requestTypePickerClose,
    forceClose: forceTypePickerClose
  } = useAnimatedModal(false);
  const {
    isOpen: isCustomModalOpen,
    isClosing: isCustomModalClosing,
    open: openCustomModal,
    requestClose: requestCustomModalClose,
    forceClose: forceCustomModalClose
  } = useAnimatedModal(false);
  const {
    isOpen: isDurationPickerOpen,
    isClosing: isDurationPickerClosing,
    open: openDurationPicker,
    requestClose: requestDurationPickerClose,
    forceClose: forceDurationPickerClose
  } = useAnimatedModal(false);
  const [customName, setCustomName] = React.useState('');
  const [customMetLight, setCustomMetLight] = React.useState('');
  const [customMetModerate, setCustomMetModerate] = React.useState('');
  const [customMetVigorous, setCustomMetVigorous] = React.useState('');
  const resetCustomState = React.useCallback(() => {
    setCustomName('');
    setCustomMetLight('');
    setCustomMetModerate('');
    setCustomMetVigorous('');
  }, []);
  const selectedCardio = cardioTypes?.[session.type] ?? null;
  const formatMetValue = (value) => (typeof value === 'number' ? value.toFixed(1) : '--');
  const selectedMetSummary = selectedCardio
    ? `Light ${formatMetValue(selectedCardio.met?.light)} • Moderate ${formatMetValue(
        selectedCardio.met?.moderate
      )} • Vigorous ${formatMetValue(selectedCardio.met?.vigorous)} METs`
    : 'Browse the full cardio library to find the best match.';

  const handleCardioTypeSelect = (typeKey) => {
    onChange({ ...session, type: typeKey });
    requestTypePickerClose();
  };

  React.useEffect(() => {
    if (!isOpen) {
      forceTypePickerClose();
      forceCustomModalClose();
      forceDurationPickerClose();
    }
  }, [forceCustomModalClose, forceDurationPickerClose, forceTypePickerClose, isOpen]);

  React.useEffect(() => {
    if (!isCustomModalOpen && !isCustomModalClosing) {
      resetCustomState();
    }
  }, [isCustomModalClosing, isCustomModalOpen, resetCustomState]);

  const handleDurationChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      onChange({ ...session, duration: '' });
      return;
    }

    const parsed = Number.parseInt(value, 10);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    onChange({ ...session, duration: sanitized });
  };

  const handleDurationPickerChange = React.useCallback(
    (minutes) => {
      if (!Number.isFinite(minutes)) {
        return;
      }

      const currentValue = Number(session.duration);
      if (session.duration !== '' && Number.isFinite(currentValue) && currentValue === minutes) {
        return;
      }

      onChange({ ...session, duration: minutes });
    },
    [onChange, session]
  );

  const handleDurationPickerSave = React.useCallback(
    (minutes) => {
      handleDurationPickerChange(minutes);
      requestDurationPickerClose();
    },
    [handleDurationPickerChange, requestDurationPickerClose]
  );

  const handleEffortTypeChange = (nextType) => {
    if (nextType === effortType) {
      return;
    }

    if (nextType === 'heartRate') {
      onChange({
        ...session,
        effortType: 'heartRate',
        averageHeartRate: session.averageHeartRate ?? ''
      });
      return;
    }

    onChange({
      ...session,
      effortType: 'intensity',
      intensity: session.intensity ?? 'moderate',
      averageHeartRate: ''
    });
  };

  const handleIntensityChange = (event) => {
    onChange({ ...session, intensity: event.target.value });
  };

  const handleHeartRateChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      onChange({ ...session, averageHeartRate: '' });
      return;
    }

    const parsed = Number.parseInt(value, 10);
    const sanitized = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    onChange({ ...session, averageHeartRate: sanitized });
  };

  const effortButtonClass = (type) =>
    `w-full rounded-lg border px-3 py-1.5 text-sm transition-all ${
      effortType === type
        ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/30'
        : 'bg-slate-700 text-slate-300 border-slate-600 hover:border-blue-400 hover:text-white'
    }`;

  const handleOpenCustomCardioModal = () => {
    resetCustomState();
    openCustomModal();
  };

  const customModalCanSave =
    Boolean(customName.trim()) &&
    [customMetLight, customMetModerate, customMetVigorous].every((value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0;
    });

  const handleCustomCardioSave = () => {
    if (!customModalCanSave || !onAddCustomCardioType) {
      return;
    }

    const newKey = onAddCustomCardioType({
      label: customName,
      met: {
        light: Number(customMetLight),
        moderate: Number(customMetModerate),
        vigorous: Number(customMetVigorous)
      }
    });

    if (newKey) {
      handleCardioTypeSelect(newKey);
    }

    requestCustomModalClose();
  };

  const handleCustomCardioCancel = () => {
    requestCustomModalClose();
  };

  const handleDeleteCustomCardioType = (typeKey) => {
    if (!onDeleteCustomCardioType) {
      return;
    }

    const alternativeType = Object.keys(cardioTypes ?? {}).filter((key) => key !== typeKey)[0] ?? 'treadmill_walk';
    onDeleteCustomCardioType(typeKey);

    if (session.type === typeKey) {
      onChange({ ...session, type: alternativeType });
    }
  };

  return (
    <>
      <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-xl">
            {isEditing ? 'Edit Cardio Session' : 'Add Cardio Session'}
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm block mb-2">Cardio Type</label>
            <button
              type="button"
              onClick={() => openTypePicker()}
              className="w-full px-3 py-2 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98] flex items-start justify-between gap-3"
            >
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="font-semibold text-sm md:text-base truncate">
                  {selectedCardio?.label ?? 'Select Cardio Type'}
                </span>
                <span
                  className="text-[11px] md:text-xs opacity-90 truncate whitespace-nowrap leading-tight"
                  title={selectedMetSummary}
                >
                  {selectedMetSummary}
                </span>
              </span>
              <span className="text-[11px] opacity-75 whitespace-nowrap">Tap to change</span>
            </button>
          </div>

          <div>
            <label className="text-slate-300 text-sm block mb-2">Duration (minutes)</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={session.duration === '' ? '' : session.duration}
                onChange={handleDurationChange}
                className="w-full bg-slate-700 text-white px-4 pr-14 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={openDurationPicker}
                className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                aria-label="Open duration picker"
              >
                <ChevronsUpDown size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-300 text-sm block mb-2">Effort Tracking</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={effortButtonClass('intensity')}
                onClick={() => handleEffortTypeChange('intensity')}
              >
                Intensity
              </button>
              <button
                type="button"
                className={effortButtonClass('heartRate')}
                onClick={() => handleEffortTypeChange('heartRate')}
              >
                Average Heart Rate
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Use heart rate for wearable-based estimates or intensity for quick selections.
            </p>
          </div>

          {effortType === 'intensity' ? (
            <div>
              <label className="text-slate-300 text-sm block mb-2">Intensity</label>
              <select
                value={intensityValue}
                onChange={handleIntensityChange}
                className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
              >
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="vigorous">Vigorous</option>
              </select>
              <p className="text-xs text-slate-400 mt-2">
                Pick the perceived exertion level that best matches the session.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-slate-300 text-sm block mb-2">Average Heart Rate (bpm)</label>
              <input
                type="number"
                min="0"
                value={heartRateValue}
                onChange={handleHeartRateChange}
                className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none"
              />
              <p className="text-xs text-slate-400 mt-2">
                Enter the average beats per minute recorded during this session.
              </p>
            </div>
          )}

          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-slate-300 text-sm">Estimated Burn:</p>
            <p className="text-white font-bold text-xl">~{estimatedBurn} calories</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            type="button"
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            type="button"
            disabled={!canSave}
            className={`flex-1 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              canSave
                ? isEditing
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
                : isEditing
                ? 'bg-emerald-600/60 cursor-not-allowed opacity-70'
                : 'bg-red-600/60 cursor-not-allowed opacity-70'
            }`}
          >
            <Check size={20} />
            Save
          </button>
        </div>
      </ModalShell>

      <CardioDurationPickerModal
        isOpen={isDurationPickerOpen}
        isClosing={isDurationPickerClosing}
        minutes={sessionDurationMinutes}
        onChange={handleDurationPickerChange}
        onCancel={requestDurationPickerClose}
        onSave={handleDurationPickerSave}
      />

      <CardioTypePickerModal
        isOpen={isTypePickerOpen}
        isClosing={isTypePickerClosing}
        cardioTypes={cardioTypes}
        customCardioTypes={customCardioTypes}
        selectedType={session.type}
        onSelect={handleCardioTypeSelect}
        onClose={requestTypePickerClose}
        onCreateCustomCardioType={handleOpenCustomCardioModal}
        onDeleteCustomCardioType={handleDeleteCustomCardioType}
      />

      <CustomCardioTypeModal
        isOpen={isCustomModalOpen}
        isClosing={isCustomModalClosing}
        name={customName}
        metLight={customMetLight}
        metModerate={customMetModerate}
        metVigorous={customMetVigorous}
        onNameChange={setCustomName}
        onMetLightChange={setCustomMetLight}
        onMetModerateChange={setCustomMetModerate}
        onMetVigorousChange={setCustomMetVigorous}
        onCancel={handleCustomCardioCancel}
        onSave={handleCustomCardioSave}
        canSave={customModalCanSave}
      />
    </>
  );
};
