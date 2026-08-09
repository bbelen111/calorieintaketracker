import React, { useCallback, useEffect, useMemo } from 'react';
import { Save, Star, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  formatTimeOfDay12Hour,
  formatDurationLabel,
  normalizeTimeOfDay,
  roundDurationHours,
} from '../../../../utils/formatting/time';
import { calculateTrainingSessionCalories } from '../../../../utils/calculations/calculations';
import { resolveTrainingSessionEpoc } from '../../../../utils/calculations/epoc';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { HeartRatePickerModal } from '../pickers/HeartRatePickerModal';
import { TrainingTypeListModal } from '../lists/TrainingTypeListModal';
import { TrainingTypeEditorModal } from './TrainingTypeEditorModal';
import { getDefaultEnergyMapData } from '../../../../utils/data/storage';

const DEFAULT_TRAINING_TYPE_CATALOG =
  getDefaultEnergyMapData().trainingType ?? {};
const FALLBACK_TRAINING_TYPE = 'trainingtype_1';

export const TrainingModal = ({
  isOpen,
  isClosing,
  mode = 'session',
  trainingTypes,
  customTrainingTypes,
  session,
  onChange,
  onAddCustomTrainingType,
  onDeleteCustomTrainingType,
  onStartTimePickerClick,
  onDurationClick,
  onOpenFavourites,
  showFavouritesButton = false,
  userWeight,
  userAge,
  userGender,
  isEditing: isEditingProp,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      trainingTypes: state.trainingTypes ?? {},
      trainingTypeOverrides: state.userData?.trainingType,
      userData: state.userData,
    }),
    shallow
  );
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const resolvedCustomTrainingTypes = useMemo(() => {
    // Only non-preset overrides count as user-created training types.
    const raw = customTrainingTypes ?? store.trainingTypeOverrides;
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    return Object.entries(raw).reduce((acc, [key, entry]) => {
      if (!DEFAULT_TRAINING_TYPE_CATALOG[key]) {
        acc[key] = entry;
      }
      return acc;
    }, {});
  }, [customTrainingTypes, store.trainingTypeOverrides]);
  const effortType = session?.effortType ?? 'intensity';
  const intensityValue = session?.intensity ?? 'moderate';
  const heartRateValue =
    session?.averageHeartRate === '' || session?.averageHeartRate == null
      ? ''
      : session?.averageHeartRate;

  const resolvedUserWeight = userWeight ?? store.userData?.weight;
  const resolvedUserAge = userAge ?? store.userData?.age;
  const resolvedUserGender = userGender ?? store.userData?.gender;
  const epocEnabled = store.userData?.epocEnabled ?? true;
  const isFavouriteMode = mode === 'favourite';
  const isEditing = Boolean(isEditingProp ?? session?.id != null);
  const headerTitle = isFavouriteMode
    ? 'Add Favourite Training Session'
    : isEditing
      ? 'Edit Training Session'
      : 'Add Training Session';
  const saveLabel = isFavouriteMode ? 'Save Favourite' : 'Save';
  const overlayClassName = isFavouriteMode ? 'z-[80]' : '';

  const pseudoTrainingSession = useMemo(() => {
    const durationHours = Number(session?.durationHours);
    const durationMinutes = Number.isFinite(durationHours)
      ? Math.round(durationHours * 60)
      : 0;

    return {
      type: session?.type,
      duration: durationMinutes,
      effortType,
      intensity: intensityValue,
      averageHeartRate: effortType === 'heartRate' ? heartRateValue : '',
    };
  }, [
    session?.type,
    session?.durationHours,
    effortType,
    heartRateValue,
    intensityValue,
  ]);

  const estimatedBurn = useMemo(
    () =>
      calculateTrainingSessionCalories(
        pseudoTrainingSession,
        {
          weight: resolvedUserWeight,
          age: resolvedUserAge,
          gender: resolvedUserGender,
        },
        resolvedTrainingTypes
      ),
    [
      pseudoTrainingSession,
      resolvedUserWeight,
      resolvedUserAge,
      resolvedUserGender,
      resolvedTrainingTypes,
    ]
  );

  const estimatedEpoc = useMemo(() => {
    const epoc = resolveTrainingSessionEpoc({
      session: pseudoTrainingSession,
      exerciseCalories: estimatedBurn,
      trainingType: resolvedTrainingTypes?.[session?.type],
      userData: {
        age: resolvedUserAge,
        epocCarryoverHours: store.userData?.epocCarryoverHours,
      },
    });

    return Number(epoc?.totalCalories) || 0;
  }, [
    pseudoTrainingSession,
    estimatedBurn,
    resolvedTrainingTypes,
    session?.type,
    resolvedUserAge,
    store.userData?.epocCarryoverHours,
  ]);

  const formattedDuration = formatDurationLabel(session?.durationHours);
  const normalizedStartTime = useMemo(
    () => normalizeTimeOfDay(session?.startTime, '12:00'),
    [session?.startTime]
  );
  const formattedStartTime12h = useMemo(
    () => formatTimeOfDay12Hour(normalizedStartTime, '12:00 PM'),
    [normalizedStartTime]
  );
  const roundedDuration = useMemo(
    () => roundDurationHours(session?.durationHours),
    [session?.durationHours]
  );

  const hasValidDuration =
    Number.isFinite(Number(session?.durationHours)) &&
    Number(session?.durationHours) > 0;
  const hasValidHeartRate =
    effortType === 'heartRate'
      ? Number.isFinite(Number(heartRateValue)) && Number(heartRateValue) > 0
      : true;
  const hasValidStartTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    String(session?.startTime ?? '').trim()
  );
  const canSave = hasValidDuration && hasValidHeartRate && hasValidStartTime;

  const selectedTraining = resolvedTrainingTypes?.[session?.type] ?? null;
  const selectedCalories = Number(selectedTraining?.caloriesPerHour);
  const selectedCaloriesSummary = selectedTraining
    ? Number.isFinite(selectedCalories)
      ? `${Math.round(selectedCalories)} kcal/hr`
      : '-- kcal/hr'
    : 'Browse the full training library to find the best match.';

  const effortButtonClass = (type) =>
    `w-full rounded-lg border px-3 py-1.5 text-sm transition-all focus-ring pressable-inline ${
      effortType === type
        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
        : 'bg-surface-highlight text-muted border-border md:hover:border-accent-blue'
    }`;

  const intensityButtonClass = (level) =>
    `w-full rounded-lg border px-3 py-2 text-sm transition-all focus-ring pressable-inline ${
      intensityValue === level
        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
        : 'bg-surface-highlight text-muted border-border md:hover:border-accent-blue'
    }`;

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
    isOpen: isHeartRatePickerOpen,
    isClosing: isHeartRatePickerClosing,
    open: openHeartRatePicker,
    requestClose: requestHeartRatePickerClose,
    forceClose: forceHeartRatePickerClose,
  } = useAnimatedModal(false);
  const [customName, setCustomName] = React.useState('');
  const [customCalories, setCustomCalories] = React.useState('');
  const resetCustomState = React.useCallback(() => {
    setCustomName('');
    setCustomCalories('');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      forceTypePickerClose();
      forceCustomModalClose();
      forceHeartRatePickerClose();
    }
  }, [
    forceCustomModalClose,
    forceHeartRatePickerClose,
    forceTypePickerClose,
    isOpen,
  ]);

  useEffect(() => {
    if (!isCustomModalOpen && !isCustomModalClosing) {
      const timeout = setTimeout(() => {
        resetCustomState();
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [isCustomModalClosing, isCustomModalOpen, resetCustomState]);

  const handleTrainingTypeSelect = (typeKey) => {
    onChange({ ...session, type: typeKey });
    requestTypePickerClose();
  };

  const handleEffortTypeChange = (nextType) => {
    if (nextType === effortType) {
      return;
    }

    if (nextType === 'heartRate') {
      onChange({
        ...session,
        effortType: 'heartRate',
        averageHeartRate: session?.averageHeartRate ?? '',
      });
      return;
    }

    onChange({
      ...session,
      effortType: 'intensity',
      intensity: session?.intensity ?? 'moderate',
      averageHeartRate: '',
    });
  };

  const handleIntensityChange = (nextIntensity) => {
    if (nextIntensity === intensityValue) {
      return;
    }

    onChange({ ...session, intensity: nextIntensity });
  };

  const handleHeartRatePickerSave = useCallback(
    (bpm) => {
      onChange({ ...session, averageHeartRate: bpm });
      requestHeartRatePickerClose();
    },
    [onChange, requestHeartRatePickerClose, session]
  );

  const formattedHeartRate = useMemo(() => {
    const numeric = Number(heartRateValue);
    if (heartRateValue === '' || !Number.isFinite(numeric) || numeric <= 0) {
      return '--';
    }
    return `${numeric} bpm`;
  }, [heartRateValue]);

  const handleOpenCustomTrainingModal = () => {
    resetCustomState();
    openCustomModal();
  };

  const customModalCanSave =
    Boolean(customName.trim()) &&
    Number.isFinite(Number(customCalories)) &&
    Number(customCalories) > 0;

  const handleCustomTrainingSave = () => {
    if (!customModalCanSave || !onAddCustomTrainingType) {
      return;
    }

    const newKey = onAddCustomTrainingType({
      name: customName,
      calories: Number(customCalories),
    });

    if (newKey) {
      handleTrainingTypeSelect(newKey);
    }

    requestCustomModalClose();
  };

  const handleCustomTrainingCancel = () => {
    requestCustomModalClose();
  };

  const handleDeleteCustomTrainingType = (typeKey) => {
    if (!onDeleteCustomTrainingType) {
      return;
    }

    onDeleteCustomTrainingType(typeKey);

    if (session?.type === typeKey) {
      onChange({ ...session, type: FALLBACK_TRAINING_TYPE });
    }
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        contentClassName="p-6 w-full max-w-md"
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
              Training Type
            </label>
            <button
              type="button"
              onClick={() => openTypePicker()}
              className="w-full px-3 py-2 rounded-lg border-2 bg-primary border-primary text-primary-foreground transition-all press-feedback focus-ring flex items-start justify-between gap-3"
            >
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="font-semibold text-sm md:text-base truncate">
                  {selectedTraining?.label ?? 'Select Training Type'}
                </span>
                <span
                  className="text-[11px] md:text-xs opacity-90 truncate whitespace-nowrap leading-tight"
                  title={selectedCaloriesSummary}
                >
                  {selectedCaloriesSummary}
                </span>
              </span>
              <span className="text-[11px] opacity-75 whitespace-nowrap">
                Tap to change
              </span>
            </button>
          </div>

          <div>
            <label className="text-foreground text-sm block mb-2">
              Start Time
            </label>
            <button
              type="button"
              onClick={onStartTimePickerClick}
              className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
              aria-label="Open start time picker"
            >
              <span className="font-medium text-base">
                <span className="text-foreground">{formattedStartTime12h}</span>
                <span className="text-foreground/70">
                  {' '}
                  ({normalizedStartTime})
                </span>
              </span>
              <ChevronsUpDown size={16} className="text-muted shrink-0" />
            </button>
            <p className="text-xs text-muted mt-2">
              Used to split post-workout carryover across day boundaries.
            </p>
          </div>

          <div>
            <label className="text-foreground text-sm block mb-2">
              Training Duration (hours)
            </label>
            <button
              onClick={onDurationClick}
              type="button"
              className="w-full px-3 py-2 rounded-lg border-2 bg-primary border-primary text-primary-foreground transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
            >
              <div className="flex items-baseline gap-x-2">
                <span className="font-semibold text-sm md:text-base">
                  {formattedDuration}
                </span>
                <span className="text-xs opacity-90">
                  ~{roundedDuration.toFixed(2)} hours
                </span>
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
                className="w-full px-3 py-2 rounded-lg border-2 bg-primary border-primary text-primary-foreground transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
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

          <div className="bg-surface-highlight rounded-lg p-3">
            <p className="text-foreground/80 text-xs text-center mb-1">
              Estimated Burn:
            </p>
            <p className="text-foreground font-bold text-xl text-center">
              ~{estimatedBurn} calories
            </p>
            {epocEnabled && (
              <p className="text-muted text-xs text-center mt-1">
                +~{Math.round(estimatedEpoc)} EPOC
              </p>
            )}
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
            disabled={!canSave}
            className={`flex-1 text-primary-foreground px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium focus-ring press-feedback ${
              canSave
                ? 'bg-primary active:brightness-110'
                : 'bg-primary/60 cursor-not-allowed opacity-70'
            }`}
          >
            <Save size={20} />
            {saveLabel}
          </button>
        </div>
      </ModalShell>

      <TrainingTypeListModal
        isOpen={isTypePickerOpen}
        isClosing={isTypePickerClosing}
        trainingTypes={resolvedTrainingTypes}
        customTrainingTypes={resolvedCustomTrainingTypes}
        selectedType={session?.type}
        onSelect={handleTrainingTypeSelect}
        onClose={requestTypePickerClose}
        onCreateCustomTrainingType={handleOpenCustomTrainingModal}
        onDeleteCustomTrainingType={handleDeleteCustomTrainingType}
      />

      <TrainingTypeEditorModal
        isOpen={isCustomModalOpen}
        isClosing={isCustomModalClosing}
        name={customName}
        calories={customCalories}
        onNameChange={setCustomName}
        onCaloriesChange={setCustomCalories}
        onCancel={handleCustomTrainingCancel}
        onSave={handleCustomTrainingSave}
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
