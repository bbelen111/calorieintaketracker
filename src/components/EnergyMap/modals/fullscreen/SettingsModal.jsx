import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  MonitorSmartphone,
  Sparkles,
  Feather,
  CircleOff,
  UtensilsCrossed,
  ChartPie,
  Trash2,
  Lightbulb,
  Dumbbell,
  BedDouble,
  Plug,
  Footprints,
  HeartPulse,
  RefreshCw,
  Download,
  Upload,
  Share2,
  Bell,
} from 'lucide-react';
import { NotificationsSettingsSection } from './NotificationsSettingsSection';
import {
  DEFAULT_ACTIVITY_MULTIPLIERS,
  getActivityPresetByKey,
} from '../../../../constants/activity/activityPresets';
import { ModalShell } from '../../common/ModalShell';
import {
  formatDateLabel,
  formatWeight,
  normalizeDateKey,
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
import {
  MOTION_PREFERENCE_OPTIONS,
  normalizeMotionPreferenceKey,
} from '../../../../constants/appearance/motion';
import { getAdaptiveThermogenesisSmartModeDataStatus } from '../../../../utils/calculations/adaptiveThermogenesis';
import { SettingsReveal } from './SettingsReveal';
import {
  normalizeMacroLocks,
  normalizeMacroRecommendationSplit,
} from '../../../../utils/calculations/macroRecommendations';
import {
  FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS,
  normalizeFoodSearchDefaultEntry,
} from '../pickers/MealTypePickerModal';
import {
  HealthConnectStatus,
  getHealthSourceName,
} from '../../../../constants/health/healthSources';
import {
  connectHeartRateSync,
  disconnectHeartRateSync,
  refreshHeartRateSync,
  useHeartRateSyncState,
} from '../../../../services/heartRateSync';
import { describeMaxHrSource } from '../../../../utils/formatting/heartRate';
import { isAndroid, isIOS } from '../../../../utils/platform';
import { formatRelativeTime } from '../../../../utils/formatting/relativeTime';
import { exportAllDataAsJSON } from '../../../../utils/export';
import { parseFullExportText } from '../../../../utils/data/fullExport';

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
    title: 'Profile & Health',
    icon: UserRound,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: Palette,
  },
  {
    id: 'activity',
    title: 'Activity & Steps',
    icon: Activity,
  },
  {
    id: 'adjustments',
    title: 'Metabolic Adjustments',
    icon: SlidersHorizontal,
  },
  {
    id: 'food',
    title: 'Food & Macros',
    icon: UtensilsCrossed,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: Bell,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: Plug,
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
//  - Animations: Auto = "follow the device", Full = lively, Reduced = light,
//    Off = nothing.
const MOTION_ICONS = {
  system: MonitorSmartphone,
  full: Sparkles,
  reduced: Feather,
  off: CircleOff,
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
  onStepGoalPickerClick,
  onStepRangesClick,
  onMacroPickerClick,
  onClearCachedFoodsClick,
  onCancel,
  stepSync = null,
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
        stepGoalPicker: onStepGoalPickerClick,
        stepRanges: onStepRangesClick,
        macroPicker: onMacroPickerClick,
        clearCachedFoods: onClearCachedFoodsClick,
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
      onClearCachedFoodsClick,
      onHeightPickerClick,
      onMacroPickerClick,
      onManageBodyFatClick,
      onManageWeightClick,
      onOpenAdaptiveThermogenesisInfo,
      onOpenEpocInfo,
      onOpenTefInfo,
      onNavigate,
      onRequestBack,
      onStepGoalPickerClick,
      onStepRangesClick,
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
          onOpenStepGoalPicker={resolvedActions.openers.stepGoalPicker}
          onOpenStepRanges={resolvedActions.openers.stepRanges}
          onOpenMacroPicker={resolvedActions.openers.macroPicker}
          onClearCachedFoods={resolvedActions.openers.clearCachedFoods}
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
          heartRateOpeners={resolvedActions.openers}
          stepSync={stepSync}
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
  onOpenStepGoalPicker,
  onOpenStepRanges,
  onOpenMacroPicker,
  onClearCachedFoods,
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
  heartRateOpeners,
  stepSync,
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

    {page === 'profile' && (
      <HeartRateSettingsSection
        userData={userData}
        onFieldChange={onFieldChange}
        openers={heartRateOpeners}
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
        onOpenStepGoalPicker={onOpenStepGoalPicker}
        onOpenStepRanges={onOpenStepRanges}
      />
    )}

    {page === 'food' && (
      <FoodNutritionSection
        userData={userData}
        onFieldChange={onFieldChange}
        onOpenMacroPicker={onOpenMacroPicker}
        onClearCachedFoods={onClearCachedFoods}
      />
    )}

    {page === 'notifications' && (
      <NotificationsSettingsSection
        userData={userData}
        onFieldChange={onFieldChange}
        onOpenTimePicker={heartRateOpeners?.notificationTimePicker}
      />
    )}

    {page === 'integrations' && (
      <IntegrationsSection
        userData={userData}
        stepSync={stepSync}
        openers={heartRateOpeners}
      />
    )}

    {page === 'adjustments' && (
      <div className="space-y-7">
        <EpocSection
          epocEnabled={epocEnabled}
          epocCarryoverHours={epocCarryoverHours}
          onOpenInfo={onOpenEpocInfo}
          onOpenWindowPicker={onOpenEpocWindowPicker}
          onFieldChange={onFieldChange}
        />

        <SmartTefSection
          userData={userData}
          useTargetQuickEstimates={useTargetQuickEstimates}
          showFoodModalTefBurn={showFoodModalTefBurn}
          useTargetLiveCard={useTargetLiveCard}
          onOpenInfo={onOpenTefInfo}
          onFieldChange={onFieldChange}
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
          onOpenInfo={onOpenAdaptiveThermogenesisInfo}
          onFieldChange={onFieldChange}
        />
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

/**
 * Profile & Health -> Heart rate. Max HR / VO2 max overrides apply
 * immediately through onFieldChange (out-of-range = auto). Watch sync and the
 * BLE sensor live under Settings -> Integrations (`IntegrationsSection`); this
 * group keeps only the values that describe the user.
 */
const HeartRateSettingsSection = ({ userData, onFieldChange, openers }) => {
  const heartRateProfile = useEnergyMapStore((state) => state.heartRateProfile);
  const hasCustomMax = userData.maxHeartRateCustom != null;
  const hasCustomVo2 = userData.vo2MaxCustom != null;

  return (
    <div className="mt-7 border-t border-border/70 pt-6">
      <p className="text-foreground font-semibold mb-3">Heart rate</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div>
          <SettingLabel>Resting heart rate</SettingLabel>
          <PickerButton
            onClick={() => openers?.heartRateTracker?.()}
            ariaLabel="Open heart rate tracker"
          >
            {heartRateProfile?.restingHr != null
              ? `${heartRateProfile.restingHr} bpm (7-day)`
              : 'No readings yet'}
          </PickerButton>
        </div>

        <div>
          <SettingLabel>Max heart rate</SettingLabel>
          <PickerButton
            onClick={() => openers?.maxHeartRatePicker?.()}
            ariaLabel="Set max heart rate"
          >
            {heartRateProfile?.maxHr != null
              ? `${heartRateProfile.maxHr} bpm · ${describeMaxHrSource(heartRateProfile.maxHrSource)}`
              : '—'}
          </PickerButton>
          {hasCustomMax && (
            <button
              type="button"
              onClick={() => onFieldChange?.('maxHeartRateCustom', null)}
              className="mt-1.5 text-xs font-medium text-accent-blue focus-ring rounded px-1 pressable-inline"
            >
              Use automatic estimate
            </button>
          )}
        </div>

        <div>
          <SettingLabel>VO2 max</SettingLabel>
          <PickerButton
            onClick={() => openers?.vo2MaxPicker?.()}
            ariaLabel="Set VO2 max"
          >
            {heartRateProfile?.vo2Max != null
              ? `${heartRateProfile.vo2Max} · ${
                  heartRateProfile.vo2MaxSource === 'custom'
                    ? 'custom'
                    : 'from watch'
                }`
              : 'Not set'}
          </PickerButton>
          {hasCustomVo2 && (
            <button
              type="button"
              onClick={() => onFieldChange?.('vo2MaxCustom', null)}
              className="mt-1.5 text-xs font-medium text-accent-blue focus-ring rounded px-1 pressable-inline"
            >
              Use watch value
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => openers?.heartRateZonesInfo?.()}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted md:hover:text-foreground focus-ring rounded px-1 pressable-inline"
      >
        <Info size={14} /> How heart rate affects your numbers
      </button>
    </div>
  );
};

// An export is a few MB at most; anything near this is not one of ours.
const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;

const INTEGRATION_ACTION_CLASS =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-all focus-ring pressable-inline';
const INTEGRATION_PRIMARY_ACTION_CLASS = `${INTEGRATION_ACTION_CLASS} border-primary bg-primary text-primary-foreground md:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60`;
const INTEGRATION_SECONDARY_ACTION_CLASS = `${INTEGRATION_ACTION_CLASS} border-border bg-surface-highlight text-foreground md:hover:border-muted/50 disabled:cursor-not-allowed disabled:opacity-60`;

const isHealthStoreReachable = (status) =>
  status !== HealthConnectStatus.UNAVAILABLE &&
  status !== HealthConnectStatus.NOT_INSTALLED;

const latestDate = (...dates) =>
  dates
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
    .reduce((latest, date) => (!latest || date > latest ? date : latest), null);

/** One data source inside an integrations card: icon tile, title/status, control. */
const IntegrationRow = ({ icon: Icon, title, status, tone, children }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 ring-1 ring-accent-blue/20">
        <Icon size={19} className="text-accent-blue" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium leading-tight">
          {title}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            tone === 'error' ? 'text-accent-red' : 'text-muted'
          }`}
        >
          {status}
        </p>
      </div>
    </div>
    {children}
  </div>
);

/**
 * Settings -> Integrations. Everything that moves data across the app boundary:
 * the on-device health store (steps, heart rate), Bluetooth devices, and the
 * user's own data going out as a file.
 *
 * - Steps and heart rate share one permission store but not one switch. Heart
 *   rate has a persisted opt-in (`heartRateSyncEnabled`); step sync has none -
 *   `useHealthConnect` reconnects on launch whenever the OS grants access - so
 *   its row offers Connect / Sync now, and revoking happens in the health app
 *   (the footnote says so). Do not fake a step "off" switch: it would not survive
 *   a relaunch.
 * - The copy never claims more than the code does: the app only reads.
 */
const IntegrationsSection = ({ userData, stepSync, openers }) => {
  const hrSync = useHeartRateSyncState();
  const healthSourceName = getHealthSourceName();
  // Only Android can open the permission screen; iOS users manage access in
  // the Health app itself (see useHealthConnect.openSettings).
  const android = !isIOS();
  // Where Export saves straight to the Documents folder (and a separate Share
  // button makes sense) rather than opening the share sheet.
  const savesToDocuments = isAndroid();

  const stepStatus = stepSync?.status ?? HealthConnectStatus.UNAVAILABLE;
  const stepsReachable = isHealthStoreReachable(stepStatus);
  const hrReachable = isHealthStoreReachable(hrSync.status);
  const stepsConnected = stepStatus === HealthConnectStatus.CONNECTED;
  const hrOn =
    Boolean(userData.heartRateSyncEnabled) &&
    hrSync.status === HealthConnectStatus.CONNECTED;
  const notInstalled =
    stepStatus === HealthConnectStatus.NOT_INSTALLED ||
    hrSync.status === HealthConnectStatus.NOT_INSTALLED;

  const isSyncing = Boolean(stepSync?.isLoading) || hrSync.isLoading;
  const canSyncNow = (stepsConnected || hrOn) && !isSyncing;

  let stepsStatusText;
  if (stepStatus === HealthConnectStatus.CONNECTING) {
    stepsStatusText = 'Connecting…';
  } else if (stepSync?.error) {
    stepsStatusText = stepSync.error;
  } else if (stepsConnected) {
    const label = formatRelativeTime(stepSync?.lastSynced);
    stepsStatusText = label ? `Synced ${label}` : 'Connected';
  } else {
    stepsStatusText = 'Not connected';
  }

  const hrStatusText =
    hrSync.status === HealthConnectStatus.CONNECTING
      ? 'Connecting…'
      : (hrSync.error ??
        'Resting heart rate, daily heart rate, VO2 max and workouts');

  const lastSynced = latestDate(
    stepsConnected ? stepSync?.lastSynced : null,
    hrOn ? hrSync.lastSynced : null
  );
  const lastSyncedLabel = formatRelativeTime(lastSynced);

  const handleSyncNow = () => {
    if (stepsConnected) {
      stepSync?.refresh?.();
    }
    if (hrOn) {
      refreshHeartRateSync();
    }
  };

  // One status line serves export and import: `busy` names the running action,
  // `message` the last outcome ({ tone: 'ok' | 'error', text }).
  const [busy, setBusy] = useState(null);
  const [dataMessage, setDataMessage] = useState(null);
  const importInputRef = useRef(null);

  const handleExport = async ({ share = false } = {}) => {
    setBusy(share ? 'share' : 'export');
    setDataMessage(null);
    const result = await (share
      ? exportAllDataAsJSON(userData, { share: true })
      : exportAllDataAsJSON(userData));
    setBusy(null);

    if (!result.success) {
      setDataMessage({
        tone: 'error',
        text: `Export failed${result.error ? `: ${result.error}` : '.'}`,
      });
    } else if (result.canceled) {
      setDataMessage(null);
    } else if (result.method === 'saved') {
      setDataMessage({
        tone: 'ok',
        text: `Saved to ${result.location}/${result.fileName}`,
      });
    } else if (result.method === 'download') {
      setDataMessage({ tone: 'ok', text: `Saved ${result.fileName}` });
    } else {
      setDataMessage({
        tone: 'ok',
        text: 'Choose where to save or send your export (Save to Files keeps a copy on this device).',
      });
    }
  };

  const handleImportFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    // Reset first so choosing the same file again still fires `change`.
    input.value = '';
    if (!file) {
      return;
    }

    setDataMessage(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setDataMessage({
        tone: 'error',
        text: 'That file is too large to be an Energy Map export.',
      });
      return;
    }

    setBusy('import');
    let text;
    try {
      text = await file.text();
    } catch {
      setBusy(null);
      setDataMessage({ tone: 'error', text: "Couldn't read that file." });
      return;
    }
    setBusy(null);

    const parsed = parseFullExportText(text);
    if (!parsed.ok) {
      setDataMessage({ tone: 'error', text: parsed.error });
      return;
    }

    // The orchestrator owns the destructive-action confirmation and reports the
    // outcome back here (the confirm modal closes the moment it is accepted).
    openers?.importData?.(parsed, (applied) => {
      setDataMessage(
        applied
          ? {
              tone: 'ok',
              text: 'Import complete. Your data has been replaced.',
            }
          : {
              tone: 'error',
              text: 'Import failed. Your current data was left as it is.',
            }
      );
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>{healthSourceName}</SettingLabel>
        {stepsReachable || hrReachable ? (
          <>
            <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-surface-highlight/40">
              {stepsReachable && (
                <IntegrationRow
                  icon={Footprints}
                  title="Steps"
                  status={stepsStatusText}
                  tone={stepSync?.error ? 'error' : 'muted'}
                >
                  {stepsConnected ? (
                    <span className="shrink-0 rounded-full border border-accent-emerald/40 bg-accent-emerald/15 px-2.5 py-1 text-xs font-semibold text-accent-emerald">
                      Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => stepSync?.connect?.()}
                      disabled={stepStatus === HealthConnectStatus.CONNECTING}
                      aria-label={`Connect steps to ${healthSourceName}`}
                      className={INTEGRATION_PRIMARY_ACTION_CLASS}
                    >
                      {stepStatus === HealthConnectStatus.ERROR
                        ? 'Retry'
                        : 'Connect'}
                    </button>
                  )}
                </IntegrationRow>
              )}

              {hrReachable && (
                <IntegrationRow
                  icon={HeartPulse}
                  title="Heart rate & workouts"
                  status={hrStatusText}
                  tone={hrSync.error ? 'error' : 'muted'}
                >
                  <BinarySwitch
                    checked={hrOn}
                    disabled={hrSync.status === HealthConnectStatus.CONNECTING}
                    ariaLabel={`Sync heart rate from ${healthSourceName}`}
                    onClick={() =>
                      hrOn ? disconnectHeartRateSync() : connectHeartRateSync()
                    }
                  />
                </IntegrationRow>
              )}

              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={!canSyncNow}
                  className={INTEGRATION_SECONDARY_ACTION_CLASS}
                >
                  <RefreshCw
                    size={15}
                    aria-hidden="true"
                    className={isSyncing ? 'animate-spin' : ''}
                  />
                  Sync now
                </button>
                {android && (
                  <button
                    type="button"
                    onClick={() => stepSync?.openSettings?.()}
                    className={INTEGRATION_SECONDARY_ACTION_CLASS}
                  >
                    Manage permissions
                  </button>
                )}
                {lastSyncedLabel && (
                  <span className="ml-auto text-xs text-muted">
                    Last synced {lastSyncedLabel}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              Energy Map only reads this data to fill in your steps and heart
              rate; it never changes anything in {healthSourceName}.{' '}
              {android
                ? 'Revoke access any time from Manage permissions.'
                : 'Manage access in the Health app under Profile → Privacy → Apps.'}
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-sm text-muted">
            {notInstalled
              ? `${healthSourceName} isn't installed. Install it from Google Play, then come back to connect.`
              : `${healthSourceName} isn't available on this device.`}
          </p>
        )}
      </div>

      <div>
        <SettingLabel>Devices</SettingLabel>
        <PickerButton
          onClick={() => openers?.heartRateSensor?.()}
          ariaLabel="Pair a Bluetooth heart-rate sensor"
        >
          {userData.heartRateSensor?.name ?? 'Pair a chest strap or arm band'}
        </PickerButton>
        <p className="mt-2 text-xs text-muted">
          Any Bluetooth heart-rate sensor that uses the standard heart-rate
          profile.
        </p>
      </div>

      <div>
        <SettingLabel>Your data</SettingLabel>
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-surface-highlight/40">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium leading-tight">
                Export all data
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {savesToDocuments
                  ? 'Saves one JSON file to your Documents folder'
                  : "Everything you've logged, as one JSON file"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {savesToDocuments && (
                <button
                  type="button"
                  onClick={() => handleExport({ share: true })}
                  disabled={busy !== null}
                  aria-label="Share export"
                  className={INTEGRATION_SECONDARY_ACTION_CLASS}
                >
                  <Share2 size={15} aria-hidden="true" />
                  {busy === 'share' ? 'Sharing…' : 'Share'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleExport()}
                disabled={busy !== null}
                aria-label="Export all data"
                className={INTEGRATION_SECONDARY_ACTION_CLASS}
              >
                <Download size={15} aria-hidden="true" />
                {busy === 'export' ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium leading-tight">
                Import from file
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Replace the data on this device with an export file
              </p>
            </div>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={busy !== null}
              aria-label="Import data from file"
              className={INTEGRATION_SECONDARY_ACTION_CLASS}
            >
              <Upload size={15} aria-hidden="true" />
              {busy === 'import' ? 'Reading…' : 'Import'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json,text/plain"
              onChange={handleImportFile}
              className="hidden"
              data-testid="import-file-input"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
        {dataMessage && (
          <p
            role="status"
            className={`mt-2 text-xs ${
              dataMessage.tone === 'error' ? 'text-accent-red' : 'text-muted'
            }`}
          >
            {dataMessage.text}
          </p>
        )}
      </div>
    </div>
  );
};

const AppearanceSection = ({ userData, onFieldChange }) => {
  const fontScaleKey = normalizeFontScaleKey(userData.fontScale);
  const densityKey = normalizeUiDensityKey(userData.uiDensity);
  const motionKey = normalizeMotionPreferenceKey(userData.motionPreference);
  const hasSeenSwipeHint = userData.hasSeenSwipeHint === true;

  // One block per setting (the page staggers its blocks in); text size and
  // density apply live to the whole app, including this page, so there is no
  // separate preview to maintain.
  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Color theme</SettingLabel>
        <div
          role="group"
          aria-label="Color theme"
          className="grid grid-cols-2 gap-2 md:grid-cols-4"
        >
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
        <div
          role="group"
          aria-label="Text size"
          className="grid grid-cols-4 gap-2"
        >
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
        <div
          role="group"
          aria-label="Density"
          className="grid grid-cols-3 gap-2"
        >
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

      <div>
        <SettingLabel>Animations</SettingLabel>
        <div
          role="group"
          aria-label="Animations"
          className="grid grid-cols-4 gap-2"
        >
          {MOTION_PREFERENCE_OPTIONS.map(({ key, label }) => {
            const MotionIcon = MOTION_ICONS[key];
            return (
              <SegmentedButton
                key={key}
                active={motionKey === key}
                activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
                aria-pressed={motionKey === key}
                onClick={() => onFieldChange?.('motionPreference', key)}
              >
                <span className="flex flex-col items-center gap-1">
                  <MotionIcon
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

      <div>
        <SettingLabel>Swipe tip</SettingLabel>
        <button
          type="button"
          disabled={!hasSeenSwipeHint}
          onClick={() => onFieldChange?.('hasSeenSwipeHint', false)}
          aria-label="Show swipe tip again"
          className={`w-full px-4 py-3 rounded-lg border transition-all text-left flex items-center justify-between gap-3 focus-ring ${
            hasSeenSwipeHint
              ? 'bg-surface-highlight text-foreground border-border md:hover:border-muted/50 pressable-inline'
              : 'bg-surface-highlight/40 text-muted border-border/60 cursor-not-allowed'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Lightbulb
              size={18}
              aria-hidden="true"
              className={`shrink-0 ${
                hasSeenSwipeHint ? 'text-accent-amber' : 'text-muted'
              }`}
            />
            <span className="min-w-0">
              <span className="block font-medium text-base">
                {hasSeenSwipeHint ? 'Show again' : 'Waiting to be shown'}
              </span>
              <span className="block text-xs text-muted">
                The “Swipe between screens” hint in the header
              </span>
            </span>
          </span>
        </button>
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

    {/* The whole card is the tap target (not just the value chip); the chip is
        a visual affordance only. Spans, not <p>/<div>: button content must be
        phrasing content. */}
    <SettingsReveal open={epocEnabled}>
      <button
        type="button"
        onClick={() => onOpenWindowPicker?.()}
        aria-label="Open carryover window picker"
        className="group mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5 text-left transition-all pressable-card focus-ring md:hover:border-muted/50 md:hover:bg-surface-highlight/70"
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
    </SettingsReveal>
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

      <SettingsReveal open={userData.smartTefEnabled}>
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
      </SettingsReveal>
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

  // The smoothing-window slider stages its drag value locally and commits to
  // the store on release (pointer up / key up / blur). Writing the store per
  // drag frame re-ran deriveState + the full orchestrator tree at ~60fps.
  // This is the only continuous store-bound control in Settings; every other
  // control still applies immediately through onFieldChange.
  const [dragWindowDays, setDragWindowDays] = useState(null);
  const resolvedWindowDays =
    dragWindowDays ?? adaptiveThermogenesisSmoothingWindowDays;
  const commitWindowDays = () => {
    if (dragWindowDays == null) {
      return;
    }

    const valueToCommit = dragWindowDays;
    setDragWindowDays(null);
    if (valueToCommit !== adaptiveThermogenesisSmoothingWindowDays) {
      onFieldChange?.(
        'adaptiveThermogenesisSmoothingWindowDays',
        valueToCommit
      );
    }
  };

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

      <SettingsReveal open={adaptiveThermogenesisEnabled}>
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
      </SettingsReveal>

      <SettingsReveal
        open={adaptiveThermogenesisEnabled && resolvedSmartModeEnabled}
      >
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

          <SettingsReveal open={adaptiveThermogenesisSmoothingEnabled}>
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
                  <span>{resolvedWindowDays} days</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={14}
                  step={1}
                  value={resolvedWindowDays}
                  onChange={(event) =>
                    setDragWindowDays(Number(event.target.value))
                  }
                  onPointerUp={commitWindowDays}
                  onKeyUp={commitWindowDays}
                  onBlur={commitWindowDays}
                  style={{
                    '--value': `${((resolvedWindowDays - 3) / 11) * 100}%`,
                  }}
                  className="w-full cursor-pointer transition-all"
                  aria-label="Adaptive thermogenesis smoothing window"
                />
              </div>
            </div>
          </SettingsReveal>
        </div>
      </SettingsReveal>
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

const NEAT_DAY_CARDS = [
  {
    day: 'training',
    title: 'Training Day',
    icon: Dumbbell,
    className: 'border-primary bg-primary',
  },
  {
    day: 'rest',
    title: 'Rest Day',
    icon: BedDouble,
    className: 'border-accent-indigo bg-accent-indigo',
  },
];

// One tappable summary per day type. Tapping opens that day's preset editor
// directly (no intermediate "pick a day" sheet). The card knows whether it is
// today's day type, shows the baseline it produces, and surfaces a one-off
// override for today so the global number is never silently outranked.
const NeatDayCard = ({
  title,
  icon: Icon,
  className,
  presetLabel,
  multiplier,
  baseline,
  isToday,
  todayOverride,
  onClick,
}) => (
  <button
    onClick={onClick}
    type="button"
    aria-label={`Edit ${title} NEAT, ${presetLabel}, offset ${formatMultiplier(multiplier)}`}
    className={`w-full text-left p-3 md:p-4 rounded-lg border-2 text-primary-foreground transition-all press-feedback focus-ring md:hover:brightness-110 flex items-center gap-3 ${className}`}
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-highlight/20">
      <Icon size={20} aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="font-semibold text-sm md:text-base">{title}</span>
        {isToday && (
          <span className="rounded-full bg-surface-highlight/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Today
          </span>
        )}
      </span>
      <span className="block text-xs md:text-sm opacity-90">
        {presetLabel} • NEAT offset: {formatMultiplier(multiplier)}
      </span>
      {baseline !== null && (
        <span className="block text-xs opacity-75">
          ~{baseline.toLocaleString()} cal baseline (BMR + NEAT)
        </span>
      )}
      {todayOverride && (
        <span className="mt-1 block text-xs font-medium">
          Today is overridden to {formatMultiplier(todayOverride.multiplier)}
          {todayOverride.label ? ` (${todayOverride.label})` : ''}
        </span>
      )}
    </span>
    <ChevronRight
      size={18}
      className="shrink-0 opacity-75"
      aria-hidden="true"
    />
  </button>
);

const DailyActivitySection = ({
  userData,
  bmr,
  onDailyActivityClick,
  onOpenStepGoalPicker,
  onOpenStepRanges,
}) => {
  const stepGoal = Number(userData.stepGoal);
  const stepRanges = Array.isArray(userData.stepRanges)
    ? userData.stepRanges
    : [];

  const presets = userData.activityPresets ?? defaultPresetKeys;
  const multipliers =
    userData.activityMultipliers ?? DEFAULT_ACTIVITY_MULTIPLIERS;

  const todayKey = getTodayDateKey();
  const todayDay = (userData.trainingSessions ?? []).some(
    (session) => normalizeDateKey(session?.date) === todayKey
  )
    ? 'training'
    : 'rest';
  const todayOverride = userData.dailyNeatOverrides?.[todayKey] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Daily NEAT (Non-Exercise Activity)</SettingLabel>
        <div className="space-y-2">
          {NEAT_DAY_CARDS.map(({ day, title, icon, className }) => {
            const preset = getActivityPresetByKey(
              day,
              presets[day] ?? 'default'
            );
            const multiplier =
              multipliers[day] ?? DEFAULT_ACTIVITY_MULTIPLIERS[day];
            const isToday = day === todayDay;

            return (
              <NeatDayCard
                key={day}
                title={title}
                icon={icon}
                className={className}
                presetLabel={preset ? preset.label : 'Custom'}
                multiplier={multiplier}
                baseline={
                  Number.isFinite(bmr)
                    ? Math.round(bmr + bmr * multiplier)
                    : null
                }
                isToday={isToday}
                todayOverride={isToday ? todayOverride : null}
                onClick={() => onDailyActivityClick?.(day)}
              />
            );
          })}
        </div>
      </div>

      <div>
        <SettingLabel>Daily step goal</SettingLabel>
        <PickerButton
          onClick={() => onOpenStepGoalPicker?.()}
          ariaLabel="Open step goal picker"
        >
          {Number.isFinite(stepGoal) && stepGoal > 0
            ? `${stepGoal.toLocaleString()} steps`
            : 'Not set'}
        </PickerButton>
      </div>

      <div>
        <SettingLabel>Step ranges</SettingLabel>
        <PickerButton
          onClick={() => onOpenStepRanges?.()}
          ariaLabel="Open step ranges"
        >
          {stepRanges.length} {stepRanges.length === 1 ? 'range' : 'ranges'}
          {stepRanges.length > 0 && (
            <span className="block truncate text-xs font-normal text-muted">
              {stepRanges.join(' · ')}
            </span>
          )}
        </PickerButton>
      </div>
    </div>
  );
};

const FoodNutritionSection = ({
  userData,
  onFieldChange,
  onOpenMacroPicker,
  onClearCachedFoods,
}) => {
  const defaultEntry = normalizeFoodSearchDefaultEntry(
    userData.foodSearchDefaultEntry
  );
  const defaultEntryOption =
    FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS.find(
      (option) => option.id === defaultEntry
    ) ?? FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS[0];

  const split = normalizeMacroRecommendationSplit(
    userData.macroRecommendationSplit
  );
  const lockedMacroCount = Object.values(
    normalizeMacroLocks(userData.macroLocks)
  ).filter((grams) => grams !== null && grams !== undefined).length;

  const cachedFoodCount = Array.isArray(userData.cachedFoods)
    ? userData.cachedFoods.length
    : 0;

  const toPercent = (ratio) => `${Math.round((Number(ratio) || 0) * 100)}%`;

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Food search opens in</SettingLabel>
        <div
          role="group"
          aria-label="Food search default view"
          className="grid grid-cols-2 gap-2"
        >
          {FOOD_SEARCH_DEFAULT_ENTRY_OPTIONS.map(({ id, label }) => (
            <SegmentedButton
              key={id}
              active={defaultEntry === id}
              activeClassName={BUTTON_ACTIVE_PRIMARY_CLASS}
              aria-pressed={defaultEntry === id}
              onClick={() => onFieldChange?.('foodSearchDefaultEntry', id)}
            >
              <span className="text-sm">{label}</span>
            </SegmentedButton>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {defaultEntryOption.description}
        </p>
      </div>

      <div>
        <SettingLabel>Macro targets</SettingLabel>
        <PickerButton
          onClick={() => onOpenMacroPicker?.()}
          ariaLabel="Open macro split picker"
        >
          <span className="inline-flex items-center gap-2">
            <ChartPie
              size={18}
              aria-hidden="true"
              className="shrink-0 text-accent-blue"
            />
            <span>
              P {toPercent(split.protein)} · C {toPercent(split.carbs)} · F{' '}
              {toPercent(split.fats)}
            </span>
          </span>
          {lockedMacroCount > 0 && (
            <span className="block text-xs font-normal text-muted">
              {lockedMacroCount} {lockedMacroCount === 1 ? 'macro' : 'macros'}{' '}
              locked to grams
            </span>
          )}
        </PickerButton>
      </div>

      <div>
        <SettingLabel>Cached foods</SettingLabel>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-highlight/40 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight text-foreground">
              {cachedFoodCount.toLocaleString()}{' '}
              {cachedFoodCount === 1 ? 'food' : 'foods'} saved
            </p>
            <p className="mt-0.5 text-xs text-muted">
              From online search and barcode scans
            </p>
          </div>
          <button
            type="button"
            disabled={cachedFoodCount === 0}
            onClick={() => onClearCachedFoods?.()}
            aria-label="Clear cached foods"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-all focus-ring ${
              cachedFoodCount === 0
                ? 'cursor-not-allowed border-border/60 text-muted opacity-60'
                : 'border-accent-red/40 bg-accent-red/15 text-accent-red pressable-inline md:hover:bg-accent-red/25'
            }`}
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
};
