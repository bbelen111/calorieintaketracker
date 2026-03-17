import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Save,
  ChevronsUpDown,
  Mars,
  Venus,
  ChevronLeft,
  Sun,
  Moon,
  Smartphone,
  Monitor,
  Flame,
  Info,
} from 'lucide-react';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../../constants/activityPresets';
import { ModalShell } from '../../common/ModalShell';
import {
  formatDurationLabel,
  roundDurationHours,
} from '../../../../utils/time';
import { formatDateLabel, formatWeight } from '../../../../utils/weight';
import { formatBodyFat } from '../../../../utils/bodyFat';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  AGE_MAX,
  AGE_MIN,
  HEIGHT_MAX,
  HEIGHT_MIN,
  sanitizeAge,
  sanitizeHeight,
} from '../../../../utils/profile';

const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'amoled_dark', label: 'AMOLED', icon: Smartphone },
];

export const SettingsModal = ({
  isOpen,
  isClosing,
  userData,
  onChange,
  bmr,
  trainingTypes,
  trainingCalories,
  onTrainingClick,
  onDailyActivityClick,
  onAgePickerClick,
  onHeightPickerClick,
  onManageWeightClick,
  onManageBodyFatClick,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  onOpenTefInfo,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      bmr: state.bmr,
      trainingTypes: state.trainingTypes,
      trainingCalories: state.trainingCalories,
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
    }),
    shallow
  );

  const resolvedUserData = userData ?? store.userData;
  const resolvedBmr = bmr ?? store.bmr;
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const resolvedTrainingCalories = trainingCalories ?? store.trainingCalories;
  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedBodyFatEntries = bodyFatEntries ?? store.bodyFatEntries;
  const resolvedBodyFatTrackingEnabled =
    typeof bodyFatTrackingEnabled === 'boolean'
      ? bodyFatTrackingEnabled
      : resolvedUserData.bodyFatTrackingEnabled;

  const selectedTrainingType =
    resolvedTrainingTypes?.[resolvedUserData.trainingType] ?? null;
  const formattedTrainingDuration = useMemo(
    () => formatDurationLabel(resolvedUserData.trainingDuration),
    [resolvedUserData.trainingDuration]
  );
  const roundedTrainingDuration = useMemo(
    () => roundDurationHours(resolvedUserData.trainingDuration),
    [resolvedUserData.trainingDuration]
  );

  const [ageInput, setAgeInput] = useState(() =>
    String(sanitizeAge(resolvedUserData.age))
  );
  const [heightInput, setHeightInput] = useState(() =>
    String(sanitizeHeight(resolvedUserData.height))
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAgeInput(String(sanitizeAge(resolvedUserData.age)));
    setHeightInput(String(sanitizeHeight(resolvedUserData.height)));
  }, [isOpen, resolvedUserData.age, resolvedUserData.height]);

  const commitAgeInput = useCallback(() => {
    const nextAge = sanitizeAge(ageInput, resolvedUserData.age);
    onChange('age', nextAge);
    setAgeInput(String(nextAge));
  }, [ageInput, onChange, resolvedUserData.age]);

  const commitHeightInput = useCallback(() => {
    const nextHeight = sanitizeHeight(heightInput, resolvedUserData.height);
    onChange('height', nextHeight);
    setHeightInput(String(nextHeight));
  }, [heightInput, onChange, resolvedUserData.height]);

  const handleNumericEnter = useCallback((event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.currentTarget.blur();
  }, []);

  const handleCancel = useCallback(() => {
    setAgeInput(String(sanitizeAge(resolvedUserData.age)));
    setHeightInput(String(sanitizeHeight(resolvedUserData.height)));
    onCancel?.();
  }, [onCancel, resolvedUserData.age, resolvedUserData.height]);

  const handleSave = useCallback(() => {
    const nextAge = sanitizeAge(ageInput, resolvedUserData.age);
    const nextHeight = sanitizeHeight(heightInput, resolvedUserData.height);
    onChange('age', nextAge);
    onChange('height', nextHeight);
    setAgeInput(String(nextAge));
    setHeightInput(String(nextHeight));
    onSave?.();
  }, [
    ageInput,
    heightInput,
    onChange,
    onSave,
    resolvedUserData.age,
    resolvedUserData.height,
  ]);

  const latestWeightEntry = useMemo(
    () =>
      Array.isArray(resolvedWeightEntries) && resolvedWeightEntries.length
        ? resolvedWeightEntries[resolvedWeightEntries.length - 1]
        : null,
    [resolvedWeightEntries]
  );

  const displayedWeight = useMemo(() => {
    const resolved = latestWeightEntry?.weight ?? resolvedUserData.weight;
    const formatted = formatWeight(resolved);
    return formatted ?? '—';
  }, [latestWeightEntry?.weight, resolvedUserData.weight]);

  const lastLoggedLabel = useMemo(() => {
    if (!latestWeightEntry?.date) {
      return 'No entries yet';
    }
    return `Last logged ${formatDateLabel(latestWeightEntry.date, { month: 'short', day: 'numeric' })}`;
  }, [latestWeightEntry]);

  const latestBodyFatEntry = useMemo(
    () =>
      Array.isArray(resolvedBodyFatEntries) && resolvedBodyFatEntries.length
        ? resolvedBodyFatEntries[resolvedBodyFatEntries.length - 1]
        : null,
    [resolvedBodyFatEntries]
  );

  const displayedBodyFat = useMemo(() => {
    const formatted = formatBodyFat(latestBodyFatEntry?.bodyFat);
    return formatted ?? '—';
  }, [latestBodyFatEntry?.bodyFat]);

  const bodyFatLoggedLabel = useMemo(() => {
    if (!latestBodyFatEntry?.date) {
      return 'No entries yet';
    }
    return `Last logged ${formatDateLabel(latestBodyFatEntry.date, { month: 'short', day: 'numeric' })}`;
  }, [latestBodyFatEntry]);

  return (
    <ModalShell
      isOpen={isOpen}
      isClosing={isClosing}
      onClose={handleCancel}
      fullHeight
      overlayClassName="fixed inset-0 bg-black/70 !p-0 !flex-none !items-stretch !justify-stretch"
      contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Back"
            className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-foreground font-bold text-xl md:text-2xl">
            Personal Settings
          </h3>
        </div>
      </div>

      <div className="flex-1 bg-surface border-t border-border flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4 md:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="text-foreground/80 text-sm block mb-2">
                  Age
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={AGE_MIN}
                    max={AGE_MAX}
                    step={1}
                    value={ageInput}
                    onChange={(event) => setAgeInput(event.target.value)}
                    onBlur={commitAgeInput}
                    onKeyDown={handleNumericEnter}
                    className="w-full bg-surface-highlight text-foreground px-4 pr-14 py-3 rounded-lg border border-border focus:border-primary focus:outline-none text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => onAgePickerClick?.()}
                    className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted/30 md:hover:bg-muted/50 text-foreground transition focus-ring"
                    aria-label="Open age picker"
                  >
                    <ChevronsUpDown size={16} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-foreground/80 text-sm block mb-2">
                  Gender
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onChange('gender', 'male')}
                    type="button"
                    className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 focus-ring pressable-inline ${
                      resolvedUserData.gender === 'male'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-surface-highlight border-border text-muted'
                    }`}
                  >
                    <Mars size={16} />
                    <span>Male</span>
                  </button>
                  <button
                    onClick={() => onChange('gender', 'female')}
                    type="button"
                    className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 focus-ring pressable-inline ${
                      resolvedUserData.gender === 'female'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-surface-highlight border-border text-muted'
                    }`}
                  >
                    <Venus size={16} />
                    <span>Female</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-foreground/80 text-sm block mb-2">
                  Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => onChange('theme', value)}
                      type="button"
                      className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 focus-ring pressable-inline ${
                        resolvedUserData.theme === value
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-surface-highlight border-border text-muted'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-sm">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-foreground/80 text-sm block mb-2">
                  Weight (kg)
                </label>
                <button
                  type="button"
                  onClick={() => onManageWeightClick?.()}
                  className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-500 text-white transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left focus-ring md:hover:bg-blue-500/90"
                >
                  <span className="font-semibold text-sm md:text-base">
                    {displayedWeight !== '—' ? `${displayedWeight}kg` : '—'}
                  </span>
                  <span className="text-xs md:text-sm opacity-90">
                    {lastLoggedLabel}
                  </span>
                  <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                    Tap to manage
                  </span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-foreground/80 text-sm">
                    Body Fat (%)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        'bodyFatTrackingEnabled',
                        !resolvedBodyFatTrackingEnabled
                      )
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all focus-ring pressable-inline ${
                      resolvedBodyFatTrackingEnabled
                        ? 'bg-accent-emerald/20 border-accent-emerald/60 text-accent-emerald'
                        : 'bg-surface-highlight border-border text-muted'
                    }`}
                  >
                    {resolvedBodyFatTrackingEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onManageBodyFatClick?.()}
                  disabled={!resolvedBodyFatTrackingEnabled}
                  className={`w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left font-semibold focus-ring ${
                    resolvedBodyFatTrackingEnabled
                      ? 'bg-blue-600 border-blue-500 text-white md:hover:bg-blue-500/90'
                      : 'bg-surface-highlight border-border text-muted cursor-not-allowed'
                  }`}
                >
                  <span className="font-semibold text-sm md:text-base">
                    {displayedBodyFat !== '—' ? `${displayedBodyFat}%` : '—'}
                  </span>
                  <span className="text-xs md:text-sm opacity-90">
                    {resolvedBodyFatTrackingEnabled
                      ? bodyFatLoggedLabel
                      : 'Tracking disabled'}
                  </span>
                  <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
                    {resolvedBodyFatTrackingEnabled
                      ? 'Tap to manage'
                      : 'Enable to use'}
                  </span>
                </button>
              </div>

              <div>
                <label className="text-foreground/80 text-sm block mb-2">
                  Height (cm)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={HEIGHT_MIN}
                    max={HEIGHT_MAX}
                    step={1}
                    value={heightInput}
                    onChange={(event) => setHeightInput(event.target.value)}
                    onBlur={commitHeightInput}
                    onKeyDown={handleNumericEnter}
                    className="w-full bg-surface-highlight text-foreground px-4 pr-14 py-3 rounded-lg border border-border focus:border-primary focus:outline-none text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => onHeightPickerClick?.()}
                    className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted/30 md:hover:bg-muted/50 text-foreground transition focus-ring"
                    aria-label="Open height picker"
                  >
                    <ChevronsUpDown size={16} />
                  </button>
                </div>
              </div>
            </div>

            <DailyActivitySection
              userData={resolvedUserData}
              bmr={resolvedBmr}
              onDailyActivityClick={onDailyActivityClick}
            />

            <div>
              <div className="flex items-center justify-between mb-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenTefInfo?.()}
                  className="inline-flex items-center gap-2 text-foreground/80 text-sm md:hover:text-foreground transition-colors focus-ring rounded-md"
                >
                  <span>Smart TEF</span>
                  <Info size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      'smartTefEnabled',
                      !resolvedUserData.smartTefEnabled
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all focus-ring pressable-inline ${
                    resolvedUserData.smartTefEnabled
                      ? 'bg-accent-orange/20 border-accent-orange/60 text-accent-orange'
                      : 'bg-surface-highlight border-border text-muted'
                  }`}
                >
                  {resolvedUserData.smartTefEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div
                className={`rounded-lg border p-3 ${
                  resolvedUserData.smartTefEnabled
                    ? 'bg-accent-orange/10 border-accent-orange/30'
                    : 'bg-surface-highlight/40 border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-lg p-2 ${
                      resolvedUserData.smartTefEnabled
                        ? 'bg-accent-orange/20 text-accent-orange'
                        : 'bg-surface-highlight text-muted'
                    }`}
                  >
                    <Flame size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-semibold">
                      Replace the built-in 10% TEF estimate with macro-based
                      Smart TEF.
                    </p>
                    <p className="text-muted text-xs mt-1">
                      Target mode uses your macro targets. Dynamic mode uses the
                      macros you’ve already logged for today’s live steps card.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-foreground/80 text-sm block mb-2">
                Training
              </label>
              <button
                onClick={onTrainingClick}
                type="button"
                className="relative w-full text-left p-3 md:p-4 rounded-lg border-2 bg-indigo-600 border-indigo-500 text-white transition-all press-feedback focus-ring md:hover:bg-indigo-500/90"
              >
                <div className="min-w-0 pr-24 md:pr-28">
                  <div className="font-semibold text-base">
                    {selectedTrainingType?.label ?? 'Training'}
                  </div>
                  <div className="text-xs md:text-sm opacity-90 mt-0.5">
                    {selectedTrainingType?.caloriesPerHour ?? '—'} cal/hr •{' '}
                    {formattedTrainingDuration}
                  </div>
                  <div className="text-[11px] opacity-80 mt-1">
                    {`~${roundedTrainingDuration.toFixed(2)} hours • Session burn: ~${Math.round(resolvedTrainingCalories)} calories`}
                  </div>
                </div>
                <span className="pointer-events-none absolute top-3 right-3 md:top-4 md:right-4 text-[11px] opacity-75 whitespace-nowrap">
                  Tap to edit
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 md:gap-3 p-4 border-t border-border bg-background/60">
          <button
            onClick={handleCancel}
            type="button"
            className="flex-1 bg-surface-highlight text-foreground px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all press-feedback focus-ring font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="flex-1 bg-blue-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all press-feedback focus-ring font-medium"
          >
            <Save size={20} />
            Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

const formatMultiplier = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded.toFixed(0)}%`
    : `${rounded.toFixed(1)}%`;
};

const defaultPresetKeys = { training: 'default', rest: 'default' };

const DailyActivitySection = ({ userData, bmr, onDailyActivityClick }) => {
  const presets = userData.activityPresets ?? defaultPresetKeys;
  const multipliers =
    userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;

  const trainingPresetKey = presets.training ?? 'default';
  const restPresetKey = presets.rest ?? 'default';

  const trainingPreset = getActivityPresetByKey('training', trainingPresetKey);
  const restPreset = getActivityPresetByKey('rest', restPresetKey);

  const trainingLabel = trainingPreset ? trainingPreset.label : 'Custom';
  const restLabel = restPreset ? restPreset.label : 'Custom';

  const trainingMultiplier =
    multipliers.training ?? DEFAULT_ACTIVITY_MULTIPLIERS.training;
  const restMultiplier = multipliers.rest ?? DEFAULT_ACTIVITY_MULTIPLIERS.rest;

  const trainingBaseline = Number.isFinite(bmr)
    ? Math.round(bmr + bmr * trainingMultiplier)
    : null;
  const restBaseline = Number.isFinite(bmr)
    ? Math.round(bmr + bmr * restMultiplier)
    : null;

  return (
    <div>
      <label className="text-foreground/80 text-sm block mb-2">
        Daily NEAT (Non-Exercise Activity)
      </label>
      <button
        onClick={onDailyActivityClick}
        type="button"
        className="relative w-full text-left p-3 md:p-4 rounded-lg border-2 bg-indigo-600 border-indigo-500 text-white transition-all press-feedback focus-ring"
      >
        <div className="min-w-0 pr-24 md:pr-28">
          <div className="font-semibold text-sm md:text-base">
            Training Day • {trainingLabel}
          </div>
          <div className="text-xs md:text-sm opacity-90">
            NEAT offset: {formatMultiplier(trainingMultiplier)}
          </div>
          <div className="font-semibold text-sm md:text-base mt-3">
            Rest Day • {restLabel}
          </div>
          <div className="text-xs md:text-sm opacity-90">
            NEAT offset: {formatMultiplier(restMultiplier)}
          </div>
        </div>
        <span className="pointer-events-none absolute top-3 right-3 md:top-4 md:right-4 text-[11px] opacity-75 whitespace-nowrap">
          Tap to adjust
        </span>
      </button>
      {Number.isFinite(bmr) && (
        <div className="mt-2 space-y-1 text-xs text-foreground/80">
          {restBaseline !== null && (
            <p>
              Rest day baseline: ~{restBaseline.toLocaleString()} cal (BMR +
              NEAT)
            </p>
          )}
          {trainingBaseline !== null && (
            <p>
              Training day baseline: ~{trainingBaseline.toLocaleString()} cal
              (BMR + NEAT)
            </p>
          )}
        </div>
      )}
    </div>
  );
};
