import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Settings,
  Edit3,
  ChevronRight,
  AlertCircle,
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
import { calculateTrainingSessionCalories } from '../../../utils/calculations/calculations';
import { calculateCaloriesFromSteps } from '../../../utils/calculations/steps';
import {
  resolveCardioSessionEpoc,
  resolveTrainingSessionEpoc,
} from '../../../utils/calculations/epoc';
import {
  sortWeightEntries,
  formatWeight,
} from '../../../utils/measurements/weight';
import {
  sortBodyFatEntries,
  formatBodyFat,
} from '../../../utils/measurements/bodyFat';
import {
  formatTooltipDate,
  getOldDataWarningText,
} from '../../../utils/visuals/trackerHelpers';

const GOAL_BORDER_CLASS_BY_BG = {
  'bg-accent-purple': 'border-accent-purple',
  'bg-accent-green': 'border-accent-green',
  'bg-accent-blue': 'border-accent-blue',
  'bg-accent-yellow': 'border-accent-yellow',
  'bg-accent-orange': 'border-accent-orange',
};

export const HomeScreen = ({
  userData,
  goals,
  selectedGoal,
  isGoalLocked,
  goalLockPhaseName,
  onGoalClick,
  onSettingsClick,
  onBodyFatClick,
  onWeightClick,
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
}) => {
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
      calculateBreakdown: state.calculateBreakdown,
    }),
    shallow
  );

  const resolvedUserData = userData ?? store.userData;
  const resolvedTrainingCalories = trainingCalories ?? store.trainingCalories;
  const resolvedTrainingSessions = trainingSessions ?? store.trainingSessions;
  const resolvedTrainingTypes = trainingTypes ?? store.trainingTypes;
  const resolvedCardioTypes = cardioTypes ?? store.cardioTypes;
  const toDateKey = (value) => {
    if (value == null) return null;
    const normalized = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  };
  const now = new Date();
  const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const resolvedCardioSessions = (
    cardioSessions ?? store.cardioSessions
  ).filter((session) => toDateKey(session?.date) === todayDateKey);
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
  const currentWeight = formatWeight(
    weightLatest?.weight ?? resolvedUserData.weight
  );
  const weightDateLabel = weightLatest?.date
    ? formatTooltipDate(weightLatest.date)
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
    ? formatTooltipDate(bodyFatLatest.date)
    : 'No entries yet';
  const bodyFatOldDataWarning = bodyFatLatest?.date
    ? getOldDataWarningText(bodyFatLatest.date)
    : null;
  const resolvedTodayTrainingSessions = resolvedTrainingSessions.filter(
    (session) => toDateKey(session?.date) === todayDateKey
  );
  const epocEnabled = resolvedUserData?.epocEnabled ?? true;
  const resolvedTrainingEpocTotal = epocEnabled
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
    : 0;
  const resolvedCardioEpocTotal = epocEnabled
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
    : 0;
  const resolvedHasCardioSessions =
    typeof hasCardioSessions === 'boolean'
      ? hasCardioSessions
      : resolvedCardioSessions.length > 0;

  const todayStepEntry = Array.isArray(resolvedUserData?.stepEntries)
    ? resolvedUserData.stepEntries.find(
        (entry) => toDateKey(entry?.date) === todayDateKey
      )
    : null;
  const todayStepCount = Number(todayStepEntry?.steps) || 0;
  const todayStepCalories =
    todayStepCount > 0
      ? Math.round(calculateCaloriesFromSteps(todayStepCount, resolvedUserData))
      : 0;
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
  const todayBreakdown = store.calculateBreakdown(
    todayStepCount,
    resolvedTodayTrainingSessions.length > 0,
    { dateKey: todayDateKey }
  );
  const todayTdee = Math.round(Number(todayBreakdown?.total) || 0);
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
                  {durationValue} min • {effortDisplay} • ~{calories} kcal
                  {epocEnabled && ` + ~${Math.round(epocCalories)} EPOC`}
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
                  {durationValue} min • {effortDisplay} • ~{calories} kcal
                  {epocEnabled && ` + ~${Math.round(epocCalories)} EPOC`}
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="text-accent-blue" size={32} />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Your Energy Map
            </h1>
          </div>
          <button
            onClick={onSettingsClick}
            type="button"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg transition-all press-feedback focus-ring md:hover:brightness-110"
          >
            <Settings size={20} />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* ── Compact Weight widget ── */}
          <button
            onClick={onWeightClick}
            type="button"
            className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-3 md:p-4 border border-border/50 transition-all active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted text-xs font-medium">Weight</p>
                <p className="text-2xl md:text-3xl font-bold text-foreground leading-tight mt-1 flex items-baseline gap-1.5">
                  <span className="shrink-0">
                    {currentWeight ? `${currentWeight} kg` : '—'}
                  </span>
                  {weightOldDataWarning && (
                    <span className="inline-flex items-center gap-0.5 text-accent-yellow text-[10px] font-medium truncate min-w-0">
                      <AlertCircle size={10} className="shrink-0" />
                      {weightOldDataWarning}
                    </span>
                  )}
                </p>
                <p className="text-muted text-[11px] mt-1 truncate">
                  {weightDateLabel}
                </p>
              </div>
              <ChevronRight
                size={20}
                className="text-muted/60 shrink-0 mt-1 md:group-hover:text-primary transition-colors"
              />
            </div>
          </button>

          {/* ── Compact Body Fat widget ── */}
          {resolvedBodyFatTrackingEnabled && (
            <button
              onClick={onBodyFatClick}
              type="button"
              className="group relative w-full text-left bg-surface-highlight/50 rounded-xl p-3 md:p-4 border border-border/50 transition-all active:scale-[0.99] pressable-card focus-ring md:hover:bg-surface-highlight md:hover:border-border/80"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-muted text-xs font-medium">Body Fat %</p>
                  <p className="text-2xl md:text-3xl font-bold text-foreground leading-tight mt-1 flex items-baseline gap-1.5">
                    <span className="shrink-0">
                      {currentBodyFat ? `${currentBodyFat}%` : '—'}
                    </span>
                    {bodyFatOldDataWarning && (
                      <span className="inline-flex items-center gap-0.5 text-accent-yellow text-[10px] font-medium truncate min-w-0">
                        <AlertCircle size={10} className="shrink-0" />
                        {bodyFatOldDataWarning}
                      </span>
                    )}
                  </p>
                  <p className="text-muted text-[11px] mt-1 truncate">
                    {bodyFatDateLabel}
                  </p>
                </div>
                <ChevronRight
                  size={20}
                  className="text-muted/60 shrink-0 mt-1 md:group-hover:text-primary transition-colors"
                />
              </div>
            </button>
          )}
        </div>

        {/* Today's Activity Burn — folded into the hero */}
        <div className="mt-5 pt-5 border-t border-border/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                Today&apos;s Activity Burn
              </h2>
              <p className="inline-flex items-center text-[11px] font-medium text-accent-blue border border-accent-blue/20 bg-accent-blue/10 px-3 py-0.5 rounded-full transition-all pressable-inline focus-ring md:hover:bg-accent-blue/20">
                {burnPercent != null ? `~${burnPercent}% of daily TDEE` : '—'}
              </p>
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
              return (
                <div
                  key={segment.key}
                  className="flex items-center gap-2 min-w-0"
                >
                  <SegIcon
                    className={`${segment.textClass} shrink-0`}
                    size={16}
                  />
                  <span className="text-muted truncate">{segment.label}</span>
                  <span
                    className={`font-semibold shrink-0 ${segment.textClass}`}
                  >
                    {segment.kcal}
                  </span>
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
};
