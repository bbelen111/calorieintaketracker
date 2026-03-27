import React, { useCallback, useEffect, useMemo } from 'react';
import { Save, Edit3, ChevronsUpDown } from 'lucide-react';
import { ModalShell } from '../../common/ModalShell';
import {
  formatTimeOfDay12Hour,
  formatDurationLabel,
  normalizeTimeOfDay,
  roundDurationHours,
} from '../../../../utils/time';
import { calculateTrainingSessionCalories } from '../../../../utils/calculations';
import { resolveTrainingSessionEpoc } from '../../../../utils/epoc';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { useAnimatedModal } from '../../../../hooks/useAnimatedModal';
import { HeartRatePickerModal } from '../pickers/HeartRatePickerModal';

export const TrainingModal = ({
  isOpen,
  isClosing,
  mode = 'session',
  trainingTypes,
  tempTrainingType,
  tempTrainingDuration,
  tempTrainingEffortType,
  tempTrainingIntensity,
  tempTrainingHeartRate,
  tempTrainingStartTime,
  onTrainingTypeSelect,
  onEditTrainingType,
  onDurationClick,
  onEffortTypeChange,
  onIntensityChange,
  onHeartRateChange,
  onStartTimePickerClick,
  userWeight,
  userAge,
  userGender,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      trainingTypes: state.trainingTypes ?? {},
      userData: state.userData,
    }),
    shallow
  );
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const effortType = tempTrainingEffortType ?? 'intensity';
  const intensityValue = tempTrainingIntensity ?? 'moderate';
  const heartRateValue =
    tempTrainingHeartRate === '' || tempTrainingHeartRate == null
      ? ''
      : tempTrainingHeartRate;

  const resolvedUserWeight = userWeight ?? store.userData?.weight;
  const resolvedUserAge = userAge ?? store.userData?.age;
  const resolvedUserGender = userGender ?? store.userData?.gender;
  const epocEnabled = store.userData?.epocEnabled ?? true;

  const pseudoTrainingSession = useMemo(() => {
    const durationMinutes = Number.isFinite(Number(tempTrainingDuration))
      ? Math.round(Number(tempTrainingDuration) * 60)
      : 0;

    return {
      type: tempTrainingType,
      duration: durationMinutes,
      effortType,
      intensity: intensityValue,
      averageHeartRate: effortType === 'heartRate' ? tempTrainingHeartRate : '',
    };
  }, [
    tempTrainingType,
    tempTrainingDuration,
    effortType,
    intensityValue,
    tempTrainingHeartRate,
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
      trainingType: resolvedTrainingTypes?.[tempTrainingType],
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
    tempTrainingType,
    resolvedUserAge,
    store.userData?.epocCarryoverHours,
  ]);

  const formattedDuration = formatDurationLabel(tempTrainingDuration);
  const normalizedStartTime = useMemo(
    () => normalizeTimeOfDay(tempTrainingStartTime, '12:00'),
    [tempTrainingStartTime]
  );
  const formattedStartTime12h = useMemo(
    () => formatTimeOfDay12Hour(normalizedStartTime, '12:00 PM'),
    [normalizedStartTime]
  );
  const roundedDuration = useMemo(
    () => roundDurationHours(tempTrainingDuration),
    [tempTrainingDuration]
  );

  const hasValidHeartRate =
    effortType === 'heartRate'
      ? Number.isFinite(Number(tempTrainingHeartRate)) &&
        Number(tempTrainingHeartRate) > 0
      : true;
  const hasValidStartTime =
    mode !== 'session' ||
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(
      String(tempTrainingStartTime ?? '').trim()
    );
  const canSave = hasValidHeartRate && hasValidStartTime;

  const effortButtonClass = (type) =>
    `w-full rounded-lg border px-3 py-1.5 text-sm transition-all focus-ring pressable-inline ${
      effortType === type
        ? 'bg-primary text-primary-foreground border-accent-blue shadow-sm'
        : 'bg-surface-highlight text-muted border-border md:hover:border-accent-blue'
    }`;

  const intensityButtonClass = (level) =>
    `w-full rounded-lg border px-3 py-2 text-sm transition-all focus-ring pressable-inline ${
      intensityValue === level
        ? 'bg-primary text-primary-foreground border-accent-blue shadow-sm'
        : 'bg-surface-highlight text-muted border-border md:hover:border-accent-blue'
    }`;

  const {
    isOpen: isHeartRatePickerOpen,
    isClosing: isHeartRatePickerClosing,
    open: openHeartRatePicker,
    requestClose: requestHeartRatePickerClose,
    forceClose: forceHeartRatePickerClose,
  } = useAnimatedModal(false);

  useEffect(() => {
    if (!isOpen) {
      forceHeartRatePickerClose();
    }
  }, [forceHeartRatePickerClose, isOpen]);

  const handleHeartRatePickerSave = useCallback(
    (bpm) => {
      onHeartRateChange({ target: { value: String(bpm) } });
      requestHeartRatePickerClose();
    },
    [onHeartRateChange, requestHeartRatePickerClose]
  );

  const formattedHeartRate = useMemo(() => {
    const numeric = Number(heartRateValue);
    if (heartRateValue === '' || !Number.isFinite(numeric) || numeric <= 0) {
      return '--';
    }
    return `${numeric} bpm`;
  }, [heartRateValue]);

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        isClosing={isClosing}
        contentClassName="p-6 w-full max-w-md"
      >
        <h3 className="text-foreground font-bold text-xl mb-4 text-left">
          Training Settings
        </h3>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-foreground text-sm">Training Type</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(resolvedTrainingTypes).map(([key, type]) => {
                const isActive = tempTrainingType === key;

                return (
                  <button
                    key={key}
                    onClick={() => {
                      onTrainingTypeSelect(key);
                    }}
                    type="button"
                    className={`p-3 rounded-lg border-2 transition-all text-sm relative text-left focus-ring pressable ${
                      isActive
                        ? 'bg-accent-indigo border-accent-indigo text-primary-foreground'
                        : 'bg-surface-highlight border-border text-muted active:bg-surface-highlight/80 md:hover:border-accent-indigo'
                    }`}
                  >
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditTrainingType(key);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-primary-foreground/10 md:hover:bg-primary-foreground/20 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      <Edit3 size={12} />
                    </span>
                    <div className="pr-10 space-y-1">
                      <div className="font-bold text-base leading-tight">
                        {type.label}
                      </div>
                      <div className="text-xs opacity-75 leading-tight">
                        {type.caloriesPerHour} kcal/hr
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
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
              className="w-full px-3 py-2 rounded-lg border-2 bg-primary border-accent-blue text-primary-foreground transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
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
                onClick={() => onEffortTypeChange('intensity')}
              >
                Intensity
              </button>
              <button
                type="button"
                className={effortButtonClass('heartRate')}
                onClick={() => onEffortTypeChange('heartRate')}
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
                  onClick={() => onIntensityChange('light')}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={intensityButtonClass('moderate')}
                  onClick={() => onIntensityChange('moderate')}
                >
                  Moderate
                </button>
                <button
                  type="button"
                  className={intensityButtonClass('vigorous')}
                  onClick={() => onIntensityChange('vigorous')}
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
                className="w-full px-3 py-2 rounded-lg border-2 bg-primary border-accent-blue text-primary-foreground transition-all active:scale-[0.98] flex items-center justify-between focus-ring press-feedback"
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
            Save
          </button>
        </div>
      </ModalShell>

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
