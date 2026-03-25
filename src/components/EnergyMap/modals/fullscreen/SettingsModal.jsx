import React, { useCallback, useMemo } from 'react';
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
  Info,
} from 'lucide-react';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../../constants/activityPresets';
import { ModalShell } from '../../common/ModalShell';
import { formatDateLabel, formatWeight } from '../../../../utils/weight';
import { formatBodyFat } from '../../../../utils/bodyFat';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import { sanitizeAge, sanitizeHeight } from '../../../../utils/profile';

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
  onDailyActivityClick,
  onAgePickerClick,
  onHeightPickerClick,
  onManageWeightClick,
  onManageBodyFatClick,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  onOpenTefInfo,
  onOpenAdaptiveThermogenesisInfo,
  onCancel,
  onSave,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      bmr: state.bmr,
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
    }),
    shallow
  );

  const resolvedUserData = userData ?? store.userData;
  const resolvedBmr = bmr ?? store.bmr;
  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedBodyFatEntries = bodyFatEntries ?? store.bodyFatEntries;
  const resolvedBodyFatTrackingEnabled =
    typeof bodyFatTrackingEnabled === 'boolean'
      ? bodyFatTrackingEnabled
      : resolvedUserData.bodyFatTrackingEnabled;
  const useTargetQuickEstimates =
    resolvedUserData.smartTefQuickEstimatesTargetMode ?? true;
  const showFoodModalTefBurn =
    resolvedUserData.smartTefFoodTefBurnEnabled ?? true;
  const useTargetLiveCard =
    useTargetQuickEstimates &&
    (resolvedUserData.smartTefLiveCardTargetMode ?? false);
  const adaptiveThermogenesisEnabled =
    resolvedUserData.adaptiveThermogenesisEnabled ?? false;
  const adaptiveThermogenesisSmartMode =
    resolvedUserData.adaptiveThermogenesisSmartMode ?? false;
  const epocEnabled = resolvedUserData.epocEnabled ?? true;
  const epocCarryoverHours = Number.isFinite(
    Number(resolvedUserData.epocCarryoverHours)
  )
    ? Math.min(
        Math.max(Math.round(Number(resolvedUserData.epocCarryoverHours)), 1),
        24
      )
    : 6;

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const handleSave = useCallback(() => {
    onSave?.();
  }, [onSave]);

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
            Settings
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
                <button
                  type="button"
                  onClick={() => onAgePickerClick?.()}
                  className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
                  aria-label="Open age picker"
                >
                  <span className="font-medium text-base">
                    {sanitizeAge(resolvedUserData.age)} years
                  </span>
                  <ChevronsUpDown size={16} className="text-muted shrink-0" />
                </button>
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
                    role="switch"
                    aria-checked={resolvedBodyFatTrackingEnabled}
                    aria-label="Toggle body fat tracking"
                    onClick={() =>
                      onChange(
                        'bodyFatTrackingEnabled',
                        !resolvedBodyFatTrackingEnabled
                      )
                    }
                    className="inline-flex items-center rounded-full focus-ring pressable-inline"
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                        resolvedBodyFatTrackingEnabled
                          ? 'bg-accent-emerald border-accent-emerald/70'
                          : 'bg-surface-highlight border-border'
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          resolvedBodyFatTrackingEnabled
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </span>
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
                <button
                  type="button"
                  onClick={() => onHeightPickerClick?.()}
                  className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
                  aria-label="Open height picker"
                >
                  <span className="font-medium text-base">
                    {sanitizeHeight(resolvedUserData.height)} cm
                  </span>
                  <ChevronsUpDown size={16} className="text-muted shrink-0" />
                </button>
              </div>
            </div>

            <DailyActivitySection
              userData={resolvedUserData}
              bmr={resolvedBmr}
              onDailyActivityClick={onDailyActivityClick}
            />

            <div>
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="inline-flex items-center gap-1.5 text-foreground/80 text-sm rounded-md px-1 py-0.5">
                  <span>EPOC (Post-Exercise Burn)</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={epocEnabled}
                  aria-label="Toggle EPOC"
                  onClick={() => onChange('epocEnabled', !epocEnabled)}
                  className="inline-flex items-center rounded-full focus-ring pressable-inline"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                      epocEnabled
                        ? 'bg-accent-emerald border-accent-emerald/70'
                        : 'bg-surface-highlight border-border'
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        epocEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <p className="text-muted text-xs mb-2">
                Adds post-exercise oxygen consumption to TDEE and carries part
                of it into following days based on session time.
              </p>

              {epocEnabled && (
                <div className="mt-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-foreground text-sm font-medium leading-tight">
                        Carryover window
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        Higher values extend how long EPOC can spill into the
                        next day.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={epocCarryoverHours}
                      onChange={(event) =>
                        onChange(
                          'epocCarryoverHours',
                          Math.min(
                            Math.max(
                              Number.parseInt(event.target.value, 10) || 1,
                              1
                            ),
                            24
                          )
                        )
                      }
                      className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-sm text-foreground focus-ring"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenTefInfo?.()}
                  className="inline-flex items-center gap-1.5 text-foreground/80 text-sm md:hover:text-foreground transition-colors focus-ring rounded-md px-1 py-0.5 pressable-inline"
                >
                  <span>Smart TEF</span>
                  <Info size={14} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={resolvedUserData.smartTefEnabled}
                  aria-label="Toggle Smart TEF"
                  onClick={() =>
                    onChange(
                      'smartTefEnabled',
                      !resolvedUserData.smartTefEnabled
                    )
                  }
                  className="inline-flex items-center rounded-full focus-ring pressable-inline"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                      resolvedUserData.smartTefEnabled
                        ? 'bg-accent-emerald border-accent-emerald/70'
                        : 'bg-surface-highlight border-border'
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        resolvedUserData.smartTefEnabled
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <p className="text-muted text-xs mb-2">
                TEF (Thermic Effect of Food) is the energy cost of digesting and
                processing food. Smart TEF swaps a one-size-fits-all estimate
                for a macro-based version.
              </p>

              {resolvedUserData.smartTefEnabled && (
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-foreground text-sm font-medium leading-tight">
                          Show TEF burn in food modals
                        </p>
                        <p className="text-muted text-xs mt-0.5">
                          Displays TEF burn in manual food entry and portion
                          modals.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showFoodModalTefBurn}
                        aria-label="Toggle TEF burn in food modals"
                        onClick={() =>
                          onChange(
                            'smartTefFoodTefBurnEnabled',
                            !showFoodModalTefBurn
                          )
                        }
                        className="inline-flex items-center rounded-full focus-ring pressable-inline"
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                            showFoodModalTefBurn
                              ? 'bg-accent-emerald border-accent-emerald/70'
                              : 'bg-surface-highlight border-border'
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              showFoodModalTefBurn
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-foreground text-sm font-medium leading-tight">
                          Use target mode for quick estimates
                        </p>
                        <p className="text-muted text-xs mt-0.5">
                          Step-range estimates use macro targets instead of
                          today&apos;s logged macros.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useTargetQuickEstimates}
                        aria-label="Toggle target mode for quick estimates"
                        onClick={() => {
                          const nextUseTargetQuickEstimates =
                            !useTargetQuickEstimates;
                          onChange(
                            'smartTefQuickEstimatesTargetMode',
                            nextUseTargetQuickEstimates
                          );

                          if (!nextUseTargetQuickEstimates) {
                            onChange('smartTefLiveCardTargetMode', false);
                          }
                        }}
                        className="inline-flex items-center rounded-full focus-ring pressable-inline"
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                            useTargetQuickEstimates
                              ? 'bg-accent-emerald border-accent-emerald/70'
                              : 'bg-surface-highlight border-border'
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              useTargetQuickEstimates
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  {useTargetQuickEstimates && (
                    <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-foreground text-sm font-medium leading-tight">
                            Also use target mode for hero/live card
                          </p>
                          <p className="text-muted text-xs mt-0.5">
                            Live step card uses macro targets instead of
                            today&apos;s logged macros.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={useTargetLiveCard}
                          aria-label="Toggle target mode for hero/live card"
                          onClick={() =>
                            onChange(
                              'smartTefLiveCardTargetMode',
                              !useTargetLiveCard
                            )
                          }
                          className="inline-flex items-center rounded-full focus-ring pressable-inline"
                        >
                          <span
                            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                              useTargetLiveCard
                                ? 'bg-accent-emerald border-accent-emerald/70'
                                : 'bg-surface-highlight border-border'
                            }`}
                          >
                            <span
                              className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                useTargetLiveCard
                                  ? 'translate-x-6'
                                  : 'translate-x-1'
                              }`}
                            />
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenAdaptiveThermogenesisInfo?.()}
                  className="inline-flex items-center gap-1.5 text-foreground/80 text-sm md:hover:text-foreground transition-colors focus-ring rounded-md px-1 py-0.5 pressable-inline"
                >
                  <span>Adaptive Thermogenesis</span>
                  <Info size={14} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adaptiveThermogenesisEnabled}
                  aria-label="Toggle Adaptive Thermogenesis"
                  onClick={() =>
                    onChange(
                      'adaptiveThermogenesisEnabled',
                      !adaptiveThermogenesisEnabled
                    )
                  }
                  className="inline-flex items-center rounded-full focus-ring pressable-inline"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                      adaptiveThermogenesisEnabled
                        ? 'bg-accent-emerald border-accent-emerald/70'
                        : 'bg-surface-highlight border-border'
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        adaptiveThermogenesisEnabled
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <p className="text-muted text-xs">
                Adds a metabolic adaptation correction to TDEE. Crude mode uses
                time-in-goal stages, smart mode uses weight/intake trend signal.
              </p>

              {adaptiveThermogenesisEnabled && (
                <div className="mt-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-foreground text-sm font-medium leading-tight">
                        Use Smart mode
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        When off, Adaptive Thermogenesis uses Crude staged mode.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={adaptiveThermogenesisSmartMode}
                      aria-label="Toggle Adaptive Thermogenesis smart mode"
                      onClick={() =>
                        onChange(
                          'adaptiveThermogenesisSmartMode',
                          !adaptiveThermogenesisSmartMode
                        )
                      }
                      className="inline-flex items-center rounded-full focus-ring pressable-inline"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
                          adaptiveThermogenesisSmartMode
                            ? 'bg-accent-emerald border-accent-emerald/70'
                            : 'bg-surface-highlight border-border'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            adaptiveThermogenesisSmartMode
                              ? 'translate-x-6'
                              : 'translate-x-1'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </div>
              )}
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
