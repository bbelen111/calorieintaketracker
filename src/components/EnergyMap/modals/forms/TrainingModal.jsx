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
import { normalizeSessionHeartRate } from '../../../../constants/health/heartRate';
import {
  applyManualHeartRate,
  clearHeartRateFields,
  resolveTrainingHrBurnModel,
} from '../../../../utils/calculations/sessionHeartRate';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import { SessionHeartRatePanel } from '../../common/SessionHeartRatePanel';
import { ImportWorkoutButton } from '../../common/ImportWorkoutButton';
import { SegmentedToggle } from '../../common/SegmentedToggle';
import { SmoothHeight } from '../../common/SmoothHeight';
import { useUnits } from '../../../../hooks/useUnits';

const DEFAULT_TRAINING_TYPE_CATALOG =
  getDefaultEnergyMapData().trainingType ?? {};
const FALLBACK_TRAINING_TYPE = 'trainingtype_1';
const EFFORT_TYPE_OPTIONS = [
  { id: 'intensity', label: 'Intensity' },
  { id: 'heartRate', label: 'Average Heart Rate' },
];
const INTENSITY_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'vigorous', label: 'Vigorous' },
];

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
  const overlayClassName = isFavouriteMode ? 'z-80' : '';

  const sessionDateKey = session?.date || getTodayDateKey();
  const pseudoTrainingSession = useMemo(() => {
    const durationHours = Number(session?.durationHours);
    const durationMinutes = Number.isFinite(durationHours)
      ? Math.round(durationHours * 60)
      : 0;

    return {
      type: session?.type,
      date: sessionDateKey,
      duration: durationMinutes,
      effortType,
      intensity: intensityValue,
      averageHeartRate: effortType === 'heartRate' ? heartRateValue : '',
      // Mirrors the save path: a new HR session prices by HR-picked
      // intensity; an edited legacy session keeps Keytel.
      hrBurnModel:
        effortType === 'heartRate'
          ? resolveTrainingHrBurnModel(session)
          : undefined,
    };
  }, [session, sessionDateKey, effortType, heartRateValue, intensityValue]);

  // Same inputs as the breakdown: full userData (HR profile as of the session
  // date) with the form's profile overrides on top.
  const pricingUserData = useMemo(
    () => ({
      ...store.userData,
      weight: resolvedUserWeight,
      age: resolvedUserAge,
      gender: resolvedUserGender,
    }),
    [store.userData, resolvedUserWeight, resolvedUserAge, resolvedUserGender]
  );

  const estimatedBurn = useMemo(
    () =>
      calculateTrainingSessionCalories(
        pseudoTrainingSession,
        pricingUserData,
        resolvedTrainingTypes
      ),
    [pseudoTrainingSession, pricingUserData, resolvedTrainingTypes]
  );

  const estimatedEpoc = useMemo(() => {
    const epoc = resolveTrainingSessionEpoc({
      session: pseudoTrainingSession,
      exerciseCalories: estimatedBurn,
      trainingType: resolvedTrainingTypes?.[session?.type],
      userData: pricingUserData,
    });

    return Number(epoc?.totalCalories) || 0;
  }, [
    pseudoTrainingSession,
    estimatedBurn,
    resolvedTrainingTypes,
    session?.type,
    pricingUserData,
  ]);

  // One-line result of an "Import" from the watch (shown under the header).
  const [importNote, setImportNote] = React.useState(null);
  const hrBurnModel =
    effortType === 'heartRate' ? resolveTrainingHrBurnModel(session) : null;

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
      ? normalizeSessionHeartRate(heartRateValue) != null
      : true;
  const hasValidStartTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    String(session?.startTime ?? '').trim()
  );
  const canSave = hasValidDuration && hasValidHeartRate && hasValidStartTime;

  const units = useUnits();
  const selectedTraining = resolvedTrainingTypes?.[session?.type] ?? null;
  const selectedCalories = Number(selectedTraining?.caloriesPerHour);
  const selectedCaloriesSummary = selectedTraining
    ? Number.isFinite(selectedCalories)
      ? `${units.energy.value(selectedCalories, { grouping: false })} ${units.energy.unit}/hr`
      : `-- ${units.energy.unit}/hr`
    : 'Browse the full training library to find the best match.';

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
      ...clearHeartRateFields(session),
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
      onChange(applyManualHeartRate(session, bpm));
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
        <div className="flex flex-wrap items-center justify-between mb-4 gap-x-3 gap-y-2">
          <h3 className="text-foreground font-bold text-xl">{headerTitle}</h3>
          {/* Wraps under the title on narrow screens, staying side by side. */}
          <div className="ml-auto flex items-center gap-2">
            {!isFavouriteMode && (
              <ImportWorkoutButton
                kind="training"
                session={session}
                onChange={onChange}
                dateKey={sessionDateKey}
                onNote={setImportNote}
              />
            )}
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
        </div>
        {importNote && (
          <p aria-live="polite" className="-mt-2 mb-3 text-xs text-muted">
            {importNote}
          </p>
        )}

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
            <SegmentedToggle
              ariaLabel="Effort tracking"
              options={EFFORT_TYPE_OPTIONS}
              value={effortType}
              onChange={handleEffortTypeChange}
            />
            <p className="text-xs text-muted mt-2">
              Use heart rate for wearable-based estimates or intensity for quick
              selections.
            </p>
          </div>

          <SmoothHeight swapKey={effortType}>
            {effortType === 'intensity' ? (
              <div>
                <label className="text-foreground text-sm block mb-2">
                  Intensity
                </label>
                <SegmentedToggle
                  ariaLabel="Intensity"
                  options={INTENSITY_OPTIONS}
                  value={intensityValue}
                  onChange={handleIntensityChange}
                />
                <p className="text-xs text-muted mt-2">
                  Pick the perceived exertion level that best matches the
                  session.
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
                  {hrBurnModel === 'keytel'
                    ? 'Classic heart-rate formula (this session was logged before heart rate set the intensity).'
                    : `Heart rate sets the intensity; your training type keeps its ${units.energy.unit} per hour.`}
                </p>
                <SessionHeartRatePanel
                  session={session}
                  dateKey={sessionDateKey}
                />
              </div>
            )}
          </SmoothHeight>

          <div className="bg-surface-highlight rounded-lg p-3">
            <p className="text-foreground/80 text-xs text-center mb-1">
              Estimated Burn:
            </p>
            <p className="text-foreground font-bold text-xl text-center">
              ~{units.energy.value(estimatedBurn, { grouping: false })}{' '}
              {units.energy.longUnit}
            </p>
            {epocEnabled && (
              <p className="text-muted text-xs text-center mt-1">
                +~{units.energy.value(estimatedEpoc, { grouping: false })} EPOC
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
