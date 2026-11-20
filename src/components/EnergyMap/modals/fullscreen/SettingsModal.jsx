import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronsUpDown,
  Mars,
  Venus,
  ChevronLeft,
  ChevronRight,
  Info,
  UserRound,
  Palette,
  Activity,
  SlidersHorizontal,
  Type,
  Rows2,
  Rows3,
  Rows4,
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
import {
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  normalizeFontScaleKey,
  normalizeUiDensityKey,
} from '../../../../constants/appearance/uiScale';
import { getAdaptiveThermogenesisSmartModeDataStatus } from '../../../../utils/calculations/adaptiveThermogenesis';

// `swatchClass` is the CSS class that carries the theme's variables, so the
// preview swatch below resolves its colours from the real theme definition in
// `index.css` instead of a hardcoded copy. `theme-dark` is a swatch-only alias
// of the `:root` default (the app never puts it on <body>); `auto` previews as
// a dark/light split.
const THEME_OPTIONS = [
  { value: 'auto', label: 'Auto', swatchClass: null },
  { value: 'dark', label: 'Dark', swatchClass: 'theme-dark' },
  { value: 'light', label: 'Light', swatchClass: 'theme-light' },
  { value: 'amoled_dark', label: 'Darker', swatchClass: 'theme-amoled-dark' },
  { value: 'forest', label: 'Forest', swatchClass: 'theme-forest' },
  { value: 'dawn', label: 'Dawn', swatchClass: 'theme-dawn' },
  { value: 'dusk', label: 'Dusk', swatchClass: 'theme-dusk' },
  { value: 'midnight', label: 'Midnight', swatchClass: 'theme-midnight' },
];

// One miniature app: page background, a surface card and the primary accent.
const ThemeSwatchFace = ({ themeClass, className = '' }) => (
  <span
    className={`${themeClass} relative block overflow-hidden bg-background ${className}`}
  >
    <span className="absolute inset-x-0 bottom-0 h-1/2 bg-surface" />
    <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
  </span>
);

const ThemeSwatch = ({ swatchClass }) => (
  <span
    aria-hidden="true"
    className="relative flex h-6 w-9 shrink-0 overflow-hidden rounded-md border border-foreground/25 shadow-xs"
  >
    {swatchClass ? (
      <ThemeSwatchFace themeClass={swatchClass} className="h-full w-full" />
    ) : (
      <>
        <ThemeSwatchFace themeClass="theme-dark" className="h-full w-1/2" />
        <ThemeSwatchFace themeClass="theme-light" className="h-full w-1/2" />
      </>
    )}
  </span>
);

const SETTINGS_PAGES = [
  {
    id: 'profile',
    title: 'Profile & Measurements',
    icon: UserRound,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: Palette,
  },
  {
    id: 'activity',
    title: 'Daily Activity',
    icon: Activity,
  },
  {
    id: 'adjustments',
    title: 'Calorie Adjustments',
    icon: SlidersHorizontal,
  },
];

const defaultPresetKeys = { training: 'default', rest: 'default' };

// Icons for the display-scale rows. Presentation only - the options themselves
// (keys, labels, multipliers) live in constants/appearance/uiScale.js.
//  - Text size: the same glyph drawn progressively larger (px, so it does not move
//    with the setting it illustrates).
//  - Density: a stack of rows - more, tighter rows = more compact.
const FONT_SCALE_ICON_PX = { small: 13, default: 16, large: 19, xlarge: 22 };
const DENSITY_ICONS = {
  compact: Rows4,
  default: Rows3,
  comfortable: Rows2,
};

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
  activePage = 'home',
  onNavigate,
  onRequestBack,
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
      },
      navigation: actions?.navigation ?? {
        activePage,
        navigate: onNavigate,
        back: onRequestBack,
      },
    }),
    [
      actions?.info,
      actions?.lifecycle,
      actions?.navigation,
      actions?.onFieldChange,
      actions?.openers,
      activePage,
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
      onNavigate,
      onRequestBack,
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

  const handleBack = useCallback(() => {
    if (typeof resolvedActions.navigation.back === 'function') {
      resolvedActions.navigation.back();
      return;
    }
    handleCancel();
  }, [handleCancel, resolvedActions.navigation]);

  const handleOpenPage = useCallback(
    (page) => resolvedActions.navigation.navigate?.(page),
    [resolvedActions.navigation]
  );

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

  // The hub slides in from the left only when the user came BACK to it from a
  // page - never on the modal's own first open (the shell already animates that).
  // Derived during render (the app's retention pattern) rather than in an effect:
  // flip on the first navigation into a page, reset once the modal is closed.
  const [hasNavigated, setHasNavigated] = useState(false);
  const isOnHub = resolvedActions.navigation.activePage === 'home';
  if (!isOpen && hasNavigated) {
    setHasNavigated(false);
  } else if (isOpen && !isOnHub && !hasNavigated) {
    setHasNavigated(true);
  }

  return (
    <FullscreenModalFrame
      isOpen={isOpen}
      isClosing={isClosing}
      onBack={handleBack}
      title={
        SETTINGS_PAGES.find(
          (page) => page.id === resolvedActions.navigation.activePage
        )?.title ?? 'Settings'
      }
    >
      {resolvedActions.navigation.activePage === 'home' ? (
        <SettingsHome onOpenPage={handleOpenPage} animateIn={hasNavigated} />
      ) : (
        <SettingsPageContent
          page={resolvedActions.navigation.activePage}
          userData={resolvedUserData}
          bmr={resolvedBmr}
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
          onDailyActivityClick={resolvedActions.openers.dailyActivity}
          onOpenEpocWindowPicker={resolvedActions.openers.epocWindowPicker}
          onOpenTefInfo={resolvedActions.info.tef}
          onOpenAdaptiveThermogenesisInfo={
            resolvedActions.info.adaptiveThermogenesis
          }
          onOpenEpocInfo={resolvedActions.info.epoc}
          epocEnabled={epocEnabled}
          epocCarryoverHours={epocCarryoverHours}
          useTargetQuickEstimates={useTargetQuickEstimates}
          showFoodModalTefBurn={showFoodModalTefBurn}
          useTargetLiveCard={useTargetLiveCard}
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
        />
      )}
    </FullscreenModalFrame>
  );
};

const SettingsHome = ({ onOpenPage, animateIn = false }) => (
  <nav
    aria-label="Settings categories"
    className={`mx-auto w-full max-w-3xl space-y-2 p-4 md:p-6 ${
      animateIn ? 'settings-hub-enter' : ''
    }`}
  >
    {SETTINGS_PAGES.map(({ id, title, icon: Icon }) => (
      <button
        key={id}
        type="button"
        onClick={() => onOpenPage(id)}
        className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface-highlight/40 px-3 py-2.5 text-left shadow-sm transition-all pressable-card focus-ring md:hover:border-muted/50 md:hover:bg-surface-highlight/70"
        aria-label={`Open ${title}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 ring-1 ring-accent-blue/20 transition-transform duration-200 group-active:scale-90 md:group-hover:scale-105">
          <Icon
            size={19}
            className="shrink-0 text-accent-blue"
            aria-hidden="true"
          />
        </span>
        <span className="flex-1 font-medium text-foreground">{title}</span>
        <ChevronRight
          size={18}
          className="shrink-0 text-muted transition-transform group-active:translate-x-0.5 md:group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>
    ))}
  </nav>
);

const SettingsPageContent = ({
  page,
  userData,
  bmr,
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
  onDailyActivityClick,
  onOpenEpocWindowPicker,
  onOpenTefInfo,
  onOpenAdaptiveThermogenesisInfo,
  onOpenEpocInfo,
  epocEnabled,
  epocCarryoverHours,
  useTargetQuickEstimates,
  showFoodModalTefBurn,
  useTargetLiveCard,
  adaptiveThermogenesisEnabled,
  adaptiveThermogenesisSmartMode,
  adaptiveThermogenesisSmartModeAvailable,
  adaptiveThermogenesisSmartModeDataStatus,
  adaptiveThermogenesisSmoothingEnabled,
  adaptiveThermogenesisSmoothingMethod,
  adaptiveThermogenesisSmoothingWindowDays,
}) => (
  <div
    key={page}
    className="settings-page-enter mx-auto w-full max-w-3xl p-4 pb-8 md:p-8"
  >
    {page === 'profile' && (
      <ProfileSection
        userData={userData}
        displayedWeight={displayedWeight}
        lastLoggedLabel={lastLoggedLabel}
        displayedBodyFat={displayedBodyFat}
        bodyFatLoggedLabel={bodyFatLoggedLabel}
        bodyFatTrackingEnabled={bodyFatTrackingEnabled}
        onFieldChange={onFieldChange}
        onOpenAgePicker={onOpenAgePicker}
        onOpenHeightPicker={onOpenHeightPicker}
        onOpenWeightManager={onOpenWeightManager}
        onOpenBodyFatManager={onOpenBodyFatManager}
      />
    )}

    {page === 'appearance' && (
      <AppearanceSection userData={userData} onFieldChange={onFieldChange} />
    )}

    {page === 'activity' && (
      <DailyActivitySection
        userData={userData}
        bmr={bmr}
        onDailyActivityClick={onDailyActivityClick}
      />
    )}

    {page === 'adjustments' && (
      <div className="space-y-7 divide-y divide-border/70">
        <EpocSection
          epocEnabled={epocEnabled}
          epocCarryoverHours={epocCarryoverHours}
          onOpenInfo={onOpenEpocInfo}
          onOpenWindowPicker={onOpenEpocWindowPicker}
          onFieldChange={onFieldChange}
        />

        <div className="pt-6">
          <SmartTefSection
            userData={userData}
            useTargetQuickEstimates={useTargetQuickEstimates}
            showFoodModalTefBurn={showFoodModalTefBurn}
            useTargetLiveCard={useTargetLiveCard}
            onOpenInfo={onOpenTefInfo}
            onFieldChange={onFieldChange}
          />
        </div>

        <div className="pt-6">
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
            onOpenInfo={onOpenAdaptiveThermogenesisInfo}
            onFieldChange={onFieldChange}
          />
        </div>
      </div>
    )}
  </div>
);

const FullscreenModalFrame = ({
  isOpen,
  isClosing,
  onBack,
  title,
  children,
}) => (
  <ModalShell
    isOpen={isOpen}
    isClosing={isClosing}
    onClose={onBack}
    fullHeight
    overlayClassName="fixed inset-0 bg-surface/70 p-0! flex-none! items-stretch! justify-stretch!"
    contentClassName="fixed inset-0 w-screen h-screen p-0 bg-background rounded-none border-none max-h-none! flex flex-col pt-[env(safe-area-inset-top)] keyboard-bottom-inset pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
  >
    <header className="flex items-center justify-between px-4 py-3 fullscreen-header bg-background border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="text-muted md:hover:text-foreground transition-all pressable-inline focus-ring"
        >
          <ChevronLeft size={24} />
        </button>
        {/* Re-keyed on the title: a short fade/rise when hub <-> page changes. */}
        <h3
          key={title}
          className="header-stat-in text-foreground font-bold text-xl"
        >
          {title}
        </h3>
      </div>
    </header>

    <div className="flex-1 fullscreen-body bg-surface border-t border-border overflow-y-auto flex flex-col">
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  </ModalShell>
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ${
        checked
          ? 'bg-accent-emerald border-accent-emerald/70 shadow-[0_0_10px_rgb(var(--accent-emerald)/0.4)]'
          : 'bg-surface-highlight border-border shadow-none'
      }`}
    >
      {/* Springy thumb: a slight overshoot on the slide makes the flip feel
          physical instead of a linear glide. */}
      <span
        className={`h-4 w-4 rounded-full bg-primary-foreground shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </span>
  </button>
);

const SegmentedButton = ({ active, activeClassName, children, ...props }) => {
  // The selection "pop" must play when the user CHANGES the selection, not on
  // mount (a page opening would otherwise pulse every already-selected button).
  // Tracked during render, not in an effect: remember the last `active` and arm
  // the pop only on a false -> true flip.
  const [lastActive, setLastActive] = useState(active);
  const [shouldPop, setShouldPop] = useState(false);
  if (lastActive !== active) {
    setLastActive(active);
    setShouldPop(active);
  }

  return (
    <button
      type="button"
      className={`${BUTTON_BASE_CLASS} ${
        active
          ? `${activeClassName} ${shouldPop ? 'settings-select-pop' : ''}`
          : BUTTON_INACTIVE_CLASS
      }`}
      {...props}
    >
      {children}
    </button>
  );
};

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

const AppearanceSection = ({ userData, onFieldChange }) => {
  const fontScaleKey = normalizeFontScaleKey(userData.fontScale);
  const densityKey = normalizeUiDensityKey(userData.uiDensity);

  // One block per setting (the page staggers its blocks in); text size and
  // density apply live to the whole app, including this page, so there is no
  // separate preview to maintain.
  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Color theme</SettingLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {THEME_OPTIONS.map(({ value, label, swatchClass }) => (
            <SegmentedButton
              key={value}
              active={userData.theme === value}
              activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
              aria-pressed={userData.theme === value}
              onClick={() => onFieldChange?.('theme', value)}
            >
              {/* Stacked + centered so every swatch shares one x-position per
                  column regardless of label width. */}
              <span className="flex flex-col items-center gap-1.5">
                <ThemeSwatch swatchClass={swatchClass} />
                <span className="text-sm">{label}</span>
              </span>
            </SegmentedButton>
          ))}
        </div>
      </div>

      <div>
        <SettingLabel>Text size</SettingLabel>
        <div className="grid grid-cols-4 gap-2">
          {FONT_SCALE_OPTIONS.map(({ key, label, scale }) => (
            <SegmentedButton
              key={key}
              active={fontScaleKey === key}
              activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
              aria-pressed={fontScaleKey === key}
              onClick={() => onFieldChange?.('fontScale', key)}
            >
              {/* Stacked like the theme buttons. The glyph grows with the size, and
                  each label is drawn at the size it stands for (absolute units, so
                  neither moves with the setting they describe) - the row reads as
                  a preview. Fixed-height icon slot keeps the labels on one line. */}
              <span className="flex flex-col items-center gap-1">
                <span className="flex h-6 items-end">
                  <Type
                    size={FONT_SCALE_ICON_PX[key]}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                </span>
                <span style={{ fontSize: `${0.875 * scale}rem` }}>{label}</span>
              </span>
            </SegmentedButton>
          ))}
        </div>
      </div>

      <div>
        <SettingLabel>Density</SettingLabel>
        <div className="grid grid-cols-3 gap-2">
          {DENSITY_OPTIONS.map(({ key, label }) => {
            const DensityIcon = DENSITY_ICONS[key];
            return (
              <SegmentedButton
                key={key}
                active={densityKey === key}
                activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
                aria-pressed={densityKey === key}
                onClick={() => onFieldChange?.('uiDensity', key)}
              >
                <span className="flex flex-col items-center gap-1">
                  <DensityIcon
                    size={20}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  <span className="text-sm">{label}</span>
                </span>
              </SegmentedButton>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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
      // The whole card is the tap target (not just the value chip); the chip is
      // a visual affordance only. Spans, not <p>/<div>: button content must be
      // phrasing content.
      <button
        type="button"
        onClick={() => onOpenWindowPicker?.()}
        aria-label="Open carryover window picker"
        className="settings-reveal group mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-left transition-all pressable-card focus-ring md:hover:border-muted/50 md:hover:bg-surface-highlight/70"
      >
        <span className="block">
          <span className="block text-foreground text-sm font-medium leading-tight">
            Carryover window
          </span>
          <span className="mt-0.5 block text-muted text-xs">
            Higher values extend how long EPOC can spill into the next day.
          </span>
        </span>
        <span className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-surface-highlight px-3 py-1 text-sm font-medium text-foreground transition-colors md:group-hover:border-muted/50">
          <span>{epocCarryoverHours}h</span>
          <ChevronsUpDown size={14} className="text-muted shrink-0" />
        </span>
      </button>
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
        <div className="settings-reveal mt-3 space-y-2">
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
          className={`settings-reveal mt-3 rounded-lg border px-3 py-2.5 ${
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
        <div className="settings-reveal mt-2 space-y-2">
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
            <div className="settings-reveal rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 space-y-2">
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
        <div className="settings-reveal mt-2 space-y-1 text-xs text-foreground/80">
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
