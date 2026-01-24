import React, { useMemo } from 'react';
import { Save, ChevronsUpDown, Mars, Venus } from 'lucide-react';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../constants/activityPresets';
import { ModalShell } from '../common/ModalShell';
import { formatDurationLabel, roundDurationHours } from '../../../utils/time';
import { formatDateLabel, formatWeight } from '../../../utils/weight';
import { formatBodyFat } from '../../../utils/bodyFat';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';

export const SettingsModal = ({
  isOpen,
  isClosing,
  userData,
  onChange,
  bmr,
  trainingTypes,
  trainingCalories,
  onTrainingTypeClick,
  onTrainingDurationClick,
  onDailyActivityClick,
  onAgePickerClick,
  onHeightPickerClick,
  onManageWeightClick,
  onManageBodyFatClick,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
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
      contentClassName="p-4 md:p-6 w-full md:max-w-2xl"
    >
      <h3 className="text-white font-bold text-xl md:text-2xl mb-4 md:mb-6">
        Personal Settings
      </h3>

      <div className="space-y-4 md:space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div>
            <label className="text-slate-300 text-sm block mb-2">Age</label>
            <div className="relative">
              <input
                type="number"
                value={resolvedUserData.age}
                onChange={(event) =>
                  onChange('age', parseInt(event.target.value, 10) || 0)
                }
                className="w-full bg-slate-700 text-white px-4 pr-14 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
              />
              <button
                type="button"
                onClick={() => onAgePickerClick?.()}
                className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                aria-label="Open age picker"
              >
                <ChevronsUpDown size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-300 text-sm block mb-2">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange('gender', 'male')}
                type="button"
                className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 ${
                  resolvedUserData.gender === 'male'
                    ? 'bg-blue-600 border-blue-400 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 active:scale-95'
                }`}
              >
                <Mars size={16} />
                <span>Male</span>
              </button>
              <button
                onClick={() => onChange('gender', 'female')}
                type="button"
                className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 ${
                  resolvedUserData.gender === 'female'
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 active:scale-95'
                }`}
              >
                <Venus size={16} />
                <span>Female</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-300 text-sm block mb-2">
              Weight (kg)
            </label>
            <button
              type="button"
              onClick={() => onManageWeightClick?.()}
              className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:bg-blue-500/90"
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
              <label className="text-slate-300 text-sm">Body Fat (%)</label>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    'bodyFatTrackingEnabled',
                    !resolvedBodyFatTrackingEnabled
                  )
                }
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                  resolvedBodyFatTrackingEnabled
                    ? 'bg-emerald-600/20 border-emerald-400 text-emerald-200'
                    : 'bg-slate-700 border-slate-600 text-slate-300'
                }`}
              >
                {resolvedBodyFatTrackingEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => onManageBodyFatClick?.()}
              disabled={!resolvedBodyFatTrackingEnabled}
              className={`w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1 text-left font-semibold ${
                resolvedBodyFatTrackingEnabled
                  ? 'bg-blue-600 border-blue-400 text-white hover:bg-blue-500/90'
                  : 'bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed'
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
            <label className="text-slate-300 text-sm block mb-2">
              Height (cm)
            </label>
            <div className="relative">
              <input
                type="number"
                value={resolvedUserData.height}
                onChange={(event) =>
                  onChange('height', parseFloat(event.target.value) || 0)
                }
                className="w-full bg-slate-700 text-white px-4 pr-14 py-3 rounded-lg border border-slate-600 focus:border-blue-400 focus:outline-none text-lg"
              />
              <button
                type="button"
                onClick={() => onHeightPickerClick?.()}
                className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-600/80 hover:bg-slate-500 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-800"
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
          <label className="text-slate-300 text-sm block mb-2">
            Training Type
          </label>
          <button
            onClick={onTrainingTypeClick}
            type="button"
            className="relative w-full text-left p-3 md:p-4 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98] hover:bg-indigo-500/90"
          >
            <div className="min-w-0 pr-24 md:pr-28">
              <div className="font-semibold text-base">
                {resolvedTrainingTypes[resolvedUserData.trainingType].label}
              </div>
              <div className="text-xs md:text-sm opacity-90 mt-0.5">
                {
                  resolvedTrainingTypes[resolvedUserData.trainingType]
                    .caloriesPerHour
                }{' '}
                cal/hr •{' '}
                {
                  resolvedTrainingTypes[resolvedUserData.trainingType]
                    .description
                }
              </div>
            </div>
            <span className="pointer-events-none absolute top-3 right-3 md:top-4 md:right-4 text-[11px] opacity-75 whitespace-nowrap">
              Tap to change
            </span>
          </button>
        </div>

        <div>
          <label className="text-slate-300 text-sm block mb-2">
            Training Duration (hours)
          </label>
          <DurationButton
            duration={resolvedUserData.trainingDuration}
            onClick={onTrainingDurationClick}
          />
          <p className="text-slate-400 text-xs mt-1">
            Training session burn: ~{Math.round(resolvedTrainingCalories)}{' '}
            calories
          </p>
        </div>
      </div>

      <div className="flex gap-2 md:gap-3 mt-6">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 bg-slate-700 active:bg-slate-600 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all active:scale-95 font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          type="button"
          className="flex-1 bg-blue-600 active:bg-blue-700 text-white px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-medium"
        >
          <Save size={20} />
          Save
        </button>
      </div>
    </ModalShell>
  );
};

const DurationButton = ({ duration, onClick }) => {
  const formatted = useMemo(() => formatDurationLabel(duration), [duration]);
  const rounded = useMemo(() => roundDurationHours(duration), [duration]);

  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 bg-blue-600 border-blue-400 text-white transition-all active:scale-[0.98] flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span className="font-semibold text-sm md:text-base">{formatted}</span>
      <span className="text-xs opacity-90">~{rounded.toFixed(2)} hours</span>
      <span className="text-[11px] opacity-75 ml-auto">Tap to change</span>
    </button>
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
      <label className="text-slate-300 text-sm block mb-2">
        Daily NEAT (Non-Exercise Activity)
      </label>
      <button
        onClick={onDailyActivityClick}
        type="button"
        className="relative w-full text-left p-3 md:p-4 rounded-lg border-2 bg-indigo-600 border-indigo-400 text-white transition-all active:scale-[0.98]"
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
        <div className="mt-2 space-y-1 text-xs text-slate-400">
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
