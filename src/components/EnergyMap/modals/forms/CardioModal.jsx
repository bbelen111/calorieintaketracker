import React from 'react';
import { Save, Star } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { ModalShell } from '../../common/ModalShell';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { CardioTypeListModal } from '../lists/CardioTypeListModal';
import { CustomCardioTypeModal } from './CustomCardioTypeModal';
import { DurationPickerModal } from '../pickers/DurationPickerModal';
import { HeartRatePickerModal } from '../pickers/HeartRatePickerModal';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { calculateCardioCalories } from '../../../../utils/calculations';
import { roundDurationHours } from '../../../../utils/time';
import { isStepBasedCardioType } from '../../../../utils/steps';

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
  userGender,
  onOpenFavourites,
  showFavouritesButton = false,
  mode = 'session',
  isEditing: isEditingProp,
}) => {
  const {
    cardioTypes: storeCardioTypes,
    customCardioTypes: storeCustomTypes,
    userData,
  } = useEnergyMapStore(
    (state) => ({
      cardioTypes: state.cardioTypes,
      customCardioTypes: state.userData?.customCardioTypes,
      userData: state.userData,
    }),
    shallow
  );
  const resolvedCardioTypes = cardioTypes ?? storeCardioTypes;
  const resolvedCustomCardioTypes = customCardioTypes ?? storeCustomTypes;
  const resolvedUserWeight = userWeight ?? userData?.weight;
  const resolvedUserAge = userAge ?? userData?.age;
  const resolvedUserGender = userGender ?? userData?.gender;
  const effortType = session.effortType ?? 'intensity';
  const isEditing = Boolean(isEditingProp ?? session?.id != null);
  const isFavouriteMode = mode === 'favourite';
  const headerTitle = isFavouriteMode
    ? 'Add Favourite Cardio Session'
    : isEditing
      ? 'Edit Cardio Session'
      : 'Add Cardio Session';
  const saveLabel = isFavouriteMode ? 'Save Favourite' : 'Save';
  const overlayClassName = isFavouriteMode ? 'z-[80]' : '';
  const estimatedBurn = calculateCardioCalories(
    session,
    {
      weight: resolvedUserWeight,
      age: resolvedUserAge,
      gender: resolvedUserGender,
    },
    resolvedCardioTypes
  );
  const hasValidDuration =
    Number.isFinite(Number(session.duration)) && Number(session.duration) > 0;
  const hasValidHeartRate =
    effortType === 'heartRate'
      ? Number.isFinite(Number(session.averageHeartRate)) &&
        Number(session.averageHeartRate) > 0
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

  const sessionDurationHours = React.useMemo(() => {
    return sessionDurationMinutes / 60;
  }, [sessionDurationMinutes]);

  const formattedSessionDuration = React.useMemo(() => {
    if (session.duration === '') return '--';
    if (sessionDurationMinutes < 60) {
      return `${sessionDurationMinutes} min`;
    }
    const roundedHours = roundDurationHours(sessionDurationHours);
    return `${roundedHours.toFixed(1)}hrs`;
  }, [session.duration, sessionDurationMinutes, sessionDurationHours]);

  const formattedSessionDurationMinutes = React.useMemo(() => {
    if (session.duration === '' || sessionDurationMinutes < 60) {
      return null;
    }
    return `~${sessionDurationMinutes} min`;
  }, [session.duration, sessionDurationMinutes]);

  const {
    isOpen: isTypePickerOpen,
    isClosing: isTypePickerClosing,
    open: openTypePicker,
    requestClose: requestTypePickerClose,
    forceClose: forceTypePickerClose,
  } = useAnimatedModal(false);
  const {
    isOpen: isCustomModalOpen,
    isClosing: isCustomModalClosing,
    open: openCustomModal,
    requestClose: requestCustomModalClose,
    forceClose: forceCustomModalClose,
  } = useAnimatedModal(false);
  const {
    isOpen: isDurationPickerOpen,
    isClosing: isDurationPickerClosing,
    open: openDurationPicker,
    requestClose: requestDurationPickerClose,
    forceClose: forceDurationPickerClose,
  } = useAnimatedModal(false);
  const {
    isOpen: isHeartRatePickerOpen,
    isClosing: isHeartRatePickerClosing,
    open: openHeartRatePicker,
    requestClose: requestHeartRatePickerClose,
    forceClose: forceHeartRatePickerClose,
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
  const selectedCardio = resolvedCardioTypes?.[session.type] ?? null;
  const showStepOverlapToggle = isStepBasedCardioType(
    session.type,
    selectedCardio
  );
  const stepOverlapEnabled = showStepOverlapToggle
    ? (session.stepOverlapEnabled ?? true)
    : false;
  const formatMetValue = (value) =>
    typeof value === 'number' ? value.toFixed(1) : '--';
  const selectedMetSummary = selectedCardio
    ? `Light ${formatMetValue(selectedCardio.met?.light)} • Moderate ${formatMetValue(
        selectedCardio.met?.moderate
      )} • Vigorous ${formatMetValue(selectedCardio.met?.vigorous)} METs`
    : 'Browse the full cardio library to find the best match.';

  const handleCardioTypeSelect = (typeKey) => {
    const nextType = resolvedCardioTypes?.[typeKey] ?? null;
    const isStepBased = isStepBasedCardioType(typeKey, nextType);
    onChange({
      ...session,
      type: typeKey,
      stepOverlapEnabled: isStepBased
        ? (session.stepOverlapEnabled ?? true)
        : false,
    });
    requestTypePickerClose();
  };

  const handleStepOverlapToggle = () => {
    if (!showStepOverlapToggle) {
      return;
    }

    onChange({
      ...session,
      stepOverlapEnabled: !stepOverlapEnabled,
    });
  };

  React.useEffect(() => {
    if (!isOpen) {
      forceTypePickerClose();
      forceCustomModalClose();
      forceDurationPickerClose();
      forceHeartRatePickerClose();
    }
  }, [
    forceCustomModalClose,
    forceDurationPickerClose,
    forceHeartRatePickerClose,
    forceTypePickerClose,
    isOpen,
  ]);

  React.useEffect(() => {
    if (!isCustomModalOpen && !isCustomModalClosing) {
      resetCustomState();
    }
  }, [isCustomModalClosing, isCustomModalOpen, resetCustomState]);

  const handleDurationPickerChange = React.useCallback(
    (minutes) => {
      if (!Number.isFinite(minutes)) {
        return;
      }

      const currentValue = Number(session.duration);
      if (
        session.duration !== '' &&
        Number.isFinite(currentValue) &&
        currentValue === minutes
      ) {
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
        averageHeartRate: session.averageHeartRate ?? '',
      });
      return;
    }

    onChange({
      ...session,
      effortType: 'intensity',
      intensity: session.intensity ?? 'moderate',
      averageHeartRate: '',
    });
  };

  const handleIntensityChange = (nextIntensity) => {
    if (nextIntensity === intensityValue) {
      return;
    }

    onChange({ ...session, intensity: nextIntensity });
  };

  const handleHeartRatePickerSave = React.useCallback(
    (bpm) => {
      onChange({ ...session, averageHeartRate: bpm });
      requestHeartRatePickerClose();
    },
    [onChange, session, requestHeartRatePickerClose]
  );

  const formattedHeartRate = React.useMemo(() => {
    const numeric = Number(heartRateValue);
    if (heartRateValue === '' || !Number.isFinite(numeric) || numeric <= 0) {
      return '--';
    }
    return `${numeric} bpm`;
  }, [heartRateValue]);

  const effortButtonClass = (type) =>
    `w-full rounded-lg border px-3 py-1.5 text-sm transition-all focus-ring pressable-inline ${
      effortType === type
        ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-900/30'
        : 'bg-surface-highlight text-muted border-border md:hover:border-blue-400'
    }`;

  const intensityButtonClass = (level) =>
    `w-full rounded-lg border px-3 py-2 text-sm transition-all focus-ring pressable-inline ${
      intensityValue === level
        ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-900/30'
        : 'bg-surface-highlight text-muted border-border md:hover:border-blue-400'
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
        vigorous: Number(customMetVigorous),
      },
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

    const alternativeType =
      Object.keys(resolvedCardioTypes ?? {}).filter(
        (key) => key !== typeKey
      )[0] ?? 'treadmill_walk';
    onDeleteCustomCardioType(typeKey);

    if (session.type === typeKey) {
      onChange({ ...session, type: alternativeType });
    }
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        contentClassName="p-6 max-w-md w-full"
        overlayClassName={overlayClassName}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-foreground font-bold text-xl">{headerTitle}</h3>
          {showFavouritesButton && typeof onOpenFavourites === 'function' && (
            <button
              type="button"
              onClick={onOpenFavourites}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-highlight px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors press-feedback focus-ring md:hover:border-accent-amber"
            >
              <Star size={14} />
              Favourites
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-foreground text-sm block mb-2">
              Cardio Type
            </label>
            <button
              type="button"
              onClick={() => openTypePicker()}
              className="w-full px-3 py-2 rounded-lg border-2 bg-indigo-600 border-indigo-500 text-white transition-all press-feedback focus-ring flex items-start justify-between gap-3"
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
              <span className="text-[11px] opacity-75 whitespace-nowrap">
                Tap to change
              </span>
            </button>
          </div>

          <div>
            <label className="text-foreground text-sm block mb-2">
              Duration (minutes)
            </label>
            <button
              onClick={openDurationPicker}
              type="button"
              className="w-full px-3 py-2 rounded-lg border-2 bg-blue-600 border-blue-500 text-white transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
            >
              <div className="flex items-baseline gap-x-2">
                <span className="font-semibold text-sm md:text-base">
                  {formattedSessionDuration}
                </span>
                {formattedSessionDurationMinutes && (
                  <span className="text-xs opacity-90">
                    {formattedSessionDurationMinutes}
                  </span>
                )}
              </div>
              <span className="text-[11px] opacity-75">Tap to change</span>
            </button>
          </div>

          <div>
            <label className="text-foreground text-sm block mb-2">
              Effort Tracking
            </label>
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
            <p className="text-xs text-muted mt-2">
              Use heart rate for wearable-based estimates or intensity for quick
              selections.
            </p>
          </div>

          {effortType === 'intensity' ? (
            <div>
              <label className="text-foreground text-sm block mb-2">
                Intensity
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={intensityButtonClass('light')}
                  onClick={() => handleIntensityChange('light')}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={intensityButtonClass('moderate')}
                  onClick={() => handleIntensityChange('moderate')}
                >
                  Moderate
                </button>
                <button
                  type="button"
                  className={intensityButtonClass('vigorous')}
                  onClick={() => handleIntensityChange('vigorous')}
                >
                  Vigorous
                </button>
              </div>
              <p className="text-xs text-muted mt-2">
                Pick the perceived exertion level that best matches the session.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-foreground text-sm block mb-2">
                Average Heart Rate (bpm)
              </label>
              <button
                onClick={openHeartRatePicker}
                type="button"
                className="w-full px-3 py-2 rounded-lg border-2 bg-blue-600 border-blue-500 text-white transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
              >
                <span className="font-semibold text-sm md:text-base">
                  {formattedHeartRate}
                </span>
                <span className="text-[11px] opacity-75">Tap to change</span>
              </button>
              <p className="text-xs text-muted mt-2">
                Select the average beats per minute recorded during this
                session.
              </p>
            </div>
          )}

          {showStepOverlapToggle && (
            <div className="rounded-lg border border-border bg-surface-highlight/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Avoid step double count
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Deduct estimated steps from this session before step
                    calories are calculated.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={stepOverlapEnabled}
                  onClick={handleStepOverlapToggle}
                  aria-label="Toggle avoid step double count"
                  className="inline-flex items-center rounded-full focus-ring pressable-inline"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                      stepOverlapEnabled
                        ? 'bg-accent-green border-accent-green/70'
                        : 'bg-surface-highlight border-border'
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${stepOverlapEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-surface-highlight rounded-lg p-3">
            <p className="text-foreground/80 text-xs text-center mb-1">
              Estimated Burn:
            </p>
            <p className="text-foreground font-bold text-xl text-center">
              ~{estimatedBurn} calories
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-4 py-2 rounded-lg transition-all press-feedback focus-ring md:hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            type="button"
            disabled={!canSave}
            className={`flex-1 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 focus-ring press-feedback ${
              canSave
                ? isEditing
                  ? 'bg-blue-600 md:hover:bg-blue-500'
                  : 'bg-blue-600 md:hover:bg-blue-500'
                : isEditing
                  ? 'bg-blue-600/60 cursor-not-allowed opacity-70'
                  : 'bg-blue-600/60 cursor-not-allowed opacity-70'
            }`}
          >
            <Save size={20} />
            {saveLabel}
          </button>
        </div>
      </ModalShell>

      <DurationPickerModal
        isOpen={isDurationPickerOpen}
        isClosing={isDurationPickerClosing}
        mode="minutes"
        title="Cardio Duration"
        minutes={sessionDurationMinutes}
        onCancel={requestDurationPickerClose}
        onSave={handleDurationPickerSave}
      />

      <CardioTypeListModal
        isOpen={isTypePickerOpen}
        isClosing={isTypePickerClosing}
        cardioTypes={resolvedCardioTypes}
        customCardioTypes={resolvedCustomCardioTypes}
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

      <HeartRatePickerModal
        isOpen={isHeartRatePickerOpen}
        isClosing={isHeartRatePickerClosing}
        value={heartRateValue}
        onCancel={requestHeartRatePickerClose}
        onSave={handleHeartRatePickerSave}
      />
    </>
  );
};
