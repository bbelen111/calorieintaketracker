import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Edit3,
  ChevronRight,
  Dumbbell,
  Target,
  Heart,
  Plus,
  Trash2,
  Footprints,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { goals as baseGoals } from '../../../constants/goals/goals';
import { useEnergyMapStore } from '../../../store/useEnergyMapStore';
import { useUnits } from '../../../hooks/useUnits';
import {
  buildDisplayTefContext,
  calculateTrainingSessionCalories,
} from '../../../utils/calculations/calculations';
import { calculateCaloriesFromSteps } from '../../../utils/calculations/steps';
import { getNutritionTotalsForDate } from '../../../utils/phases/phases';
import {
  resolveCardioSessionEpoc,
  resolveTrainingSessionEpoc,
} from '../../../utils/calculations/epoc';
import { sortWeightEntries } from '../../../utils/measurements/weight';
import { getTodayDateKey } from '../../../utils/data/dateKeys';
import {
  sortBodyFatEntries,
  formatBodyFat,
} from '../../../utils/measurements/bodyFat';
import {
  formatPanelDate,
  getOldDataWarningText,
} from '../../../utils/visuals/trackerHelpers';
import { HeroActionPill } from '../common/HeroActionPill';
import { HeroActionTile } from '../common/HeroActionTile';
import { readHeroSlots } from '../../../constants/appearance/heroAction';
import { buildHeroActionModel } from '../../../utils/calculations/heroActionMetrics';
import { HeartRateSourceGlyph } from '../common/HeartRateBadges';
import {
  getHeartRateZone,
  resolveHeartRateZones,
} from '../../../utils/calculations/heartRate';

const GOAL_BORDER_CLASS_BY_BG = {
  'bg-accent-purple': 'border-accent-purple',
  'bg-accent-green': 'border-accent-green',
  'bg-accent-blue': 'border-accent-blue',
  'bg-accent-yellow': 'border-accent-yellow',
  'bg-accent-orange': 'border-accent-orange',
};

// Pure date-key validator (module scope — the component body used to rebuild
// this closure on every render).
const toDateKey = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

// Memoized: the orchestrator's local state churn (modal opens, drafts,
// pickers) re-renders its whole tree; the carousel screens receive stable
// props, so React.memo keeps unrelated screens from reconciling each time.
export const HomeScreen = memo(function HomeScreen({
  userData,
  goals,
  selectedGoal,
  isGoalLocked,
  goalLockPhaseName,
  onGoalClick,
  bodyFatTrackingEnabled,
  onTrainingDayClick,
  onEditTrainingSession,
  onRemoveTrainingSession,
  trainingCalories,
  trainingSessions,
  trainingTypes,
  cardioTypes,
  hasCardioSessions,
  onAddCardioClick,
  onEditCardioSession,
  cardioSessions,
  calculateCardioCalories,
  onRemoveCardioSession,
  totalCardioBurn,
  weightEntries,
  bodyFatEntries,
  onOpenDailyActivityOverride,
  onOpenTodayBreakdown,
  calorieTargetCalories,
  heroActionOpeners,
}) {
  const units = useUnits();
  const store = useEnergyMapStore(
    (state) => ({
      userData: state.userData,
      trainingCalories: state.trainingCalories,
      trainingSessions: state.trainingSessions ?? [],
      trainingTypes: state.trainingTypes ?? {},
      cardioTypes: state.cardioTypes,
      totalCardioBurn: state.totalCardioBurn,
      cardioSessions: state.userData.cardioSessions ?? [],
      weightEntries: state.weightEntries ?? [],
      bodyFatEntries: state.bodyFatEntries ?? [],
      calculateTargetForGoal: state.calculateTargetForGoal,
      heartRateProfile: state.heartRateProfile,
      activePhase: state.activePhase,
      goalDailyBalanceTarget: state.goalDailyBalanceTarget,
    }),
    shallow
  );

  // Today's zones for the HR session rows (" · Z3" + where the HR came from).
  const heartRateZoneModel = useMemo(
    () => resolveHeartRateZones(store.heartRateProfile),
    [store.heartRateProfile]
  );
  const renderHeartRateExtras = (session) => {
    if ((session?.effortType ?? 'intensity') !== 'heartRate') {
      return null;
    }
    const zone = getHeartRateZone(session.averageHeartRate, heartRateZoneModel);
    return (
      <>
        {zone && ` · Z${zone.index}`}
        <HeartRateSourceGlyph
          source={session.heartRateSource}
          className="inline ml-1 align-[-1px]"
        />
      </>
    );
  };

  const resolvedUserData = userData ?? store.userData;
  const resolvedTrainingCalories = trainingCalories ?? store.trainingCalories;
  const resolvedTrainingSessions = trainingSessions ?? store.trainingSessions;
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const resolvedCardioTypes = cardioTypes ?? store.cardioTypes;
  // Canonical local date key helper (midnight-turnover safe); see
  // utils/data/dateKeys.js — no hand-rolled YYYY-MM-DD assembly here.
  const todayDateKey = getTodayDateKey();
  const resolvedCardioSessions = useMemo(
    () =>
      (cardioSessions ?? store.cardioSessions).filter(
        (session) => toDateKey(session?.date) === todayDateKey
      ),
    [cardioSessions, store.cardioSessions, todayDateKey]
  );
  const resolvedTotalCardioBurn = totalCardioBurn ?? store.totalCardioBurn;
  const resolvedGoals = goals ?? baseGoals;
  const resolvedWeightEntries = weightEntries ?? store.weightEntries;
  const resolvedBodyFatEntries = bodyFatEntries ?? store.bodyFatEntries;
  const resolvedBodyFatTrackingEnabled =
    typeof bodyFatTrackingEnabled === 'boolean'
      ? bodyFatTrackingEnabled
      : resolvedUserData.bodyFatTrackingEnabled;

  const sortedWeightEntries = useMemo(
    () => sortWeightEntries(resolvedWeightEntries ?? []),
    [resolvedWeightEntries]
  );
  const weightLatest = useMemo(
    () =>
      sortedWeightEntries.length
        ? sortedWeightEntries[sortedWeightEntries.length - 1]
        : null,
    [sortedWeightEntries]
  );
  const currentWeight = units.bodyWeight.parts(
    weightLatest?.weight ?? resolvedUserData.weight
  )?.value;
  const weightDateLabel = weightLatest?.date
    ? formatPanelDate(weightLatest.date)
    : 'No entries yet';
  const weightOldDataWarning = weightLatest?.date
    ? getOldDataWarningText(weightLatest.date)
    : null;

  const sortedBodyFatEntries = useMemo(
    () => sortBodyFatEntries(resolvedBodyFatEntries ?? []),
    [resolvedBodyFatEntries]
  );
  const bodyFatLatest = useMemo(
    () =>
      sortedBodyFatEntries.length
        ? sortedBodyFatEntries[sortedBodyFatEntries.length - 1]
        : null,
    [sortedBodyFatEntries]
  );
  const currentBodyFat = bodyFatLatest
    ? formatBodyFat(bodyFatLatest.bodyFat)
    : null;
  const bodyFatDateLabel = bodyFatLatest?.date
    ? formatPanelDate(bodyFatLatest.date)
    : 'No entries yet';
  const bodyFatOldDataWarning = bodyFatLatest?.date
    ? getOldDataWarningText(bodyFatLatest.date)
    : null;
  // Today's training sessions and the per-session EPOC totals below are
  // memoized: they re-price every matching session's burn + EPOC estimate,
  // which used to run on every render (including orchestrator-driven
  // re-renders from unrelated modal/draft state).
  const resolvedTodayTrainingSessions = useMemo(
    () =>
      resolvedTrainingSessions.filter(
        (session) => toDateKey(session?.date) === todayDateKey
      ),
    [resolvedTrainingSessions, todayDateKey]
  );
  const epocEnabled = resolvedUserData?.epocEnabled ?? true;
  const resolvedTrainingEpocTotal = useMemo(
    () =>
      epocEnabled
        ? resolvedTodayTrainingSessions.reduce((sum, session) => {
            const sessionCalories = calculateTrainingSessionCalories(
              session,
              resolvedUserData,
              resolvedTrainingTypes
            );
            const epoc = resolveTrainingSessionEpoc({
              session,
              exerciseCalories: sessionCalories,
              trainingType: resolvedTrainingTypes?.[session?.type],
              userData: resolvedUserData,
            });
            return sum + (Number(epoc?.totalCalories) || 0);
          }, 0)
        : 0,
    [
      epocEnabled,
      resolvedTodayTrainingSessions,
      resolvedTrainingTypes,
      resolvedUserData,
    ]
  );
  const resolvedCardioEpocTotal = useMemo(
    () =>
      epocEnabled
        ? resolvedCardioSessions.reduce((sum, session) => {
            const sessionCalories = calculateCardioCalories(session);
            const epoc = resolveCardioSessionEpoc({
              session,
              exerciseCalories: sessionCalories,
              cardioType: resolvedCardioTypes?.[session?.type],
              userData: resolvedUserData,
            });
            return sum + (Number(epoc?.totalCalories) || 0);
          }, 0)
        : 0,
    [
      calculateCardioCalories,
      epocEnabled,
      resolvedCardioSessions,
      resolvedCardioTypes,
      resolvedUserData,
    ]
  );
  const resolvedHasCardioSessions =
    typeof hasCardioSessions === 'boolean'
      ? hasCardioSessions
      : resolvedCardioSessions.length > 0;

  const todayStepEntry = useMemo(
    () =>
      Array.isArray(resolvedUserData?.stepEntries)
        ? resolvedUserData.stepEntries.find(
            (entry) => toDateKey(entry?.date) === todayDateKey
          )
        : null,
    [resolvedUserData, todayDateKey]
  );
  const todayStepCount = Number(todayStepEntry?.steps) || 0;
  const todayStepCalories =
    todayStepCount > 0
      ? Math.round(calculateCaloriesFromSteps(todayStepCount, resolvedUserData))
      : 0;
  // Today's logged nutrition, computed once and shared by the TEF context below
  // and the hero's calorie pill, so the same day is never read twice.
  const todayNutritionTotals = useMemo(
    () =>
      getNutritionTotalsForDate(
        resolvedUserData?.nutritionData ?? {},
        todayDateKey
      ),
    [resolvedUserData, todayDateKey]
  );
  // Match the recorded daily snapshot / ledger: use this user's canonical TEF
  // mode (target for non-logging users) with the same goal-seeded refinement,
  // instead of passing no context (which silently drops TEF entirely and made
  // the hero disagree with the header, the snapshot and the ledger).
  const todayTefContext = useMemo(
    () =>
      buildDisplayTefContext(resolvedUserData, {
        nutritionTotals: todayNutritionTotals,
      }),
    [resolvedUserData, todayNutritionTotals]
  );
  // Memoized: this is the hero's goal-seeded TDEE (3 full breakdowns in
  // target-TEF mode plus AT/EPOC passes) — it used to run on every render,
  // including re-renders triggered by unrelated orchestrator state (modal
  // opens, drafts, pickers). Destructured store function so the memo can
  // depend on the stable callback itself instead of the whole store object
  // (whose identity changes whenever ANY selected field changes).
  const calculateTargetForGoal = store.calculateTargetForGoal;
  const todayBreakdown = useMemo(
    () =>
      calculateTargetForGoal(
        todayStepCount,
        resolvedTodayTrainingSessions.length > 0,
        selectedGoal,
        { tefContext: todayTefContext, dateKey: todayDateKey }
      ).breakdown,
    // heartRateProfile: a new resting / max HR / VO2 reading reprices today's
    // HR sessions and EPOC (the profile object is memoized on its inputs, so
    // it only changes identity when they do).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      calculateTargetForGoal,
      todayStepCount,
      resolvedTodayTrainingSessions,
      selectedGoal,
      todayTefContext,
      todayDateKey,
      store.heartRateProfile,
    ]
  );
  const todayTdee = Math.round(Number(todayBreakdown?.total) || 0);

  // Calories in, the mirror of the burn figure above: the hero pill reads this
  // against the goal and doubles as the add-meal action (a tap target, not a
  // read-only chip).
  const todayIntakeCalories = Math.round(
    Number(todayNutritionTotals?.calories) || 0
  );
  const todayCalorieTarget = Number.isFinite(Number(calorieTargetCalories))
    ? Math.round(Number(calorieTargetCalories))
    : null;

  // The hero's three configurable readouts (Settings -> Home & Tips):
  // the pill beside the title and the two tiles. They default to calories,
  // Weight and Body Fat; any slot can show any metric, and no metric can sit in
  // two slots (`readHeroSlots` settles every pick - Body Fat steps aside while
  // tracking is off). Models are pure and memoized on today's inputs.
  const heroSlots = readHeroSlots(resolvedUserData, {
    bodyFatTrackingEnabled: resolvedBodyFatTrackingEnabled !== false,
  });
  const heroExerciseBurn =
    (Number(resolvedTrainingCalories) || 0) +
    (Number(resolvedTotalCardioBurn) || 0);
  const heroRestingHr = store.heartRateProfile?.restingHr ?? null;
  const heroActivePhase = store.activePhase;
  const heroBalanceTarget = store.goalDailyBalanceTarget;
  const heroWeightReading = useMemo(
    () => ({
      display: currentWeight || null,
      dateLabel: weightDateLabel,
      warning: weightOldDataWarning,
    }),
    [currentWeight, weightDateLabel, weightOldDataWarning]
  );
  const heroBodyFatReading = useMemo(
    () => ({
      display: currentBodyFat || null,
      dateLabel: bodyFatDateLabel,
      warning: bodyFatOldDataWarning,
    }),
    [currentBodyFat, bodyFatDateLabel, bodyFatOldDataWarning]
  );
  const heroModels = useMemo(() => {
    const inputs = {
      userData: resolvedUserData,
      todayKey: todayDateKey,
      calorieTarget: todayCalorieTarget,
      consumed: todayIntakeCalories,
      proteinGrams: todayNutritionTotals?.protein,
      steps: todayStepCount,
      stepGoal: resolvedUserData?.stepGoal,
      tdee: todayTdee,
      goalDailyBalanceTarget: heroBalanceTarget,
      activePhase: heroActivePhase,
      restingHr: heroRestingHr,
      exerciseBurn: heroExerciseBurn,
      weight: heroWeightReading,
      bodyFat: heroBodyFatReading,
    };
    return {
      pill: buildHeroActionModel({ metric: heroSlots.pill, ...inputs }),
      left: buildHeroActionModel({ metric: heroSlots.left, ...inputs }),
      right: buildHeroActionModel({ metric: heroSlots.right, ...inputs }),
    };
  }, [
    heroActivePhase,
    heroBalanceTarget,
    heroBodyFatReading,
    heroExerciseBurn,
    heroRestingHr,
    heroSlots.left,
    heroSlots.pill,
    heroSlots.right,
    heroWeightReading,
    resolvedUserData,
    todayCalorieTarget,
    todayDateKey,
    todayIntakeCalories,
    todayNutritionTotals,
    todayStepCount,
    todayTdee,
  ]);

  const todayNeatOverride =
    resolvedUserData?.dailyNeatOverrides?.[todayDateKey] ?? null;
  const hasTodayNeatOverride =
    todayNeatOverride != null &&
    Number.isFinite(Number(todayNeatOverride?.multiplier));
  const burnSegments = [
    {
      key: 'steps',
      label: 'Steps',
      kcal: Math.round(Number(todayStepCalories) || 0),
      colorClass: 'bg-accent-green',
      textClass: 'text-accent-green',
      icon: Footprints,
    },
    {
      key: 'training',
      label: 'Training',
      kcal: Math.round(Number(resolvedTrainingCalories) || 0),
      colorClass: 'bg-accent-blue',
      textClass: 'text-accent-blue',
      icon: Dumbbell,
    },
    {
      key: 'cardio',
      label: 'Cardio',
      kcal: Math.round(Number(resolvedTotalCardioBurn) || 0),
      colorClass: 'bg-accent-red',
      textClass: 'text-accent-red',
      icon: Heart,
    },
    {
      key: 'neat',
      label: 'NEAT',
      kcal: Math.round(Number(todayBreakdown?.baseActivity) || 0),
      colorClass: 'bg-accent-purple',
      textClass: 'text-accent-purple',
      icon: Activity,
    },
  ];
  const activeBurnTotal = burnSegments.reduce(
    (sum, segment) => sum + segment.kcal,
    0
  );
  const visibleBurnSegments = burnSegments.filter(
    (segment) => segment.kcal > 0
  );
  const totalEpoc =
    Math.round(Number(resolvedTrainingEpocTotal) || 0) +
    Math.round(Number(resolvedCardioEpocTotal) || 0);
  const burnPercent =
    todayTdee > 0 ? Math.round((activeBurnTotal / todayTdee) * 100) : null;

  const goalConfig = resolvedGoals[selectedGoal];
  const goalBorderClass =
    GOAL_BORDER_CLASS_BY_BG[goalConfig.color] ?? 'border-primary-foreground';

  const cardioHeaderContent = (
    <>
      <div className="flex items-center gap-2">
        <Heart className="text-accent-blue" size={24} />
        <h2 className="text-xl font-bold text-foreground">Cardio Sessions</h2>
      </div>
      <button
        onClick={onAddCardioClick}
        type="button"
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-all press-feedback focus-ring md:hover:brightness-110"
      >
        <Plus size={20} />
        Add
      </button>
    </>
  );

  const cardioListContent = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {resolvedCardioSessions.map((session) => {
          const cardioType = resolvedCardioTypes[session.type];
          const label = cardioType?.label ?? 'Unknown cardio type';
          const durationValue = Number.isFinite(Number(session.duration))
            ? Number(session.duration)
            : 0;
          const calories = calculateCardioCalories(session);
          const sessionEpoc = epocEnabled
            ? resolveCardioSessionEpoc({
                session,
                exerciseCalories: calories,
                cardioType: resolvedCardioTypes?.[session?.type],
                userData: resolvedUserData,
              })
            : null;
          const epocCalories = Number(sessionEpoc?.totalCalories) || 0;
          const effortType = session.effortType ?? 'intensity';
          const heartRate = Number(session.averageHeartRate);
          const hasHeartRate = Number.isFinite(heartRate) && heartRate > 0;
          const intensityLabel = session.intensity
            ? `${session.intensity.charAt(0).toUpperCase()}${session.intensity.slice(1)}`
            : 'Moderate';
          const effortDisplay =
            effortType === 'heartRate'
              ? hasHeartRate
                ? `${heartRate} bpm`
                : 'N/A bpm'
              : intensityLabel;
          const showMissingTypeWarning = !cardioType;

          return (
            <div
              key={session.id}
              className="bg-surface-highlight/50 rounded-lg p-4 border border-border/50 flex justify-between items-start gap-4 shadow-lg shadow-background/20"
            >
              <div>
                <p className="text-foreground font-semibold">{label}</p>
                <p className="text-muted text-sm">
                  <span className="text-foreground/70">
                    {durationValue} min
                  </span>
                  {' • '}
                  {effortDisplay}
                  {renderHeartRateExtras(session)}
                  {' • '}
                  <span className="text-foreground/70">~{calories} kcal</span>
                  {epocEnabled && (
                    <>
                      {' + '}
                      <span className="text-foreground/70">
                        ~{Math.round(epocCalories)} EPOC
                      </span>
                    </>
                  )}
                </p>
                {showMissingTypeWarning && (
                  <p className="text-accent-amber text-xs mt-1">
                    Cardio type removed; consider replacing this session.
                  </p>
                )}
              </div>
              <div className="flex items-end gap-6 pt-1">
                <button
                  onClick={() => onEditCardioSession?.(session.id)}
                  type="button"
                  className="text-foreground/80 transition-all active:scale-95 pressable-inline focus-ring md:hover:text-foreground md:hover:scale-110"
                >
                  <Edit3 size={22} />
                </button>
                <button
                  onClick={() => onRemoveCardioSession(session.id)}
                  type="button"
                  className="text-accent-red transition-all active:scale-95 pressable-inline focus-ring md:hover:text-accent-red md:hover:scale-110"
                >
                  <Trash2 size={22} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const cardioEmptyContent = (
    <button
      onClick={onAddCardioClick}
      type="button"
      className="w-full flex items-center justify-between p-4 rounded-xl transition-all group pressable-card focus-ring md:hover:bg-surface-highlight/50"
    >
      <div className="flex items-center gap-3">
        <Heart className="text-accent-blue" size={24} />
        <div className="text-left">
          <h2 className="text-lg font-bold text-foreground">
            Add Cardio Session
          </h2>
          <p className="text-muted text-sm">Track your cardio activities</p>
        </div>
      </div>
      <Plus
        className="text-muted md:group-hover:text-primary transition-colors"
        size={24}
      />
    </button>
  );

  const resolvedHasTrainingSessions = resolvedTodayTrainingSessions.length > 0;

  const trainingHeaderContent = (
    <>
      <div className="flex items-center gap-2">
        <Dumbbell className="text-accent-blue" size={24} />
        <h2 className="text-xl font-bold text-foreground">Training Sessions</h2>
      </div>
      <button
        onClick={onTrainingDayClick}
        type="button"
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-all press-feedback focus-ring md:hover:brightness-110"
      >
        <Plus size={20} />
        Add
      </button>
    </>
  );

  const trainingListContent = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {resolvedTodayTrainingSessions.map((session) => {
          const trainingType = resolvedTrainingTypes[session.type];
          const label = trainingType?.label ?? 'Unknown training type';
          const durationValue = Number.isFinite(Number(session.duration))
            ? Number(session.duration)
            : 0;
          const calories = calculateTrainingSessionCalories(
            session,
            resolvedUserData,
            resolvedTrainingTypes
          );
          const sessionEpoc = epocEnabled
            ? resolveTrainingSessionEpoc({
                session,
                exerciseCalories: calories,
                trainingType: resolvedTrainingTypes?.[session?.type],
                userData: resolvedUserData,
              })
            : null;
          const epocCalories = Number(sessionEpoc?.totalCalories) || 0;
          const effortType = session.effortType ?? 'intensity';
          const heartRate = Number(session.averageHeartRate);
          const hasHeartRate = Number.isFinite(heartRate) && heartRate > 0;
          const intensityLabel = session.intensity
            ? `${session.intensity.charAt(0).toUpperCase()}${session.intensity.slice(1)}`
            : 'Moderate';
          const effortDisplay =
            effortType === 'heartRate'
              ? hasHeartRate
                ? `${heartRate} bpm`
                : 'N/A bpm'
              : intensityLabel;
          const showMissingTypeWarning = !trainingType;

          return (
            <div
              key={session.id}
              className="bg-surface-highlight/50 rounded-lg p-4 border border-border/50 flex justify-between items-start gap-4 shadow-lg shadow-background/20"
            >
              <div>
                <p className="text-foreground font-semibold">{label}</p>
                <p className="text-muted text-sm">
                  <span className="text-foreground/70">
                    {durationValue} min
                  </span>
                  {' • '}
                  {effortDisplay}
                  {renderHeartRateExtras(session)}
                  {' • '}
                  <span className="text-foreground/70">~{calories} kcal</span>
                  {epocEnabled && (
                    <>
                      {' + '}
                      <span className="text-foreground/70">
                        ~{Math.round(epocCalories)} EPOC
                      </span>
                    </>
                  )}
                </p>
                {showMissingTypeWarning && (
                  <p className="text-accent-amber text-xs mt-1">
                    Training type removed; consider replacing this session.
                  </p>
                )}
              </div>
              <div className="flex items-end gap-6 pt-1">
                <button
                  onClick={() => onEditTrainingSession?.(session.id)}
                  type="button"
                  className="text-foreground/80 transition-all active:scale-95 pressable-inline focus-ring md:hover:text-foreground md:hover:scale-110"
                >
                  <Edit3 size={22} />
                </button>
                <button
                  onClick={() => onRemoveTrainingSession?.(session.id)}
                  type="button"
                  className="text-accent-red transition-all active:scale-95 pressable-inline focus-ring md:hover:text-accent-red md:hover:scale-110"
                >
                  <Trash2 size={22} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const trainingEmptyContent = (
    <button
      onClick={onTrainingDayClick}
      type="button"
      className="w-full flex items-center justify-between p-4 rounded-xl transition-all group pressable-card focus-ring md:hover:bg-surface-highlight/50"
    >
      <div className="flex items-center gap-3">
        <Dumbbell className="text-accent-blue" size={24} />
        <div className="text-left">
          <h2 className="text-lg font-bold text-foreground">
            Add Training Session
          </h2>
          <p className="text-muted text-sm">Track your strength training</p>
        </div>
      </div>
      <Plus
        className="text-muted md:group-hover:text-primary transition-colors"
        size={24}
      />
    </button>
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-surface rounded-2xl p-6 md:p-8 border border-border shadow-lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Activity className="text-accent-blue" size={32} />
            <h1 className="text-xl font-black text-foreground md:text-3xl">
              Energy Map
            </h1>
          </div>
          {/* The header gear already owns Settings from every screen, so this
              action slot carries one glanceable readout for today and the
              screen behind it. It is configurable (Settings -> Home & Tips);
              the default is calories eaten, which also starts a meal. */}
          <HeroActionPill
            model={heroModels.pill}
            onPress={heroActionOpeners?.[heroSlots.pill]}
          />
        </div>
        {/* Two configurable tiles (Settings -> Home & Tips). They default
            to Weight and Body Fat, exactly as before, and either slot can show
            any hero metric instead. Both render the same tile design. */}
        <div className="grid grid-cols-2 gap-3">
          <HeroActionTile
            model={heroModels.left}
            onPress={heroActionOpeners?.[heroSlots.left]}
          />
          <HeroActionTile
            model={heroModels.right}
            onPress={heroActionOpeners?.[heroSlots.right]}
          />
        </div>

        {/* Today's Activity Burn — folded into the hero */}
        <div className="mt-5 pt-5 border-t border-border/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                Today&apos;s Activity Burn
              </h2>
              <button
                type="button"
                onClick={onOpenTodayBreakdown}
                className="inline-flex items-center text-[11px] font-medium text-accent-blue border border-accent-blue/20 bg-accent-blue/10 px-2 py-0.5 rounded-full transition-all pressable-inline focus-ring md:hover:bg-accent-blue/20"
                aria-label="Open today's calorie breakdown"
              >
                {burnPercent != null ? `~${burnPercent}% of daily TDEE` : '—'}
              </button>
            </div>
            <div className="text-right">
              <p className="text-2xl md:text-3xl font-bold text-foreground leading-none">
                {Math.round(activeBurnTotal)}
                <span className="text-lg text-muted ml-1">kcal</span>
              </p>
              {totalEpoc > 0 && (
                <p className="text-muted text-xs mt-1">
                  +{totalEpoc} kcal EPOC
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex h-2 w-full gap-[2px] rounded-full overflow-hidden">
            {activeBurnTotal > 0 ? (
              visibleBurnSegments.map((segment) => {
                const width = (segment.kcal / activeBurnTotal) * 100;
                return (
                  <div
                    key={segment.key}
                    className={`${segment.colorClass} h-full min-w-[2px] rounded-full`}
                    style={{ width: `${width}%` }}
                  />
                );
              })
            ) : (
              <div className="h-full w-full rounded-full bg-surface-highlight" />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            {visibleBurnSegments.map((segment) => {
              const SegIcon = segment.icon;
              const isNeat = segment.key === 'neat';
              const neatTextClass = isNeat
                ? hasTodayNeatOverride
                  ? 'text-accent-green'
                  : 'text-accent-purple'
                : segment.textClass;
              const content = (
                <>
                  <SegIcon className={`${neatTextClass} shrink-0`} size={16} />
                  <span
                    className={`min-w-0 ${
                      isNeat
                        ? 'underline decoration-1 underline-offset-2 decoration-[color-mix(in_srgb,currentColor_40%,transparent)]'
                        : ''
                    }`}
                  >
                    <span className="text-muted">{segment.label}</span>
                    <span className={`font-semibold ${neatTextClass}`}>
                      {' '}
                      {segment.kcal}
                    </span>
                  </span>
                  {isNeat && (
                    <ChevronRight
                      size={12}
                      className="shrink-0 -ml-2 text-muted/60"
                    />
                  )}
                </>
              );

              if (isNeat) {
                return (
                  <button
                    key={segment.key}
                    type="button"
                    onClick={onOpenDailyActivityOverride}
                    className={`flex items-center gap-2 min-w-0 rounded-md pr-0.5 pressable-inline focus-ring ${
                      hasTodayNeatOverride
                        ? 'text-accent-green md:hover:bg-accent-green/10'
                        : 'text-accent-purple md:hover:bg-accent-purple/10'
                    }`}
                    aria-label="Adjust today's NEAT activity level"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={segment.key}
                  className="flex items-center gap-2 min-w-0"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-6 border border-border shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Target className="text-accent-blue" size={18} />
          Your Goal
        </h2>
        <button
          onClick={isGoalLocked ? undefined : onGoalClick}
          type="button"
          disabled={isGoalLocked}
          className={`w-full p-4 rounded-xl border-2 transition-all relative ${goalConfig.color} ${goalBorderClass} text-primary-foreground shadow-lg ${
            isGoalLocked
              ? 'opacity-80 cursor-not-allowed'
              : 'md:hover:scale-[1.02] active:scale-[0.98]'
          } focus-ring pressable-card`}
        >
          {(() => {
            const Icon = goalConfig.icon;
            return <Icon className="mx-auto mb-2" size={32} />;
          })()}
          <p className="font-bold text-xl">{goalConfig.label}</p>
          <p className="text-sm opacity-90 mt-1">{goalConfig.desc}</p>
          <p className="text-xs opacity-75 mt-2">
            {isGoalLocked
              ? `Locked by active phase${goalLockPhaseName ? `: ${goalLockPhaseName}` : ''}`
              : 'Tap to change'}
          </p>
        </button>
      </div>

      <div className="bg-surface rounded-2xl px-6 py-5 border border-border shadow-lg">
        <AnimatePresence initial={false}>
          {resolvedHasTrainingSessions && (
            <motion.div
              key="training-header"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                height: { type: 'spring', stiffness: 400, damping: 30 },
                opacity: { duration: 0.15 },
              }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                {trainingHeaderContent}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {resolvedHasTrainingSessions ? (
            <motion.div
              key={`training-list-${todayDateKey}-${resolvedTodayTrainingSessions.length}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                scale: { type: 'spring', stiffness: 400, damping: 28 },
                opacity: { duration: 0.15 },
              }}
            >
              {trainingListContent}
            </motion.div>
          ) : (
            <motion.div
              key="training-empty"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                scale: { type: 'spring', stiffness: 400, damping: 28 },
                opacity: { duration: 0.15 },
              }}
            >
              {trainingEmptyContent}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-surface rounded-2xl px-6 py-5 border border-border shadow-lg">
        <AnimatePresence initial={false}>
          {resolvedHasCardioSessions && (
            <motion.div
              key="cardio-header"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                height: { type: 'spring', stiffness: 400, damping: 30 },
                opacity: { duration: 0.15 },
              }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                {cardioHeaderContent}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {resolvedHasCardioSessions ? (
            <motion.div
              key={`cardio-list-${todayDateKey}-${resolvedCardioSessions.length}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                scale: { type: 'spring', stiffness: 400, damping: 28 },
                opacity: { duration: 0.15 },
              }}
            >
              {cardioListContent}
            </motion.div>
          ) : (
            <motion.div
              key="cardio-empty"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                scale: { type: 'spring', stiffness: 400, damping: 28 },
                opacity: { duration: 0.15 },
              }}
            >
              {cardioEmptyContent}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
