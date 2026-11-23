import React, { useMemo } from 'react';
import {
  Activity,
  ArrowLeftRight,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useEnergyMapStore } from '../../../../store/useEnergyMapStore';
import {
  HERO_ACTION_METRICS,
  HERO_ACTION_OPTIONS,
  HERO_SLOTS,
  HERO_SLOT_FIELDS,
  getHeroOptionGroupsForSlot,
  readHeroSlots,
} from '../../../../constants/appearance/heroAction';
import {
  HERO_ACTION_ICONS_BY_KEY,
  HERO_ACTION_ICON_KEY_BY_METRIC,
} from '../../common/heroActionIcons';
import { HeroActionPill } from '../../common/HeroActionPill';
import { HeroActionTile } from '../../common/HeroActionTile';
import { buildHeroActionModel } from '../../../../utils/calculations/heroActionMetrics';
import { buildDisplayTefContext } from '../../../../utils/calculations/calculations';
import { getNutritionTotalsForDate } from '../../../../utils/phases/phases';
import { getTodayDateKey } from '../../../../utils/data/dateKeys';
import {
  formatWeight,
  sortWeightEntries,
} from '../../../../utils/measurements/weight';
import {
  formatBodyFat,
  sortBodyFatEntries,
} from '../../../../utils/measurements/bodyFat';
import {
  formatPanelDate,
  getOldDataWarningText,
} from '../../../../utils/visuals/trackerHelpers';

const HERO_SLOT_META = [
  {
    slot: HERO_SLOTS.PILL,
    label: 'Shortcut',
    hint: 'The button beside the title.',
  },
  {
    slot: HERO_SLOTS.LEFT,
    label: 'Left tile',
    hint: 'The first tile under the title.',
  },
  {
    slot: HERO_SLOTS.RIGHT,
    label: 'Right tile',
    hint: 'The second tile under the title.',
  },
];

const PREVIEW_SLOT_OUTLINE_CLASS =
  'outline-2 outline-dashed outline-offset-2 outline-accent-blue/75';

const HINT_FIELDS = ['hasSeenSwipeHint', 'hasSeenMacroHint', 'hasSeenPinHint'];

const OPTION_BY_KEY = Object.fromEntries(
  HERO_ACTION_OPTIONS.map((option) => [option.key, option])
);

const toDateKey = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const SettingLabel = ({ children }) => (
  <label className="text-foreground/80 text-sm block mb-2">{children}</label>
);

const useLiveHeroModels = ({
  userData,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  calorieTargetCalories,
  heroSlots,
}) => {
  const store = useEnergyMapStore(
    (state) => ({
      trainingCalories: state.trainingCalories,
      totalCardioBurn: state.totalCardioBurn,
      trainingSessions: state.trainingSessions ?? [],
      heartRateProfile: state.heartRateProfile,
      activePhase: state.activePhase,
      goalDailyBalanceTarget: state.goalDailyBalanceTarget,
      calculateTargetForGoal: state.calculateTargetForGoal,
      selectedGoal: state.userData?.selectedGoal,
    }),
    shallow
  );

  const todayDateKey = getTodayDateKey();

  const sortedWeightEntries = useMemo(
    () => sortWeightEntries(weightEntries ?? []),
    [weightEntries]
  );
  const weightLatest = sortedWeightEntries.length
    ? sortedWeightEntries[sortedWeightEntries.length - 1]
    : null;
  const weightReading = useMemo(
    () => ({
      display: formatWeight(weightLatest?.weight ?? userData?.weight) || null,
      dateLabel: weightLatest?.date
        ? formatPanelDate(weightLatest.date)
        : 'No entries yet',
      warning: weightLatest?.date
        ? getOldDataWarningText(weightLatest.date)
        : null,
    }),
    [userData?.weight, weightLatest]
  );

  const sortedBodyFatEntries = useMemo(
    () => sortBodyFatEntries(bodyFatEntries ?? []),
    [bodyFatEntries]
  );
  const bodyFatLatest = sortedBodyFatEntries.length
    ? sortedBodyFatEntries[sortedBodyFatEntries.length - 1]
    : null;
  const bodyFatReading = useMemo(
    () => ({
      display: bodyFatLatest ? formatBodyFat(bodyFatLatest.bodyFat) : null,
      dateLabel: bodyFatLatest?.date
        ? formatPanelDate(bodyFatLatest.date)
        : 'No entries yet',
      warning: bodyFatLatest?.date
        ? getOldDataWarningText(bodyFatLatest.date)
        : null,
    }),
    [bodyFatLatest]
  );

  const todayStepCount = useMemo(() => {
    if (!Array.isArray(userData?.stepEntries)) return 0;
    const entry = userData.stepEntries.find(
      (item) => toDateKey(item?.date) === todayDateKey
    );
    return Number(entry?.steps) || 0;
  }, [todayDateKey, userData]);

  const todayNutritionTotals = useMemo(
    () =>
      getNutritionTotalsForDate(userData?.nutritionData ?? {}, todayDateKey),
    [todayDateKey, userData?.nutritionData]
  );

  const todayTefContext = useMemo(
    () =>
      buildDisplayTefContext(userData, {
        nutritionTotals: todayNutritionTotals,
      }),
    [todayNutritionTotals, userData]
  );

  const hasTodayTraining = useMemo(
    () =>
      store.trainingSessions.some(
        (session) => toDateKey(session?.date) === todayDateKey
      ),
    [store.trainingSessions, todayDateKey]
  );

  const calculateTargetForGoal = store.calculateTargetForGoal;
  const resolvedGoal = userData?.selectedGoal ?? store.selectedGoal;

  const todayTargetCalculation = useMemo(() => {
    if (typeof calculateTargetForGoal !== 'function') {
      return null;
    }
    try {
      return calculateTargetForGoal(
        todayStepCount,
        hasTodayTraining,
        resolvedGoal,
        { tefContext: todayTefContext, dateKey: todayDateKey }
      );
    } catch {
      return null;
    }
  }, [
    calculateTargetForGoal,
    hasTodayTraining,
    resolvedGoal,
    todayDateKey,
    todayStepCount,
    todayTefContext,
  ]);

  const todayTdee = Math.round(
    Number(todayTargetCalculation?.breakdown?.total) || 0
  );
  const resolvedCalorieTarget = Number.isFinite(Number(calorieTargetCalories))
    ? Math.round(Number(calorieTargetCalories))
    : Number.isFinite(Number(todayTargetCalculation?.targetCalories))
      ? Math.round(Number(todayTargetCalculation.targetCalories))
      : null;

  const todayIntakeCalories = Math.round(
    Number(todayNutritionTotals?.calories) || 0
  );
  const heroExerciseBurn =
    (Number(store.trainingCalories) || 0) +
    (Number(store.totalCardioBurn) || 0);

  return useMemo(() => {
    const inputs = {
      userData,
      todayKey: todayDateKey,
      calorieTarget: resolvedCalorieTarget,
      consumed: todayIntakeCalories,
      proteinGrams: todayNutritionTotals?.protein,
      steps: todayStepCount,
      stepGoal: userData?.stepGoal,
      tdee: todayTdee,
      goalDailyBalanceTarget: store.goalDailyBalanceTarget,
      activePhase: store.activePhase,
      restingHr: store.heartRateProfile?.restingHr ?? null,
      exerciseBurn: heroExerciseBurn,
      weight: weightReading,
      bodyFat: bodyFatTrackingEnabled ? bodyFatReading : null,
    };
    return {
      pill: buildHeroActionModel({ metric: heroSlots.pill, ...inputs }),
      left: buildHeroActionModel({ metric: heroSlots.left, ...inputs }),
      right: buildHeroActionModel({ metric: heroSlots.right, ...inputs }),
    };
  }, [
    bodyFatReading,
    bodyFatTrackingEnabled,
    heroExerciseBurn,
    heroSlots.left,
    heroSlots.pill,
    heroSlots.right,
    resolvedCalorieTarget,
    store.activePhase,
    store.goalDailyBalanceTarget,
    store.heartRateProfile?.restingHr,
    todayDateKey,
    todayIntakeCalories,
    todayNutritionTotals?.protein,
    todayStepCount,
    todayTdee,
    userData,
    weightReading,
  ]);
};

export const HomeLayoutSettingsSection = ({
  userData,
  weightEntries,
  bodyFatEntries,
  bodyFatTrackingEnabled,
  calorieTargetCalories,
  onFieldChange,
  onOpenSlotPicker,
}) => {
  const resolvedBodyFatEnabled = bodyFatTrackingEnabled !== false;
  const heroSlots = readHeroSlots(userData, {
    bodyFatTrackingEnabled: resolvedBodyFatEnabled,
  });

  const heroModels = useLiveHeroModels({
    userData,
    weightEntries,
    bodyFatEntries,
    bodyFatTrackingEnabled: resolvedBodyFatEnabled,
    calorieTargetCalories,
    heroSlots,
  });

  const seenHintFields = HINT_FIELDS.filter(
    (field) => userData?.[field] === true
  );
  const anyTipSeen = seenHintFields.length > 0;

  const handleResetAllTips = () => {
    seenHintFields.forEach((field) => {
      onFieldChange?.(field, false);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingLabel>Live preview</SettingLabel>
        <div className="rounded-2xl border border-border bg-background/50 p-4 shadow-lg md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Activity
                className="shrink-0 text-accent-blue"
                size={26}
                aria-hidden="true"
              />
              <span className="truncate text-lg font-black text-foreground md:text-2xl">
                Energy Map
              </span>
            </div>
            <HeroActionPill
              model={heroModels.pill}
              onPress={() => onOpenSlotPicker?.(HERO_SLOTS.PILL)}
              ariaLabel={`Edit shortcut: ${OPTION_BY_KEY[heroSlots.pill]?.label ?? heroModels.pill.shortLabel}`}
              className={PREVIEW_SLOT_OUTLINE_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <HeroActionTile
              model={heroModels.left}
              onPress={() => onOpenSlotPicker?.(HERO_SLOTS.LEFT)}
              ariaLabel={`Edit left tile: ${OPTION_BY_KEY[heroSlots.left]?.label ?? heroModels.left.shortLabel}`}
              className={PREVIEW_SLOT_OUTLINE_CLASS}
            />
            <HeroActionTile
              model={heroModels.right}
              onPress={() => onOpenSlotPicker?.(HERO_SLOTS.RIGHT)}
              ariaLabel={`Edit right tile: ${OPTION_BY_KEY[heroSlots.right]?.label ?? heroModels.right.shortLabel}`}
              className={PREVIEW_SLOT_OUTLINE_CLASS}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Tap anything with a dashed outline to change it.
        </p>
      </div>

      <div>
        <SettingLabel>Currently showing</SettingLabel>
        <div className="space-y-2">
          {HERO_SLOT_META.map(({ slot, label, hint }) => {
            const metricKey = heroSlots[slot];
            const option = OPTION_BY_KEY[metricKey] ?? HERO_ACTION_OPTIONS[0];
            const MetricIcon =
              HERO_ACTION_ICONS_BY_KEY[
                HERO_ACTION_ICON_KEY_BY_METRIC[metricKey]
              ];
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onOpenSlotPicker?.(slot)}
                aria-label={`${label}: ${option.label}`}
                className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface-highlight/40 px-3 py-2.5 text-left shadow-sm transition-all pressable-card focus-ring md:hover:border-muted/50 md:hover:bg-surface-highlight/70"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-blue/10 ring-1 ring-accent-blue/20 transition-transform duration-200 group-active:scale-90 md:group-hover:scale-105">
                  {MetricIcon && (
                    <MetricIcon
                      size={19}
                      aria-hidden="true"
                      className="shrink-0 text-accent-blue"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight text-foreground">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {hint}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent-blue">
                  <span>{option.label}</span>
                  <ChevronRight
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-muted transition-transform group-active:translate-x-0.5 md:group-hover:translate-x-0.5"
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SettingLabel>Tips</SettingLabel>
        <button
          type="button"
          disabled={!anyTipSeen}
          onClick={handleResetAllTips}
          aria-label="Show all tips again"
          className={`group flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all focus-ring ${
            anyTipSeen
              ? 'border-border bg-surface-highlight/40 text-foreground pressable-card md:hover:border-muted/50 md:hover:bg-surface-highlight/70'
              : 'cursor-not-allowed border-border/60 bg-surface-highlight/25 text-muted'
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform duration-200 ${
                anyTipSeen
                  ? 'bg-accent-amber/10 ring-accent-amber/25 text-accent-amber group-active:scale-90 md:group-hover:scale-105'
                  : 'bg-surface-highlight/60 ring-border text-muted'
              }`}
            >
              <Lightbulb size={19} aria-hidden="true" className="shrink-0" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">
                Tips
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Swipe, macro and pin tips
              </span>
            </span>
          </span>
          <span
            className={`shrink-0 text-xs font-semibold ${
              anyTipSeen ? 'text-accent-blue' : 'text-muted'
            }`}
          >
            {anyTipSeen ? 'Show all again' : 'All pending'}
          </span>
        </button>
      </div>
    </div>
  );
};

const MetricChoiceCard = ({
  icon: Icon,
  label,
  description,
  active,
  unavailable,
  statusBadge,
  showSwapIcon = false,
  onClick,
}) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={unavailable}
    title={unavailable ? 'Body fat tracking is off' : undefined}
    onClick={onClick}
    className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus-ring ${
      active
        ? 'bg-primary border-primary text-primary-foreground md:hover:brightness-110'
        : unavailable
          ? 'cursor-not-allowed border-border/60 bg-surface-highlight/30 text-muted opacity-55'
          : 'border-border bg-surface-highlight/60 text-foreground md:hover:border-muted/50 md:hover:bg-surface-highlight'
    }`}
  >
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
          active
            ? 'bg-primary-foreground/15 ring-primary-foreground/25 text-primary-foreground'
            : unavailable
              ? 'bg-surface-highlight/50 ring-border/60 text-muted'
              : 'bg-accent-blue/10 ring-accent-blue/20 text-accent-blue'
        }`}
      >
        {Icon && <Icon size={18} aria-hidden="true" className="shrink-0" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">
          {label}
        </span>
        <span
          className={`mt-0.5 block text-xs leading-snug ${
            active ? 'text-primary-foreground/85' : 'text-muted'
          }`}
        >
          {description}
        </span>
      </span>
    </span>

    {!active && statusBadge ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
        {showSwapIcon && (
          <ArrowLeftRight size={11} aria-hidden="true" className="shrink-0" />
        )}
        <span>{statusBadge}</span>
      </span>
    ) : null}
  </button>
);

export const HeroMetricPickerPage = ({
  activeSlot,
  userData,
  bodyFatTrackingEnabled,
  onSelectSlot,
  onFieldChange,
}) => {
  const resolvedBodyFatEnabled = bodyFatTrackingEnabled !== false;
  const heroSlots = readHeroSlots(userData, {
    bodyFatTrackingEnabled: resolvedBodyFatEnabled,
  });
  const activeSlotIndex = Math.max(
    0,
    HERO_SLOT_META.findIndex((item) => item.slot === activeSlot)
  );
  const activeSlotMeta = HERO_SLOT_META[activeSlotIndex] ?? HERO_SLOT_META[0];
  const groups = getHeroOptionGroupsForSlot(activeSlot);

  return (
    <div className="space-y-6">
      <div>
        {/* Animated 3-way sliding pill toggle (same architecture as FoodSearchModal / WeightTrackerModal) */}
        <div
          role="group"
          aria-label="Home slot"
          className="relative flex items-center rounded-lg border border-border bg-surface-highlight p-1"
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-accent-blue shadow-md"
            style={{
              transform: `translateX(${activeSlotIndex * 100}%)`,
              transition:
                'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), background-color 0.28s ease-out',
            }}
          />
          {HERO_SLOT_META.map(({ slot, label }) => {
            const isSelected = activeSlot === slot;
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectSlot?.(slot)}
                className={`relative z-10 flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-ring ${
                  isSelected
                    ? 'text-primary-foreground'
                    : 'text-muted md:hover:text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-muted">
          {activeSlotMeta.hint} Picking a metric used elsewhere swaps the two.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.id}>
          <SettingLabel>{group.label}</SettingLabel>
          <div role="group" aria-label={group.label} className="space-y-2">
            {group.options.map(({ key, label, description }) => {
              const Icon =
                HERO_ACTION_ICONS_BY_KEY[HERO_ACTION_ICON_KEY_BY_METRIC[key]];
              const active = heroSlots[activeSlot] === key;
              const unavailable =
                key === HERO_ACTION_METRICS.BODY_FAT && !resolvedBodyFatEnabled;
              const usedBy = active
                ? null
                : HERO_SLOT_META.find((other) => heroSlots[other.slot] === key);

              const statusBadge = unavailable
                ? 'Tracking off'
                : usedBy
                  ? `In ${usedBy.label.toLowerCase()}`
                  : null;

              return (
                <MetricChoiceCard
                  key={`${activeSlot}:${key}`}
                  icon={Icon}
                  label={label}
                  description={description}
                  active={active}
                  unavailable={unavailable}
                  statusBadge={statusBadge}
                  showSwapIcon={Boolean(usedBy && !unavailable)}
                  onClick={() =>
                    onFieldChange?.(HERO_SLOT_FIELDS[activeSlot], key)
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
