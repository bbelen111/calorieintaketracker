import React, { useCallback, useEffect, useMemo } from 'react';
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
} from '../../../../constants/activity/activityPresets';
import { ModalShell } from '../../common/ModalShell';
import {
  formatDateLabel,
  formatWeight,
} from '../../../../utils/measurements/weight';
import { formatBodyFat } from '../../../../utils/measurements/bodyFat';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  sanitizeAge,
  sanitizeHeight,
} from '../../../../utils/measurements/profile';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import { getAdaptiveThermogenesisSmartModeDataStatus } from '../../../../utils/calculations/adaptiveThermogenesis';

const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'amoled_dark', label: 'AMOLED', icon: Smartphone },
];

const defaultPresetKeys = { training: 'default', rest: 'default' };

const BUTTON_BASE_CLASS =
  'py-3 px-2 rounded-lg border-2 transition-all font-semibold flex items-center justify-center gap-2 focus-ring pressable-inline';
const BUTTON_INACTIVE_CLASS =
  'bg-surface-highlight border-border text-muted md:hover:border-muted/50';
const BUTTON_ACTIVE_PRIMARY_CLASS =
  'bg-primary border-primary text-primary-foreground md:hover:brightness-110';
const BUTTON_ACTIVE_BLUE_CLASS =
  'bg-primary border-primary text-primary-foreground md:hover:brightness-110';
const BUTTON_ACTIVE_INDIGO_CLASS =
  'bg-accent-indigo border-accent-indigo text-primary-foreground md:hover:brightness-110';

const clampInteger = (value, min, max, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(numericValue), min), max);
};

const resolveSettingsData = ({
  userData,
  bmr,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
}) => {
  const resolvedBodyFatTrackingEnabled =
    typeof bodyFatTrackingEnabled === 'boolean'
      ? bodyFatTrackingEnabled
      : userData.bodyFatTrackingEnabled;

  const useTargetQuickEstimates =
    userData.smartTefQuickEstimatesTargetMode ?? true;
  const showFoodModalTefBurn = userData.smartTefFoodTefBurnEnabled ?? true;
  const useTargetLiveCard =
    useTargetQuickEstimates && (userData.smartTefLiveCardTargetMode ?? false);

  return {
    resolvedUserData: userData,
    resolvedBmr: bmr,
    resolvedWeightEntries: weightEntries,
    resolvedBodyFatEntries: bodyFatEntries,
    resolvedBodyFatTrackingEnabled,
    useTargetQuickEstimates,
    showFoodModalTefBurn,
    useTargetLiveCard,
    adaptiveThermogenesisEnabled:
      userData.adaptiveThermogenesisEnabled ?? false,
    adaptiveThermogenesisSmartMode:
      userData.adaptiveThermogenesisSmartMode ?? false,
    adaptiveThermogenesisSmoothingEnabled:
      userData.adaptiveThermogenesisSmoothingEnabled ?? false,
    adaptiveThermogenesisSmoothingMethod:
      userData.adaptiveThermogenesisSmoothingMethod === 'sma' ? 'sma' : 'ema',
    adaptiveThermogenesisSmoothingWindowDays: clampInteger(
      userData.adaptiveThermogenesisSmoothingWindowDays,
      3,
      14,
      7
    ),
    epocEnabled: userData.epocEnabled ?? true,
    epocCarryoverHours: clampInteger(userData.epocCarryoverHours, 1, 24, 6),
  };
};

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
  onOpenEpocInfo,
  onEpocWindowPickerClick,
  onCancel,
  onSave,
  actions,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      bmr: state.bmr,
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
      dailySnapshots: state.dailySnapshots ?? {},
    }),
    shallow
  );

  const resolvedUserDataSource = userData ?? store.userData;
  const resolvedBmrSource = bmr ?? store.bmr;
  const resolvedWeightEntriesSource = weightEntries ?? store.weightEntries;
  const resolvedBodyFatEntriesSource = bodyFatEntries ?? store.bodyFatEntries;
  const resolvedDailySnapshotsSource =
    resolvedUserDataSource?.dailySnapshots ?? store.dailySnapshots;

  const resolvedActions = useMemo(
    () => ({
      onFieldChange: actions?.onFieldChange ?? onChange,
      openers: actions?.openers ?? {
        agePicker: onAgePickerClick,
        heightPicker: onHeightPickerClick,
        manageWeight: onManageWeightClick,
        manageBodyFat: onManageBodyFatClick,
        dailyActivity: onDailyActivityClick,
        epocWindowPicker: onEpocWindowPickerClick,
      },
      info: actions?.info ?? {
        tef: onOpenTefInfo,
        adaptiveThermogenesis: onOpenAdaptiveThermogenesisInfo,
        epoc: onOpenEpocInfo,
      },
      lifecycle: actions?.lifecycle ?? {
        cancel: onCancel,
        save: onSave,
      },
    }),
    [
      actions?.info,
      actions?.lifecycle,
      actions?.onFieldChange,
      actions?.openers,
      onAgePickerClick,
      onCancel,
      onChange,
      onDailyActivityClick,
      onEpocWindowPickerClick,
      onHeightPickerClick,
      onManageBodyFatClick,
      onManageWeightClick,
      onOpenAdaptiveThermogenesisInfo,
      onOpenEpocInfo,
      onOpenTefInfo,
      onSave,
    ]
  );

  const {
    resolvedUserData,
    resolvedBmr,
    resolvedWeightEntries,
    resolvedBodyFatEntries,
    resolvedBodyFatTrackingEnabled,
    useTargetQuickEstimates,
    showFoodModalTefBurn,
    useTargetLiveCard,
    adaptiveThermogenesisEnabled,
    adaptiveThermogenesisSmartMode,
    adaptiveThermogenesisSmoothingEnabled,
    adaptiveThermogenesisSmoothingMethod,
    adaptiveThermogenesisSmoothingWindowDays,
    epocEnabled,
    epocCarryoverHours,
  } = useMemo(
    () =>
      resolveSettingsData({
        userData: resolvedUserDataSource,
        bmr: resolvedBmrSource,
        weightEntries: resolvedWeightEntriesSource,
        bodyFatEntries: resolvedBodyFatEntriesSource,
        bodyFatTrackingEnabled,
      }),
    [
      bodyFatTrackingEnabled,
      resolvedBodyFatEntriesSource,
      resolvedBmrSource,
      resolvedUserDataSource,
      resolvedWeightEntriesSource,
    ]
  );

  const adaptiveThermogenesisSmartModeDataStatus = useMemo(
    () =>
      getAdaptiveThermogenesisSmartModeDataStatus({
        dateKey: getTodayDateKey(),
        dailySnapshots: resolvedDailySnapshotsSource,
        weightEntries: resolvedWeightEntries,
      }),
    [resolvedDailySnapshotsSource, resolvedWeightEntries]
  );

  const adaptiveThermogenesisSmartModeAvailable =
    adaptiveThermogenesisSmartModeDataStatus.isSufficient;
  const handleFieldChange = resolvedActions.onFieldChange;

  useEffect(() => {
    if (
      adaptiveThermogenesisSmartMode &&
      !adaptiveThermogenesisSmartModeAvailable
    ) {
      handleFieldChange?.('adaptiveThermogenesisSmartMode', false);
    }
  }, [
    adaptiveThermogenesisSmartMode,
    adaptiveThermogenesisSmartModeAvailable,
    handleFieldChange,
  ]);

  const handleCancel = useCallback(() => {
    resolvedActions.lifecycle.cancel?.();
  }, [resolvedActions.lifecycle]);

  const handleSave = useCallback(() => {
    resolvedActions.lifecycle.save?.();
  }, [resolvedActions.lifecycle]);

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
    <FullscreenModalFrame
      isOpen={isOpen}
      isClosing={isClosing}
      onBack={handleCancel}
      onClose={handleCancel}
      title="Settings"
      footer={
        <SettingsActionFooter onCancel={handleCancel} onSave={handleSave} />
      }
    >
      <div className="p-4 space-y-4 md:space-y-6">
        <ProfileSection
          userData={resolvedUserData}
          displayedWeight={displayedWeight}
          lastLoggedLabel={lastLoggedLabel}
          displayedBodyFat={displayedBodyFat}
          bodyFatLoggedLabel={bodyFatLoggedLabel}
          bodyFatTrackingEnabled={resolvedBodyFatTrackingEnabled}
          onFieldChange={handleFieldChange}
          onOpenAgePicker={resolvedActions.openers.agePicker}
          onOpenHeightPicker={resolvedActions.openers.heightPicker}
          onOpenWeightManager={resolvedActions.openers.manageWeight}
          onOpenBodyFatManager={resolvedActions.openers.manageBodyFat}
        />

        <DailyActivitySection
          userData={resolvedUserData}
          bmr={resolvedBmr}
          onDailyActivityClick={resolvedActions.openers.dailyActivity}
        />

        <EpocSection
          epocEnabled={epocEnabled}
          epocCarryoverHours={epocCarryoverHours}
          onOpenInfo={resolvedActions.info.epoc}
          onOpenWindowPicker={resolvedActions.openers.epocWindowPicker}
          onFieldChange={handleFieldChange}
        />

        <SmartTefSection
          userData={resolvedUserData}
          useTargetQuickEstimates={useTargetQuickEstimates}
          showFoodModalTefBurn={showFoodModalTefBurn}
          useTargetLiveCard={useTargetLiveCard}
          onOpenInfo={resolvedActions.info.tef}
          onFieldChange={handleFieldChange}
        />

        <AdaptiveThermogenesisSection
          adaptiveThermogenesisEnabled={adaptiveThermogenesisEnabled}
          adaptiveThermogenesisSmartMode={adaptiveThermogenesisSmartMode}
          adaptiveThermogenesisSmartModeAvailable={
            adaptiveThermogenesisSmartModeAvailable
          }
          adaptiveThermogenesisSmartModeDataStatus={
            adaptiveThermogenesisSmartModeDataStatus
          }
          adaptiveThermogenesisSmoothingEnabled={
            adaptiveThermogenesisSmoothingEnabled
          }
          adaptiveThermogenesisSmoothingMethod={
            adaptiveThermogenesisSmoothingMethod
          }
          adaptiveThermogenesisSmoothingWindowDays={
            adaptiveThermogenesisSmoothingWindowDays
          }
          onOpenInfo={resolvedActions.info.adaptiveThermogenesis}
          onFieldChange={handleFieldChange}
        />
      </div>
    </FullscreenModalFrame>
  );
};
const FullscreenModalFrame = ({
  isOpen,
  isClosing,
  onClose,
  onBack,
  title,
  children,
  footer,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    onClose={onClose}
    fullHeight
    overlayClassName="fixed inset-0 bg-surface/70 !p-0 !flex-none !items-stretch !justify-stretch"
    contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none !max-h-none flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
  >
    <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
        >
          <ChevronLeft size={24} />
        </button>
        <h3 className="text-foreground font-bold text-xl md:text-2xl">
          {title}
        </h3>
      </div>
    </div>

    <div className="flex-1 bg-surface border-t border-border flex flex-col">
      <div className="flex-1 overflow-y-auto">{children}</div>
      {footer}
    </div>
  </ModalShell>
);

const SettingsActionFooter = ({ onCancel, onSave }) => (
  <div className="flex gap-2 md:gap-3 p-4 border-t border-border bg-background/60">
    <button
      onClick={onCancel}
      type="button"
      className="flex-1 bg-surface-highlight text-foreground px-4 md:px-6 py-3 md:py-2 rounded-lg transition-all press-feedback focus-ring font-medium"
    >
      Cancel
    </button>
    <button
      onClick={onSave}
      type="button"
      className="flex-1 bg-primary text-primary-foreground px-4 md:px-6 py-3 md:py-2 rounded-lg flex items-center justify-center gap-2 transition-all press-feedback focus-ring md:hover:brightness-110 font-medium"
    >
      <Save size={20} />
      Save
    </button>
  </div>
);

const SettingLabel = ({ children }) => (
  <label className="text-foreground/80 text-sm block mb-2">{children}</label>
);

const PickerButton = ({ onClick, ariaLabel, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="w-full bg-surface-highlight text-foreground px-4 py-3 rounded-lg border border-border transition-all text-left focus-ring md:hover:border-muted/50 flex items-center justify-between gap-3 pressable-inline"
  >
    <span className="font-medium text-base">{children}</span>
    <ChevronsUpDown size={16} className="text-muted shrink-0" />
  </button>
);

const BinarySwitch = ({ checked, onClick, ariaLabel, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    aria-disabled={disabled}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center rounded-full ${
      disabled ? 'cursor-not-allowed opacity-60' : 'focus-ring pressable-inline'
    }`}
  >
    <span
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all ${
        checked
          ? 'bg-accent-emerald border-accent-emerald/70'
          : 'bg-surface-highlight border-border'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </span>
  </button>
);

const SegmentedButton = ({ active, activeClassName, children, ...props }) => (
  <button
    type="button"
    className={`${BUTTON_BASE_CLASS} ${active ? activeClassName : BUTTON_INACTIVE_CLASS}`}
    {...props}
  >
    {children}
  </button>
);

const InfoHeaderWithToggle = ({
  title,
  onInfoClick,
  checked,
  onToggle,
  ariaLabel,
}) => (
  <div className="flex items-center justify-between mb-2 gap-3">
    <button
      type="button"
      onClick={onInfoClick}
      className="inline-flex items-center gap-1.5 text-foreground/80 text-sm md:hover:text-foreground transition-colors focus-ring rounded-md px-1 pressable-inline"
    >
      <span>{title}</span>
      <Info size={14} />
    </button>
    <BinarySwitch checked={checked} onClick={onToggle} ariaLabel={ariaLabel} />
  </div>
);

const SettingToggleCard = ({
  title,
  description,
  checked,
  onToggle,
  ariaLabel,
}) => (
  <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-foreground text-sm font-medium leading-tight">
          {title}
        </p>
        <p className="text-muted text-xs mt-0.5">{description}</p>
      </div>
      <BinarySwitch
        checked={checked}
        onClick={onToggle}
        ariaLabel={ariaLabel}
      />
    </div>
  </div>
);

const ProfileSection = ({
  userData,
  displayedWeight,
  lastLoggedLabel,
  displayedBodyFat,
  bodyFatLoggedLabel,
  bodyFatTrackingEnabled,
  onFieldChange,
  onOpenAgePicker,
  onOpenHeightPicker,
  onOpenWeightManager,
  onOpenBodyFatManager,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
    <div>
      <SettingLabel>Age</SettingLabel>
      <PickerButton
        onClick={() => onOpenAgePicker?.()}
        ariaLabel="Open age picker"
      >
        {sanitizeAge(userData.age)} years
      </PickerButton>
    </div>

    <div>
      <SettingLabel>Gender</SettingLabel>
      <div className="grid grid-cols-2 gap-2">
        <SegmentedButton
          active={userData.gender === 'male'}
          activeClassName={BUTTON_ACTIVE_BLUE_CLASS}
          onClick={() => onFieldChange?.('gender', 'male')}
        >
          <Mars size={16} />
          <span>Male</span>
        </SegmentedButton>
        <SegmentedButton
          active={userData.gender === 'female'}
          activeClassName={BUTTON_ACTIVE_INDIGO_CLASS}
          onClick={() => onFieldChange?.('gender', 'female')}
        >
          <Venus size={16} />
          <span>Female</span>
        </SegmentedButton>
      </div>
    </div>

    <div>
      <SettingLabel>Theme</SettingLabel>
      <div className="grid grid-cols-2 gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <SegmentedButton
            key={value}
            active={userData.theme === value}
            activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
            onClick={() => onFieldChange?.('theme', value)}
          >
            <Icon size={16} />
            <span className="text-sm">{label}</span>
          </SegmentedButton>
        ))}
      </div>
    </div>

    <div>
      <SettingLabel>Weight (kg)</SettingLabel>
      <button
        type="button"
        onClick={() => onOpenWeightManager?.()}
        className="w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 border-primary/70 bg-primary text-primary-foreground transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left focus-ring md:hover:brightness-110 font-semibold"
      >
        <span className="font-semibold text-sm md:text-base">
          {displayedWeight !== '—' ? `${displayedWeight}kg` : '—'}
        </span>
        <span className="text-xs md:text-sm opacity-90">{lastLoggedLabel}</span>
        <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
          Tap to manage
        </span>
      </button>
    </div>

    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-foreground/80 text-sm">Body Fat (%)</label>
        <BinarySwitch
          checked={bodyFatTrackingEnabled}
          ariaLabel="Toggle body fat tracking"
          onClick={() =>
            onFieldChange?.('bodyFatTrackingEnabled', !bodyFatTrackingEnabled)
          }
        />
      </div>
      <button
        type="button"
        onClick={() => onOpenBodyFatManager?.()}
        disabled={!bodyFatTrackingEnabled}
        className={`w-full px-3 py-2 md:px-4 md:py-3 rounded-lg border-2 transition-all press-feedback flex flex-wrap items-center gap-x-3 gap-y-1 text-left font-semibold focus-ring ${
          bodyFatTrackingEnabled
            ? 'border-primary/70 bg-primary text-primary-foreground md:hover:brightness-110'
            : 'bg-surface-highlight border-border text-muted cursor-not-allowed'
        }`}
      >
        <span className="font-semibold text-sm md:text-base">
          {displayedBodyFat !== '—' ? `${displayedBodyFat}%` : '—'}
        </span>
        <span className="text-xs md:text-sm opacity-90">
          {bodyFatTrackingEnabled ? bodyFatLoggedLabel : 'Tracking disabled'}
        </span>
        <span className="text-[11px] opacity-80 ml-auto whitespace-nowrap">
          {bodyFatTrackingEnabled ? 'Tap to manage' : 'Enable to use'}
        </span>
      </button>
    </div>

    <div>
      <SettingLabel>Height (cm)</SettingLabel>
      <PickerButton
        onClick={() => onOpenHeightPicker?.()}
        ariaLabel="Open height picker"
      >
        {sanitizeHeight(userData.height)} cm
      </PickerButton>
    </div>
  </div>
);

const EpocSection = ({
  epocEnabled,
  epocCarryoverHours,
  onOpenInfo,
  onOpenWindowPicker,
  onFieldChange,
}) => (
  <div>
    <InfoHeaderWithToggle
      title="EPOC (Post-Exercise Burn)"
      onInfoClick={onOpenInfo}
      checked={epocEnabled}
      onToggle={() => onFieldChange?.('epocEnabled', !epocEnabled)}
      ariaLabel="Toggle EPOC"
    />

    <p className="text-muted text-xs mb-2">
      Adds post-exercise oxygen consumption to TDEE and carries part of it into
      following days based on session time.
    </p>

    {epocEnabled && (
      <div className="mt-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-foreground text-sm font-medium leading-tight">
              Carryover window
            </p>
            <p className="text-muted text-xs mt-0.5">
              Higher values extend how long EPOC can spill into the next day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenWindowPicker?.()}
            className="bg-surface-highlight text-foreground px-3 py-1 rounded-md border border-border transition-all text-right focus-ring md:hover:border-muted/50 flex items-center justify-center gap-2 pressable-inline font-medium text-sm"
            aria-label="Open carryover window picker"
          >
            <span>{epocCarryoverHours}h</span>
            <ChevronsUpDown size={14} className="text-muted shrink-0" />
          </button>
        </div>
      </div>
    )}
  </div>
);

const SmartTefSection = ({
  userData,
  useTargetQuickEstimates,
  showFoodModalTefBurn,
  useTargetLiveCard,
  onOpenInfo,
  onFieldChange,
}) => {
  const smartTefToggles = [
    {
      key: 'food-modal-tef',
      title: 'Show TEF burn in food modals',
      description: 'Displays TEF burn in manual food entry and portion modals.',
      checked: showFoodModalTefBurn,
      onToggle: () =>
        onFieldChange?.('smartTefFoodTefBurnEnabled', !showFoodModalTefBurn),
      ariaLabel: 'Toggle TEF burn in food modals',
    },
    {
      key: 'quick-estimates-target-mode',
      title: 'Use target mode for quick estimates',
      description:
        "Step-range estimates use macro targets instead of today's logged macros.",
      checked: useTargetQuickEstimates,
      onToggle: () => {
        const nextUseTargetQuickEstimates = !useTargetQuickEstimates;
        onFieldChange?.(
          'smartTefQuickEstimatesTargetMode',
          nextUseTargetQuickEstimates
        );

        if (!nextUseTargetQuickEstimates) {
          onFieldChange?.('smartTefLiveCardTargetMode', false);
        }
      },
      ariaLabel: 'Toggle target mode for quick estimates',
    },
  ];

  return (
    <div>
      <InfoHeaderWithToggle
        title="Smart TEF"
        onInfoClick={onOpenInfo}
        checked={userData.smartTefEnabled}
        onToggle={() =>
          onFieldChange?.('smartTefEnabled', !userData.smartTefEnabled)
        }
        ariaLabel="Toggle Smart TEF"
      />

      <p className="text-muted text-xs mb-2">
        TEF (Thermic Effect of Food) is the energy cost of digesting and
        processing food. Smart TEF swaps a one-size-fits-all estimate for a
        macro-based version.
      </p>

      {userData.smartTefEnabled && (
        <div className="mt-3 space-y-2">
          {smartTefToggles.map((toggle) => (
            <SettingToggleCard key={toggle.key} {...toggle} />
          ))}

          {useTargetQuickEstimates && (
            <SettingToggleCard
              title="Also use target mode for hero/live card"
              description="Live step card uses macro targets instead of today's logged macros."
              checked={useTargetLiveCard}
              onToggle={() =>
                onFieldChange?.(
                  'smartTefLiveCardTargetMode',
                  !useTargetLiveCard
                )
              }
              ariaLabel="Toggle target mode for hero/live card"
            />
          )}
        </div>
      )}
    </div>
  );
};
const AdaptiveThermogenesisSection = ({
  adaptiveThermogenesisEnabled,
  adaptiveThermogenesisSmartMode,
  adaptiveThermogenesisSmartModeAvailable,
  adaptiveThermogenesisSmartModeDataStatus,
  adaptiveThermogenesisSmoothingEnabled,
  adaptiveThermogenesisSmoothingMethod,
  adaptiveThermogenesisSmoothingWindowDays,
  onOpenInfo,
  onFieldChange,
}) => {
  const resolvedSmartModeEnabled =
    adaptiveThermogenesisSmartMode && adaptiveThermogenesisSmartModeAvailable;
  const lockMessage = adaptiveThermogenesisSmartModeAvailable
    ? null
    : `Requires ${adaptiveThermogenesisSmartModeDataStatus.minValidDays} intake days and ${adaptiveThermogenesisSmartModeDataStatus.minWeightEntries} weight entries in the last ${adaptiveThermogenesisSmartModeDataStatus.windowDays} days.`;

  return (
    <div>
      <InfoHeaderWithToggle
        title="Adaptive Thermogenesis"
        onInfoClick={onOpenInfo}
        checked={adaptiveThermogenesisEnabled}
        onToggle={() =>
          onFieldChange?.(
            'adaptiveThermogenesisEnabled',
            !adaptiveThermogenesisEnabled
          )
        }
        ariaLabel="Toggle Adaptive Thermogenesis"
      />

      <p className="text-muted text-xs">
        Adds a metabolic adaptation correction to TDEE. Crude mode uses
        time-in-goal stages, smart mode uses weight/intake trend signal.
      </p>

      {adaptiveThermogenesisEnabled && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2.5 ${
            adaptiveThermogenesisSmartModeAvailable
              ? 'border-border bg-surface-highlight/40'
              : 'border-border/70 bg-surface-highlight/20'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p
                className={`text-sm font-medium leading-tight ${
                  adaptiveThermogenesisSmartModeAvailable
                    ? 'text-foreground'
                    : 'text-muted'
                }`}
              >
                Use Smart mode
              </p>
              <p className="text-muted text-xs mt-0.5">
                {adaptiveThermogenesisSmartModeAvailable
                  ? 'When off, Adaptive Thermogenesis uses Crude staged mode.'
                  : lockMessage}
              </p>
            </div>
            <BinarySwitch
              checked={resolvedSmartModeEnabled}
              ariaLabel="Toggle Adaptive Thermogenesis smart mode"
              disabled={!adaptiveThermogenesisSmartModeAvailable}
              onClick={() =>
                onFieldChange?.(
                  'adaptiveThermogenesisSmartMode',
                  !resolvedSmartModeEnabled
                )
              }
            />
          </div>
        </div>
      )}

      {adaptiveThermogenesisEnabled && resolvedSmartModeEnabled && (
        <div className="mt-2 space-y-2">
          <SettingToggleCard
            title="Smooth weight signal"
            description="Reduces day-to-day noise before trend slope is calculated."
            checked={adaptiveThermogenesisSmoothingEnabled}
            onToggle={() =>
              onFieldChange?.(
                'adaptiveThermogenesisSmoothingEnabled',
                !adaptiveThermogenesisSmoothingEnabled
              )
            }
            ariaLabel="Toggle adaptive thermogenesis smoothing"
          />

          {adaptiveThermogenesisSmoothingEnabled && (
            <div className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <SegmentedButton
                  active={adaptiveThermogenesisSmoothingMethod === 'ema'}
                  activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
                  onClick={() =>
                    onFieldChange?.(
                      'adaptiveThermogenesisSmoothingMethod',
                      'ema'
                    )
                  }
                >
                  <span>EMA</span>
                  <span className="text-xs opacity-80 font-normal">
                    Exponential
                  </span>
                </SegmentedButton>
                <SegmentedButton
                  active={adaptiveThermogenesisSmoothingMethod === 'sma'}
                  activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
                  onClick={() =>
                    onFieldChange?.(
                      'adaptiveThermogenesisSmoothingMethod',
                      'sma'
                    )
                  }
                >
                  <span>SMA</span>
                  <span className="text-xs opacity-80 font-normal">Simple</span>
                </SegmentedButton>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Window</span>
                  <span>{adaptiveThermogenesisSmoothingWindowDays} days</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={14}
                  step={1}
                  value={adaptiveThermogenesisSmoothingWindowDays}
                  onChange={(event) =>
                    onFieldChange?.(
                      'adaptiveThermogenesisSmoothingWindowDays',
                      Number(event.target.value)
                    )
                  }
                  style={{
                    '--value': `${((adaptiveThermogenesisSmoothingWindowDays - 3) / 11) * 100}%`,
                  }}
                  className="w-full cursor-pointer transition-all"
                  aria-label="Adaptive thermogenesis smoothing window"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
      <SettingLabel>Daily NEAT (Non-Exercise Activity)</SettingLabel>
      <button
        onClick={onDailyActivityClick}
        type="button"
        className="relative w-full text-left p-3 md:p-4 rounded-lg border-2 border-accent-indigo bg-accent-indigo text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110"
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
